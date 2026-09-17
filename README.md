# loopback

**Compile and run your contest code in the browser, on your own CPU.** Paste a solution, drop in the sample tests, and see Accepted / Wrong answer / Time limit exceeded before you submit. No server, no queue, no waiting for a judge. Your code never leaves the tab.

It's for the moment between reading a Codeforces problem and submitting it, when you'd otherwise paste your code into an online compiler to check the samples.

Nine languages: **C, C++, Java, Python, JavaScript, TypeScript, Go, Ruby, PHP.**

## Features

- **Sample tests, not one run.** Each test has input and optional expected output. Run one, or run them all. Wrong answers show the first differing line. Leave expected output empty to just see what your program prints.
- **Time limits**, so an infinite loop can't hang the tab: 2s for C and C++, 5s elsewhere.
- **Fast-IO starter templates** per language.
- **Share links.** Code, language and tests are compressed into the URL. No database, no accounts.
- **Offline.** After the first run a service worker keeps the toolchains, so it works on a train.
- **Autosave** per language, and Ctrl/⌘ + Enter to run.

## How each language runs

| Language | Toolchain | First-use download |
|---|---|---|
| C, C++ | [YoWASP clang 22](https://github.com/YoWASP/clang) compiles to wasm, [`@runno/wasi`](https://github.com/taybenlor/runno) runs it | 26MB |
| Python 3.14 | [Pyodide](https://pyodide.org) in a worker | 13MB |
| Java 8 | [CheerpJ](https://cheerpj.com) with JDK 8 `javac` | 18MB + CheerpJ's runtime |
| Go | [yaegi](https://github.com/traefik/yaegi) interpreter, built for wasip1 | 8MB |
| Ruby 3.2 | [CRuby via WLR](https://github.com/vmware-labs/webassembly-language-runtimes) | 7MB |
| PHP 8.2 | [php-cgi via WLR](https://github.com/vmware-labs/webassembly-language-runtimes) | 4MB |
| JavaScript | The browser's own engine, in a worker | none |
| TypeScript | Types stripped by [Sucrase](https://github.com/alangpierce/sucrase), then run like JavaScript | under 1MB |

Each toolchain downloads the first time you pick that language, then stays cached.

Measured on one machine, running a+b once (downloads served locally, so add your own network time for that first run):

| | C | C++ | Java | Python | JS | TS | Go | Ruby | PHP |
|---|---|---|---|---|---|---|---|---|---|
| First run | 0.8s | 2.9s | 35s | 1.4s | 0.1s | 0.1s | 0.4s | 0.3s | 0.2s |
| After that | 0.1s | 0.1s | 0.9s | 0.1s | 0.1s | 0.1s | 0.1s | 0.1s | 0.1s |

Java is the outlier: CheerpJ fetches its JDK runtime from its own CDN before the first compile.

**Two languages need explaining:**

- **JavaScript and TypeScript** have no Node, so input comes from `input()` (the next line, or `null`) and output from `print()` or `console.log()`.
- **PHP** only has a maintained CGI build for WASI, so input is handed over as a POST body and a wrapper file defines `STDIN`. Your code reads `fgets(STDIN)` as usual.

**Java's loop guard.** CheerpJ runs Java on the page's main thread, so a worker can't be killed to stop a stuck program. Every program is compiled through javac's API with a time check spliced into each loop body, so it stops itself at the limit. See `java/loopback/Compile.java`.

## Limits

- **Deep recursion overflows the browser's call stack**: about 7k frames for C and C++ in Chrome (about 20k in Firefox), and under 10k in Java. A DFS over 10⁵ nodes needs an explicit stack.
- **No C++ exceptions.** Built with `-fno-exceptions`, so `throw` won't compile and `vector::at` aborts.
- **Java is Java 8 syntax** (no `var`, no records) and needs a connection, because CheerpJ loads its runtime from a CDN.
- **Go is interpreted** (yaegi), so it's slower than real Go, has no cgo, and covers only part of the standard library.
- **TypeScript is transpiled, not type-checked.** Type errors only show up if they break at runtime.
- **Verdicts aren't trustworthy for contests.** Everything runs on the user's machine, so anyone can fake a pass. It's for checking your own work.
- **First load is heavy** per language, though everything is cached afterwards.

## Development

Requirements: Node 22.18+ (the unit tests use Node's built-in TypeScript support). Go is needed only to build the Go runtime, and a JDK only if you change `java/loopback/*.java`.

```sh
npm install
npm run dev       # vendors the toolchains into public/vendor, then starts Vite
```

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` | Vendor toolchains (`scripts/vendor.sh`, about 76MB, gitignored), then serve or build `dist/` |
| `npm test` | Unit tests for output comparison and share links |
| `npx playwright test` | End-to-end: every language through Accepted, Wrong answer, a time limit, recovery, and a broken program. Needs Chromium; set `CHROMIUM_PATH` or run `npx playwright install chromium` |
| `npm run build:java` | Rebuild `public/java-harness.jar` from `java/loopback/` |
| `npm run build:go` | Rebuild the yaegi wasm runtime from `go/` |

```
src/main.ts               editor, tests panel, verdicts, share, autosave
src/run.ts                prepare(lang, code) → run(stdin, timeLimit): the whole runtime boundary
src/runners/              one module per language, each with its worker
src/runners/wasi-run.ts   shared WASI runner: argv, files, stdin, output cap
src/judge.ts              output comparison and share-link encoding
public/java-frame.html    CheerpJ host for Java
java/loopback/            javac driver with the loop guard, run harness
go/main.go                the yaegi wrapper compiled to wasip1
tests/smoke.spec.ts       end-to-end suite
SPIKE.md                  measurements and rejected options
```

## Deploying

`dist/` is a static folder (about 76MB, largest file 22MB) that needs no special headers and no server.

- **Cloudflare Pages** (recommended): free, unlimited bandwidth, edge locations in India. Build command `npm run build`, output directory `dist`, Node 22+. Its build image needs Go for the Go runtime; without it every other language still works.
- **GitHub Pages**: works under a `/loopback/` path. Soft limit of 100GB a month.
- **Vercel / Netlify**: same settings; Vercel's free plan is non-commercial only.

Large toolchain files are stored gzipped and inflated in the browser, which keeps every file under limits like Cloudflare's 25MB.

## Why some languages aren't here

A language can only work here if its **compiler or interpreter** has been ported to WebAssembly. Compiling *to* wasm isn't enough.

- **Rust:** `rustc` runs a separate linker process, which WASI can't do, and wants threads. [rubrc](https://github.com/oligamiq/rubrc) proved it possible, then stalled.
- **Swift:** no wasm build of `swiftc`; [SwiftWasm](https://swiftwasm.org/) compiles server-side.
- **Scala, Kotlin:** JVM compilers, 60–100MB and seconds per compile natively. Java's `javac` under CheerpJ is already the slow one here.
- **Elixir:** [Popcorn](https://popcorn.swmansion.com/) runs BEAM in the browser and is worth revisiting, but it's prerelease and version-pinned.

## Credits and licenses

[YoWASP clang](https://github.com/YoWASP/clang) (Apache-2.0 with LLVM exceptions), [Pyodide](https://github.com/pyodide/pyodide) (MPL-2.0), [`@runno/wasi`](https://github.com/taybenlor/runno) (MIT), [yaegi](https://github.com/traefik/yaegi) (Apache-2.0), [WebAssembly Language Runtimes](https://github.com/vmware-labs/webassembly-language-runtimes) (Apache-2.0) for Ruby and PHP, [CodeMirror](https://codemirror.net) (MIT), [CheerpJ](https://cheerpj.com), and OpenJDK 8's `tools.jar` (GPLv2 with Classpath Exception) via [JavaFiddle](https://github.com/leaningtech/javafiddle).

CheerpJ is free under its [Community License](https://cheerpj.com/licensing/) for personal and open-source projects and one-person companies. Business use needs a commercial license.
