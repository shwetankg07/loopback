# Phase 0 spike findings (2026-09-12)

All measured in headless Chromium 151 / Firefox 153 on this machine. Throwaway code lives in `spike/`.

## C++: YoWASP clang 22 (`@yowasp/clang`), NOT Runno
- Runno's clang is 2019 Clang 8.0.1: C++14 default + `-Werror`, no exceptions, no `bits/stdc++.h`, compile errors hidden. Rejected.
- YoWASP clang 22.1.0 works in a worker, no SharedArrayBuffer / COOP/COEP needed.
  - Flags: `clang++ -std=c++20 -O2 -fno-exceptions -I. -Wl,-z,stack-size=67108864`
  - `bits/stdc++.h`: pass it as a virtual file `{ bits: { "stdc++.h": shim } }` (works).
  - C++20 ranges and C++23 `<print>` work.
- Timing: cold compile 2.4s, warm 1.6s, a+b run 8ms, sieve 1e7 86ms, 200k ints stdin 294ms.
- Assets: 105MB raw (llvm.core.wasm 73MB); 21MB brotli. Too big for Cloudflare Pages' 25MB/file limit; GitHub Pages is fine.
- Run the compiled program with `@runno/wasi`: `new WASI(ctx)`, `WebAssembly.instantiate(module, wasi.getImportObject())`, `wasi.start({module, instance})`. Compile the module once and reuse it for every test case.
- **Ceilings**
  - No exceptions: `.at()` aborts with the message "out_of_range was thrown in -fno-exceptions mode".
  - Null deref doesn't crash.
  - **Recursion depth**:

    | Browser | Worker | Main thread |
    |---|---|---|
    | Chromium | ~7k | ~12k |
    | Firefox/Zen | ~20k | ~50k |

    Warm-up (tier-up) doesn't help. Untested idea: JSPI (`WebAssembly.promising`) runs on a separate stack. Test page: `spike/jspi.html`.

## Python: Pyodide 314 in a worker (go)
- Cold start 1.07s, a+b 4ms/1ms warm, 200k ints 24ms, recursion 20000 ok.
- Tracebacks work; fresh `globals` per run.
- Infinite loop: `worker.terminate()` + respawn 0.9s.
- stdin via `setStdin({ read(buf) })` from a string; stdout/stderr via `write(buf)`.

## Java: CheerpJ 4.3, version 8 + JavaFiddle's `tools.jar` javac (go, with ceilings)
- Needs a server that supports HTTP Range (python http.server fails; Vite works).
- Java 17 runtime has no javac; ECJ on 17 fails ("invalid location for system libraries: /lt/17"). **Source level = Java 8** for now.
- **javac `-d` dir must exist**: the Harness has a `mkdir` mode.
- The Harness loads user classes through a fresh `URLClassLoader` per run, so recompiling into the same dir is not stale (verified).
- stdin via `cheerpOSAddStringFile('/str/stdin.txt')` + `System.setIn`. stdout goes to `/files/stdout.txt`, read with `cjFileBlob`. javac errors and stack traces come from `#console`.
- Timing: init ~1s, harness compile 7s cold, compile ~0.95s warm, run ~0.35s, 200k ints BufferedReader 384ms.
- **Ceilings**
  - Recursion 10000 already fails, and shows up as a bogus `ArithmeticException`. Map that to "stack overflow".
  - **`System.exit(0)` hangs the JVM** (page never finished): rewrite it, or run Java in a disposable iframe.
- Not yet tested: whether an infinite loop freezes the page (`?steps=loop`).

## Resolved 2026-09-13
- JSPI (`WebAssembly.promising`) does NOT raise Chromium's ceiling (7k ok, 20k overflow). C++ keeps the ceiling and shows a clear message.
- A Java infinite loop blocks the main thread of its whole *site*.
  - Cross-site iframe (page on 127.0.0.1, frame on localhost): parent timers stayed at 250ms, so the page stays responsive.
  - Same-site iframe: the page froze.
  - So the Java runner is a cross-site iframe, killed and recreated on timeout. Production needs the frame on a different registrable domain (e.g. its own `*.pages.dev` / `*.github.io` site).
- Respawn after a Java timeout: a new frame created immediately lands in the same, still-looping renderer process and never boots. After 1.5s or 5s it boots fine, because Chrome kills the empty process. The runner waits 2s after a kill, and retries if the frame never says "ready".
- The `bits/stdc++.h` shim must leave out `<csetjmp>` and `<csignal>`; WASI rejects both.
- `System.exit` fix: rewrite `System.exit(` to `Harness.exit(`, which throws an `Error` the harness catches.

## Build status 2026-09-14
Phases 1–3 are done and verified. All three open items below are closed.
- `npm test`: 2 pass.
- `npx playwright test`: 6 pass.
- A real problem was accepted in all three languages.
- Share link restores in a fresh profile.
- Production build runs C++ and Python offline.

Not done:
- Deploy (needs a second site for the Java frame).
- Java offline (CheerpJ is loaded from its CDN).

## Was open (as of 2026-09-12)
1. `?steps=loop` (Java infinite loop vs page responsiveness) and `spike/jspi.html` (C++ recursion via JSPI).
2. `node --test src/judge.test.ts` (written, not yet run).
3. Then Phase 1 runners per the plan (`~/.claude/plans/dude-i-have-an-vast-wilkes.md`), using the choices above.
