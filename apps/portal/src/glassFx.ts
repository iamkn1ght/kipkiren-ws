/**
 * Site-wide interactive glass cards for the .klp screens (portals, auth,
 * legal), matching the landing's card treatment: a cursor spotlight and a
 * sheen; standalone cards also lift. Touch devices get it on tap. Cards are
 * picked up as React renders them (MutationObserver), so dashboards that load
 * data later are covered too. Styles live in klp-glass.css.
 */

const LIFT = '.klp .klp-kpi, .klp .klp-rp-card, .klp .klp-task, .klp .klp-review-card, .klp .klp-empty';
const SOFT = '.klp .klp-authcard, .klp .klp-panel, .klp .klp-legal-toc, .klp .klp-list';

function attach(card: HTMLElement, lift: boolean) {
  if (card.dataset.fx) return;
  card.dataset.fx = '1';
  card.classList.add('fxc', lift ? 'fx-lift' : 'fx-soft');
  const fx = document.createElement('i');
  fx.className = 'fx';
  fx.setAttribute('aria-hidden', 'true');
  card.prepend(fx);
  const spot = (e: PointerEvent) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  let t = 0;
  card.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { spot(e); card.classList.add('fx-on'); } });
  card.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') spot(e); });
  card.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') card.classList.remove('fx-on'); });
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    spot(e);
    card.classList.add('fx-on');
    window.clearTimeout(t);
    t = window.setTimeout(() => card.classList.remove('fx-on'), 1400);
  });
}

export function initGlassFx(): void {
  if (typeof document === 'undefined') return;
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll<HTMLElement>(LIFT).forEach((c) => attach(c, true));
    document.querySelectorAll<HTMLElement>(SOFT).forEach((c) => attach(c, false));
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(scan); } };
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  queue();
}
