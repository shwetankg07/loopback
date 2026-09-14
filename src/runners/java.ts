import { OUTPUT_LIMIT, type Prepared, type RunResult, type RunStatus } from '../run.ts'
import { timeoutResult } from './worker-call.ts'

// Java runs in a same-origin iframe (public/java-frame.html). CheerpJ uses the page's main thread, but every loop in
// the user's program is compiled with a time check, so a stuck program stops itself at the time limit.
let frame: HTMLIFrameElement | undefined
let loaded: Promise<void> | undefined
let loadedCode = ''
let seq = 0

function ensureFrame() {
  if (loaded) return loaded
  const f = (frame = document.createElement('iframe'))
  f.src = new URL('java-frame.html', document.baseURI).href
  f.hidden = true
  f.title = 'Java runtime'
  loadedCode = ''
  loaded = new Promise((resolve) => {
    addEventListener('message', function onReady(e: MessageEvent) {
      if (e.source === f.contentWindow && e.data?.ready) { removeEventListener('message', onReady); resolve() }
    })
  })
  document.body.append(f)
  return loaded
}

function kill() {
  frame?.remove()
  frame = loaded = undefined
}

function call<T>(msg: object, timeoutMs = 0): Promise<T | 'timeout'> {
  const id = ++seq
  const target = frame!
  return new Promise((resolve) => {
    const timer = timeoutMs ? setTimeout(() => { removeEventListener('message', on); kill(); resolve('timeout') }, timeoutMs) : 0
    const on = (e: MessageEvent) => {
      if (e.source !== target.contentWindow || e.data?.id !== id) return
      removeEventListener('message', on)
      clearTimeout(timer)
      resolve(e.data)
    }
    addEventListener('message', on)
    target.contentWindow!.postMessage({ id, ...msg }, location.origin)
  })
}

type Compiled = { compileError?: string; crash?: string }
type Ran = { status: RunStatus; stdout: string; stderr: string; ms: number; crash?: string }

async function compile(code: string): Promise<Compiled> {
  await ensureFrame()
  const res = (await call<Compiled>({ op: 'compile', code })) as Compiled
  if (!res.compileError && !res.crash) loadedCode = code
  return res
}

export async function prepareJava(code: string): Promise<Prepared> {
  const res = await compile(code)
  if (res.crash) return { compileError: `Java runtime failed to start: ${res.crash}` }
  if (res.compileError) return { compileError: res.compileError }
  return {
    async run(stdin, timeoutMs): Promise<RunResult> {
      if (!frame || loadedCode !== code) {
        const again = await compile(code)
        if (again.compileError || again.crash) return { status: 'runtime_error', stdout: '', stderr: again.compileError || again.crash!, ms: 0 }
      }
      // The loop guard enforces the limit inside the JVM. This outer timer only catches a program blocked outside
      // any loop (a huge Thread.sleep), and then the frame is thrown away.
      const r = await call<Ran>({ op: 'run', stdin, limit: OUTPUT_LIMIT, timeoutMs }, timeoutMs * 2 + 10_000)
      if (r === 'timeout' || r.status === 'timeout') return timeoutResult(timeoutMs)
      if (r.crash) { kill(); return { status: 'runtime_error', stdout: '', stderr: r.crash, ms: 0 } }
      return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms: r.ms }
    },
  }
}
