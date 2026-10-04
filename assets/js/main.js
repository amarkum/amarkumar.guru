/* Amar & Gurubani: parallax, wedding reveal, petals, countdown and small helpers. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hero = $('.hero');
  const heroContent = $('.hero__content');
  const nav = $('.nav');

  // The wedding scene is a pinned, scroll-driven reveal when motion is welcome. The page head
  // sets this before first paint; repeat it here in case the preference has changed since.
  root.classList.toggle('has-reveal', !reduceMotion.matches);

  /* ---------------------------------------------------------------- toast */
  const toastEl = $('.toast');
  let toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2600);
  }

  /* ---------------------------------------------------------------- wedding reveal */
  // An arch-shaped window onto the varmala scene that opens to full screen as you scroll.
  const reveal = (() => {
    const section = $('.vivah');
    if (!section) return null;
    const stage = $('.vivah__stage', section);
    const frame = $('.vivah__frame', section);
    const img = $('.vivah__img', section);
    const intro = $('.vivah__intro', section);
    const shade = $('.vivah__shade', section);
    const card = $('.vivah__card', section);
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    // Where the couple's faces sit in the illustration, and the CSS object-position.
    const FOCUS_X = 0.55, FOCUS_Y = 0.27, POS_X = 0.53, POS_Y = 0.4;
    const ratio = (parseFloat(img.getAttribute('height')) || 936) / (parseFloat(img.getAttribute('width')) || 1792);
    let top = 0, span = 1, W = 0, H = 0;
    let picL = 0, picT = 0, picR = 0, picB = 0, focusX = 0, focusY = 0;

    // Tabbing into the card while it is still hidden jumps to where it is fully shown.
    card.addEventListener('focusin', () => {
      if (root.classList.contains('has-reveal') && parseFloat(card.style.opacity || '1') < 1) {
        window.scrollTo({ top: top + span * 0.9, behavior: 'instant' });
      }
    });

    return {
      measure() {
        if (!root.classList.contains('has-reveal')) return;
        top = section.getBoundingClientRect().top + window.scrollY;
        W = stage.clientWidth;
        H = stage.clientHeight;
        span = Math.max(section.offsetHeight - H, 1);
        // the picture's box under object-fit: cover
        const rw = Math.max(W, H / ratio), rh = rw * ratio;
        picL = (W - rw) * POS_X;
        picT = (H - rh) * POS_Y;
        picR = picL + rw;
        picB = picT + rh;
        focusX = picL + rw * FOCUS_X;
        focusY = picT + rh * FOCUS_Y;
      },
      render(scrollY, viewH) {
        if (!root.classList.contains('has-reveal')) return;
        if (scrollY < top - viewH * 1.5 || scrollY > top + span + viewH) return;
        const p = clamp01((scrollY - top) / span);
        const e = ease(clamp01((p - 0.1) / 0.55));

        const w0 = Math.min(W * (W < 600 ? 0.72 : 0.62), 380);
        const h0 = Math.min(H * 0.56, (w0 * 4) / 3);
        const w = w0 + (W - w0) * e;
        const h = h0 + (H - h0) * e;
        const x = (W - w) / 2;
        const y = (H - h) / 2 + (1 - e) * H * 0.07;
        const rTop = (w / 2) * (1 - e);
        const rBottom = 22 * (1 - e);
        const clip = `inset(${y.toFixed(1)}px ${x.toFixed(1)}px ${(H - h - y).toFixed(1)}px ${x.toFixed(1)}px ` +
          `round ${rTop.toFixed(1)}px ${rTop.toFixed(1)}px ${rBottom.toFixed(1)}px ${rBottom.toFixed(1)}px)`;
        frame.style.webkitClipPath = clip;
        frame.style.clipPath = clip;

        // Slide the zoomed picture so the faces sit in the window, without ever
        // letting the picture's own edges into it; settles to no offset when open.
        const s = 1.14 - 0.14 * e;
        const cx = W / 2, cy = H / 2;
        let tx = (W / 2 - (cx + (focusX - cx) * s)) * (1 - e);
        let ty = (y + h / 2 - (cy + (focusY - cy) * s)) * (1 - e);
        tx = Math.min(Math.max(tx, x + w - (cx + (picR - cx) * s)), x - (cx + (picL - cx) * s));
        ty = Math.min(Math.max(ty, y + h - (cy + (picB - cy) * s)), y - (cy + (picT - cy) * s));
        img.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;

        const introOut = clamp01((p - 0.06) / 0.2);
        intro.style.opacity = String(1 - introOut);
        intro.style.transform = `translateY(${(-40 * introOut).toFixed(1)}px)`;
        shade.style.opacity = String(clamp01((p - 0.55) / 0.25));

        const cardIn = clamp01((p - 0.66) / 0.18);
        card.style.opacity = String(cardIn);
        card.style.transform = `translateY(${(30 * (1 - cardIn)).toFixed(1)}px)`;
        card.style.pointerEvents = cardIn > 0.5 ? 'auto' : 'none';
      },
      reset() {
        for (const el of [frame, img, intro, shade, card]) el.removeAttribute('style');
      },
    };
  })();

  /* ---------------------------------------------------------------- parallax */
  // Each [data-speed] / [data-speed-x] element moves relative to its [data-host] section:
  // positive speeds lag behind the scroll, negative speeds run ahead of it.
  const layers = $$('[data-speed], [data-speed-x]').map((el) => ({
    el,
    speed: parseFloat(el.dataset.speed) || 0,
    speedX: parseFloat(el.dataset.speedX) || 0,
    host: el.closest('[data-host]') || el.parentElement,
    isImage: el.tagName === 'IMG',
    top: 0,
    height: 0,
    rest: 0,
  }));

  let viewH = root.clientHeight;
  let viewW = root.clientWidth;
  let heroH = hero ? hero.offsetHeight : 0;
  let queued = false;

  function measure() {
    viewH = root.clientHeight;
    viewW = root.clientWidth;
    heroH = hero ? hero.offsetHeight : 0;
    const scrollY = window.scrollY;
    for (const layer of layers) {
      const rect = layer.host.getBoundingClientRect();
      layer.top = rect.top + scrollY;
      layer.height = rect.height;
      // Layers rest when their section is centred on screen; anything already
      // on screen at load rests at the top of the page instead.
      layer.rest = layer.top < viewH ? 0 : layer.top + layer.height / 2 - viewH / 2;
      if (layer.isImage) {
        // Oversize the picture just enough that its edges never show. Each edge of the
        // band is only on screen for part of the scroll, so only that travel needs covering;
        // anything more zooms the picture in and crops the people out.
        let above = 0, below = 0;
        if (!reduceMotion.matches && layer.speed) {
          const s = layer.speed, r = layer.rest, t = layer.top, h = layer.height;
          const topFrom = Math.max(-r, t - viewH - r), topTo = t - r;
          const bottomFrom = Math.max(-r, t + h - viewH - r), bottomTo = t + h - r;
          above = Math.ceil(Math.max(0, s * topFrom, s * topTo));
          below = Math.ceil(Math.max(0, -s * bottomFrom, -s * bottomTo));
        }
        layer.el.style.top = `${-above - 2}px`;
        layer.el.style.height = `${layer.height + above + below + 4}px`;
      }
    }
    if (reveal) reveal.measure();
    render();
  }

  function render() {
    queued = false;
    const scrollY = window.scrollY;

    if (nav) nav.classList.toggle('is-visible', scrollY > heroH * 0.75);

    if (reduceMotion.matches) return;

    for (const layer of layers) {
      if (scrollY + viewH < layer.top - 200 || scrollY > layer.top + layer.height + 200) continue;
      const d = scrollY - layer.rest;
      if (layer.speed) layer.el.style.setProperty('--py', `${(d * layer.speed).toFixed(1)}px`);
      if (layer.speedX) layer.el.style.setProperty('--px', `${(d * layer.speedX).toFixed(1)}px`);
    }

    if (reveal) reveal.render(scrollY, viewH);

    if (heroContent && heroH) {
      // Fade the hero text as it leaves, but only when the hero fits on one screen;
      // on phones the text sits low in a tall hero and is still being read.
      const progress = heroH > viewH * 1.1 ? 0 : clamp01(scrollY / (viewH * 0.75));
      heroContent.style.opacity = String(1 - progress);
    }
  }

  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(render);
    }
  }

  let resizeTimer;
  function onResize() {
    // Mobile browsers resize the viewport as the address bar slides; skip small height-only changes.
    const widthChanged = root.clientWidth !== viewW;
    const heightJump = Math.abs(root.clientHeight - viewH) > 120;
    if (!widthChanged && !heightJump) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 120);
  }

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if ('ResizeObserver' in window) {
    let lastBodyH = 0;
    new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height;
      if (Math.abs(h - lastBodyH) > 1) {
        lastBodyH = h;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(measure, 80);
      }
    }).observe(document.body);
  }
  reduceMotion.addEventListener?.('change', () => {
    root.classList.toggle('has-reveal', !reduceMotion.matches);
    if (reduceMotion.matches) {
      for (const layer of layers) {
        layer.el.style.removeProperty('--py');
        layer.el.style.removeProperty('--px');
      }
      if (heroContent) heroContent.style.opacity = '';
      if (reveal) reveal.reset();
    }
    measure();
  });
  measure();

  /* nav turns dark while a dark section sits under it */
  const darkSections = $$('.countdown, .bride, .vivah, .footer');
  if (nav && darkSections.length && 'IntersectionObserver' in window) {
    const underNav = new Map();
    const navWatch = new IntersectionObserver((entries) => {
      for (const entry of entries) underNav.set(entry.target, entry.isIntersecting);
      nav.classList.toggle('nav--dark', Array.from(underNav.values()).some(Boolean));
    }, { rootMargin: '0px 0px -94% 0px' });
    darkSections.forEach((section) => navWatch.observe(section));
  }

  /* pointer depth on the hero (mouse and trackpad only) */
  if (hero && window.matchMedia('(pointer: fine)').matches) {
    const deep = $$('[data-depth]', hero).map((el) => ({ el, depth: parseFloat(el.dataset.depth) || 0 }));
    let targetX = 0, targetY = 0, x = 0, y = 0, raf = 0;
    const step = () => {
      x += (targetX - x) * 0.07;
      y += (targetY - y) * 0.07;
      for (const d of deep) {
        d.el.style.setProperty('--mx', `${(x * d.depth).toFixed(2)}px`);
        d.el.style.setProperty('--my', `${(y * d.depth).toFixed(2)}px`);
      }
      raf = Math.abs(targetX - x) + Math.abs(targetY - y) > 0.001 ? requestAnimationFrame(step) : 0;
    };
    hero.addEventListener('pointermove', (e) => {
      if (reduceMotion.matches) return;
      targetX = (e.clientX / viewW - 0.5) * 2;
      targetY = (e.clientY / viewH - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(step);
    });
    hero.addEventListener('pointerleave', () => {
      targetX = 0;
      targetY = 0;
      if (!raf) raf = requestAnimationFrame(step);
    });
  }

  /* ---------------------------------------------------------------- reveal on scroll */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    for (const el of reveals) {
      const siblings = Array.from(el.parentElement.children).filter((c) => c.classList.contains('reveal'));
      const index = siblings.indexOf(el);
      if (index > 0) el.style.setProperty('--rd', `${Math.min(index * 0.12, 0.6)}s`);
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  /* ---------------------------------------------------------------- falling petals */
  const petals = (() => {
    const canvas = $('.petals');
    const ctx = canvas && canvas.getContext && canvas.getContext('2d');
    if (!ctx) return null;

    // Each petal kind is painted once onto a small sprite, then stamped every frame.
    const KINDS = [
      { from: '#fbd25f', to: '#e5841a', ruffle: true, weight: 4 },  // marigold
      { from: '#fde4a0', to: '#f0a02a', ruffle: true, weight: 3 },  // pale marigold
      { from: '#fbe4e7', to: '#e195a4', ruffle: false, weight: 2 }, // blush rose
      { from: '#ffffff', to: '#efe4d2', ruffle: false, weight: 1 }, // jasmine
    ];
    const SPRITE = 64;
    const sprites = KINDS.map((k) => {
      const c = document.createElement('canvas');
      c.width = c.height = SPRITE;
      const g = c.getContext('2d');
      const R = SPRITE * 0.42;
      g.translate(SPRITE / 2, SPRITE / 2);
      const grad = g.createLinearGradient(0, -R, 0, R);
      grad.addColorStop(0, k.from);
      grad.addColorStop(1, k.to);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, R);
      g.bezierCurveTo(R * 0.95, R * 0.55, R * 0.78, -R * 0.68, R * 0.42, -R * 0.9);
      if (k.ruffle) {
        g.quadraticCurveTo(R * 0.28, -R * 1.02, R * 0.14, -R * 0.9);
        g.quadraticCurveTo(0, -R * 1.05, -R * 0.14, -R * 0.9);
        g.quadraticCurveTo(-R * 0.28, -R * 1.02, -R * 0.42, -R * 0.9);
      } else {
        g.quadraticCurveTo(0, -R * 1.14, -R * 0.42, -R * 0.9);
      }
      g.bezierCurveTo(-R * 0.78, -R * 0.68, -R * 0.95, R * 0.55, 0, R);
      g.fill();
      g.strokeStyle = 'rgba(255, 255, 255, .4)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, R * 0.82);
      g.quadraticCurveTo(R * 0.1, 0, 0, -R * 0.72);
      g.stroke();
      return c;
    });
    const bag = KINDS.flatMap((k, i) => Array(k.weight).fill(i));

    let width = 0, height = 0, dpr = 1, list = [], ambient = false, raf = 0;

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    function make(y, fast) {
      return {
        x: Math.random() * width,
        y,
        size: 13 + Math.random() * 12,
        vx: (Math.random() - 0.5) * 0.4,
        vy: fast ? 1.3 + Math.random() * 1.5 : 0.35 + Math.random() * 0.55,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.03,
        phase: Math.random() * Math.PI * 2,
        flip: Math.random() * Math.PI * 2,
        sprite: sprites[bag[(Math.random() * bag.length) | 0]],
        shower: fast,
        alpha: 1,
      };
    }

    const quota = () => (width < 600 ? 10 : 18);

    function frame() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (ambient && Math.random() < 0.05 && list.filter((p) => !p.shower).length < quota()) {
        list.push(make(-30, false));
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.phase += 0.018;
        p.flip += 0.03;
        p.rot += p.spin;
        p.x += p.vx + Math.sin(p.phase) * 0.5;
        p.y += p.vy;
        if (!ambient && !p.shower) p.alpha -= 0.03;
        if (p.y > height + 40 || p.alpha <= 0) { list.splice(i, 1); continue; }
        if (p.y < -30) continue;
        const s = p.size / SPRITE;
        const sx = s * dpr;
        const sy = s * dpr * (0.3 + 0.7 * Math.abs(Math.cos(p.flip)));
        const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
        ctx.setTransform(cos * sx, sin * sx, -sin * sy, cos * sy, p.x * dpr, p.y * dpr);
        ctx.globalAlpha = 0.95 * p.alpha;
        ctx.drawImage(p.sprite, -SPRITE / 2, -SPRITE / 2);
      }
      ctx.globalAlpha = 1;
      raf = (ambient || list.length) && !document.hidden ? requestAnimationFrame(frame) : 0;
      if (!raf) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    const start = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); };

    size();
    window.addEventListener('resize', size);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start();
    });

    return {
      setAmbient(on) {
        if (on && !ambient && !list.length) {
          for (let i = 0; i < quota() / 2; i++) list.push(make(Math.random() * height * 0.8, false));
        }
        ambient = on;
        if (on) start();
      },
      shower(count) {
        for (let i = 0; i < count; i++) list.push(make(-30 - Math.random() * height * 0.9, true));
        start();
      },
    };
  })();

  // Petals drift down over the opening screen and again for the bride's entrance.
  const petalZones = [hero, $('.bride')].filter(Boolean);
  if (petals && petalZones.length && !reduceMotion.matches && 'IntersectionObserver' in window) {
    const inZone = new Map();
    const zoneWatch = new IntersectionObserver((entries) => {
      for (const entry of entries) inZone.set(entry.target, entry.isIntersecting);
      petals.setAmbient(!reduceMotion.matches && Array.from(inZone.values()).some(Boolean));
    }, { threshold: 0.3 });
    petalZones.forEach((zone) => zoneWatch.observe(zone));
  }

  /* ---------------------------------------------------------------- the bride's twirl */
  // Plays only while on screen; a reduced-motion preference starts it paused on its poster.
  (() => {
    const video = $('.bride__video');
    const toggle = $('.bride__toggle');
    if (!video || !toggle) return;
    video.muted = true;
    let held = reduceMotion.matches;
    let inView = !('IntersectionObserver' in window);

    const show = () => {
      toggle.classList.toggle('is-paused', held);
      toggle.setAttribute('aria-label', held ? 'Play the video' : 'Pause the video');
    };
    const sync = () => {
      if (inView && !held && !document.hidden) {
        if (video.paused) {
          const attempt = video.play();
          // Autoplay can be refused (iOS Low Power Mode, for one): wait for a tap instead.
          if (attempt && attempt.catch) {
            attempt.catch((err) => {
              if (err && err.name === 'NotAllowedError') { held = true; show(); }
            });
          }
        }
      } else if (!video.paused) {
        video.pause();
      }
      show();
    };

    toggle.addEventListener('click', () => { held = !held; sync(); });
    document.addEventListener('visibilitychange', sync);
    reduceMotion.addEventListener?.('change', () => {
      if (reduceMotion.matches) { held = true; sync(); }
    });
    if (inView) {
      sync();
    } else {
      new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { rootMargin: '150px 0px' }).observe(video);
    }
    show();
  })();

  /* ---------------------------------------------------------------- countdown */
  const clock = $('[data-countdown]');
  if (clock) {
    const start = Date.parse(clock.dataset.countdown);
    const end = Date.parse(clock.dataset.ends);
    const weddingDay = Date.parse('2026-10-07T00:00:00+05:30');
    const title = $('#countdown-title');
    const note = $('[data-countdown-note]');
    const units = {};
    $$('[data-unit]', clock).forEach((el) => { units[el.dataset.unit] = el; });
    const pad = (n) => String(n).padStart(2, '0');

    const tick = () => {
      const now = Date.now();
      if (now >= end) {
        clock.hidden = true;
        title.textContent = 'Happily ever after';
        note.textContent = 'Thank you for celebrating with us and for all your blessings.';
        return;
      }
      if (now >= start) {
        clock.hidden = true;
        if (now < weddingDay) {
          title.textContent = 'The celebrations have begun';
          note.textContent = 'Haldi, Mehndi & Sangeet are happening today. Shubh Vivah tomorrow, 7 October.';
        } else {
          title.textContent = 'Today is the day';
          note.textContent = 'Shubh Vivah is happening today, 7 October, at Sterling Quinta.';
        }
        setTimeout(tick, 30000);
        return;
      }
      let s = Math.floor((start - now) / 1000);
      const days = Math.floor(s / 86400); s -= days * 86400;
      const hours = Math.floor(s / 3600); s -= hours * 3600;
      const minutes = Math.floor(s / 60); s -= minutes * 60;
      units.days.textContent = pad(days);
      units.hours.textContent = pad(hours);
      units.minutes.textContent = pad(minutes);
      units.seconds.textContent = pad(s);
      setTimeout(tick, 1000 - (now % 1000) + 5);
    };
    tick();
  }

  /* ---------------------------------------------------------------- copy, share, blessings */
  const copyBtn = $('[data-copy-address]');
  const addressEl = $('[data-address]');
  if (copyBtn && addressEl) {
    copyBtn.addEventListener('click', async () => {
      const text = 'Sterling Quinta Jim Corbett, ' + addressEl.innerText.replace(/\s+/g, ' ').trim();
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); } catch (err) { /* nothing else to try */ }
        area.remove();
      }
      toast('Address copied');
    });
  }

  const shareBtn = $('[data-share]');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = window.location.href.split('#')[0];
      const text = 'You are invited to the wedding of Amar Kumar & Gurubani Gulati: Haldi, Mehndi & Sangeet on 6 October and Shubh Vivah on 7 October 2026 at Sterling Quinta, Jim Corbett.';
      if (navigator.share) {
        try { await navigator.share({ title: 'Amar weds Gurubani', text, url }); } catch (e) { /* share sheet dismissed */ }
      } else {
        window.open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank', 'noopener');
      }
    });
  }

  const blessBtn = $('[data-bless]');
  if (blessBtn) {
    blessBtn.addEventListener('click', () => {
      if (petals && !reduceMotion.matches) petals.shower(window.innerWidth < 600 ? 60 : 120);
      toast('Thank you for your blessings');
    });
  }

  window.agReady = true;
})();
