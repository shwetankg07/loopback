import { runWasi } from './wasi-run.ts'

// libc++ has no bits/stdc++.h; hand clang one through its virtual filesystem.
// <csetjmp> and <csignal> are left out: WASI rejects both.
const BITS = `cassert cctype cerrno cfloat climits clocale cmath cstdarg cstddef cstdint cstdio cstdlib cstring ctime cwchar cwctype
algorithm any array atomic bit bitset charconv chrono compare complex concepts deque exception forward_list fstream functional initializer_list
iomanip ios iosfwd iostream istream iterator limits list map memory new numbers numeric optional ostream queue random ranges ratio set span
sstream stack stdexcept string string_view tuple type_traits typeindex typeinfo unordered_map unordered_set utility valarray variant vector`
  .split(/\s+/).map((h) => `#include <${h}>`).join('\n')

type Lang = 'c' | 'cpp'
type Msg =
  | { op: 'compile'; vendor: string; lang: Lang; code: string }
  | { op: 'run'; module: WebAssembly.Module; stdin: string; limit: number }

let runClang: any

// Static hosts like Cloudflare Pages cap files at 25 MB, so the two big clang files ship gzipped (73 MB -> 22 MB,
// 29 MB -> 4 MB) and are inflated here. Must run before bundle.js is imported: it captures fetch at load time.
const realFetch = fetch
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input)
  if (!/\/clang\/(llvm\.core\.wasm|llvm-resources\.tar)$/.test(url)) return realFetch(input, init)
  const res = await realFetch(url + '.gz', init)
  if (!res.ok || !res.body) return res
  // If the host already decoded it (Content-Encoding: gzip), the bytes won't start with the gzip magic number.
  const [probe, body] = res.body.tee()
  const reader = probe.getReader()
  const { value } = await reader.read()
  reader.cancel()
  const gzipped = value?.[0] === 0x1f && value?.[1] === 0x8b
  const type = url.endsWith('.wasm') ? 'application/wasm' : 'application/x-tar'
  return new Response(gzipped ? body.pipeThrough(new DecompressionStream('gzip')) : body, { headers: { 'Content-Type': type } })
}

onmessage = async ({ data }: MessageEvent<Msg>) => {
  // Always answer: an unhandled rejection here would leave the page waiting forever.
  try {
    postMessage(data.op === 'compile'
      ? await compile(data.vendor, data.lang, data.code)
      : await runWasi({ module: data.module, args: ['main'], stdin: data.stdin, limit: data.limit }))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    postMessage(data.op === 'compile' ? { compileError: message } : { out: '', err: message, exitCode: 1, ms: 0 })
  }
}

async function compile(vendor: string, lang: Lang, code: string) {
  if (!runClang) {
    runClang = (await import(/* @vite-ignore */ vendor + 'clang/bundle.js')).runClang
    // runClang drops fetchProgress on its internal `clang -###` call, so fetch the 105 MB up front with a null run.
    await runClang(null, {}, { fetchProgress: ({ doneLength, totalLength }: { doneLength: number; totalLength: number }) => postMessage({ progress: { doneLength, totalLength } }) })
  }
  const dec = new TextDecoder()
  let stderr = ''
  const stack = '-Wl,-z,stack-size=67108864'
  const [args, files] = lang === 'c'
    ? [['clang', '-std=c17', '-O2', stack, 'main.c', '-o', 'main.wasm'], { 'main.c': code }]
    : [['clang++', '-std=c++20', '-O2', '-fno-exceptions', '-I.', stack, 'main.cpp', '-o', 'main.wasm'], { 'main.cpp': code, bits: { 'stdc++.h': BITS } }]
  try {
    const out = await runClang(args, files, {
      stdout: () => {},
      stderr: (b: Uint8Array | null) => { if (b) stderr += dec.decode(b, { stream: true }) },
    })
    return { module: await WebAssembly.compile(out['main.wasm']) }
  } catch (e) {
    return { compileError: stderr || String(e) }
  }
}
