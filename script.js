document.getElementById("year").textContent = String(new Date().getFullYear());

const PASSWORD = "iloveamar";
const STORAGE_KEY = "gobi-unlocked";

const body = document.body;
const gate = document.getElementById("gate");
const site = document.getElementById("site");
const gateForm = document.getElementById("gate-form");
const gateInput = document.getElementById("gate-password");
const gateError = document.getElementById("gate-error");

function unlockSite() {
  sessionStorage.setItem(STORAGE_KEY, "1");
  body.classList.remove("is-locked");
  gate.classList.add("is-hidden");
  site.hidden = false;
  initReveals();
}

function showGateError() {
  gateError.hidden = false;
  gateForm.classList.remove("is-shake");
  void gateForm.offsetWidth;
  gateForm.classList.add("is-shake");
  gateInput.focus();
  gateInput.select();
}

function initReveals() {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion) {
    document.querySelectorAll(".reveal").forEach((el) => {
      el.classList.add("is-visible");
    });
    return;
  }

  document.querySelectorAll(".hero .reveal").forEach((el) => {
    el.classList.add("is-visible");
  });

  const scrollReveals = document.querySelectorAll(
    ".letter .reveal, .reasons .reveal, .everyday .reveal, .proposal .reveal, .closing .reveal"
  );

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  scrollReveals.forEach((el) => observer.observe(el));
}

gateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = gateInput.value.trim().toLowerCase();

  if (value === PASSWORD) {
    gateError.hidden = true;
    unlockSite();
    return;
  }

  showGateError();
});

if (sessionStorage.getItem(STORAGE_KEY) === "1") {
  unlockSite();
} else {
  gateInput.focus();
}
