// JavaScript runs natively in this worker; TypeScript is transpiled first (no type checking).
// There is no Node here, so programs read input with input() and write with print() or console.log().
export {} // keeps this a module, so its declarations stay local to the worker

type Msg =
  | { op: 'check'; lang: 'js' | 'ts'; code: string }
  | { op: 'run'; js: string; stdin: string; limit: number }

onmessage = async ({ data }: MessageEvent<Msg>) => {
  // Always answer: an unhandled rejection here would leave the page waiting forever.
  try {
    postMessage(data.op === 'check' ? await check(data.lang, data.code) : run(data.js, data.stdin, data.limit))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    postMessage(data.op === 'check' ? { compileError: message } : { out: '', err: message, exitCode: 1, ms: 0 })
  }
}

async function check(lang: 'js' | 'ts', code: string) {
  if (lang === 'js') {
    try {
      new Function(code)
      return { js: code }
    } catch (e) {
      return { compileError: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
    }
  }
  // Sucrase strips the types; it's a fraction of the size of a full compiler, and type checking isn't on offer here.
  // (typescript v7 is the native port and no longer ships the old JS API.)
  const { transform } = await import('sucrase')
  try {
    return { js: transform(code, { transforms: ['typescript'], disableESTransforms: true }).code }
  } catch (e) {
    return { compileError: e instanceof Error ? `main.ts: ${e.message}` : String(e) }
  }
}

function run(js: string, stdin: string, limit: number) {
  const lines = stdin.split('\n')
  if (lines.at(-1) === '') lines.pop()
  let next = 0, out = '', overflow = false
  const write = (s: string) => {
    if (out.length + s.length > limit) { overflow = true; throw new Error('Output limit exceeded') }
    out += s
  }
  const input = () => (next < lines.length ? lines[next++] : null)
  const print = (...args: unknown[]) => write(args.map(String).join(' ') + '\n')
  const sandboxConsole = { log: print, info: print, warn: print, debug: print, error: print }

  const t = performance.now()
  try {
    new Function('input', 'print', 'console', `"use strict";\n${js}`)(input, print, sandboxConsole)
    return { out, err: overflow ? 'Output limit exceeded (1 MB)' : '', exitCode: overflow ? 1 : 0, ms: performance.now() - t }
  } catch (e) {
    const msg = e instanceof Error ? (e.stack?.split('\n').slice(0, 6).join('\n') ?? e.message) : String(e)
    const stack = /call stack size|too much recursion/i.test(msg)
    return {
      out,
      err: overflow ? 'Output limit exceeded (1 MB)' : stack ? 'Stack overflow: recursion is too deep for the browser. Use an explicit stack.' : msg,
      exitCode: 1,
      ms: performance.now() - t,
    }
  }
}
