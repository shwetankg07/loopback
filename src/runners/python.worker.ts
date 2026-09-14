type Msg =
  | { op: 'check'; vendor: string; code: string }
  | { op: 'run'; vendor: string; code: string; stdin: string; limit: number }

// Runs user code as __main__ with a fresh stdin wrapper each time (no leftover buffered input between tests)
// and a traceback that starts at the user's own frame.
const WRAPPER = `
import sys, io, traceback
__status = "ok"
sys.stdin = io.TextIOWrapper(io.BufferedReader(io.FileIO(0, "rb", closefd=False)), encoding="utf-8")
try:
    exec(compile(__src, "main.py", "exec"), {"__name__": "__main__"})
except SystemExit as e:
    if e.code not in (None, 0):
        __status = "runtime_error"
        if not isinstance(e.code, int): print(e.code, file=sys.stderr)
except BaseException as e:
    __status = "runtime_error"
    traceback.print_exception(type(e), e, e.__traceback__.tb_next)
finally:
    sys.stdout.flush(); sys.stderr.flush()
`

let py: any

onmessage = async ({ data }: MessageEvent<Msg>) => {
  py ??= await (await import(/* @vite-ignore */ data.vendor + 'pyodide/pyodide.mjs')).loadPyodide({ indexURL: data.vendor + 'pyodide/' })
  postMessage(data.op === 'check' ? check(data.code) : run(data.code, data.stdin, data.limit))
}

function check(code: string) {
  const g = py.toPy({ __src: code })
  try {
    py.runPython(`
import traceback
try:
    compile(__src, "main.py", "exec"); __err = ""
except SyntaxError as e:
    __err = "".join(traceback.format_exception_only(type(e), e))`, { globals: g })
    return { compileError: g.get('__err') as string }
  } finally {
    g.destroy()
  }
}

function run(code: string, stdin: string, limit: number) {
  const bytes = new TextEncoder().encode(stdin)
  const dec = new TextDecoder()
  let pos = 0, out = '', err = '', overflow = false
  py.setStdin({
    read(buf: Uint8Array) {
      const n = Math.min(buf.length, bytes.length - pos)
      buf.set(bytes.subarray(pos, pos + n))
      pos += n
      return n
    },
  })
  // ponytail: once over the limit, output is dropped and the program runs on until it ends or times out
  const sink = (to: 'out' | 'err') => ({
    write(buf: Uint8Array) {
      const s = dec.decode(buf)
      if (out.length + err.length + s.length > limit) overflow = true
      else to === 'out' ? (out += s) : (err += s)
      return buf.length
    },
  })
  py.setStdout(sink('out'))
  py.setStderr(sink('err'))

  const g = py.toPy({ __src: code })
  const t = performance.now()
  try {
    py.runPython(WRAPPER, { globals: g })
    const status = overflow ? 'runtime_error' : (g.get('__status') as string)
    return { status, out, err: overflow ? err + '\nOutput limit exceeded (1 MB)' : err, ms: performance.now() - t }
  } catch (e) {
    // The interpreter itself died (usually a wasm stack overflow from very deep recursion): this worker is done.
    const msg = e instanceof Error ? e.message : String(e)
    const stack = /call stack size|too much recursion/i.test(msg)
    return { status: 'runtime_error', out, err: stack ? 'Stack overflow: recursion is too deep for the browser.' : msg, ms: performance.now() - t, fatal: true }
  } finally {
    g.destroy()
  }
}
