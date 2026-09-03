document.addEventListener("DOMContentLoaded", () => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- theme toggle ----
     Light is the default; dark is only ever on because the visitor asked for it.
     The stored value is applied by an inline script in <head> so the first paint
     is already correct — this only wires the button and keeps the two in sync. */
  const THEME_KEY = "geefit-theme";
  const themeBtn = document.querySelector(".theme-toggle");
  const readTheme = () =>
    document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

  const applyTheme = theme => {
    const dark = theme === "dark";
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    if (themeBtn) {
      const next = dark ? "light" : "dark";
      themeBtn.setAttribute("aria-pressed", String(dark));
      themeBtn.setAttribute("aria-label", "Switch to " + next + " theme");
      themeBtn.setAttribute("title", "Switch to " + next + " theme");
    }
    // The 3D scene paints its own colours and has to repaint on a theme change.
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
  };

  applyTheme(readTheme());
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = readTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    });
  }

  /* ---- mobile nav ---- */
  const toggle = document.querySelector(".hamburger");
  const nav = document.querySelector("nav.primary");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.querySelectorAll("a").forEach(a =>
      a.addEventListener("click", () => {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  /* ---- header gains a background once you scroll ---- */
  const header = document.querySelector("header.site");
  if (header) {
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- stub forms (no backend: this is a static site) ---- */
  document.querySelectorAll("form[data-stub]").forEach(form => {
    form.addEventListener("submit", e => {
      e.preventDefault();
      const note = form.querySelector(".form-note") ||
                   form.parentElement.querySelector(".form-note");
      if (note) {
        note.textContent = "Thanks — we've got it. Someone from the team will reply within a few working days.";
        note.hidden = false;
      }
      form.reset();
    });
  });

  if (reduced || !("IntersectionObserver" in window)) return;

  /* ---- scroll reveal ---- */
  const targets = document.querySelectorAll(
    ".section-head, .card, .stat-strip, .sector-card, .track-card, .tier-card, " +
    ".desk-card, .leader-card, .cta-band, .quote-block, .city-strip, .rates-wrap, " +
    ".facts, .partner-strip, .map-embed, .form-grid"
  );
  const show = el => {
    el.classList.add("in");
    revealer.unobserve(el);
  };

  // Reveal on intersect, but also as soon as an element is at or above the fold —
  // a fast scroll (or a jump to an anchor) can skip past an element without the
  // observer ever sampling it as intersecting, which would hide it permanently.
  const revealer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting || entry.boundingClientRect.top < innerHeight) {
        show(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0 });

  targets.forEach((el, i) => {
    el.classList.add("reveal");
    el.style.transitionDelay = (i % 4) * 70 + "ms";
    revealer.observe(el);
  });

  // Safety net: nothing may stay invisible once it has reached the fold.
  let sweeping = false;
  const sweep = () => {
    sweeping = false;
    document.querySelectorAll(".reveal:not(.in)").forEach(el => {
      if (el.getBoundingClientRect().top < innerHeight) show(el);
    });
  };
  const queueSweep = () => {
    if (sweeping) return;
    sweeping = true;
    requestAnimationFrame(sweep);
  };
  window.addEventListener("scroll", queueSweep, { passive: true });
  window.addEventListener("resize", queueSweep, { passive: true });
  window.addEventListener("load", queueSweep);
  // A backgrounded tab never runs requestAnimationFrame, so the sweep above
  // cannot fire while hidden. Catch up the moment the tab is shown again.
  document.addEventListener("visibilitychange", queueSweep);
  queueSweep();

  /* ---- count up the stat numerals ---- */
  const nums = document.querySelectorAll(".stat-strip .num");
  const counter = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const raw = el.textContent.trim();
      const target = parseInt(raw, 10);
      obs.unobserve(el);
      if (isNaN(target)) return;
      const suffix = raw.replace(/^[\d,]+/, "");
      const start = performance.now();
      const dur = 900;
      const tick = now => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  nums.forEach(n => counter.observe(n));
});
