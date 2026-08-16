const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

const PASSWORD = "iloveamar";
const STORAGE_KEY = "gobi-unlocked";

function buildPasswordHint(password) {
  return password
    .split("")
    .map((char, index) => {
      if (index === 0) return char;
      if (index >= password.length - 4) return char;
      return "*";
    })
    .join("");
}

function normalizeSecret(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

const hintEl = document.getElementById("hint-code");
if (hintEl) {
  hintEl.textContent = buildPasswordHint(PASSWORD);
}

const body = document.body;
const gate = document.getElementById("gate");
const site = document.getElementById("site");
const gateForm = document.getElementById("gate-form");
const gateInput = document.getElementById("gate-password");
const gateError = document.getElementById("gate-error");

if (gateInput) {
  gateInput.maxLength = PASSWORD.length;
  gateInput.placeholder = buildPasswordHint(PASSWORD);
}

function unlockSite() {
  sessionStorage.setItem(STORAGE_KEY, "1");
  body.classList.remove("is-locked");
  gate.classList.add("is-hidden");
  site.hidden = false;
  site.classList.add("is-unlocked");
  initReveals();
  initDreamyMotion();
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
    ".letter .reveal, .real-letter .reveal, .reasons .reveal, .everyday .reveal, .proposal .reveal, .closing .reveal"
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
  const value = normalizeSecret(gateInput.value);

  if (value === PASSWORD) {
    gateError.hidden = true;
    unlockSite();
    return;
  }

  showGateError();
});

if (sessionStorage.getItem(STORAGE_KEY) === "1") {
  unlockSite();
} else if (gateInput) {
  gateInput.focus();
}

function initDreamyMotion() {
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReducedMotion || initDreamyMotion.ready) return;
  initDreamyMotion.ready = true;

  document.addEventListener(
    "mousemove",
    (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 16;
      const y = (event.clientY / window.innerHeight - 0.5) * 16;
      document.documentElement.style.setProperty("--dream-x", `${x}px`);
      document.documentElement.style.setProperty("--dream-y", `${y}px`);
    },
    { passive: true }
  );
}
