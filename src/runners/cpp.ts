import { OUTPUT_LIMIT, vendorURL, type Prepared, type RunResult } from '../run.ts'
import { KillableWorker, timeoutResult } from './worker-call.ts'
import type { WasiResult } from './wasi-run.ts'

const spawn = () => new Worker(new URL('./cpp.worker.ts', import.meta.url), { type: 'module' })
const compiler = new KillableWorker(spawn)
const runner = new KillableWorker(spawn)

export const onCompilerDownload = (fn: (p: { doneLength: number; totalLength: number }) => void) => { compiler.onProgress = fn }

type Compiled = { module: WebAssembly.Module } | { compileError: string }

// C and C++ share one clang; only the driver arguments differ.
const prepareClang = (lang: 'c' | 'cpp') => async (code: string): Promise<Prepared> => {
  const res = (await compiler.call<Compiled>({ op: 'compile', vendor: vendorURL(''), lang, code })) as Compiled
  if ('compileError' in res) return res
  return {
    async run(stdin, timeoutMs): Promise<RunResult> {
      const r = await runner.call<WasiResult>({ op: 'run', module: res.module, stdin, limit: OUTPUT_LIMIT }, timeoutMs)
      if (r === 'timeout') return timeoutResult(timeoutMs)
      const aborted = r.exitCode === 134 && !r.err ? 'Aborted (exit code 134)' : ''
      return {
        status: r.exitCode === 0 ? 'ok' : 'runtime_error',
        stdout: r.out,
        stderr: r.err || aborted || (r.exitCode ? `Exit code ${r.exitCode}` : ''),
        ms: r.ms,
      }
    },
  }
}

export const prepareC = prepareClang('c')
export const prepareCpp = prepareClang('cpp')
