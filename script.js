document.getElementById("year").textContent = String(new Date().getFullYear());

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

if (!prefersReducedMotion) {
  const heroReveals = document.querySelectorAll(".hero .reveal");
  heroReveals.forEach((el) => el.classList.add("is-visible"));

  const scrollReveals = document.querySelectorAll(
    ".letter .reveal, .reasons .reveal, .everyday .reveal, .closing .reveal"
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
} else {
  document.querySelectorAll(".reveal").forEach((el) => {
    el.classList.add("is-visible");
  });
}
