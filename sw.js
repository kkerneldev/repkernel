/* Bump the version when changing the offline shell. */
const PREFIX = "kernels-source-";
const VERSION = "v3";
const SHELL = PREFIX + "shell-" + VERSION;
const DATA = PREFIX + "data-" + VERSION;
const IMAGES = PREFIX + "images-" + VERSION;
const ROOT = new URL("./", self.location.href);
const url = path => new URL(path, ROOT).href;
const CORE = [
  "index.html", "app.html", "offline.html", "assets/offline.js", "assets/offline.css",
  "manifest.webmanifest", "assets/qr.js", "assets/showcase.css",
  "assets/apps/org.ayugram.app.png", "assets/apps/me.keet.HDRezka.png",
  ...[400, 500, 600, 700, 800].map(weight => "assets/fonts/inter-" + weight + ".woff"),
  "assets/icons/icon-192.png", "assets/icons/icon-512.png",
  "assets/logos/AltStore-logo.png", "assets/logos/sidestore-logo.png",
  "assets/logos/feather-logo.png", "assets/logos/scarlet-logo.png"
];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(CORE.map(path => new Request(url(path), {cache:"reload"})));
    // Saving the catalogue during installation also covers the first, uncontrolled visit.
    await updateJSON("source.json");
    await updateJSON("news.json").catch(() => {});
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys())
      .filter(key => key.startsWith(PREFIX) && ![SHELL, DATA, IMAGES].includes(key))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
async function updateJSON(path) {
  const response = await fetch(new Request(url(path), {cache:"no-cache"}));
  if (!response.ok) throw new Error("Catalogue unavailable");
  const value = await response.clone().json();
  if (path === "source.json" ? !Array.isArray(value.apps) || !value.apps.length : !Array.isArray(value.items)) {
    throw new Error("Invalid catalogue");
  }
  const headers = new Headers(response.headers);
  headers.set("X-Kernel-Saved-At", new Date().toISOString());
  const saved = new Response(await response.arrayBuffer(), {
    status:response.status, statusText:response.statusText, headers
  });
  try { await (await caches.open(DATA)).put(url(path), saved.clone()); } catch (_) {}
  return saved;
}
async function timeout(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Network timeout")), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
async function catalogue(path, event) {
  // Do not tie refresh to a page's AbortSignal: a cached response can still be returned.
  const refresh = updateJSON(path);
  event.waitUntil(refresh.catch(() => {}));
  try { return await timeout(refresh, 4500); }
  catch (_) {
    const saved = await (await caches.open(DATA)).match(url(path));
    if (!saved) return new Response('{"error":"offline"}', {status:503, headers:{"Content-Type":"application/json"}});
    const headers = new Headers(saved.headers);
    headers.set("X-Kernel-Offline", "true");
    return new Response(await saved.arrayBuffer(), {status:200, headers});
  }
}
async function navigation(request) {
  const requested = new URL(request.url);
  let path = requested.pathname.slice(ROOT.pathname.length);
  if (!path || path === "index.html") path = "index.html";
  const known = ["index.html", "app.html"].includes(path);
  try {
    const response = await timeout(fetch(request), 4500);
    if (!response.ok) throw new Error("Page unavailable");
    if (known) {
      try { await (await caches.open(SHELL)).put(url(path), response.clone()); } catch (_) {}
    }
    return response;
  } catch (_) {
    const cache = await caches.open(SHELL);
    return (known && await cache.match(url(path))) || await cache.match(url("offline.html"));
  }
}
async function image(request) {
  const cache = await caches.open(IMAGES);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    try {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - 60)).map(key => cache.delete(key)));
    } catch (_) { /* Storage pressure must not prevent images from loading. */ }
  }
  return response;
}
async function asset(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await timeout(fetch(request), 4500);
    if (!response.ok) throw new Error("Asset unavailable");
    try { await cache.put(request, response.clone()); } catch (_) {}
    return response;
  } catch (_) { return await cache.match(request) || Response.error(); }
}
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const target = new URL(request.url);
  // Release downloads, GitHub APIs and installer links are never cached.
  if (/\.ipa$/i.test(target.pathname)) return;
  const local = target.origin === ROOT.origin && target.pathname.startsWith(ROOT.pathname);
  const path = local ? target.pathname.slice(ROOT.pathname.length) : "";
  if (local && ["source.json", "news.json"].includes(path)) {
    event.respondWith(catalogue(path, event));
  } else if (local && request.mode === "navigate") {
    event.respondWith(navigation(request));
  } else if (request.destination === "image") {
    event.respondWith(image(request));
  } else if (local && CORE.includes(path)) {
    event.respondWith(asset(request));
  }
});
self.addEventListener("message", event => {
  if (event.data?.type !== "OFFLINE_STATUS" || !event.ports[0]) return;
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    const saved = await (await caches.open(DATA)).match(url("source.json"));
    event.ports[0].postMessage({
      ready:!!saved && !!(await shell.match(url("index.html"))) && !!(await shell.match(url("app.html"))),
      savedAt:saved?.headers.get("X-Kernel-Saved-At") || null
    });
  })());
});
