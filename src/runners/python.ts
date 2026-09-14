import { OUTPUT_LIMIT, vendorURL, type Prepared, type RunResult, type RunStatus } from '../run.ts'
import { KillableWorker, timeoutResult } from './worker-call.ts'

const python = new KillableWorker(() => new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' }))

type Ran = { status: RunStatus; out: string; err: string; ms: number; fatal?: boolean }

export async function preparePython(code: string): Promise<Prepared> {
  const vendor = vendorURL('')
  const { compileError } = (await python.call<{ compileError: string }>({ op: 'check', vendor, code })) as { compileError: string }
  if (compileError) return { compileError }
  return {
    async run(stdin, timeoutMs): Promise<RunResult> {
      // Pyodide boots in ~1s; don't let the boot of a freshly respawned worker eat the time limit.
      await python.call({ op: 'check', vendor, code: '' })
      const r = await python.call<Ran>({ op: 'run', vendor, code, stdin, limit: OUTPUT_LIMIT }, timeoutMs)
      if (r === 'timeout') return timeoutResult(timeoutMs)
      if (r.fatal) python.kill()
      return { status: r.status, stdout: r.out, stderr: r.err, ms: r.ms }
    },
  }
}
