(() => {
  "use strict";
  const status = document.createElement("div");
  status.id = "offline-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  const nav = document.querySelector("nav");
  if (nav) nav.after(status); else document.body.prepend(status);
  let ready = false, savedAt = null, cached = false;
  const supported = "serviceWorker" in navigator && window.isSecureContext;
  function render() {
    const ru = document.documentElement.lang === "ru";
    const offline = !navigator.onLine || cached;
    status.hidden = navigator.onLine && !ready && !cached;
    status.dataset.offline = String(offline);
    const date = savedAt ? new Date(savedAt).toLocaleString(ru ? "ru" : "en", {
      day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", year:"numeric"
    }) : "";
    if (offline) {
      status.textContent = ready || cached
        ? (ru ? "Офлайн · Сохранённый каталог. Для скачивания IPA нужен интернет." : "Offline · Saved catalogue. IPA downloads require internet.")
        : (ru ? "Нет подключения. Офлайн-копия пока не готова." : "No connection. An offline copy is not ready yet.");
    } else {
      status.textContent = ru ? "Страницы и каталог доступны офлайн." : "Pages and catalogue are available offline.";
    }
    if (date) status.textContent += (ru ? " Данные сохранены: " : " Data saved: ") + date;
  }
  async function checkStatus(worker) {
    if (!worker) return;
    const channel = new MessageChannel();
    const timer = setTimeout(() => channel.port1.close(), 3000);
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close();
      ready = !!event.data.ready;
      savedAt = event.data.savedAt || savedAt;
      render();
    };
    worker.postMessage({type:"OFFLINE_STATUS"}, [channel.port2]);
  }
  // Shared by both pages; preserves the normal network path when SW is unavailable.
  window.fetchCatalogue = async (path, options) => {
    const response = await fetch(path, options);
    if (path === "source.json" && response.ok) {
      cached = response.headers.get("X-Kernel-Offline") === "true";
      savedAt = response.headers.get("X-Kernel-Saved-At") || new Date().toISOString();
      render();
      if (supported) checkStatus(navigator.serviceWorker.controller).catch(() => {});
    }
    return response;
  };
  new MutationObserver(render).observe(document.documentElement, {attributes:true, attributeFilter:["lang"]});
  window.addEventListener("offline", render);
  window.addEventListener("online", () => {
    render();
    window.dispatchEvent(new Event("catalogue-reconnect"));
  });
  render();
  if (!supported) return;
  navigator.serviceWorker.register(new URL("../sw.js", document.currentScript.src), {updateViaCache:"none"})
    .then(() => navigator.serviceWorker.ready)
    .then(registration => checkStatus(registration.active))
    .catch(() => { ready = false; render(); });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    checkStatus(navigator.serviceWorker.controller).catch(() => {});
  });
})();
