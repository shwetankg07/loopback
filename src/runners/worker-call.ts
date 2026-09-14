import type { RunResult } from '../run.ts'

// A worker that answers one message at a time and can be killed on timeout.
// ponytail: one in-flight call per worker, the UI runs tests sequentially anyway.
export class KillableWorker {
  private worker?: Worker
  onProgress?: (p: { doneLength: number; totalLength: number }) => void
  constructor(private spawn: () => Worker) {}

  call<T>(msg: unknown, timeoutMs = 0): Promise<T | 'timeout'> {
    const w = (this.worker ??= this.spawn())
    return new Promise((resolve, reject) => {
      const timer = timeoutMs ? setTimeout(() => { this.kill(); resolve('timeout') }, timeoutMs) : 0
      w.onmessage = ({ data }) => {
        if (data?.progress) return this.onProgress?.(data.progress)
        clearTimeout(timer)
        resolve(data)
      }
      w.onerror = (e) => { clearTimeout(timer); this.kill(); reject(new Error(e.message || 'worker crashed')) }
      w.postMessage(msg)
    })
  }

  kill() {
    this.worker?.terminate()
    this.worker = undefined
  }
}

export const timeoutResult = (ms: number): RunResult => ({ status: 'timeout', stdout: '', stderr: `Time limit exceeded (${ms / 1000}s)`, ms })
