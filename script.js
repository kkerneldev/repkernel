/*
 * 1. Опубликуй source.json на GitHub Pages.
 * 2. Укажи здесь его полный публичный HTTPS URL.
 */
const SOURCE_URL = "PASTE_YOUR_PUBLIC_SOURCE_JSON_URL_HERE";

function getAddSourceUrl() {
  if (!SOURCE_URL.startsWith("https://") || SOURCE_URL.includes("PASTE_YOUR")) return null;
  return `altstore-classic://source?url=${encodeURIComponent(SOURCE_URL)}`;
}

document.querySelectorAll(".add-source").forEach((button) => {
  button.addEventListener("click", (event) => {
    const target = getAddSourceUrl();
    if (!target) {
      event.preventDefault();
      document.querySelector("#faq").scrollIntoView({ behavior: "smooth" });
      const answer = document.querySelector(".faq-list details:nth-child(2)");
      if (answer) answer.open = true;
      return;
    }
    event.preventDefault();
    window.location.href = target;
  });
});

const menuButton = document.querySelector(".menu-toggle");
const nav = document.querySelector("#nav-links");
menuButton?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});
nav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  nav.classList.remove("open");
  menuButton?.setAttribute("aria-expanded", "false");
}));
