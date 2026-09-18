/* ============================================================
   scenes.js — scroll-driven chapter engine

   Each chapter is:
     .track  (tall, gives us scroll distance)
       .stage (position: sticky, 100vh — the pinned viewport)

   As the track scrolls past, we compute progress 0..1 and:
     - publish it as --p on the track (used by CSS, e.g. the flight arc)
     - switch the active .slide / .vis pair
     - fill the stepper bars
   ============================================================ */

(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tracks = Array.prototype.slice.call(document.querySelectorAll('.track'));
  if (!tracks.length) return;

  const clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };

  /* ---------- Build scene descriptors ---------- */
  const scenes = tracks.map(function (track) {
    const slides = Array.prototype.slice.call(track.querySelectorAll('.slide'));
    const visuals = Array.prototype.slice.call(track.querySelectorAll('.vis'));
    const stepper = track.querySelector('[data-stepper]');
    const count = Math.max(slides.length, 1);

    // Build stepper segments to match the slide count
    if (stepper && slides.length > 1) {
      stepper.innerHTML = '';
      for (let i = 0; i < count; i++) stepper.appendChild(document.createElement('i'));
    }

    return {
      track: track,
      slides: slides,
      visuals: visuals,
      steps: stepper ? Array.prototype.slice.call(stepper.querySelectorAll('i')) : [],
      count: count,
      active: -1,
      inView: false
    };
  });

  /* ---------- Reduced motion: show everything, no pinning ---------- */
  if (reduceMotion) {
    scenes.forEach(function (s) {
      s.track.classList.add('in-view');
      s.track.style.setProperty('--p', '1');
      s.slides.forEach(function (el) { el.classList.add('active'); });
      s.visuals.forEach(function (el) { el.classList.add('active'); });
      s.track.querySelectorAll('[data-count]').forEach(function (el) {
        if (window.__countUp) window.__countUp(el);
      });
    });
    return;
  }

  /* ---------- Activate a slide + its matching visual ---------- */
  function setActive(scene, index) {
    if (scene.active === index) return;
    const previous = scene.active;
    scene.active = index;

    scene.track.setAttribute('data-active', String(index));

    scene.slides.forEach(function (el, i) {
      el.classList.toggle('active', i === index);
      // slides already passed drift upward rather than down
      el.classList.toggle('exit-up', i < index);
    });

    scene.visuals.forEach(function (el, i) {
      const on = i === index;
      el.classList.toggle('active', on);
      if (on && previous !== index) restartAnimations(el);
    });

    // Count up any numbers on the newly active slide
    const slide = scene.slides[index];
    if (slide && window.__countUp) {
      slide.querySelectorAll('[data-count]').forEach(function (el) {
        window.__countUp(el);
      });
    }
  }

  /* ---------- Re-trigger CSS animations when a visual re-enters ----------
     Toggling the class alone won't replay a finished animation, so we
     force a reflow on the subtree. */
  function restartAnimations(visual) {
    visual.querySelectorAll('*').forEach(function (node) {
      const anim = getComputedStyle(node).animationName;
      if (anim && anim !== 'none') {
        node.style.animation = 'none';
        void node.offsetWidth;      // reflow
        node.style.animation = '';
      }
    });
  }

  /* ---------- Flow mode (phones) ----------
     Below 700px the CSS unpins the chapters and stacks each visual
     above its own slide. Nothing is scroll-driven there, so we just
     activate each piece as it scrolls into view. */
  const flowMQ = window.matchMedia('(max-width: 700px)');
  const isFlow = function () { return flowMQ.matches; };

  const flowObserver = new IntersectionObserver(function (entries) {
    if (!isFlow()) return;
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('active');
      entry.target.querySelectorAll('[data-count]').forEach(function (el) {
        if (window.__countUp) window.__countUp(el);
      });
    });
  }, { threshold: 0.25, rootMargin: '0px 0px -10% 0px' });

  scenes.forEach(function (scene) {
    scene.slides.forEach(function (el) { flowObserver.observe(el); });
    scene.visuals.forEach(function (el) { flowObserver.observe(el); });
  });

  // The flight chapter animates on reveal in flow mode, keyed off .in-view
  const trackObserver = new IntersectionObserver(function (entries) {
    if (!isFlow()) return;
    entries.forEach(function (entry) {
      entry.target.classList.toggle('in-view', entry.isIntersecting);
    });
  }, { threshold: 0.2 });
  tracks.forEach(function (t) { trackObserver.observe(t); });

  /* ---------- Size each copy column to its tallest slide ----------
     Slides are absolutely stacked, so the column has no natural height.
     Without this the tallest slide overflows and gets clipped. */
  function layout() {
    if (isFlow()) return;   // slides are static and self-sizing in flow mode
    scenes.forEach(function (scene) {
      if (scene.slides.length < 1) return;
      const copy = scene.track.querySelector('.scene-copy');
      if (!copy) return;

      copy.style.minHeight = '0px';

      let tallest = 0;
      scene.slides.forEach(function (el) {
        if (el.scrollHeight > tallest) tallest = el.scrollHeight;
      });

      copy.style.minHeight = tallest + 'px';

      // If that pushes the pinned stage past the viewport, give back the excess.
      const stage = scene.track.querySelector('.stage');
      const stageInner = scene.track.querySelector('.stage-inner');
      if (stage && stageInner) {
        const overflow = stageInner.offsetHeight - stage.clientHeight;
        if (overflow > 0) {
          copy.style.minHeight = Math.max(tallest - overflow, 200) + 'px';
        }
      }
    });
  }

  /* ---------- Per-frame update ---------- */
  function update() {
    if (isFlow()) return;   // flow mode is driven by IntersectionObserver
    const vh = window.innerHeight;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const rect = scene.track.getBoundingClientRect();

      // Skip anything well outside the viewport
      const visible = rect.top < vh && rect.bottom > 0;
      if (visible !== scene.inView) {
        scene.inView = visible;
        scene.track.classList.toggle('in-view', visible);
      }
      if (!visible) continue;

      const scrollable = scene.track.offsetHeight - vh;
      const p = scrollable > 0 ? clamp(-rect.top / scrollable, 0, 1) : 0;
      scene.track.style.setProperty('--p', p.toFixed(4));

      if (scene.count > 1) {
        // Split progress into equal segments, one per slide.
        // A small hold at each end keeps the first and last slide
        // readable rather than flashing past.
        const seg = 1 / scene.count;
        const index = clamp(Math.floor(p / seg), 0, scene.count - 1);
        setActive(scene, index);

        // Fill the stepper: past segments full, current partial
        const within = clamp((p - index * seg) / seg, 0, 1);
        for (let s = 0; s < scene.steps.length; s++) {
          const fill = s < index ? 1 : s === index ? within : 0;
          scene.steps[s].style.setProperty('--fill', (fill * 100).toFixed(1) + '%');
        }
      } else {
        setActive(scene, 0);
      }
    }
  }

  /* ---------- rAF loop, driven by scroll/resize ---------- */
  let queued = false;
  function request() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      update();
    });
  }

  function refresh() { layout(); update(); }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);

  // Initial paint (and again after fonts settle, since layout can shift)
  refresh();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(refresh);
  }
  window.addEventListener('load', refresh);
})();
