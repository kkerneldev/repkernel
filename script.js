// Set this to the public HTTPS URL of your published source.json.
const SOURCE_URL = "PASTE_YOUR_PUBLIC_SOURCE_JSON_URL_HERE";

function altStoreURL() {
  if (!SOURCE_URL.startsWith("https://") || SOURCE_URL.includes("PASTE_YOUR")) return null;
  return `altstore-classic://source?url=${encodeURIComponent(SOURCE_URL)}`;
}

document.querySelectorAll(".add-source").forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = altStoreURL();
    if (!target) {
      event.preventDefault();
      document.querySelector("#source-hint").textContent =
        "Before using this button, publish source.json and set its HTTPS URL in script.js.";
      document.querySelector("#source-hint").classList.add("hint-error");
      return;
    }
    event.preventDefault();
    window.location.href = target;
  });
});

const menuButton = document.querySelector("#menu-button");
const nav = document.querySelector("#navigation");
menuButton?.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});
nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  nav.classList.remove("open");
  menuButton?.setAttribute("aria-expanded", "false");
}));
