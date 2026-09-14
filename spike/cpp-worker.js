// Throwaway spike: YoWASP clang + @runno/wasi inside a browser worker.
import { runClang } from "/node_modules/@yowasp/clang/gen/bundle.js";
import { WASI, WASIContext } from "/node_modules/@runno/wasi/dist/main.js";

const dec = new TextDecoder();
const shim = "algorithm array bitset cassert cctype chrono climits cmath cstdint cstdio cstdlib cstring deque functional iomanip iostream iterator limits list map memory numeric optional queue random set sstream stack string tuple unordered_map unordered_set utility vector"
  .split(" ").map((h) => `#include <${h}>`).join("\n") + "\n";

onmessage = async ({ data: { id, op, code, stdin, wasm } }) => {
  const t = performance.now();
  if (op === "compile") {
    let err = "";
    try {
      const out = await runClang(["clang++", "-std=c++20", "-O2", "-fno-exceptions", "-I.", "-Wl,-z,stack-size=67108864", "main.cpp", "-o", "main.wasm"],
        { "main.cpp": code, bits: { "stdc++.h": shim } },
        { stdout: () => {}, stderr: (b) => { if (b) err += dec.decode(b); } });
      postMessage({ id, ok: true, wasm: out["main.wasm"], ms: Math.round(performance.now() - t) });
    } catch (e) {
      postMessage({ id, ok: false, err, ms: Math.round(performance.now() - t) });
    }
  } else {
    let out = "", err = "", pos = 0;
    try {
      const r = await WASI.start(new Response(wasm, { headers: { "Content-Type": "application/wasm" } }), new WASIContext({
        args: ["main"], env: {},
        stdin: (max) => { const c = stdin.slice(pos, pos + max); pos += c.length; return c.length ? c : null; },
        stdout: (s) => (out += s), stderr: (s) => (err += s),
      }));
      postMessage({ id, exit: r.exitCode, out, err, ms: Math.round(performance.now() - t) });
    } catch (e) {
      postMessage({ id, threw: String(e.message || e), out, ms: Math.round(performance.now() - t) });
    }
  }
};
