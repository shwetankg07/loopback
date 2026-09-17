import { OUTPUT_LIMIT, type Prepared, type RunResult } from '../run.ts'
import { KillableWorker, timeoutResult } from './worker-call.ts'
import type { WasiResult } from './wasi-run.ts'

const js = new KillableWorker(() => new Worker(new URL('./js.worker.ts', import.meta.url), { type: 'module' }))

type Checked = { js: string } | { compileError: string }

export const prepareJs = (lang: 'js' | 'ts') => async (code: string): Promise<Prepared> => {
  const checked = (await js.call<Checked>({ op: 'check', lang, code })) as Checked
  if ('compileError' in checked) return checked
  return {
    async run(stdin, timeoutMs): Promise<RunResult> {
      const r = await js.call<WasiResult>({ op: 'run', js: checked.js, stdin, limit: OUTPUT_LIMIT }, timeoutMs)
      if (r === 'timeout') return timeoutResult(timeoutMs)
      return { status: r.exitCode === 0 ? 'ok' : 'runtime_error', stdout: r.out, stderr: r.err, ms: r.ms }
    },
  }
}
