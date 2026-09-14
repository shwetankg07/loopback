import { runMany } from "/spike/depth-run.js";
onmessage = async (e) => postMessage(await runMany(e.data));
