// Run with Playwright installed: node tests/offline.cjs
const {chromium} = require("playwright");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const original = require("../source.json");
let catalogue = structuredClone(original), broken = false, apiRequests = 0;
const mime = {".html":"text/html", ".js":"application/javascript", ".json":"application/json",
  ".css":"text/css", ".woff":"font/woff", ".png":"image/png", ".webmanifest":"application/manifest+json"};
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/outside") { res.writeHead(200); res.end("outside scope"); return; }
  if (!pathname.startsWith("/repo/")) { res.writeHead(404); res.end(); return; }
  const relative = decodeURIComponent(pathname.slice("/repo/".length)) || "index.html";
  if (relative === "source.json") {
    apiRequests++;
    res.setHeader("Content-Type", "application/json");
    res.end(broken ? "<invalid-json>" : JSON.stringify(catalogue));
    return;
  }
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await fs.readFile(file);
    res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch (_) { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({
      headless:true,
      ...(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})
    });
    const context = await browser.newContext({locale:"en-US", viewport:{width:390,height:844}});
    const errors = [];
    await context.route("**/*", route => {
      if (route.request().url().startsWith(base)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(base + "/repo/");
    await page.waitForFunction(() => document.querySelector("#offline-status")?.textContent.includes("available offline"));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert(await page.locator("#grid").textContent().then(x => x.includes("AyuGram")));
    const status = await page.locator("#offline-status").textContent();
    assert(status.includes("Data saved:"));
    console.log("PASS: first visit saves shell and catalogue, including under a subdirectory");
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#grid")?.textContent.includes("AyuGram"));
    await page.waitForFunction(() => document.querySelector("#offline-status")?.textContent.includes("Offline"));
    await page.goto(base + "/repo/app.html?id=org.ayugram.app");
    await page.waitForFunction(() => document.querySelector("#app")?.textContent.includes("AyuGram"));
    await page.locator("#langBtn").click();
    assert.equal(await page.locator("html").getAttribute("lang"), "ru");
    assert((await page.locator("#offline-status").textContent()).includes("Офлайн"));
    assert((await page.locator("#app").textContent()).includes("Скачать"));
    console.log("PASS: offline reload, unvisited app page with query, Russian status");
    await page.goto(base + "/repo/missing/deep/page");
    assert((await page.locator("#title").textContent()).includes("Нет подключения"));
    assert.equal(await page.locator("#home").getAttribute("href"), base + "/repo/index.html");
    console.log("PASS: uncached page has a localized fallback and correct catalogue link");
    await page.goto(base + "/repo/app.html?id=me.keet.HDRezka");
    await page.waitForFunction(() => document.querySelector("#app")?.textContent.includes("HDrezka"));
    catalogue.apps.find(a => a.bundleIdentifier === "me.keet.HDRezka").versions[0].version = "99.0.0";
    await context.setOffline(false);
    await page.waitForFunction(() => document.querySelector("#app")?.textContent.includes("99.0.0"));
    await page.waitForFunction(() => document.querySelector("#offline-status")?.textContent.includes("доступны офлайн"));
    console.log("PASS: reconnection refreshes displayed catalogue without reload");
    broken = true;
    await page.reload();
    await page.waitForFunction(() => document.querySelector("#app")?.textContent.includes("99.0.0"));
    assert((await page.locator("#offline-status").textContent()).includes("Офлайн"));
    console.log("PASS: invalid network JSON preserves the last valid catalogue");
    broken = false;
    const cacheURLs = await page.evaluate(async () => {
      const urls = [];
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
      return urls;
    });
    assert(!cacheURLs.some(url => /\.ipa(?:$|\?)/i.test(url) || url.includes("api.github.com")));
    assert(cacheURLs.some(url => url.endsWith("/repo/assets/fonts/inter-400.woff")));
    assert(apiRequests > 1);
    assert.deepEqual(errors, []);
    console.log("PASS: local fonts cached; no IPA/API caching; no page JavaScript errors");
    await context.close();
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
