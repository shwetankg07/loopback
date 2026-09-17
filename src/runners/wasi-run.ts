import { WASI, WASIContext, type WASIFS } from '@runno/wasi'

// Shared by every WASI toolchain: C/C++ (clang output), Go (yaegi), Ruby and PHP.

const stamps = () => { const now = new Date(); return { access: now, modification: now, change: now } }

export const wasiFiles = (files: Record<string, string>): WASIFS =>
  Object.fromEntries(Object.entries(files).map(([path, content]) => [path, { path, content, mode: 'string' as const, timestamps: stamps() }]))

// Large toolchains ship gzipped, because static hosts cap files at 25 MB. Falls back to the plain file, and
// skips inflating when the host already decoded it (the bytes wouldn't start with the gzip magic number).
export async function fetchWasm(url: string): Promise<WebAssembly.Module> {
  const res = await fetch(url + '.gz')
  if (!res.ok || !res.body) return WebAssembly.compileStreaming(fetch(url))
  const [probe, body] = res.body.tee()
  const reader = probe.getReader()
  const { value } = await reader.read()
  reader.cancel()
  const gzipped = value?.[0] === 0x1f && value?.[1] === 0x8b
  const stream = gzipped ? body.pipeThrough(new DecompressionStream('gzip')) : body
  return WebAssembly.compileStreaming(new Response(stream, { headers: { 'Content-Type': 'application/wasm' } }))
}

export type WasiResult = { out: string; err: string; exitCode: number; ms: number }

export async function runWasi(opts: {
  module: WebAssembly.Module
  args: string[]
  env?: Record<string, string>
  fs?: WASIFS
  stdin: string
  limit: number
}): Promise<WasiResult> {
  const enc = new TextEncoder()
  let out = '', err = '', pos = 0, overflow = false
  const write = (s: string, to: 'out' | 'err') => {
    if (out.length + err.length + s.length > opts.limit) { overflow = true; throw new Error('Output limit exceeded') }
    to === 'out' ? (out += s) : (err += s)
  }
  const wasi = new WASI({
    args: opts.args,
    env: opts.env ?? {},
    fs: opts.fs ?? {},
    stdin: (max) => {
      let chunk = opts.stdin.slice(pos, pos + max)
      while (enc.encode(chunk).length > max) chunk = chunk.slice(0, chunk.length >> 1) // multibyte input
      pos += chunk.length
      return chunk.length ? chunk : null
    },
    stdout: (s) => write(s, 'out'),
    stderr: (s) => write(s, 'err'),
  })
  const instance = await WebAssembly.instantiate(opts.module, wasi.getImportObject())
  const t = performance.now()
  try {
    const { exitCode } = wasi.start({ module: opts.module, instance })
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
