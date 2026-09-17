import { fetchWasm, runWasi, wasiFiles } from './wasi-run.ts'

// Languages that are a single WASI binary plus one source file. Interpreters, so there is no separate compile step:
// syntax errors surface as runtime errors.
type WasiLang = 'go' | 'ruby' | 'php'

const SPEC: Record<WasiLang, {
  wasm: string
  files: (code: string) => Record<string, string>
  args: string[]
  env?: (stdin: string) => Record<string, string>
  clean?: (out: string) => string
}> = {
  go: {
    wasm: 'go/yaegi.wasm',
    files: (code) => ({ '/main.go': code }),
    args: ['yaegi', '/main.go'],
  },
  ruby: {
    wasm: 'ruby/ruby.wasm',
    files: (code) => ({ '/main.rb': code }),
    args: ['ruby', '/main.rb'],
  },
  php: {
    // This is the CGI build (the only maintained WASI one), so stdin arrives as a POST body and a wrapper file
    // hands it to the program as STDIN. Keeping the user's file separate keeps error line numbers right.
    wasm: 'php/php-cgi.wasm',
    files: (code) => ({
      '/run.php': `<?php define('STDIN', fopen('php://input', 'r')); require '/main.php';`,
      '/main.php': code,
    }),
    args: ['php', '-q', '-d', 'html_errors=0', '/run.php'],
    env: (stdin) => ({
      REQUEST_METHOD: 'POST',
      CONTENT_TYPE: 'text/plain',
      CONTENT_LENGTH: String(new TextEncoder().encode(stdin).length),
      SCRIPT_FILENAME: '/run.php',
      REDIRECT_STATUS: '1',
    }),
    clean: (out) => out.replace(/^(?:[\w-]+: [^\r\n]*\r?\n)+\r?\n/, ''),
  },
}

const modules: Partial<Record<WasiLang, Promise<WebAssembly.Module>>> = {}

onmessage = async ({ data }: MessageEvent<{ lang: WasiLang; vendor: string; code: string; stdin: string; limit: number }>) => {
  const spec = SPEC[data.lang]
  try {
    const module = await (modules[data.lang] ??= fetchWasm(data.vendor + spec.wasm))
    const result = await runWasi({
      module,
      args: spec.args,
      env: spec.env?.(data.stdin),
      fs: wasiFiles(spec.files(data.code)),
      stdin: data.stdin,
      limit: data.limit,
    })
    postMessage(spec.clean ? { ...result, out: spec.clean(result.out) } : result)
  } catch (e) {
    postMessage({ out: '', err: e instanceof Error ? e.message : String(e), exitCode: 1, ms: 0 })
  }
}
