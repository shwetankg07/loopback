// Throwaway spike driver: node spike/browser.mjs <url>
import { chromium } from "@playwright/test";

const url = process.argv[2];
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() !== "log" || process.env.VERBOSE) console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const t = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 });
console.log(JSON.stringify(await page.evaluate(() => window.__results), null, 1));
console.log("crossOriginIsolated:", await page.evaluate(() => crossOriginIsolated), "| total ms:", Date.now() - t);
await browser.close();
