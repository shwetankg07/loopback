# loopback

A DSA practice playground that compiles and runs **C++, Java and Python in your browser, on your own CPU**. There's no judge server: paste a solution, add test cases, hit **Run all tests**, and get Accepted / Wrong answer / Time limit exceeded / Runtime error / Compile error for each one. Your code never leaves the tab.

Online compilers like JDoodle, OnlineGDB and Programiz send your code to a server and queue it. loopback ships the toolchains to the browser as WebAssembly instead. After the first load it runs with no waiting, costs nothing to host per run, and works offline.

## Features

- **Three languages in one tab.** C++20 (clang 22, `#include <bits/stdc++.h>` works), Java 8 (real `javac`), Python 3.14.
- **Test cases with verdicts.** Input plus optional expected output; output comparison ignores trailing spaces and blank lines. A wrong answer shows the first differing line.
- **Time limits.** Infinite loops stop at the limit (2s for C++, 5s for Java and Python) instead of hanging the page.
- **Share links.** Code, language and tests are compressed into the URL hash. No database.
- **Offline.** A service worker caches the app and the C++ and Python toolchains after the first run.
- **Autosave.** Code (per language) and tests are kept in `localStorage`. Ctrl/⌘ + Enter runs everything.

## How each language runs

| | Toolchain | Where it runs | Time limit enforcement |
|---|---|---|---|
| C++ | [YoWASP clang 22](https://github.com/YoWASP/clang) (LLVM compiled to WASI) compiles to wasm; [`@runno/wasi`](https://github.com/taybenlor/runno) runs it | Web Workers: one compiles, one runs | The run worker is terminated and respawned |
| Python | [Pyodide 314](https://pyodide.org) | A Web Worker | The worker is terminated and respawned (~1s) |
| Java | [CheerpJ 4.3](https://cheerpj.com) (a JVM in wasm), JDK 8 `javac` from `tools.jar` | A hidden same-origin iframe | Loop guard, see below |

**The Java loop guard.** CheerpJ runs Java on the page's main thread, so a worker can't be killed to stop a stuck program. `java/loopback/Compile.java` drives javac through its API and, right after parsing, rewrites every loop body to `{ loopback.Guard.tick(); body }` and `System.exit(x)` to `loopback.Guard.exit(x)`. `tick()` checks the clock every 16k iterations and throws once the limit has passed, and keeps throwing so a `catch (Throwable)` can't swallow it. Line numbers and compiler errors are unchanged. The trade-off is that the tab stays busy for up to the time limit while a stuck Java program runs.

Standard input is passed per test case, the way judges do it, not typed in while the program runs.

## Limits

- **First load is heavy.**
  - C++: a 26MB compiler download.
  - Python: 13MB.
  - Java: an 18MB `tools.jar`, plus CheerpJ's JDK runtime from its CDN.
  - Everything is cached after the first visit.
- **Compile time.** About 1.5s for C++ and about 1s for Java once warm. Slower than a server on a fast machine, and noticeably slower on low-end phones.
- **Deep recursion overflows the browser's call stack.**
  - C++: about 7k frames in Chrome, about 20k in Firefox.
  - Java: under 10k.
  - A DFS on a 10⁵-node path graph needs an explicit stack. The error message says so.
- **No C++ exceptions.** Code is compiled with `-fno-exceptions`, so `throw` doesn't compile and `vector::at` out of range aborts with a message.
- **Java is limited to Java 8 syntax** (no `var` or records). CheerpJ's Java 17 runtime doesn't ship a compiler.
- **Java needs a connection**, because CheerpJ loads from its CDN.
- **Not a trusted judge.** Verdicts are computed on the user's machine, so they're for practice, not contests.

## Development

Requirements: Node 22.18+ (the unit tests use Node's built-in TypeScript support). A JDK is needed only if you change `java/loopback/*.java`.

```sh
npm install
npm run dev          # copies toolchains into public/vendor, then starts Vite
```

Open the URL Vite prints.

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` | Copy toolchains into `public/vendor` (gitignored, about 57MB), then serve or build to `dist/` |
| `npm test` | Unit tests for output comparison and share links (`node --test`) |
| `npx playwright test` | End-to-end: every language through Accepted, Wrong answer, Time limit exceeded and recovery, compile errors, and all kinds of stuck Java loops. Set `CHROMIUM_PATH`, or install a browser with `npx playwright install chromium` |
| `npm run build:java` | Rebuild `public/java-harness.jar` from `java/loopback/` (`javac --release 8` against `tools.jar`) |

Layout:

```
src/main.ts               editor, tests panel, verdicts, share, autosave
src/run.ts                prepare(lang, code) → run(stdin, timeLimit): the whole runtime boundary
src/runners/              cpp / python / java runners and their workers
src/judge.ts              output comparison, share-link encoding
public/java-frame.html    CheerpJ host for Java
java/loopback/            javac driver with the loop guard, run harness
tests/smoke.spec.ts       Playwright end-to-end suite
SPIKE.md                  the measurements behind every choice above
```

## Deploying

The build is a static folder, `dist/` (58MB, largest file 22MB). It needs no special headers, no cross-origin isolation and no server.

- **Cloudflare Pages** (recommended): free, unlimited bandwidth, edge locations across India.
  1. Connect the repo.
  2. Set the build command to `npm run build`.
  3. Set the output directory to `dist`.
  4. Set the Node version to 22 or newer.
- **GitHub Pages:** works under a `/loopback/` path, since every URL is relative. The soft limit is 100GB of bandwidth a month.
- **Vercel / Netlify:** same build settings. Vercel's free Hobby plan is non-commercial only.

The two large clang files are served gzipped and decompressed in the browser, so they stay under per-file limits like Cloudflare's 25MB.

## Credits and licenses

loopback builds on:
- [YoWASP clang](https://github.com/YoWASP/clang) (Apache-2.0 with LLVM exceptions)
- [Pyodide](https://github.com/pyodide/pyodide) (MPL-2.0)
- [`@runno/wasi`](https://github.com/taybenlor/runno) (MIT)
- [CodeMirror](https://codemirror.net) (MIT)
- [CheerpJ](https://cheerpj.com)
- OpenJDK 8's `tools.jar` (GPLv2 with Classpath Exception), taken from [JavaFiddle](https://github.com/leaningtech/javafiddle)

CheerpJ is free under its [Community License](https://cheerpj.com/licensing/) for personal projects, open-source projects and one-person companies. Business use needs a commercial license from Leaning Technologies.
