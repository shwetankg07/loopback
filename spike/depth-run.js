// Throwaway spike: how deep can compiled C++ recurse, and does warm-up (tier-up) help?
import { WASI } from "/node_modules/@runno/wasi/dist/main.js";

async function runOnce(module, stdin) {
  let out = "", pos = 0;
  const wasi = new WASI({
    args: ["main"], env: {},
    stdin: (max) => { const c = stdin.slice(pos, pos + max); pos += c.length; return c.length ? c : null; },
    stdout: (s) => (out += s), stderr: () => {},
  });
  const t = performance.now();
  try {
    const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
    const r = wasi.start({ module, instance });
    return `exit=${r.exitCode} out=${out.trim()} ${Math.round(performance.now() - t)}ms`;
  } catch (e) {
    return `THREW ${e.message}`;
  }
}

export async function runMany(bytes) {
  const module = await WebAssembly.compile(bytes);
  const res = {};
  for (const n of [4000, 6000, 7000, 8000, 9000, 12000]) res[`cold ${n}`] = await runOnce(module, `${n}\n`);
  for (let i = 0; i < 30; i++) await runOnce(module, "3000\n");
  for (const n of [8000, 12000, 20000, 50000, 100000]) res[`warm ${n}`] = await runOnce(module, `${n}\n`);
  return res;
}
