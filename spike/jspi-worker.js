// Throwaway spike: does running _start through JSPI (separate V8 stack) raise the recursion ceiling?
import { WASI } from "/node_modules/@runno/wasi/dist/main.js";

onmessage = async ({ data: bytes }) => {
  const module = await WebAssembly.compile(bytes);
  const res = { hasJSPI: typeof WebAssembly.promising === "function" };
  for (const n of [7000, 20000, 50000, 100000, 300000, 1000000]) {
    let out = "", pos = 0;
    const stdin = n + "\n";
    const wasi = new WASI({
      args: ["main"], env: {},
      stdin: (max) => { const c = stdin.slice(pos, pos + max); pos += c.length; return c.length ? c : null; },
      stdout: (s) => (out += s), stderr: () => {},
    });
    const t = performance.now();
    try {
      const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
      let p;
      const start = WebAssembly.promising(instance.exports._start);
      wasi.start({ module, instance: { exports: { ...instance.exports, _start: () => { p = start(); } } } });
      await p;
      res[n] = `ok out=${out.trim()} ${Math.round(performance.now() - t)}ms`;
    } catch (e) {
      res[n] = `${out.trim() ? "out=" + out.trim() + " " : ""}THREW ${e.constructor?.name}: ${e.message}`;
    }
  }
  postMessage(res);
};
