/* Amar & Gurubani: parallax, petals, countdown and small helpers. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hero = $('.hero');
  const heroContent = $('.hero__content');
  const nav = $('.nav');

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

  /* ---------------------------------------------------------------- parallax */
  // Each [data-speed] element moves relative to its [data-host] section:
  // positive speeds lag behind the scroll, negative speeds run ahead of it.
  const layers = $$('[data-speed]').map((el) => ({
    el,
    speed: parseFloat(el.dataset.speed) || 0,
    host: el.closest('[data-host]') || el.parentElement,
    isImage: el.tagName === 'IMG',
    top: 0,
    height: 0,
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
        // Oversize the photo so it never shows an edge while it drifts.
        const reach = Math.max(layer.rest - (layer.top - viewH), layer.top + layer.height - layer.rest);
        const extra = reduceMotion.matches ? 0 : Math.ceil(Math.abs(layer.speed) * reach) + 2;
        layer.el.style.top = `${-extra}px`;
        layer.el.style.height = `${layer.height + extra * 2}px`;
      }
    }
    render();
  }

  function render() {
    queued = false;
    const scrollY = window.scrollY;

    if (nav) nav.classList.toggle('is-visible', scrollY > heroH * 0.75);

    if (reduceMotion.matches) return;

    for (const layer of layers) {
      if (scrollY + viewH < layer.top - 200 || scrollY > layer.top + layer.height + 200) continue;
      layer.el.style.setProperty('--py', `${((scrollY - layer.rest) * layer.speed).toFixed(1)}px`);
    }

    if (heroContent && heroH) {
      // Fade the hero text as it leaves, but only when the hero fits on one screen;
      // on phones the text sits low in a tall hero and is still being read.
      const progress = heroH > viewH * 1.1 ? 0 : Math.min(Math.max(scrollY / (viewH * 0.75), 0), 1);
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
    if (reduceMotion.matches) {
      for (const layer of layers) layer.el.style.removeProperty('--py');
      if (heroContent) heroContent.style.opacity = '';
    }
    measure();
  });
  measure();

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

    const COLOURS = ['#e9a23b', '#f2c14e', '#e07b24', '#f5c86a', '#d9b36c', '#9fb38a'];
    let width = 0, height = 0, list = [], ambient = false, raf = 0;

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function make(y, fast) {
      return {
        x: Math.random() * width,
        y,
        r: 5 + Math.random() * 7,
        vx: (Math.random() - 0.5) * 0.5,
        vy: fast ? 1.4 + Math.random() * 1.6 : 0.45 + Math.random() * 0.75,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.05,
        phase: Math.random() * Math.PI * 2,
        flip: Math.random() * Math.PI * 2,
        colour: COLOURS[(Math.random() * COLOURS.length) | 0],
        shower: fast,
        alpha: 1,
      };
    }

    function draw(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(p.flip)));
      ctx.globalAlpha = 0.92 * p.alpha;
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.moveTo(0, -p.r);
      ctx.bezierCurveTo(p.r * 0.95, -p.r * 0.55, p.r * 0.6, p.r * 0.75, 0, p.r);
      ctx.bezierCurveTo(-p.r * 0.6, p.r * 0.75, -p.r * 0.95, -p.r * 0.55, 0, -p.r);
      ctx.fill();
      ctx.globalAlpha = 0.3 * p.alpha;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -p.r * 0.7);
      ctx.lineTo(0, p.r * 0.7);
      ctx.stroke();
      ctx.restore();
    }

    const quota = () => (width < 600 ? 12 : 24);

    function frame() {
      ctx.clearRect(0, 0, width, height);
      if (ambient && Math.random() < 0.07 && list.filter((p) => !p.shower).length < quota()) {
        list.push(make(-20, false));
      }
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.phase += 0.02;
        p.flip += 0.04;
        p.rot += p.spin;
        p.x += p.vx + Math.sin(p.phase) * 0.55;
        p.y += p.vy;
        if (!ambient && !p.shower) p.alpha -= 0.03;
        if (p.y > height + 30 || p.alpha <= 0) { list.splice(i, 1); continue; }
        if (p.y > -20) draw(p);
      }
      raf = (ambient || list.length) && !document.hidden ? requestAnimationFrame(frame) : 0;
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
        for (let i = 0; i < count; i++) list.push(make(-20 - Math.random() * height * 0.9, true));
        start();
      },
    };
  })();

  // Petals only fall on request (the blessings button); the hero stays clean.

  /* ---------------------------------------------------------------- video */
  // Background clips are silent loops: play while on screen, pause when off, never for reduced motion.
  const videos = $$('video.cine');
  const inView = new Set();
  const tryPlay = (video) => {
    if (reduceMotion.matches || document.hidden || !inView.has(video)) return;
    video.muted = true;
    video.defaultMuted = true;
    const p = video.play();
    if (p && p.catch) p.catch(() => { /* blocked: retried on readiness or first gesture */ });
  };
  const syncVideo = (video, visible) => {
    if (visible) { inView.add(video); tryPlay(video); }
    else { inView.delete(video); video.pause(); }
  };
  for (const v of videos) {
    v.muted = true;
    v.addEventListener('canplay', () => { if (v.paused) tryPlay(v); });
  }
  if ('IntersectionObserver' in window) {
    const vio = new IntersectionObserver((entries) => {
      for (const entry of entries) syncVideo(entry.target, entry.isIntersecting);
    }, { threshold: 0.1 });
    videos.forEach((v) => vio.observe(v));
  } else {
    videos.forEach((v) => syncVideo(v, true));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) videos.forEach((v) => v.pause());
    else videos.forEach(tryPlay);
  });
  // If autoplay was blocked (e.g. low-power mode), the first tap or scroll kicks it off.
  const nudge = () => videos.forEach(tryPlay);
  for (const type of ['pointerdown', 'touchstart', 'keydown', 'scroll']) {
    window.addEventListener(type, nudge, { passive: true, once: true });
  }
  reduceMotion.addEventListener?.('change', () => {
    if (reduceMotion.matches) videos.forEach((v) => v.pause());
    else videos.forEach(tryPlay);
  });

  /* ---------------------------------------------------------------- venue carousel */
  for (const root of $$('[data-carousel]')) {
    const slides = $$('.carousel__slide', root);
    const dotsWrap = $('.carousel__dots', root);
    if (slides.length < 2) continue;
    let index = 0, timer = 0;
    const dots = slides.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `Photo ${i + 1} of ${slides.length}`);
      b.addEventListener('click', () => { show(i); restart(); });
      dotsWrap.appendChild(b);
      return b;
    });
    function show(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach((s, k) => s.classList.toggle('is-active', k === index));
      dots.forEach((d, k) => d.setAttribute('aria-selected', String(k === index)));
    }
    function start() { if (!timer && !reduceMotion.matches) timer = setInterval(() => show(index + 1), 4500); }
    function stop() { clearInterval(timer); timer = 0; }
    function restart() { stop(); start(); }
    root.addEventListener('pointerenter', stop);
    root.addEventListener('pointerleave', start);
    // Manual control: arrows, swipe/drag, sideways scroll, keyboard.
    $('[data-prev]', root)?.addEventListener('click', () => { show(index - 1); restart(); });
    $('[data-next]', root)?.addEventListener('click', () => { show(index + 1); restart(); });
    const track = $('.carousel__track', root);
    let downX = null, downY = null;
    track.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; }, { passive: true });
    track.addEventListener('pointerup', (e) => {
      if (downX === null) return;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      downX = downY = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { show(index + (dx < 0 ? 1 : -1)); restart(); }
    });
    track.addEventListener('pointercancel', () => { downX = downY = null; });
    let wheelLock = 0;
    track.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaX) < 20 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
      e.preventDefault();
      const now = Date.now();
      if (now - wheelLock < 600) return;
      wheelLock = now;
      show(index + (e.deltaX > 0 ? 1 : -1)); restart();
    }, { passive: false });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { show(index + 1); restart(); }
      if (e.key === 'ArrowLeft') { show(index - 1); restart(); }
    });
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    show(0);
    start();
  }

  /* ---------------------------------------------------------------- background music */
  // Optional: shows a toggle only when assets/audio/theme.mp3 exists. Browsers need a tap before sound.
  const music = $('[data-music]');
  const musicBtn = $('[data-music-toggle]');
  if (music && musicBtn) {
    const setState = (on) => {
      musicBtn.setAttribute('aria-pressed', String(on));
      musicBtn.setAttribute('aria-label', on ? 'Pause background music' : 'Play background music');
      musicBtn.classList.toggle('is-playing', on);
      try { localStorage.setItem('ag-music', on ? '1' : '0'); } catch (e) {}
    };
    const play = () => { music.volume = 0.45; music.play().then(() => setState(true)).catch(() => setState(false)); };
    const pause = () => { music.pause(); setState(false); };
    fetch(music.getAttribute('src'), { method: 'HEAD' }).then((r) => {
      if (!r.ok) return;
      musicBtn.hidden = false;
      let wanted = '1';
      try { wanted = localStorage.getItem('ag-music') ?? '1'; } catch (e) {}
      if (wanted === '1' && !reduceMotion.matches) {
        // Try straight away (allowed where the browser trusts the site); otherwise the first gesture starts it.
        play();
        const kick = () => { if (music.paused) play(); };
        for (const type of ['pointerdown', 'touchstart', 'keydown', 'scroll', 'wheel']) window.addEventListener(type, kick, { once: true, passive: true });
      } else {
        music.pause();
      }
    }).catch(() => {});
    musicBtn.addEventListener('click', (e) => { e.stopPropagation(); music.paused ? play() : pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && !music.paused) { music.pause(); } else if (!document.hidden && musicBtn.classList.contains('is-playing')) { music.play().catch(() => {}); } });
  }

  /* ---------------------------------------------------------------- countdown */
  const clock = $('[data-countdown]');
  if (clock) {
    const start = Date.parse(clock.dataset.countdown);
    const end = Date.parse(clock.dataset.ends);
    const weddingDay = Date.parse('2027-02-07T00:00:00+05:30');
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
          note.textContent = 'Haldi & Sangeet are happening today. Shubh Vivah tomorrow, 7 February.';
        } else {
          title.textContent = 'Today is the day';
          note.textContent = 'Shubh Vivah is happening today, 7 February, at Sterling Quinta.';
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
      const text = 'You are invited to the wedding of Amar Kumar & Gurubani Gulati: Haldi & Sangeet on 6 February and Shubh Vivah on 7 February 2027 at Sterling Quinta, Jim Corbett.';
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
      if (petals && !reduceMotion.matches) petals.shower(window.innerWidth < 600 ? 70 : 140);
      toast('Thank you for your blessings');
    });
  }
})();
