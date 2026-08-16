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
  initReasonsCarousel();
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

function initReasonsCarousel() {
  const carousel = document.getElementById("reasons-carousel");
  if (!carousel || initReasonsCarousel.ready) return;
  initReasonsCarousel.ready = true;

  const track = carousel.querySelector(".carousel-track");
  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  const dots = Array.from(carousel.querySelectorAll(".carousel-dot"));
  const prevBtn = carousel.querySelector(".carousel-prev");
  const nextBtn = carousel.querySelector(".carousel-next");

  if (!track || slides.length === 0) return;

  let index = 0;
  let timer = null;
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  function setActive(nextIndex) {
    index = (nextIndex + slides.length) % slides.length;

    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === index);
    });

    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
    });

    const target = slides[index];
    const offset =
      target.offsetLeft - (track.clientWidth - target.clientWidth) / 2;

    track.scrollTo({ left: offset, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  function nextSlide() {
    setActive(index + 1);
  }

  function prevSlide() {
    setActive(index - 1);
  }

  function startAutoplay() {
    if (prefersReducedMotion) return;
    stopAutoplay();
    timer = window.setInterval(nextSlide, 4200);
  }

  function stopAutoplay() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  prevBtn?.addEventListener("click", () => {
    prevSlide();
    startAutoplay();
  });

  nextBtn?.addEventListener("click", () => {
    nextSlide();
    startAutoplay();
  });

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const slideIndex = Number(dot.dataset.slide);
      if (!Number.isNaN(slideIndex)) {
        setActive(slideIndex);
        startAutoplay();
      }
    });
  });

  track.addEventListener(
    "scroll",
    () => {
      window.clearTimeout(initReasonsCarousel.scrollTimer);
      initReasonsCarousel.scrollTimer = window.setTimeout(() => {
        const center = track.scrollLeft + track.clientWidth / 2;
        let closest = 0;
        let closestDistance = Infinity;

        slides.forEach((slide, i) => {
          const slideCenter = slide.offsetLeft + slide.clientWidth / 2;
          const distance = Math.abs(center - slideCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closest = i;
          }
        });

        if (closest !== index) {
          index = closest;
          slides.forEach((slide, i) => {
            slide.classList.toggle("is-active", i === index);
          });
          dots.forEach((dot, i) => {
            dot.classList.toggle("is-active", i === index);
          });
        }
      }, 80);
    },
    { passive: true }
  );

  carousel.addEventListener("mouseenter", stopAutoplay);
  carousel.addEventListener("mouseleave", startAutoplay);
  carousel.addEventListener("focusin", stopAutoplay);
  carousel.addEventListener("focusout", startAutoplay);

  setActive(0);
  startAutoplay();
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
