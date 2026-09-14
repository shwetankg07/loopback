// Throwaway spike: Pyodide in a worker with batch stdin.
import { loadPyodide } from "/node_modules/pyodide/pyodide.mjs";

const t0 = performance.now();
const py = await loadPyodide({ indexURL: "/node_modules/pyodide/" });
postMessage({ type: "ready", ms: Math.round(performance.now() - t0) });

onmessage = async ({ data: { code, stdin } }) => {
  let out = "", err = "";
  const bytes = new TextEncoder().encode(stdin);
  let pos = 0;
  py.setStdin({
    read(buf) {
      const n = Math.min(buf.length, bytes.length - pos);
      buf.set(bytes.subarray(pos, pos + n));
      pos += n;
      return n;
    },
  });
  py.setStdout({ write(buf) { out += new TextDecoder().decode(buf); return buf.length; } });
  py.setStderr({ write(buf) { err += new TextDecoder().decode(buf); return buf.length; } });
  const globals = py.globals.get("dict")();
  const t = performance.now();
  try {
    await py.runPythonAsync(code, { globals });
    postMessage({ type: "done", status: "ok", out, err, ms: Math.round(performance.now() - t) });
  } catch (e) {
    postMessage({ type: "done", status: "runtime_error", out, err: err + String(e.message), ms: Math.round(performance.now() - t) });
  } finally {
    globals.destroy();
  }
};
