import { OUTPUT_LIMIT, vendorURL, type Prepared, type RunResult } from '../run.ts'
import { KillableWorker, timeoutResult } from './worker-call.ts'
import type { WasiResult } from './wasi-run.ts'

// Go, Ruby and PHP: one WASI binary each, run in a worker that gets terminated on timeout.
export type WasiLang = 'go' | 'ruby' | 'php'

const workers: Partial<Record<WasiLang, KillableWorker>> = {}
const workerFor = (lang: WasiLang) =>
  (workers[lang] ??= new KillableWorker(() => new Worker(new URL('./wasi.worker.ts', import.meta.url), { type: 'module' })))

export const prepareWasi = (lang: WasiLang) => async (code: string): Promise<Prepared> => ({
  async run(stdin, timeoutMs): Promise<RunResult> {
    const r = await workerFor(lang).call<WasiResult>({ lang, vendor: vendorURL(''), code, stdin, limit: OUTPUT_LIMIT }, timeoutMs)
    if (r === 'timeout') return timeoutResult(timeoutMs)
    return {
      status: r.exitCode === 0 ? 'ok' : 'runtime_error',
      stdout: r.out,
      stderr: r.err || (r.exitCode ? `Exit code ${r.exitCode}` : ''),
      ms: r.ms,
    }
  },
})
