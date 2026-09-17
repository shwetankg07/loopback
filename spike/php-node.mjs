// Throwaway spike: can php-cgi.wasm behave like a CLI under @runno/wasi? Checks stdin and stray CGI headers.
import { readFile } from 'node:fs/promises'
import { WASI, WASIContext } from '/home/predator/loopback/node_modules/@runno/wasi/dist/main.js'

const wasm = await readFile('public/vendor/php/php-cgi.wasm')
const file = (path, content) => ({ [path]: { path, content, mode: 'string', timestamps: { access: new Date(), modification: new Date(), change: new Date() } } })

async function run(label, code, stdin, args, env = {}) {
  let out = '', err = '', pos = 0
  const t = performance.now()
  try {
    const r = await WASI.start(new Response(wasm, { headers: { 'Content-Type': 'application/wasm' } }), new WASIContext({
      args,
      env,
      fs: file('/main.php', code),
      stdin: (max) => { const c = stdin.slice(pos, pos + max); pos += c.length; return c.length ? c : null },
      stdout: (s) => (out += s),
      stderr: (s) => (err += s),
    }))
    console.log(`--- ${label} [${args.join(' ')}] exit=${r.exitCode} ${Math.round(performance.now() - t)}ms`)
  } catch (e) {
    console.log(`--- ${label} [${args.join(' ')}] THREW ${e.message}`)
  }
  console.log('    stdout:', JSON.stringify(out.slice(0, 300)))
  if (err) console.log('    stderr:', JSON.stringify(err.slice(0, 200)))
}

const HELLO = `<?php echo "hello\\n";`
const STDIN_LINES = `<?php
$n = trim(fgets(STDIN));
$parts = explode(" ", trim(fgets(STDIN)));
$sum = 0;
foreach ($parts as $p) $sum += (int)$p;
echo $sum, " ", max(array_map('intval', $parts)), "\\n";`

await run('hello, -q', HELLO, '', ['php', '-q', '/main.php'])
await run('hello, no -q', HELLO, '', ['php', '/main.php'])
await run('stdin via fgets', STDIN_LINES, '5\n3 1 4 1 5\n', ['php', '-q', '/main.php'])
await run('stdin with CGI env', STDIN_LINES, '5\n3 1 4 1 5\n', ['php', '-q', '/main.php'], { REQUEST_METHOD: 'POST', CONTENT_LENGTH: '16', CONTENT_TYPE: 'text/plain' })
await run('parse error', `<?php echo ;`, '', ['php', '-q', '/main.php'])
