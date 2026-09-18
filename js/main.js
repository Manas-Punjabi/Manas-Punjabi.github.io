/* ============================================================
   main.js — theme, reveals, counters, top bar, reading progress
   ============================================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme ---------- */
  const root = document.documentElement;
  const STORAGE_KEY = 'theme-pref';

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* private mode */ }
  }

  (function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    // Light is the intended default; dark is opt-in via the toggle.
    root.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
  })();

  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    const revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    revealEls.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ---------- Count-up numbers ----------
     Any element with data-count animates 0 -> value the first time
     it is revealed. Scene slides call countUp() directly on activation. */

  function countUp(el) {
    if (!el || el.dataset.counted === '1') return;
    el.dataset.counted = '1';

    const target = parseFloat(el.dataset.count);
    if (Number.isNaN(target)) return;

    const suffix = el.dataset.suffix || '';
    if (reduceMotion) { el.textContent = target + suffix; return; }

    const duration = 1100;
    const start = performance.now();

    function frame(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);        // easeOutCubic
      const value = Math.round(target * eased);
      el.textContent = value + suffix;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // Expose for scenes.js
  window.__countUp = countUp;

  // Counters that live outside scene slides
  const looseCounters = document.querySelectorAll('[data-count]:not(.slide [data-count])');
  if (looseCounters.length) {
    const counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          countUp(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    looseCounters.forEach(function (el) { counterObserver.observe(el); });
  }

  /* ---------- Top bar + reading progress ---------- */
  const topbar = document.querySelector('.topbar');
  const bar = document.getElementById('scroll-bar');
  const rail = document.getElementById('rail');

  let ticking = false;

  function onScroll() {
    const y = window.scrollY;

    if (topbar) topbar.classList.toggle('solid', y > 40);
    if (rail) rail.classList.toggle('show', y > window.innerHeight * 0.6);

    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (y / max) * 100 : 0;
      bar.style.width = pct.toFixed(2) + '%';
    }

    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });

  onScroll();

  /* ---------- Project detail dialog ----------
     Detail lives in .detail-store and is cloned into a single <dialog>,
     so a chapter's pinned layout never has to accommodate it. */
  const dialog = document.getElementById('detail-dialog');
  const dialogContent = document.getElementById('detail-content');
  const dialogClose = document.getElementById('detail-close');

  if (dialog && dialogContent) {
    let lastFocused = null;

    function openDetail(id) {
      const source = document.getElementById(id);
      if (!source) return;

      lastFocused = document.activeElement;
      dialogContent.replaceChildren(source.cloneNode(true));
      dialogContent.scrollTop = 0;

      // Freeze the page so scrolling doesn't advance scenes behind the dialog
      root.style.overflow = 'hidden';

      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');

      if (dialogClose) dialogClose.focus();
    }

    function closeDetail() {
      root.style.overflow = '';
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    document.querySelectorAll('[data-detail]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDetail(btn.dataset.detail); });
    });

    if (dialogClose) dialogClose.addEventListener('click', closeDetail);

    // Click on the backdrop (outside the dialog box) closes it
    dialog.addEventListener('click', function (e) {
      if (e.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const outside =
        e.clientX < box.left || e.clientX > box.right ||
        e.clientY < box.top  || e.clientY > box.bottom;
      if (outside) closeDetail();
    });

    // ESC fires 'cancel'/'close' natively — make sure we still unfreeze
    dialog.addEventListener('close', function () { root.style.overflow = ''; });
  }

  /* ---------- Rail: highlight the chapter in view ---------- */
  const railLinks = Array.prototype.slice.call(document.querySelectorAll('.rail a'));
  const chapters = railLinks
    .map(function (a) { return document.getElementById(a.dataset.rail); })
    .filter(Boolean);

  if (chapters.length) {
    const railObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        railLinks.forEach(function (a) {
          a.classList.toggle('active', a.dataset.rail === entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

    chapters.forEach(function (c) { railObserver.observe(c); });
  }
})();
