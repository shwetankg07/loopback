// Throwaway spike: run the Go, Ruby and PHP WASI runtimes through @runno/wasi exactly as the browser will.
import { readFile } from 'node:fs/promises'
import { WASI, WASIContext } from '/home/predator/loopback/node_modules/@runno/wasi/dist/main.js'

const stamps = { access: new Date(), modification: new Date(), change: new Date() }
const file = (path, content) => ({ [path]: { path, content, mode: 'string', timestamps: stamps } })
const cache = {}

async function run(label, wasmPath, args, srcPath, code, stdin = '', env = {}) {
  cache[wasmPath] ??= await readFile(wasmPath)
  let out = '', err = '', pos = 0
  const t = performance.now()
  try {
    const r = await WASI.start(new Response(cache[wasmPath], { headers: { 'Content-Type': 'application/wasm' } }), new WASIContext({
      args, env,
      fs: file(srcPath, code),
      stdin: (max) => { const c = stdin.slice(pos, pos + max); pos += c.length; return c.length ? c : null },
      stdout: (s) => (out += s),
      stderr: (s) => (err += s),
    }))
    console.log(`--- ${label}: exit=${r.exitCode} ${Math.round(performance.now() - t)}ms`)
  } catch (e) {
    console.log(`--- ${label}: THREW ${e.message} (${Math.round(performance.now() - t)}ms)`)
  }
  if (out) console.log('    stdout:', JSON.stringify(out.slice(0, 220)))
  if (err) console.log('    stderr:', JSON.stringify(err.slice(0, 220)))
}

const INPUT = '5\n3 1 4 1 5\n'
const GO = `package main

import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	reader := bufio.NewReader(os.Stdin)
	var n int
	fmt.Fscan(reader, &n)
	sum, max := 0, -1<<62
	for i := 0; i < n; i++ {
		var x int
		fmt.Fscan(reader, &x)
		sum += x
		if x > max {
			max = x
		}
	}
	fmt.Println(sum, max)
}`
const RUBY = `n = gets.to_i
a = gets.split.map(&:to_i)
puts "#{a.sum} #{a.max}"`
const PHP_STDIN_STREAM = `<?php
$in = fopen("php://stdin", "r");
$n = (int)trim(fgets($in));
$a = array_map('intval', explode(" ", trim(fgets($in))));
echo array_sum($a), " ", max($a), "\\n";`
const PHP_GET_CONTENTS = `<?php
$data = preg_split('/\\s+/', trim(file_get_contents("php://stdin")));
$n = (int)array_shift($data);
$a = array_map('intval', $data);
echo array_sum($a), " ", max($a), "\\n";`

const go = 'public/vendor/go/yaegi.wasm', ruby = 'public/vendor/ruby/ruby.wasm', php = 'public/vendor/php/php-cgi.wasm'

await run('go: sum and max', go, ['yaegi', '/main.go'], '/main.go', GO, INPUT)
await run('go: goroutines and channels', go, ['yaegi', '/main.go'], '/main.go', `package main

import "fmt"

func main() {
	ch := make(chan int)
	go func() { ch <- 21 * 2 }()
	fmt.Println(<-ch)
}`, '')
await run('go: compile error', go, ['yaegi', '/main.go'], '/main.go', `package main

func main() { undefinedThing() }`, '')

await run('ruby: sum and max', ruby, ['ruby', '/main.rb'], '/main.rb', RUBY, INPUT)
await run('ruby: syntax error', ruby, ['ruby', '/main.rb'], '/main.rb', 'def f(\nend', '')

await run('php: php://stdin', php, ['php', '-q', '-d', 'html_errors=0', '/main.php'], '/main.php', PHP_STDIN_STREAM, INPUT)
await run('php: file_get_contents', php, ['php', '-q', '-d', 'html_errors=0', '/main.php'], '/main.php', PHP_GET_CONTENTS, INPUT)
await run('php: parse error, plain text', php, ['php', '-q', '-d', 'html_errors=0', '/main.php'], '/main.php', '<?php echo ;', '')
