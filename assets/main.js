document.documentElement.classList.add("js");

/* ---------- Starfield ---------- */
(() => {
  const canvas = document.getElementById("stars");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let stars = [], w, h, dpr;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
    const count = Math.round((innerWidth * innerHeight) / 4200);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: (Math.random() ** 3 * 1.4 + 0.25) * dpr,
      a: Math.random() * 0.7 + 0.2,
      s: Math.random() * 0.02 + 0.004,
      p: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.15 ? 30 : Math.random() < 0.3 ? 215 : 0,
    }));
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const tw = reduce ? 1 : 0.65 + 0.35 * Math.sin(t * s.s * 0.1 + s.p);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = s.hue ? `hsl(${s.hue}, 90%, 80%)` : "#fff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!reduce) requestAnimationFrame(draw);
  }

  resize();
  addEventListener("resize", resize);
  requestAnimationFrame(draw);
})();

/* ---------- Header: scroll state + mobile menu ---------- */
(() => {
  const header = document.querySelector(".site-header");
  const btn = document.querySelector(".menu-btn");
  if (!header) return;
  const onScroll = () => header.classList.toggle("scrolled", scrollY > 10);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
  btn?.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    btn.setAttribute("aria-expanded", open);
  });
  header.querySelectorAll(".nav-links a").forEach((a) =>
    a.addEventListener("click", () => document.body.classList.remove("nav-open"))
  );
})();

/* ---------- Tabs ---------- */
document.querySelectorAll("[role=tablist]").forEach((list) => {
  const tabs = [...list.querySelectorAll("[role=tab]")];
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", on);
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    })
  );
});

/* ---------- Reveal on scroll ---------- */
(() => {
  const els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) return els.forEach((el) => el.classList.add("in"));
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
    { rootMargin: "0px 0px -8% 0px" }
  );
  els.forEach((el) => io.observe(el));
})();

/* ---------- Research table of contents: highlight current section ---------- */
(() => {
  const links = document.querySelectorAll(".toc a");
  if (!links.length) return;
  const map = new Map([...links].map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          links.forEach((l) => l.classList.remove("active"));
          map.get(e.target.id)?.classList.add("active");
        }
      }),
    { rootMargin: "-30% 0px -60% 0px" }
  );
  map.forEach((_, id) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
})();
