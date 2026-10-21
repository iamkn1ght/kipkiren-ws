import { memo, useEffect, useRef, type MouseEvent } from 'react';
import { KlpToggle } from './klpTheme.tsx';
import { LEGAL_NAV, type LegalDocId } from './Legal.tsx';
import { initLanding } from './landingFx.ts';
import './landing.css';
import './landing-x.css';

/**
 * Public landing page, v0.3 "the live site, elevated" (reviewed as a design
 * prototype, then ported). Same palette, copy, light / warm-dark modes and
 * section order as before, plus: page tone that follows the scroll, glass
 * surfaces with a site-wide interactive card treatment, a particle hero,
 * a word-by-word manifesto, a pinned 3D exploded view, a horizontal service
 * reel, a night-shift care log, frosted pricing over a giant word, numbered
 * glass process steps, a centred philosophy + why ribbon and a promise close.
 *
 * Markup is static (SSR-safe for the build-time prerender); all motion and
 * interaction live in landingFx.ts, started once on mount and torn down on
 * unmount. Styles are scoped under .kx in landing-x.css.
 */

// Build + Care pricing. A one-time build (priced below the one-time-only shops)
// plus a monthly care plan. The differentiator: we build it, then we run it.
export const PLANS = [
  { kick: '01 · starter', name: 'Starter', desc: 'A polished presence for a small business getting online properly.',
    build: '45,000', care: '3,500',
    feats: ['Up to 5 pages, designed and built', 'Domain, hosting and email forwarding', 'Mobile-perfect, fast, SEO-ready', 'Care: uptime, SSL, backups, edits', '48-hour support SLA'],
    cta: 'Start with Starter', featured: false },
  { kick: '02 · growth', name: 'Growth', desc: 'For teams that treat their website as core infrastructure.',
    build: '89,000', care: '7,500',
    feats: ['Up to 10 pages, blog or simple CMS', 'On-page SEO and analytics built in', 'Card payments on your site (M-Pesa coming soon)', 'Care: everything, plus monthly SEO', 'Named delivery lead · 24-hour SLA'],
    cta: 'Choose Growth', featured: true },
  { kick: '03 · business', name: 'Business', desc: 'Mid-market sites, portals and integrations, actively operated.',
    build: '165,000', care: '18,000',
    feats: ['Unlimited pages and integrations', 'E-commerce or booking systems', 'Priority delivery and support', 'Care: everything (cloud provisioning coming soon)', '12-hour SLA · quarterly reviews'],
    cta: 'Choose Business', featured: false },
];

export const FAQ = [
  { q: 'Do prices include VAT?', a: 'No. All figures exclude 16% VAT, which is itemised on your proforma.' },
  { q: 'How does payment work?', a: 'Every build and every change is priced on a proforma you approve first. Today you pay by bank transfer and we confirm it, usually the same working day, with a receipt by email. M-Pesa and card checkout are coming soon. Monthly care is invoiced on the 1st and due by the 7th. No surprise invoices, ever.' },
  { q: 'Do I have to take a care plan?', a: 'The build and its first year of care go together, so your site is looked after from day one. After that, care is month to month and you can pause any time. You always keep the site.' },
  { q: 'What does monthly care cover?', a: 'Hosting, uptime checks every five minutes, SSL, backups, security patches and a block of change requests each month. Anything larger is quoted on the rate card before we start.' },
  { q: 'Where are you based?', a: 'Nairobi. We work with clients across East Africa, and occasionally further afield.' },
  { q: 'What if we want to leave?', a: 'We hand over the codebase, database, DNS and every account. No lock-in, ever. The site is yours.' },
];

const COMPARE_THEM = ['Maintenance billed separately, if at all', 'Slow to reach when something breaks', 'The site quietly rots within a year', 'You chase them for every small fix'];
const COMPARE_US = ['Care included from the first day', 'A named team that answers within your SLA', 'Monitored, patched and updated for you', 'We watch it so you never have to'];

// Authentic competence signal (the stack this site actually runs on) in place
// of fabricated client logos. Only list what is live today.
const STACK = ['React', 'TypeScript', 'Supabase', 'PostgreSQL', 'Cloudflare', 'Railway', 'Vite', 'GSAP', 'Row-level security', 'Audit log'];

const PROCESS = [
  { t: 'Discovery', d: '45-90 minutes. We listen more than we present.' },
  { t: 'Proforma', d: 'Fixed scope, fixed price, in your inbox within 48 hours.' },
  { t: 'Design', d: 'Editorial layouts, real content, one direction refined, not three shown.' },
  { t: 'Build', d: 'Weekly demos. You can watch the site come together.' },
  { t: 'Launch', d: 'Quiet, deliberate, with rollback on hand. No launch tweets required.' },
  { t: 'Operation', d: 'The part most studios skip. We stay.' },
];

// Philosophy + Why Kipkiren (option E): four reasons, each with the number we commit to.
const BELIEFS = [
  { k: 'Transparent pricing', n: '48', suf: 'h', t: 'A proforma before any work.', d: 'No surprise invoices, no padded hours, no "it depends".' },
  { k: 'We run what we build', n: '99.9', suf: '%', dec: '1', t: 'We stay on the line.', d: 'Care is a first-class part of the work, not an upsell.' },
  { k: 'You own everything', n: '100', suf: '%', t: 'No lock-in, ever.', d: 'Code, database, DNS and every account are yours.' },
];

const MANIFESTO = 'Websites decay. Most agencies quietly disappear after launch. *We stay,* with monitoring, backups, patches and a real person who knows your business.';

// Short labels for the footer legal column (the full names live on the pages).
const FOOTER_LEGAL: Record<string, string> = { terms: 'Terms', privacy: 'Privacy', refunds: 'Refunds', sla: 'Service', cookies: 'Cookies', faq: 'FAQ' };

function manifestoWords() {
  const out: JSX.Element[] = [];
  MANIFESTO.split(/(\*[^*]+\*)/).forEach((chunk, ci) => {
    const em = chunk.startsWith('*');
    chunk.replace(/\*/g, '').split(/(\s+)/).forEach((w, wi) => {
      if (!w) return;
      if (/^\s+$/.test(w)) { out.push(<span key={`${ci}-${wi}`}>{w}</span>); return; }
      out.push(<span key={`${ci}-${wi}`} className={em ? 'w em' : 'w'}>{w}</span>);
    });
  });
  return out;
}

const Check = () => <span className="chk" />;

// Footer links to the service pages (ids match Services.tsx; kept here to
// avoid a circular import, since Services.tsx reads PLANS from this file).
const FOOTER_SERVICES: { id: string; label: string }[] = [
  { id: 'web-design-nairobi', label: 'Web design' }, { id: 'website-maintenance-kenya', label: 'Website care' },
  { id: 'seo-services-kenya', label: 'SEO' }, { id: 'website-hosting-kenya', label: 'Hosting' }, { id: 'pricing', label: 'Pricing' },
];

function LandingImpl({ onSignIn, onSignUp, onLegal }: { onSignIn: () => void; onSignUp: () => void; onLegal: (id: LegalDocId) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return undefined;
    return initLanding(rootRef.current);
  }, []);

  const legal = (id: LegalDocId) => (e: MouseEvent) => { e.preventDefault(); onLegal(id); };
  const page = (id: string) => (e: MouseEvent) => { e.preventDefault(); onLegal(id as LegalDocId); };

  return (
    <div className="kx" ref={rootRef}>
      <div id="tone" aria-hidden="true" />
      <div className="haze" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <header className="nav glass" id="nav">
        <a className="brand" href="#top" aria-label="Kipkiren Web Services home"><span className="mark">K</span><span className="nm">Kipkiren<small>Web services</small></span></a>
        <nav className="nav-links" id="navLinks" aria-label="Main">
          <span className="nav-pill" id="navPill" />
          <a href="#about">About</a><a href="#services">Services</a><a href="#process">Process</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a>
        </nav>
        <div className="nav-r">
          <KlpToggle />
          <button type="button" className="btn ghost" onClick={onSignIn}>Sign in</button>
          <button type="button" className="btn primary" onClick={onSignUp}>Start a project</button>
          <button className="menu-btn" id="menuBtn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="msheet"><span /><span /></button>
        </div>
      </header>
      <div className="msheet glass" id="msheet" hidden>
        <nav aria-label="Mobile"><a href="#about">About</a><a href="#services">Services</a><a href="#process">Process</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a></nav>
        <div className="msheet-ctas">
          <button type="button" className="btn primary" onClick={onSignUp}>Start a project <span className="ar">&rarr;</span></button>
          <button type="button" className="btn ghost" onClick={onSignIn}>Sign in</button>
        </div>
        <p className="mono">studio@kipkiren.co.ke · Nairobi</p>
      </div>

      <main id="top">
        {/* hero */}
        <section className="hero" id="hero" data-tone="paper">
          <canvas id="field" aria-hidden="true" />
          <div className="wrap">
            <div>
              <h1 className="d-xl hero-h1" id="heroTitle"><span className="ln"><span>Precision websites,</span></span><span className="ln"><span><em>quietly operated.</em></span></span></h1>
              <p className="lead">Kipkiren is a Nairobi web design studio that designs, builds and runs the websites Kenyan businesses depend on. One senior team, one transparent price, and people who still answer long after launch.</p>
              <div className="ctas"><a className="btn primary" href="#pricing">See pricing <span className="ar">&rarr;</span></a><a className="btn ghost" href="mailto:studio@kipkiren.co.ke?subject=Project%20conversation">Book a conversation</a></div>
              <div className="assure"><span>Fixed price before any work</span><span>You own everything</span><span>No lock-in</span></div>
            </div>
            <aside className="studio glass" id="studio">
              <span className="mono">Studio note · 004</span>
              <p className="q">"The web is quieter than it looks. Almost every site we are asked to rescue was shipped in a rush by someone who was never going to answer the phone six months later."</p>
              <p className="mono by">Kipkiren Studio, on why we run what we build</p>
              <div className="facts"><div><span className="n">48h</span><span className="l">To proforma</span></div><div><span className="n">99.9%</span><span className="l">Uptime target</span></div><div><span className="n">24h</span><span className="l">Response SLA</span></div></div>
              <div className="studio-price"><span>Build from <strong>KES 45,000</strong> plus care from 3,500/mo</span><a href="#pricing">See pricing &rarr;</a></div>
            </aside>
          </div>
        </section>

        <div className="marquee glass" aria-hidden="true"><span className="mono">Built with</span><div className="mq"><div className="mq-track">{[...STACK, ...STACK].map((s, i) => <span key={i}>{s}</span>)}</div></div></div>

        {/* philosophy + why kipkiren: centred statement + ribbon */}
        <section className="sec belief" id="about" data-tone="paper">
          <div className="wrap">
            <span className="eyebrow">Philosophy · Why Kipkiren</span>
            <h2 className="d-lg belief-h">We treat your site <em>like infrastructure.</em></h2>
            <p className="manifesto" id="manifesto">{manifestoWords()}</p>
            <div className="ribbon glass">
              {BELIEFS.map((r) => (
                <div key={r.k} className="rib">
                  <span className="rk">{r.k}</span>
                  <span className="rn" data-count={r.n} data-suf={r.suf} data-dec={r.dec ?? '0'}>{r.n}{r.suf}</span>
                  <h3>{r.t}</h3>
                  <p>{r.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* how we build: exploded view */}
        <section data-tone="paper" id="how">
          <div className="ex-pin" id="exPin">
            <div className="ex-copy">
              <span className="eyebrow">How we build</span>
              <h2 className="d-lg">Every site is four layers deep. <em>We own all four.</em></h2>
              <ol className="ex-list" id="exList">
                <li data-i="3"><span className="k">L4</span><span><b>Interface</b><small>Your brand, mobile-first, accessible, fast on a Safaricom 4G phone.</small></span></li>
                <li data-i="2"><span className="k">L3</span><span><b>Structure</b><small>A grid, a type scale and performance budgets set before a pixel ships.</small></span></li>
                <li data-i="1"><span className="k">L2</span><span><b>Code</b><small>React and TypeScript, tested. M-Pesa through Kipkiren Pay is coming soon.</small></span></li>
                <li data-i="0"><span className="k">L1</span><span><b>Infrastructure</b><small>Edge network, API, Postgres with row-level security, an insert-only audit log.</small></span></li>
              </ol>
            </div>
            <div className="ex-stage" aria-hidden="true">
              <div className="ex-stack" id="exStack">
                <div className="ex-layer L-infra">
                  <span className="tag">L1 · Infrastructure</span>
                  <svg viewBox="0 0 560 385" preserveAspectRatio="none"><path d="M140 110 H280 V190 M280 190 H420 M280 230 V300 M420 190 V280" /></svg>
                  <div className="node" style={{ left: '8%', top: '22%' }}>Cloudflare edge<br />CDN · SSL · DNS</div>
                  <div className="node t" style={{ left: '40%', top: '42%' }}>API<br />RS256 JWT</div>
                  <div className="node t" style={{ left: '66%', top: '40%' }}>Postgres<br />RLS per client</div>
                  <div className="node" style={{ left: '40%', top: '76%' }}>Audit log</div>
                  <div className="node" style={{ left: '66%', top: '72%' }}>Uptime · 5 min</div>
                </div>
                <div className="ex-layer L-code">
                  <span className="tag">L2 · Code</span>
                  <pre>
                    <span className="cm">{'// checkout.tsx'}</span>{'\n'}
                    <span className="kw">export async function</span>{' payWithMpesa(order: Order) {\n  '}
                    <span className="kw">const</span>{' pf = '}<span className="kw">await</span>{' proforma.approve(order.id)\n  '}
                    <span className="kw">if</span>{' (pf.hash !== order.hash) '}<span className="kw">throw</span>{' '}<span className="st">{"'scope changed'"}</span>{'\n  '}
                    <span className="kw">return</span>{' kipkirenPay.stkPush({\n    msisdn: order.phone,\n    amount: pf.total_kes,  '}<span className="cm">{'// KES, VAT incl.'}</span>{'\n    ref: pf.ref,\n  })\n}'}
                  </pre>
                </div>
                <div className="ex-layer L-wire">
                  <span className="tag">L3 · Structure</span>
                  <div className="wf" style={{ left: '6%', right: '6%', top: '16%', height: '9%' }}><b>nav · sticky · 64px</b></div>
                  <div className="wf" style={{ left: '6%', width: '46%', top: '35%', height: '20%' }}><b>h1 · serif 44/1.04</b></div>
                  <div className="wf" style={{ left: '6%', width: '22%', top: '63%', height: '7%' }}><b>STK push</b></div>
                  <div className="wf" style={{ left: '58%', right: '6%', top: '33%', height: '40%' }}><b>img · AVIF · 38 KB</b></div>
                  <div className="wf" style={{ left: '6%', right: '6%', top: '82%', height: '9%' }}><b>grid · 3 col</b></div>
                </div>
                <div className="ex-layer L-ui">
                  <span className="tag">L4 · Interface</span>
                  <div className="site">
                    <div className="s-nav"><span className="s-logo">Kilele</span><span className="s-links"><span>Menu</span><span>Order</span><span>Visit</span></span><span className="s-cta">Order now</span></div>
                    <div className="s-hero"><div><h4>Fresh from the oven by seven.</h4><p>Order cakes and bread before midnight. Collect in Westlands from 7 a.m.</p><span className="s-btn">Order with M-Pesa</span></div><div className="s-img" /></div>
                    <div className="s-row"><div><span>Sourdough</span><span>KES 450</span></div><div><span>Black forest</span><span>KES 2,400</span></div><div><span>Mandazi x6</span><span>KES 180</span></div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* services reel */}
        <section className="reel" id="services" data-tone="night">
          <div className="reel-pin" id="reelPin">
            <span className="orb a" /><span className="orb b" />
            <div className="reel-head"><div><span className="eyebrow">Services</span><h2 className="d-lg">Four disciplines, <em>one team.</em></h2></div><div className="reel-prog"><i id="reelBar" /></div></div>
            <div className="reel-track" id="reelTrack">
              <article className="panel glass">
                <div className="panel-l"><span className="code">DESIGN</span><div><h3>Design</h3><p>Editorial, deliberate, and grounded in your brand. No moodboard-of-the-week.</p></div><ul><li>A visual system, not a one-off mockup</li><li>Real content and structure from day one</li><li>Mobile-first and accessible by default</li></ul></div>
                <div className="panel-r"><svg viewBox="0 0 300 300" aria-hidden="true"><rect className="df-l" x="30" y="60" width="60" height="60" rx="10" /><rect className="df-t" x="100" y="60" width="60" height="60" rx="10" /><rect className="df-p" x="170" y="60" width="60" height="60" rx="10" /><text className="dt big" x="30" y="200">Aa</text><path className="dl m" d="M30 228 H270" /><text className="dt t" x="30" y="256">TOKENS YOU KEEP</text></svg><div className="rate"><span>Design work</span><b>from KES 3,500/hr</b></div></div>
              </article>
              <article className="panel glass">
                <div className="panel-l"><span className="code">ENGINEERING</span><div><h3>Engineering</h3><p>React, TanStack, Supabase. Ships fast, stays fast, scored honestly.</p></div><ul><li>React and TypeScript, typed end to end</li><li>Supabase and Postgres with row-level security</li><li>Clean code and a full handover, always</li></ul></div>
                <div className="panel-r"><svg viewBox="0 0 300 300" aria-hidden="true"><rect className="dl" x="20" y="120" width="76" height="48" rx="10" /><text className="dt" x="30" y="149">BROWSER</text><rect className="df-t" x="112" y="120" width="76" height="48" rx="10" /><text className="dt" x="138" y="149" style={{ fill: '#fff' }}>API</text><rect className="df-p" x="204" y="120" width="76" height="48" rx="10" /><text className="dt" x="210" y="149" style={{ fill: 'var(--paper)' }}>POSTGRES</text><path className="dl t" d="M96 144 H112 M188 144 H204" /><text className="dt t" x="20" y="220">RS256 · RLS · AUDIT LOG</text></svg><div className="rate"><span>Build work</span><b>from KES 3,500/hr</b></div></div>
              </article>
              <article className="panel glass">
                <div className="panel-l"><span className="code">SEO &amp; CONTENT</span><div><h3>Search</h3><p>Structured for discovery. Written by humans who read what they publish.</p></div><ul><li>Technical SEO and structured data</li><li>Analytics and Search Console wired in</li><li>Ongoing content support on care plans</li></ul></div>
                <div className="panel-r"><svg viewBox="0 0 300 300" aria-hidden="true"><rect className="dl" x="20" y="80" width="260" height="38" rx="19" /><text className="dt" x="38" y="104">bakery near westlands</text><rect className="df-t" x="20" y="132" width="260" height="46" rx="12" /><text className="dt" x="36" y="160" style={{ fill: '#fff' }}>KILELE BAKERY · OPEN NOW</text><path className="dl m" d="M20 204 H240 M20 222 H200 M20 240 H220" /></svg><div className="rate"><span>SEO work</span><b>from KES 3,000/hr</b></div></div>
              </article>
              <article className="panel glass">
                <div className="panel-l"><span className="code">MANAGED HOSTING</span><div><h3>Hosting</h3><p>We own uptime, backups, updates and the 03:00 incident. You own the site.</p></div><ul><li>Uptime checked every 5 minutes, with alerts</li><li>SSL, backups and restores</li><li>A named person who answers</li></ul></div>
                <div className="panel-r"><svg viewBox="0 0 300 300" aria-hidden="true"><text className="dt big" x="30" y="130">99.9%</text><text className="dt" x="30" y="160">MONTHLY UPTIME TARGET</text><path className="dl m" d="M30 200 H270" /><rect className="df-l" x="30" y="214" width="8" height="8" rx="4" /><text className="dt t" x="46" y="222">CHECKED EVERY 5 MIN</text></svg><div className="rate"><span>Included in</span><b>every care plan</b></div></div>
              </article>
            </div>
          </div>
        </section>

        {/* process */}
        <section className="sec" id="process" data-tone="paper">
          <div className="wrap">
            <div className="sec-head">
              <div><span className="eyebrow">Process</span><h2 className="d-lg">How the work <em>moves.</em></h2></div>
              <p className="lead">Six steps. Predictable calendar. No mystery deliverables.</p>
            </div>
            <div className="proc-grid" id="procGrid">
              {PROCESS.map((p, i) => (
                <div key={p.t} className="step glass"><span className="num">{String(i + 1).padStart(2, '0')}</span><span className="ghost-n" aria-hidden="true">{i + 1}</span><h3>{p.t}</h3><p>{p.d}</p></div>
              ))}
            </div>
          </div>
        </section>

        {/* care / night shift */}
        <section className="sec night" id="care" data-tone="night">
          <span className="orb c" />
          <div className="wrap grid">
            <div>
              <span className="eyebrow">Care · after launch</span>
              <div className="clock" id="clock">03:00<sup>EAT</sup></div>
              <h2 className="d-md">While Nairobi sleeps, <em>your site is still being looked after.</em></h2>
              <p className="lead">Every care plan keeps checking, renewing, backing up and patching through the night, and a named person answers if anything breaks.</p>
            </div>
            <div className="log glass">
              <div className="log-hd"><span className="live">Care log · sample</span><span>kilele-bakery.co.ke</span></div>
              <ol id="log" />
              <div className="log-ft"><span>Incidents in the last 30 days: 0</span><span>Uptime target 99.9%</span></div>
            </div>
          </div>
        </section>

        {/* pricing */}
        <section className="sec pricing" id="pricing" data-tone="paper">
          <div className="wrap">
            <div className="head">
              <span className="eyebrow">Pricing</span>
              <p className="lead">One transparent build price to launch, one monthly care plan to keep it fast, secure and growing. Every figure in Kenyan shillings, VAT itemised on the proforma.</p>
            </div>
            <div className="giant-wrap">
              <div className="giant" aria-hidden="true">Pric<em>ing</em></div>
              <div className="plans" id="plans">
                {PLANS.map((p, i) => (
                  <article key={p.name} className={`plan glass${p.featured ? ' feat' : ''}`} data-build={p.build.replace(/,/g, '')} data-care={p.care.replace(/,/g, '')}>
                    <div className="plan-top">
                      <div className="plan-name"><span>{p.name} plan</span>{p.featured && <span className="plan-flag">Most chosen</span>}</div>
                      <p className="plan-desc">{p.desc}</p>
                      <div className="amt"><span className="cur">KES</span><span className="v" data-i={i}>{p.build}</span><span className="per">/build</span></div>
                      <div className="care-line">Plus care <strong>KES {p.care}</strong> / month</div>
                    </div>
                    <ul className="plan-feats">{p.feats.map((f) => <li key={f}><Check />{f}</li>)}</ul>
                    <div className="plan-cta"><button type="button" className="btn" onClick={onSignUp}>{p.cta}</button></div>
                  </article>
                ))}
              </div>
              <div className="switch-row">
                <button className="switch" id="yearSwitch" type="button" role="switch" aria-checked="false"><span className="tr" /><span>Show first year, with care</span></button>
                <span className="mono" id="switchNote">One-time build fee, ex-VAT</span>
              </div>
            </div>
            <div className="plans-link" aria-hidden="true">
              <span className="pill glass">Why Build + Care</span>
              <svg viewBox="0 0 820 70" preserveAspectRatio="none"><path d="M410 0 V22 M410 22 H90 V70 M410 22 H730 V70" /><circle cx="90" cy="70" r="3" /><circle cx="730" cy="70" r="3" /></svg>
            </div>
            <div className="compare glass">
              <div className="them"><span className="mono">A one-time build</span><h3>Pay once, then you are on your own.</h3><ul>{COMPARE_THEM.map((c) => <li key={c}>{c}</li>)}</ul></div>
              <div className="us"><span className="mono">Kipkiren Build + Care</span><h3>Built once, then run for years.</h3><ul>{COMPARE_US.map((c) => <li key={c}>{c}</li>)}</ul></div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="sec" data-tone="paper">
          <div className="wrap faq-grid">
            <div><span className="eyebrow">FAQ</span><h2 className="d-lg" style={{ marginTop: 20 }}>Questions people ask, <em>plainly answered.</em></h2></div>
            <div className="faq-list" id="faqs">
              {FAQ.map((f, i) => (
                <div key={f.q} className={`faq glass${i === 0 ? ' open' : ''}`}><button type="button" aria-expanded={i === 0}><span>{f.q}</span><span className="chev" /></button><div className="body"><p>{f.a}</p></div></div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta" id="contact" data-tone="paper">
          <div className="promise" id="promise">
            <p className="promise-big">
              <span className="w">Tell</span> <span className="w">us</span> <span className="w">the</span> <span className="w">idea.</span><br />
              <span className="w t">We</span> <span className="w t">build</span> <span className="w t">it.</span>
            </p>
            <ul className="promise-chips">
              <li>Fixed price</li><li>Proforma in 48h</li><li>Receipts by email</li><li>No lock-in</li><li>We stay after launch</li>
            </ul>
          </div>
          <div className="wrap">
            <div className="cta-card glass">
              <span className="eyebrow">Start</span>
              <h2 className="d-lg">Ready when <em>you are.</em></h2>
              <p className="lead">Pick a plan or open a ticket for something custom. Either path starts a real conversation with a real designer, usually the same day.</p>
              <div className="ctas"><a className="btn primary" href="#pricing">See plans <span className="ar">&rarr;</span></a><button type="button" className="btn ghost" onClick={onSignUp}>Open a custom ticket</button></div>
            </div>
          </div>
          <div className="floaters" aria-hidden="true">
            <div className="fl glass f1"><span className="k">Proforma</span><b>Approved</b><span className="ok">Scope locked</span></div>
            <div className="fl glass f2"><span className="k">Bank transfer</span><b>Payment confirmed</b><span className="ok">Receipt emailed</span></div>
            <div className="fl glass f3"><span className="k">SSL</span><b>Renewed</b><span className="ok">Valid 90 days</span></div>
            <div className="fl glass f4"><span className="k">Ticket</span><b>Scoped in 48h</b><span className="ok">Awaiting you</span></div>
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="foot">
        <div className="wrap">
          <div className="foot-panel glass">
            <div className="foot-top">
              <div className="foot-brand">
                <a className="brand" href="#top"><span className="mark">K</span><span className="fb-name">Kipkiren<small>Web services</small></span></a>
                <p className="foot-tag">Precision websites, quietly operated. Designed, built and run by a small senior team in Nairobi.</p>
              </div>
              <div className="foot-social">
                <a className="soc" href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="Kipkiren on LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.3 0-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H9V9Z" /></svg></a>
                <a className="soc" href="https://www.instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Kipkiren on Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="3.8" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" /></svg></a>
              </div>
            </div>
            <div className="foot-cols">
              <div className="foot-col"><span className="fc-h">Services</span><ul>{FOOTER_SERVICES.map((s) => <li key={s.id}><a href={`/${s.id}`} onClick={page(s.id)}>{s.label}</a></li>)}</ul></div>
              <div className="foot-col"><span className="fc-h">Legal</span><ul>{LEGAL_NAV.map((n) => <li key={n.id}><a href={`/${n.id}`} onClick={legal(n.id)}>{FOOTER_LEGAL[n.id] ?? n.label}</a></li>)}</ul></div>
              <div className="foot-col foot-contact"><span className="fc-h">Contact</span><ul>
                <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" /><circle cx="12" cy="11" r="2" /></svg><span>Nairobi, Kenya. Serving locally and beyond.</span></li>
                <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></svg><a href="mailto:studio@kipkiren.co.ke">studio@kipkiren.co.ke</a></li>
                <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg><span>Mon to Fri, 09:00 to 18:00 EAT</span></li>
                <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /><circle cx="12" cy="8" r="4" /></svg><a href="#top" onClick={(e) => { e.preventDefault(); onSignIn(); }}>Client portal</a></li>
              </ul></div>
            </div>
            <div className="footbar"><span className="mono">&copy; 2026 Kipkiren Web Services Ltd. · Nairobi · A Kipkiren Teknolojia company</span><a className="toplink" href="#top">Back to top &uarr;</a></div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// The page is static markup driven by landingFx; never re-render it (a parent
// re-render would only hand in equivalent callbacks).
export const Landing = memo(LandingImpl, () => true);
