/**
 * Motion + interaction for the public landing (Landing.tsx). Everything is
 * scoped to the landing root, started once on mount and fully torn down on
 * unmount (listeners via an AbortController, rAF loops via an alive flag,
 * GSAP tweens / ScrollTriggers / pins via a gsap context + matchMedia).
 *
 * GSAP is imported lazily so the build-time prerender (Node) never loads it,
 * and the page is fully readable before it arrives.
 */

import { initHands } from './handsFx.ts';

type Gsap = typeof import('gsap').gsap;
type ST = typeof import('gsap/ScrollTrigger').ScrollTrigger;

const EVENTS: [string, string][] = [
  ['UPTIME', 'kilele-bakery.co.ke 200 OK · 184 ms'],
  ['BACKUP', 'Nightly database backup complete · 42 MB'],
  ['SSL', 'Certificate expires in 21 days · renewal scheduled'],
  ['UPTIME', 'kilele-bakery.co.ke 200 OK · 171 ms'],
  ['PATCH', 'Security update applied on staging · tests pass'],
  ['RESTORE', 'Weekly restore test · backup verified'],
  ['UPTIME', 'kilele-bakery.co.ke 200 OK · 190 ms'],
  ['PATCH', 'Update promoted to live · zero downtime'],
];

const FX_SELECTOR = '.plan, .stat, .step, .hub-card, .faq, .compare, .cta-card, .studio, .panel, .log, .fl, .foot-panel';

interface Particle { hx: number; hy: number; x: number; y: number; vx: number; vy: number; ang: number; dist: number; s: number; t: boolean; free: boolean }

export function initLanding(root: HTMLElement): () => void {
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => window.addEventListener(t, f, { ...opts, ...sig });
  let alive = true;
  const timers: number[] = [];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  const $$ = <T extends Element = HTMLElement>(s: string) => Array.from(root.querySelectorAll<T>(s));
  const css = (v: string) => getComputedStyle(root).getPropertyValue(v).trim();
  const fmt = (n: number) => Math.round(n).toLocaleString('en-KE');
  let gsap: Gsap | null = null;
  let ScrollTrigger: ST | null = null;
  let ctx: { revert: () => void } | null = null;

  /* ---------- page tone (scroll colour story) ---------- */
  const tone = $('#tone');
  let tones: Record<string, string> = {};
  const readTones = () => { tones = { paper: css('--paper'), night: css('--night') }; };
  readTones();
  let curTone = 'paper';
  const setTone = (t: string, instant = false) => {
    curTone = t;
    if (!tone) return;
    const color = tones[t] ?? '';
    if (gsap && !instant && !reduce) gsap.to(tone, { backgroundColor: color, duration: 0.8, ease: 'power2.out', overwrite: true });
    else tone.style.backgroundColor = color;
  };
  setTone('paper', true);

  /* ---------- nav ---------- */
  const nav = $('#nav');
  const pill = $('#navPill');
  const links = $$<HTMLAnchorElement>('#navLinks a');
  let active: HTMLAnchorElement | null = null;
  let lastY = window.scrollY;
  on('scroll', () => { const y = window.scrollY; nav?.classList.toggle('hide', y > lastY && y > 500); lastY = y; }, { passive: true });
  const movePill = (a: HTMLAnchorElement | null) => {
    if (!pill) return;
    if (!a) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1'; pill.style.width = a.offsetWidth + 'px'; pill.style.transform = `translateX(${a.offsetLeft - 4}px)`;
  };
  links.forEach((a) => a.addEventListener('pointerenter', () => movePill(a), sig));
  $('#navLinks')?.addEventListener('pointerleave', () => movePill(active), sig);

  /* ---------- in-page anchors: smooth scroll, no hash in the URL ---------- */
  const menuBtn = $('#menuBtn');
  const sheet = $('#msheet');
  const closeMenu = () => { if (!sheet || !menuBtn) return; sheet.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; };
  $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')!.slice(1);
    e.preventDefault();
    closeMenu();
    const target = id === 'top' ? null : document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, sig));
  menuBtn?.addEventListener('click', () => {
    if (!sheet) return;
    const open = sheet.hidden;
    sheet.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  }, sig);
  sheet?.querySelectorAll('button').forEach((b) => b.addEventListener('click', closeMenu, sig));
  on('keydown', (e) => { if (e.key === 'Escape' && sheet && !sheet.hidden) closeMenu(); });

  /* ---------- hero particle field ---------- */
  const cv = $<HTMLCanvasElement>('#field');
  const hero = $('#hero');
  const ctx2d = cv?.getContext('2d') ?? null;
  let W = 0, H = 0, pts: Particle[] = [], scatter = 0;
  let DOT = '#111008', DOTA = '#0E7A68';
  const readDots = () => { DOT = css('--dot') || DOT; DOTA = css('--dot-accent') || DOTA; };
  readDots();
  const mouse = { x: -9999, y: -9999 };
  const sample = () => {
    if (!cv || !ctx2d || !hero) return;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR; ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
    const off = document.createElement('canvas');
    const o = off.getContext('2d', { willReadFrequently: true });
    if (!o || W === 0 || H === 0) return;
    off.width = W; off.height = H;
    const word = 'engineered.';
    let fs = Math.min(W * 0.17, H * 0.22);
    o.font = `italic 400 ${fs}px "Playfair Display", Georgia, serif`;
    const mw = o.measureText(word).width;
    if (mw > W * 0.94) { fs *= (W * 0.94) / mw; o.font = `italic 400 ${fs}px "Playfair Display", Georgia, serif`; }
    o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#000';
    const cy = W < 700 ? H * 0.17 : H * 0.23;
    o.fillText(word, W / 2, cy);
    const data = o.getImageData(0, 0, W, H).data;
    const step = W < 700 ? 3 : Math.max(4, Math.round(fs / 52));
    const homes: [number, number][] = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if ((data[(y * W + x) * 4 + 3] ?? 0) > 128) homes.push([x, y]);
    const old = pts.filter((p) => !p.free);
    pts = homes.map(([hx, hy], i) => {
      const a = Math.random() * Math.PI * 2, d = 200 + Math.random() * Math.max(W, H), prev = old[i];
      return { hx, hy, x: prev ? prev.x : W / 2 + Math.cos(a) * d, y: prev ? prev.y : cy + Math.sin(a) * d, vx: 0, vy: 0, ang: a, dist: 120 + Math.random() * 520, s: Math.random() < 0.1 ? 2.2 : 1.6, t: Math.random() < 0.14, free: false };
    });
    for (let i = 0; i < (W < 700 ? 40 : 90); i++) pts.push({ hx: 0, hy: 0, x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, ang: 0, dist: 0, s: 1.3, t: Math.random() < 0.3, free: true });
    if (reduce) pts.forEach((p) => { if (!p.free) { p.x = p.hx; p.y = p.hy; } });
  };
  const R = 130;
  hero?.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; }, sig);
  hero?.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; }, sig);
  let heroVis = true;
  const heroIO = new IntersectionObserver(([en]) => { heroVis = !!en?.isIntersecting; });
  if (hero) heroIO.observe(hero);
  const hexA = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  let drawn = false;
  const draw = () => {
    if (!alive || !ctx2d) return;
    if (heroVis) {
      ctx2d.clearRect(0, 0, W, H);
      const near: Particle[] = [];
      for (const p of pts) {
        if (p.free) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        } else {
          const tx = p.hx + Math.cos(p.ang) * p.dist * scatter, ty = p.hy + Math.sin(p.ang) * p.dist * scatter - scatter * 120;
          p.vx += (tx - p.x) * 0.045; p.vy += (ty - p.y) * 0.045;
          const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < R * R) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 5.5; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
          p.vx *= 0.82; p.vy *= 0.82; p.x += p.vx; p.y += p.vy;
        }
        const mdx = p.x - mouse.x, mdy = p.y - mouse.y;
        if (mdx * mdx + mdy * mdy < (R * 1.6) * (R * 1.6)) near.push(p);
        ctx2d.fillStyle = p.t ? DOTA : DOT;
        ctx2d.fillRect(p.x, p.y, p.s, p.s);
      }
      ctx2d.lineWidth = 0.6;
      const lim = Math.min(near.length, 180);
      for (let i = 0; i < lim; i++) {
        const a = near[i]!;
        for (let j = i + 1; j < lim; j++) {
          const b = near[j]!, dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 1600) { ctx2d.strokeStyle = hexA(DOTA, (1 - d2 / 1600) * 0.7); ctx2d.beginPath(); ctx2d.moveTo(a.x, a.y); ctx2d.lineTo(b.x, b.y); ctx2d.stroke(); }
        }
      }
      if (mouse.x > -999) { ctx2d.strokeStyle = hexA(DOTA, 0.35); ctx2d.lineWidth = 1; ctx2d.beginPath(); ctx2d.arc(mouse.x, mouse.y, R, 0, Math.PI * 2); ctx2d.stroke(); }
    }
    if (!reduce || !drawn) requestAnimationFrame(draw);
    drawn = true;
  };

  /* ---------- studio card tilt ---------- */
  const studio = $('#studio');
  if (studio && !reduce && fine) {
    studio.addEventListener('pointermove', (e) => { const r = studio.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; studio.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`; }, sig);
    studio.addEventListener('pointerleave', () => { studio.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)'; studio.style.transform = ''; timers.push(window.setTimeout(() => { studio.style.transition = ''; }, 600)); }, sig);
  }

  /* ---------- pricing: build vs first-year switch ---------- */
  const plans = $$('.plan');
  let year = false;
  const renderPlans = (animate: boolean) => {
    plans.forEach((plan) => {
      const build = Number(plan.dataset.build), care = Number(plan.dataset.care);
      const v = plan.querySelector<HTMLElement>('.v');
      const per = plan.querySelector<HTMLElement>('.per');
      const line = plan.querySelector<HTMLElement>('.care-line');
      if (!v || !per || !line) return;
      const to = year ? build + 12 * care : build;
      const from = Number(v.dataset.cur || build);
      v.dataset.cur = String(to);
      if (animate && gsap && !reduce) { const o = { n: from }; gsap.to(o, { n: to, duration: 0.9, ease: 'power3.out', onUpdate: () => { v.textContent = fmt(o.n); } }); }
      else v.textContent = fmt(to);
      per.textContent = year ? '/yr 1' : '/build';
      line.innerHTML = year ? `Build <strong>${fmt(build)}</strong> + 12 x ${fmt(care)} care` : `Plus care <strong>KES ${fmt(care)}</strong> / month`;
    });
    const note = $('#switchNote');
    if (note) note.textContent = year ? 'Build plus 12 months of care, ex-VAT' : 'One-time build fee, ex-VAT';
  };
  $('#yearSwitch')?.addEventListener('click', (e) => { year = !year; (e.currentTarget as HTMLElement).setAttribute('aria-checked', String(year)); renderPlans(true); }, sig);

  /* ---------- FAQ accordion ---------- */
  $$('.faq button').forEach((b) => b.addEventListener('click', () => {
    const f = b.parentElement!, open = !f.classList.contains('open');
    $$('.faq').forEach((x) => { x.classList.remove('open'); x.querySelector('button')?.setAttribute('aria-expanded', 'false'); });
    if (open) { f.classList.add('open'); b.setAttribute('aria-expanded', 'true'); }
  }, sig));

  /* ---------- hub connector lines ---------- */
  const drawHub = () => {
    const hub = $('#hub'), svg = $<SVGSVGElement>('#hubLines');
    if (!hub || !svg || getComputedStyle(svg).display === 'none') return;
    const h = hub.getBoundingClientRect(), core = hub.querySelector('.core')?.getBoundingClientRect();
    if (!core) return;
    svg.setAttribute('viewBox', `0 0 ${h.width} ${h.height}`);
    const cx = core.left - h.left + core.width / 2, cy = core.top - h.top + core.height / 2;
    svg.innerHTML = Array.from(hub.querySelectorAll('.hub-card')).map((c) => { const r = c.getBoundingClientRect(); return `<path d="M${cx} ${cy} L${r.left - h.left + r.width / 2} ${r.top - h.top + r.height / 2}"/>`; }).join('');
  };

  /* ---------- night shift care log (sample) ---------- */
  const log = $('#log'), clock = $('#clock');
  let sec = 3 * 3600 + 12, k = 0;
  const stamp = (s: number) => [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');
  const push = (fresh: boolean) => {
    if (!log) return;
    const [tag, msg] = EVENTS[k % EVENTS.length]!; k++;
    log.querySelectorAll('li.fresh').forEach((li) => li.classList.remove('fresh'));
    const li = document.createElement('li'); if (fresh) li.className = 'fresh';
    li.innerHTML = `<span>${stamp(sec)}</span><span class="tag">${tag}</span><span>${msg}</span>`;
    log.prepend(li); while (log.children.length > 9) log.lastChild?.remove();
    if (clock?.firstChild) clock.firstChild.nodeValue = stamp(sec).slice(0, 5);
    sec += 97 + Math.floor(Math.random() * 120);
  };
  for (let i = 0; i < 7; i++) push(false);
  if (!reduce) timers.push(window.setInterval(() => push(true), 2400));

  /* ---------- site-wide interactive glass cards ---------- */
  ['.plans', '.stats', '.proc-grid', '.hub'].forEach((g) => $(g)?.classList.add('fx-group'));
  const setOn = (card: HTMLElement, isOn: boolean) => {
    card.classList.toggle('fx-on', isOn);
    const g = card.parentElement;
    if (g?.classList.contains('fx-group')) g.classList.toggle('has-on', !!g.querySelector('.fx-on'));
  };
  const spot = (card: HTMLElement, e: PointerEvent) => { const r = card.getBoundingClientRect(); card.style.setProperty('--mx', `${e.clientX - r.left}px`); card.style.setProperty('--my', `${e.clientY - r.top}px`); };
  const tapTimers = new WeakMap<HTMLElement, number>();
  $$(FX_SELECTOR).forEach((card) => {
    card.classList.add('fxc');
    if (!card.querySelector(':scope > .fx')) { const fx = document.createElement('i'); fx.className = 'fx'; fx.setAttribute('aria-hidden', 'true'); card.prepend(fx); }
    card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { spot(card, e); setOn(card, true); } }, sig);
    card.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') spot(card, e); }, sig);
    card.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setOn(card, false); }, sig);
    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      spot(card, e);
      $$('.fx-on').forEach((c) => { if (c !== card) setOn(c, false); });
      setOn(card, true);
      window.clearTimeout(tapTimers.get(card));
      const t = window.setTimeout(() => setOn(card, false), 1600);
      tapTimers.set(card, t); timers.push(t);
    }, sig);
    card.addEventListener('focusin', () => setOn(card, true), sig);
    card.addEventListener('focusout', () => setOn(card, false), sig);
  });

  /* ---------- tone + active nav from the section under mid-screen ---------- */
  const toneSecs = $$('[data-tone]');
  const navSecs = ['about', 'services', 'process', 'pricing', 'contact'].map((id) => root.querySelector<HTMLElement>(`#${id}`));
  let tickRaf = 0;
  const syncScroll = () => {
    tickRaf = 0;
    const mid = window.innerHeight * 0.5;
    const hit = (el: Element) => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; };
    const t = toneSecs.find(hit);
    if (t && t.dataset.tone && t.dataset.tone !== curTone) setTone(t.dataset.tone);
    const n = navSecs.find((el) => el && hit(el));
    const next = n ? links.find((a) => a.getAttribute('href') === `#${n.id}`) ?? null : null;
    if (next !== active) { active = next; links.forEach((a) => a.classList.toggle('on', a === active)); movePill(active); }
  };
  on('scroll', () => { if (!tickRaf) tickRaf = requestAnimationFrame(syncScroll); }, { passive: true });

  /* ---------- ASCII hands in the closing CTA ---------- */
  const handsStage = $('#hands');
  const handsCanvas = $<HTMLCanvasElement>('#handsCanvas');
  const hands = handsStage && handsCanvas ? initHands(handsStage, handsCanvas, root, reduce, ac.signal) : null;

  /* ---------- theme changes (klpTheme toggles data-mode on <html>) ---------- */
  const modeObs = new MutationObserver(() => { readTones(); setTone(curTone, true); readDots(); hands?.refresh(); });
  modeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });

  /* ---------- layout-dependent pieces ---------- */
  let rz = 0;
  on('resize', () => { window.clearTimeout(rz); rz = window.setTimeout(() => { sample(); drawHub(); syncScroll(); }, 200); });
  const fontsReady = document.fonts?.load
    ? Promise.race([document.fonts.load('italic 400 120px "Playfair Display"'), new Promise((r) => setTimeout(r, 1500))])
    : Promise.resolve();
  void fontsReady.then(() => { if (!alive) return; sample(); draw(); drawHub(); syncScroll(); });

  const staticExplode = (gap: number, off: number) => {
    const stack = $('#exStack');
    if (stack) stack.style.transform = 'rotateX(56deg) rotateZ(-36deg) scale(.74)';
    $$('.ex-layer').forEach((l, i) => { l.style.transform = `translateZ(${i * gap - off}px)`; });
    $$('#exList li').forEach((li) => li.classList.add('on'));
  };
  const words = $$('#manifesto .w');
  const steps = $$('#procGrid .step');
  const staticFallback = () => {
    words.forEach((w) => w.classList.add('on'));
    staticExplode(window.innerWidth > 1040 ? 110 : 70, window.innerWidth > 1040 ? 160 : 100);
  };

  /* ---------- scroll choreography (GSAP, loaded lazily) ---------- */
  let mmRevert: (() => void) | null = null;
  if (reduce) {
    staticFallback();
  } else {
    void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([g, s]) => {
      if (!alive) return;
      gsap = g.gsap; ScrollTrigger = s.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
      const G = gsap, STr = ScrollTrigger;
      ctx = G.context(() => {
        G.from('#heroTitle .ln > span', { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.1, delay: 0.1 });
        G.fromTo('#studio', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', delay: 0.3, clearProps: 'transform,opacity' });
        STr.create({ trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true, onUpdate: (st) => { scatter = st.progress * 1.4; } });
        STr.create({ trigger: '#manifesto', start: 'top 82%', end: 'bottom 45%', scrub: true, onUpdate: (st) => { const n = Math.round(st.progress * words.length); words.forEach((w, i) => w.classList.toggle('on', i < n)); } });
        $$('[data-count]').forEach((el) => {
          const to = Number(el.dataset.count), dec = Number(el.dataset.dec || 0), suf = el.dataset.suf || '';
          STr.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => { const o = { n: 0 }; G.to(o, { n: to, duration: 1.6, ease: 'power3.out', onUpdate: () => { el.textContent = o.n.toFixed(dec) + suf; } }); } });
        });
        G.from(steps, { y: 50, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.08, clearProps: 'transform,opacity', scrollTrigger: { trigger: '#procGrid', start: 'top 82%' } });
        G.fromTo('.giant', { yPercent: 18 }, { yPercent: -12, ease: 'none', scrollTrigger: { trigger: '#pricing', start: 'top bottom', end: 'bottom top', scrub: true } });
        G.from('.plan', { y: 70, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.12, clearProps: 'transform,opacity', scrollTrigger: { trigger: '#plans', start: 'top 80%' } });
        $$('.fl').forEach((f, i) => G.to(f, { y: i % 2 ? -14 : 14, duration: 3 + i * 0.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
        $$('.sec-head h2').forEach((el) => G.from(el, { y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'transform,opacity', scrollTrigger: { trigger: el, start: 'top 88%' } }));

        const mm = G.matchMedia();
        mmRevert = () => mm.revert();
        mm.add('(min-width: 1041px)', () => {
          const layers = $$('.ex-layer'), items = $$('#exList li');
          G.set('#exStack', { rotateX: 0, rotateZ: 0, scale: 0.92 }); G.set(layers, { z: 0 });
          G.timeline({ scrollTrigger: { trigger: '#exPin', start: 'top top', end: '+=2200', pin: true, scrub: 0.8,
            onUpdate: (st) => { const idx = Math.min(3, Math.floor(st.progress * 4.4)); items.forEach((li) => li.classList.toggle('on', 3 - Number(li.dataset.i) <= idx)); } } })
            .to('#exStack', { rotateX: 58, rotateZ: -38, scale: 0.78, duration: 1, ease: 'power2.inOut' })
            .to(layers, { z: (i: number) => i * 120 - 180, duration: 1.4, ease: 'power2.inOut' }, '<.2')
            .to('#exStack', { rotateZ: -26, duration: 0.8, ease: 'none' });
          const track = $('#reelTrack');
          if (track) {
            const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
            const bar = $('#reelBar');
            G.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '#reelPin', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true, onUpdate: (st) => { if (bar) bar.style.width = `${st.progress * 100}%`; } } });
            G.to('.reel .orb.a', { x: 260, y: -60, ease: 'none', scrollTrigger: { trigger: '#reelPin', start: 'top top', end: () => `+=${dist()}`, scrub: true } });
          }
        });
        mm.add('(max-width: 1040px)', () => { staticExplode(70, 100); });
      }, root);
      // triggers below the pins were created first; measure them after the pin spacing exists
      STr.sort(); STr.refresh();
      void document.fonts?.ready.then(() => { if (!alive) return; STr.sort(); STr.refresh(); drawHub(); syncScroll(); });
    }).catch(() => { if (alive) staticFallback(); });
  }

  syncScroll();

  return () => {
    alive = false;
    ac.abort();
    hands?.stop();
    heroIO.disconnect();
    modeObs.disconnect();
    timers.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
    window.clearTimeout(rz);
    if (tickRaf) cancelAnimationFrame(tickRaf);
    mmRevert?.();
    ctx?.revert();
    document.body.style.overflow = '';
  };
}
