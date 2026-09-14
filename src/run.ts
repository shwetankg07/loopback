import { prepareCpp } from './runners/cpp.ts'
import { preparePython } from './runners/python.ts'
import { prepareJava } from './runners/java.ts'

export type Lang = 'cpp' | 'java' | 'python'
export type RunStatus = 'ok' | 'runtime_error' | 'timeout'
export type RunResult = { status: RunStatus; stdout: string; stderr: string; ms: number }

// Compile once, then run against every test case's stdin.
export type Prepared =
  | { compileError: string }
  | { run(stdin: string, timeoutMs: number): Promise<RunResult> }

export const OUTPUT_LIMIT = 1 << 20

// Toolchains are copied into public/vendor by `npm run vendor`; resolve against the page so any base path works.
export const vendorURL = (path: string) => new URL('vendor/' + path, document.baseURI).href

const runners: Record<Lang, (code: string) => Promise<Prepared>> = {
  cpp: prepareCpp,
  python: preparePython,
  java: prepareJava,
}

export const prepare = (lang: Lang, code: string) => runners[lang](code)
