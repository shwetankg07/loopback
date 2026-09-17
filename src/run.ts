import { prepareC, prepareCpp } from './runners/cpp.ts'
import { preparePython } from './runners/python.ts'
import { prepareJava } from './runners/java.ts'
import { prepareJs } from './runners/js.ts'
import { prepareWasi } from './runners/wasi.ts'

export type Lang = 'c' | 'cpp' | 'java' | 'python' | 'js' | 'ts' | 'go' | 'ruby' | 'php'
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
  c: prepareC,
  cpp: prepareCpp,
  java: prepareJava,
  python: preparePython,
  js: prepareJs('js'),
  ts: prepareJs('ts'),
  go: prepareWasi('go'),
  ruby: prepareWasi('ruby'),
  php: prepareWasi('php'),
}

export const prepare = (lang: Lang, code: string) => runners[lang](code)
