import { WASI } from '@runno/wasi'

// libc++ has no bits/stdc++.h; hand clang one through its virtual filesystem.
// <csetjmp> and <csignal> are left out: WASI rejects them outright.
const BITS = `cassert cctype cerrno cfloat climits clocale cmath cstdarg cstddef cstdint cstdio cstdlib cstring ctime cwchar cwctype
algorithm any array atomic bit bitset charconv chrono compare complex concepts deque exception forward_list fstream functional initializer_list
iomanip ios iosfwd iostream istream iterator limits list map memory new numbers numeric optional ostream queue random ranges ratio set span
sstream stack stdexcept string string_view tuple type_traits typeindex typeinfo unordered_map unordered_set utility valarray variant vector`
  .split(/\s+/).map((h) => `#include <${h}>`).join('\n')

type Msg =
  | { op: 'compile'; vendor: string; code: string }
  | { op: 'run'; module: WebAssembly.Module; stdin: string; limit: number }

let runClang: any

onmessage = async ({ data }: MessageEvent<Msg>) => {
  postMessage(data.op === 'compile' ? await compile(data.vendor, data.code) : await run(data.module, data.stdin, data.limit))
}

async function compile(vendor: string, code: string) {
  if (!runClang) {
    runClang = (await import(/* @vite-ignore */ vendor + 'clang/bundle.js')).runClang
    // runClang drops fetchProgress on its internal `clang -###` call, so fetch the 105 MB up front with a null run.
    await runClang(null, {}, { fetchProgress: ({ doneLength, totalLength }: { doneLength: number; totalLength: number }) => postMessage({ progress: { doneLength, totalLength } }) })
  }
  const dec = new TextDecoder()
  let stderr = ''
  try {
    const out = await runClang(
      ['clang++', '-std=c++20', '-O2', '-fno-exceptions', '-I.', '-Wl,-z,stack-size=67108864', 'main.cpp', '-o', 'main.wasm'],
      { 'main.cpp': code, bits: { 'stdc++.h': BITS } },
      { stdout: () => {}, stderr: (b: Uint8Array | null) => { if (b) stderr += dec.decode(b, { stream: true }) } },
    )
    return { module: await WebAssembly.compile(out['main.wasm']) }
  } catch (e) {
    return { compileError: stderr || String(e) }
  }
}

async function run(module: WebAssembly.Module, stdin: string, limit: number) {
  const enc = new TextEncoder()
  let out = '', err = '', pos = 0, overflow = false
  const write = (s: string, to: 'out' | 'err') => {
    if (out.length + err.length + s.length > limit) { overflow = true; throw new Error('Output limit exceeded') }
    to === 'out' ? (out += s) : (err += s)
  }
  const wasi = new WASI({
    args: ['main'],
    env: {},
    stdin: (max) => {
      let chunk = stdin.slice(pos, pos + max)
      while (enc.encode(chunk).length > max) chunk = chunk.slice(0, chunk.length >> 1) // multibyte input
      pos += chunk.length
      return chunk.length ? chunk : null
    },
    stdout: (s) => write(s, 'out'),
    stderr: (s) => write(s, 'err'),
  })
  const instance = await WebAssembly.instantiate(module, wasi.getImportObject())
  const t = performance.now()
  try {
    const { exitCode } = wasi.start({ module, instance })
    const ms = performance.now() - t
    if (overflow) return { out, err: err + '\nOutput limit exceeded (1 MB)', exitCode: 1, ms }
    return { out, err, exitCode, ms }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = /call stack size|too much recursion/i.test(msg)
    return {
      out,
      err: err + (overflow ? 'Output limit exceeded (1 MB)'
        : stack ? 'Stack overflow: recursion is too deep for the browser (roughly 7k frames in Chrome, 20k in Firefox). Use an explicit stack.'
        : msg),
      exitCode: 1,
      ms: performance.now() - t,
    }
  }
}
