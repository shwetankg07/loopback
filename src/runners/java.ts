import { OUTPUT_LIMIT, type Prepared, type RunResult, type RunStatus } from '../run.ts'
import { timeoutResult } from './worker-call.ts'

// The frame must be cross-site so a Java infinite loop can't freeze the editor (see SPIKE.md).
// Production: set VITE_JAVA_FRAME_ORIGIN to a separate site hosting the same build.
// Dev: 127.0.0.1 and localhost are different sites, so swap between them.
function frameURL() {
  const configured = import.meta.env.VITE_JAVA_FRAME_ORIGIN as string | undefined
  if (configured) return new URL('java-frame.html', configured).href
  const url = new URL('java-frame.html', document.baseURI)
  if (url.hostname === '127.0.0.1') url.hostname = 'localhost'
  else if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
  // ponytail: anywhere else the frame is same-site, so an infinite loop freezes the tab until reload
  return url.href
}

let frame: HTMLIFrameElement | undefined
let loaded: Promise<void> | undefined
let loadedCode = ''
let killedAt = 0
let seq = 0

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function ensureFrame() {
  if (!frame) loaded = spawnFrame()
  return loaded!
}

// Chrome reuses a site's renderer process for a new frame. Right after a kill that process is still spinning in the
// old infinite loop, so a new frame there never starts; Chrome shuts the empty process down within ~1.5s (SPIKE.md).
// The frame says "ready" before it boots the JVM, so no "ready" means it landed in a stuck process: retry.
async function spawnFrame() {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(Math.max(0, killedAt + 2000 - Date.now()))
    const f = (frame = document.createElement('iframe'))
    f.src = frameURL()
    f.hidden = true
    f.title = 'Java runtime'
    loadedCode = ''
    const ready = new Promise<boolean>((resolve) => {
      const onReady = (e: MessageEvent) => {
        if (e.source === f.contentWindow && e.data?.ready) { removeEventListener('message', onReady); resolve(true) }
      }
      addEventListener('message', onReady)
      setTimeout(() => { removeEventListener('message', onReady); resolve(false) }, 15000)
    })
    document.body.append(f)
    if (await ready) return
    f.remove()
    killedAt = Date.now()
  }
  frame = undefined
  throw new Error('the Java runtime is stuck in a previous program')
}

function kill() {
  frame?.remove()
  frame = loaded = undefined
  killedAt = Date.now()
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
    target.contentWindow!.postMessage({ id, ...msg }, new URL(target.src).origin)
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
      // After a timeout the frame was destroyed: boot a new JVM and recompile before the clock starts.
      if (!frame || loadedCode !== code) {
        const again = await compile(code)
        if (again.compileError || again.crash) return { status: 'runtime_error', stdout: '', stderr: again.compileError || again.crash!, ms: 0 }
      }
      const r = await call<Ran>({ op: 'run', stdin, limit: OUTPUT_LIMIT }, timeoutMs)
      if (r === 'timeout') return timeoutResult(timeoutMs)
      if (r.crash) { kill(); return { status: 'runtime_error', stdout: '', stderr: r.crash, ms: 0 } }
      return { status: r.status, stdout: r.stdout, stderr: r.stderr, ms: r.ms }
    },
  }
}
