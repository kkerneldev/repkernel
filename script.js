/*
 * 1. Опубликуй source.json в GitHub Pages.
 * 2. Вставь сюда его полный публичный HTTPS URL.
 * Пример: https://username.github.io/kernels-source/source.json
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
      const firstAnswer = document.querySelector(".faq-list details:nth-child(2)");
      if (firstAnswer) firstAnswer.open = true;
      return;
    }
    button.href = target;
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
