/**
 * ASCII hands for the closing CTA, after "The Creation of Adam": two hands
 * reach in from either side and, as the section scrolls into view, close the
 * gap until the index fingertips touch, with a teal spark at the contact
 * (the client's idea meeting our engineering).
 *
 * Each hand is drawn with simple shapes (forearm, palm, thumb, curled fingers,
 * extended index finger), every part outlined so the finger separations become
 * strong lines. The drawing is sampled into a grid of JetBrains Mono
 * characters: edges get dense characters, the flat interior stays faint.
 * Characters near the cursor scatter and turn teal.
 */

const RAMP = ' .,:-=+*%#@';
const NOISE = '01<>/{}[]=+*';

interface Cell { x: number; y: number; d: number }
interface Pt { bx: number; by: number; side: number; ch: string; d: number; acc: boolean; ph: number }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * One hand pointing right, wrist to the left, drawn in unit space where the
 * index fingertip sits at (0.5, tipY). `droop` lets the index finger sag
 * slightly (the receiving hand).
 */
function drawHand(o: CanvasRenderingContext2D, s: number, droop: number) {
  const SKIN = '#d9d4cb', LINE = '#14120c';
  const ow = Math.max(1.6, s * 0.012);
  const cap = (x1: number, y1: number, x2: number, y2: number, w: number) => {
    o.lineCap = 'round';
    o.strokeStyle = LINE; o.lineWidth = w * s + ow * 2;
    o.beginPath(); o.moveTo(x1 * s, y1 * s); o.lineTo(x2 * s, y2 * s); o.stroke();
    o.strokeStyle = SKIN; o.lineWidth = w * s;
    o.beginPath(); o.moveTo(x1 * s, y1 * s); o.lineTo(x2 * s, y2 * s); o.stroke();
  };
  // forearm (fades off toward the edge of the stage)
  const g = o.createLinearGradient(-1.3 * s, 0, -0.2 * s, 0);
  g.addColorStop(0, 'rgba(217,212,203,0)'); g.addColorStop(0.45, SKIN);
  o.lineCap = 'butt';
  o.strokeStyle = LINE; o.lineWidth = 0.2 * s + ow * 2;
  o.beginPath(); o.moveTo(-0.62 * s, 0.05 * s); o.lineTo(-0.14 * s, 0.02 * s); o.stroke();
  o.strokeStyle = g; o.lineWidth = 0.2 * s + ow * 2.2;
  o.beginPath(); o.moveTo(-1.3 * s, 0.07 * s); o.lineTo(-0.62 * s, 0.05 * s); o.stroke();
  o.strokeStyle = SKIN; o.lineWidth = 0.2 * s;
  o.beginPath(); o.moveTo(-0.7 * s, 0.055 * s); o.lineTo(-0.12 * s, 0.02 * s); o.stroke();
  // palm
  o.fillStyle = SKIN; o.strokeStyle = LINE; o.lineWidth = ow;
  o.beginPath();
  o.roundRect(-0.16 * s, -0.11 * s, 0.32 * s, 0.25 * s, 0.09 * s);
  o.fill(); o.stroke();
  // curled middle, ring and little fingers (two segments each, folding back)
  cap(0.12, 0.0, 0.25, 0.04, 0.068); cap(0.25, 0.04, 0.2, 0.1, 0.064);
  cap(0.11, 0.065, 0.22, 0.1, 0.064); cap(0.22, 0.1, 0.17, 0.155, 0.06);
  cap(0.08, 0.12, 0.18, 0.15, 0.058); cap(0.18, 0.15, 0.13, 0.195, 0.054);
  // thumb along the top
  cap(-0.03, -0.09, 0.1, -0.15, 0.072); cap(0.1, -0.15, 0.19, -0.135, 0.064);
  // extended index finger (three segments, slight droop on the receiving hand)
  cap(0.12, -0.06, 0.27, -0.065 + droop * 0.2, 0.07);
  cap(0.27, -0.065 + droop * 0.2, 0.39, -0.06 + droop * 0.55, 0.066);
  cap(0.39, -0.06 + droop * 0.55, 0.48, -0.055 + droop, 0.062);
}

export function initHands(stage: HTMLElement, cv: HTMLCanvasElement, root: HTMLElement, reduce: boolean, signal: AbortSignal): { refresh: () => void; stop: () => void } {
  const ctx = cv.getContext('2d');
  if (!ctx) return { refresh: () => {}, stop: () => {} };
  let alive = true, visible = false, W = 0, H = 0, cell = 6, spread = 0, pts: Pt[] = [];
  let ink = '#111008', accent = '#0E7A68';
  let contact = { x: 0, y: 0 };
  const mouse = { x: -9999, y: -9999 };
  const css = (v: string) => getComputedStyle(root).getPropertyValue(v).trim();
  const readColors = () => { ink = css('--ink') || ink; accent = css('--dot-accent') || accent; };
  const charFor = (d: number) => RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(d * (RAMP.length - 1))))] ?? '.';

  // draw into an offscreen canvas, then sample it into character cells
  const sample = (paint: (o: CanvasRenderingContext2D) => void): Cell[] => {
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const o = off.getContext('2d', { willReadFrequently: true });
    if (!o) return [];
    paint(o);
    const data = o.getImageData(0, 0, W, H).data;
    const lumAt = (x: number, y: number) => {
      const xi = Math.max(0, Math.min(W - 1, x | 0)), yi = Math.max(0, Math.min(H - 1, y | 0));
      const i = (yi * W + xi) * 4;
      if ((data[i + 3] ?? 0) < 90) return 1;
      return (0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)) / 255;
    };
    const out: Cell[] = [];
    for (let y = cell / 2; y < H; y += cell) {
      for (let x = cell / 2; x < W; x += cell) {
        const i = ((y | 0) * W + (x | 0)) * 4;
        if ((data[i + 3] ?? 0) <= 90) continue;
        const lum = lumAt(x, y);
        const d = clamp01((1 - lum) * 1.25);
        // keep every line cell, thin the flat skin so the line work carries the shape
        if (d < 0.3 && Math.random() < 0.55) continue;
        out.push({ x, y, d });
      }
    }
    return out;
  };

  const build = () => {
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    W = stage.clientWidth; H = stage.clientHeight;
    if (W === 0 || H === 0) return;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cell = W < 700 ? 4 : 6;
    const s = W < 700 ? W * 0.56 : Math.min(H * 1.25, W * 0.4);
    const gap = cell * 1.6;
    const cy = H * 0.52;
    contact = { x: W / 2, y: cy - 0.055 * s };
    spread = Math.min(W * 0.16, s * 0.45);
    const left = sample((o) => { o.save(); o.translate(W / 2 - 0.48 * s - gap / 2, cy); drawHand(o, s, 0.035); o.restore(); });
    const right = sample((o) => { o.save(); o.translate(W / 2 + 0.48 * s + gap / 2, cy); o.scale(-1, 1); drawHand(o, s, 0); o.restore(); });
    pts = [];
    const add = (cells: Cell[], side: number) => cells.forEach((c) => pts.push({ bx: c.x, by: c.y, side, ch: charFor(c.d), d: c.d, acc: Math.random() < 0.04, ph: Math.random() * Math.PI * 2 }));
    add(left, -1); add(right, 1);
  };

  const progress = () => {
    if (reduce) return 1;
    const r = stage.getBoundingClientRect();
    return smooth(clamp01((window.innerHeight * 0.95 - r.top) / (window.innerHeight * 0.7)));
  };

  let t = 0, drawn = false;
  const draw = () => {
    if (!alive) return;
    if ((visible || !drawn) && pts.length) {
      drawn = true;
      t += 0.016;
      const p = progress();
      const touch = clamp01((p - 0.9) / 0.1);
      stage.style.setProperty('--clasp', String(touch));
      ctx.clearRect(0, 0, W, H);
      ctx.font = `${Math.round(cell * 1.55)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const R = 90;
      const buckets: [number, number, string][][] = [[], [], [], []];
      const off = (1 - p) * spread;
      for (const q of pts) {
        let x = q.bx + q.side * off, y = q.by;
        if (!reduce) { const drift = 0.6 + (1 - p) * 1.2; x += Math.sin(t * 1.4 + q.ph) * drift * 0.5; y += Math.cos(t * 1.1 + q.ph) * drift * 0.5; }
        let ch = q.ch, hot = false;
        const dx = x - mouse.x, dy = y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 14;
          x += (dx / d) * f; y += (dy / d) * f; hot = true;
          if (Math.random() < 0.3) ch = NOISE[(Math.random() * NOISE.length) | 0] ?? ch;
        } else if (!reduce && Math.random() < 0.01) {
          ch = RAMP[1 + ((Math.random() * (RAMP.length - 1)) | 0)] ?? ch;
        }
        const nearTip = touch > 0 && Math.hypot(x - contact.x, y - contact.y) < 46;
        const b = hot || nearTip ? 3 : q.d > 0.55 ? 2 : q.d > 0.3 ? 1 : q.acc ? 3 : 0;
        buckets[b]!.push([x, y, ch]);
      }
      // spark at the contact point once the fingertips meet
      if (touch > 0 && !reduce) {
        const n = Math.round(18 * touch);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + t * 0.8, rad = 10 + ((t * 40 + i * 7) % 34);
          buckets[3]!.push([contact.x + Math.cos(a) * rad, contact.y + Math.sin(a) * rad, i % 3 ? '+' : '*']);
        }
      }
      const styles = [[ink, 0.2], [ink, 0.5], [ink, 0.95], [accent, 0.95]] as const;
      buckets.forEach((list, i) => {
        if (!list.length) return;
        const [color, alpha] = styles[i]!;
        ctx.globalAlpha = alpha; ctx.fillStyle = color;
        for (const [x, y, ch] of list) ctx.fillText(ch, x, y);
      });
      ctx.globalAlpha = 1;
    }
    if (!reduce) requestAnimationFrame(draw);
  };

  const io = new IntersectionObserver(([en]) => { visible = !!en?.isIntersecting; }, { rootMargin: '120px 0px' });
  io.observe(stage);
  const host = stage.parentElement ?? stage;
  host.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; }, { signal });
  host.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; }, { signal });
  let rz = 0;
  window.addEventListener('resize', () => { window.clearTimeout(rz); rz = window.setTimeout(() => { build(); drawn = false; if (reduce) draw(); }, 200); }, { signal });

  readColors();
  const ready = document.fonts?.load ? Promise.race([document.fonts.load('12px "JetBrains Mono"'), new Promise((r) => setTimeout(r, 1200))]) : Promise.resolve();
  void ready.then(() => { if (!alive) return; build(); draw(); });

  return {
    refresh: () => { readColors(); drawn = false; if (reduce) draw(); },
    stop: () => { alive = false; io.disconnect(); window.clearTimeout(rz); },
  };
}
