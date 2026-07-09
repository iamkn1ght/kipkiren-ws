import { useEffect, useState, type CSSProperties } from 'react';
import { KlpToggle } from './klpTheme.tsx';
import { LEGAL_NAV, type LegalDocId } from './Legal.tsx';
import './landing.css';

/**
 * Public landing page, rebuilt to the warm editorial design reference
 * (design_reference/index.html + styles.css). Self-contained warm "paper"
 * system scoped under .klp; Playfair Display / Syne / JetBrains Mono; hairline
 * dividers, ink pill buttons, teal-deep philosophy band. onSignIn() enters the
 * portal flow; nav links smooth-scroll to sections.
 */

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

// Ordered to match the page's story: Services 01 -> About 02 -> Process 03 -> Pricing 04 -> Contact 05.
const NAV = [
  { id: 'services', label: 'Services' },
  { id: 'about', label: 'About' },
  { id: 'process', label: 'Process' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'contact', label: 'Contact' },
];

// Build + Care pricing. A one-time build (priced below the one-time-only shops)
// plus a monthly care plan. The differentiator: we build it, then we run it.
const PLANS = [
  { kick: '01 · starter', name: 'Starter', desc: 'A polished presence for a small business getting online properly.',
    build: '45,000', care: '3,500',
    feats: ['Up to 5 pages, designed and built', 'Domain, hosting and business email', 'Mobile-perfect, fast, SEO-ready', 'Care: uptime, SSL, backups, edits', '48-hour support SLA'],
    cta: 'Start with Starter', featured: false },
  { kick: '02 · growth', name: 'Growth', desc: 'For teams that treat their website as core infrastructure.',
    build: '89,000', care: '7,500',
    feats: ['Up to 10 pages, blog or simple CMS', 'On-page SEO and analytics built in', 'Payment or M-Pesa integration', 'Care: everything, plus monthly SEO', 'Named delivery lead · 24-hour SLA'],
    cta: 'Choose Growth', featured: true },
  { kick: '03 · business', name: 'Business', desc: 'Mid-market sites, portals and integrations, actively operated.',
    build: '165,000', care: '18,000',
    feats: ['Unlimited pages and integrations', 'E-commerce or booking systems', 'Priority delivery and support', 'Care: everything, plus cloud provisioning', '12-hour SLA · quarterly reviews'],
    cta: 'Choose Business', featured: false },
];

// The competitive contrast. Answers "why you, not a cheaper one-time build?"
const COMPARE_THEM = ['Pay once, then you are on your own', 'Maintenance billed separately, if at all', 'Slow to reach when something breaks', 'The site quietly rots within a year', 'You chase them for every small fix'];
const COMPARE_US = ['Built once, then run for years', 'Care included from the first day', 'A named team and a phone that answers', 'Monitored, patched and updated for you', 'We watch it so you never have to'];

const GUARANTEES = ['You own everything', 'No lock-in, ever', 'Every price approved before we build', 'A proforma within 48 hours'];

const FAQ = [
  { q: 'Do prices include VAT?', a: 'No. All figures exclude 16% VAT, which is itemised on your proforma.' },
  { q: 'How does payment work?', a: 'Every build and every change is priced on a proforma you approve first. Pay by M-Pesa or card. The one-time build is invoiced in stages; monthly care is billed on the 1st. No surprise invoices, ever.' },
  { q: 'Do I have to take a care plan?', a: 'The build and its first year of care go together, so your site is looked after from day one. After that, care is month to month and you can pause any time. You always keep the site.' },
  { q: 'What does monthly care cover?', a: 'Hosting, uptime monitoring, SSL, daily backups, security patches and a block of change requests each month. Anything larger is quoted on the rate card before we start.' },
  { q: 'Where are you based?', a: 'Nairobi. We work with clients across East Africa, and occasionally further afield.' },
  { q: 'What if we want to leave?', a: 'We hand over the codebase, database, DNS and every account. No lock-in, ever. The site is yours.' },
];

// Authentic competence signal (real stack) in place of fabricated client logos.
const STACK = ['React', 'TypeScript', 'Supabase', 'PostgreSQL', 'Cloudflare', 'M-Pesa', 'Paystack', 'Vite', 'Row-level security', 'Daily backups'];

// Genuine reasons a business chooses Kipkiren. Every one is true to how we work.
const WHY = [
  { n: '01', t: 'Transparent pricing', d: 'You approve a fixed-price proforma before any work starts. No surprise invoices, no padded hours, no "it depends".' },
  { n: '02', t: 'We run what we build', d: 'Care is a first-class part of the work, not an upsell. Most agencies hand over and vanish. We stay on the line.' },
  { n: '03', t: 'Response you can count on', d: 'A 12 to 48 hour SLA by plan, in business hours, with a named person who knows your site. Not a shared inbox.' },
  { n: '04', t: 'You own everything', d: 'Code, database, DNS and every account are yours. We hand them over on request. There is no lock-in, ever.' },
  { n: '05', t: 'Serious, secure engineering', d: 'React and Supabase with row-level isolation, SSL, daily backups and continuous monitoring on every site we host.' },
  { n: '06', t: 'Local, senior, reachable', d: 'A small Nairobi team on Kenyan time, fluent in M-Pesa and the market you sell to. Senior hands only, no juniors learning on your budget.' },
];

const SERVICES = [
  { n: '01', title: 'Design', body: "Editorial, deliberate, and grounded in your brand. No moodboard-of-the-week." },
  { n: '02', title: 'Engineering', body: 'React, TanStack, Supabase. Ships fast, stays fast, scored honestly.' },
  { n: '03', title: 'SEO & content', body: 'Structured for discovery. Written by humans who read what they publish.' },
  { n: '04', title: 'Managed hosting', body: 'We own uptime, backups, updates and the 03:00 phone call. You own the site.' },
];

const STATS = [
  { n: '01', v: '2019', l: 'Studio founded' },
  { n: '02', v: '68', l: 'Sites in active operation' },
  { n: '03', v: '99.98%', l: '12-month uptime average' },
  { n: '04', v: '24h', l: 'Ticket response SLA' },
];

const PROCESS = [
  { n: '01', t: 'Discovery', d: '45-90 minutes. We listen more than we present.' },
  { n: '02', t: 'Proforma', d: 'Fixed scope, fixed price, in your inbox within 48 hours.' },
  { n: '03', t: 'Design', d: 'Editorial layouts, real content, one direction refined, not three shown.' },
  { n: '04', t: 'Build', d: 'Weekly demos. You can watch the site come together.' },
  { n: '05', t: 'Launch', d: 'Quiet, deliberate, with rollback on hand. No launch tweets required.' },
  { n: '06', t: 'Operation', d: 'The part most studios skip. We stay.' },
];

export function Landing({ onSignIn, onLegal }: { onSignIn: () => void; onLegal: (id: LegalDocId) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const go = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const goClose = (id: string) => () => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>('.klp-reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // While the mobile menu is open: lock body scroll and close on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  return (
    <div className="klp">
      {/* header */}
      <header className="klp-header">
        <div className="klp-container row">
          <a className="klp-brand" href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
            <span className="mark">K</span>
            <span className="name">Kipkiren<small>WEB SERVICES</small></span>
          </a>
          <nav className="klp-nav">
            {NAV.map((n) => <button key={n.id} type="button" onClick={go(n.id)}>{n.label}</button>)}
          </nav>
          <div className="auth">
            <KlpToggle />
            <button type="button" className="klp-btn ghost" onClick={onSignIn}>Sign in</button>
            <button type="button" className="klp-btn primary" onClick={onSignIn}>Start a project</button>
            <button type="button" className="klp-burger" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="klp-mobile-nav" onClick={() => setMenuOpen(true)}><span className="bl" /></button>
          </div>
        </div>
      </header>

      {/* mobile full-screen navigation */}
      <div className={`klp-msheet ${menuOpen ? 'open' : ''}`} id="klp-mobile-nav" role="dialog" aria-modal="true" aria-label="Site menu">
        <div className="klp-msheet-inner klp-container">
          <div className="klp-msheet-head">
            <span className="klp-msheet-brand">
              <span className="mark">K</span>
              <span className="name">Kipkiren<small>WEB SERVICES</small></span>
            </span>
            <div className="klp-msheet-head-r">
              <KlpToggle />
              <button type="button" className="klp-msheet-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><span /><span /></button>
            </div>
          </div>

          <nav className="klp-msheet-nav">
            <div className="klp-msheet-group">
              <div className="klp-msheet-label" style={cssVars({ '--i': 0 })}>Explore</div>
              {NAV.map((n, i) => (
                <button key={n.id} type="button" className="klp-msheet-link" style={cssVars({ '--i': i + 1 })} onClick={goClose(n.id)}>
                  <span className="lft"><span className="n">{String(i + 1).padStart(2, '0')}</span><span className="t">{n.label}</span></span>
                  <span className="x">→</span>
                </button>
              ))}
            </div>
            <div className="klp-msheet-group">
              <div className="klp-msheet-label" style={cssVars({ '--i': 6 })}>Legal &amp; trust</div>
              <div className="klp-msheet-chips" style={cssVars({ '--i': 7 })}>
                {LEGAL_NAV.map((n) => (
                  <button key={n.id} type="button" className="klp-msheet-chip" onClick={() => { setMenuOpen(false); onLegal(n.id); }}>{n.label}</button>
                ))}
              </div>
            </div>
          </nav>

          <div className="klp-msheet-foot" style={cssVars({ '--i': 8 })}>
            <div className="klp-msheet-label">Get started</div>
            <div className="klp-msheet-cta">
              <button type="button" className="klp-btn primary" onClick={() => { setMenuOpen(false); onSignIn(); }}>Start a project</button>
              <button type="button" className="klp-btn ghost" onClick={() => { setMenuOpen(false); onSignIn(); }}>Sign in</button>
            </div>
            <a className="klp-msheet-contact" href="mailto:studio@kipkiren.co.ke">studio@kipkiren.co.ke · Nairobi</a>
          </div>
        </div>
      </div>

      <main id="top">
        {/* hero */}
        <section className="klp-container klp-hero">
          <div className="klp-hero-grid">
            <div className="klp-hero-main">
              <span className="klp-eyebrow teal klp-reveal"><span className="dot" />A managed web services studio · Nairobi</span>
              <h1 className="klp-display-xl klp-reveal" style={cssVars({ '--d': '80ms' })}>Precision websites,<br /><em style={cssVars({ color: 'var(--teal-deep)' })}>quietly operated.</em></h1>
              <p className="klp-lead klp-reveal" style={cssVars({ '--d': '160ms' })}>
                Kipkiren designs, builds and runs the websites Kenyan businesses depend on. One senior team,
                one transparent price, and a phone that still answers long after launch.
              </p>
              <div className="klp-hero-ctas klp-reveal" style={cssVars({ '--d': '240ms' })}>
                <button type="button" className="klp-btn primary" onClick={go('pricing')}>See pricing <span>→</span></button>
                <button type="button" className="klp-btn ghost" onClick={go('contact')}>Book a conversation</button>
              </div>
              <div className="klp-hero-assure klp-reveal" style={cssVars({ '--d': '320ms' })}>
                <span><span className="tk" />Fixed price before any work</span>
                <span><span className="tk" />You own everything</span>
                <span><span className="tk" />No lock-in</span>
              </div>
            </div>
            <aside className="klp-hero-aside klp-reveal" style={cssVars({ '--d': '360ms' })}>
              <div className="klp-herocard">
                <div className="klp-mono">Studio note · 004</div>
                <p className="quote">"The web is quieter than it looks. Almost every site we are asked to rescue was shipped in a rush by someone who was never going to answer the phone six months later."</p>
                <div className="klp-mono by">Kipkiren Studio, on why we run what we build</div>
                <div className="klp-herocard-facts">
                  <div><span className="n">2019</span><span className="l">Founded</span></div>
                  <div><span className="n">68</span><span className="l">Sites run</span></div>
                  <div><span className="n">99.98%</span><span className="l">Uptime</span></div>
                </div>
                <button type="button" className="klp-herocard-price" onClick={go('pricing')}>
                  <span className="p"><span className="k">Build from</span> <strong>KES 45,000</strong> <span className="k">plus care from 3,500/mo</span></span>
                  <span className="go">See pricing <span>&rarr;</span></span>
                </button>
              </div>
            </aside>
          </div>
        </section>

        {/* built-with marquee (real stack, not fabricated logos) */}
        <section className="klp-marquee-band">
          <div className="klp-container inner">
            <span className="klp-mono" style={cssVars({ flexShrink: 0 })}>Built with</span>
            <div className="klp-marquee">
              <div className="klp-marquee-track">
                {[...STACK, ...STACK].map((c, i) => <span key={i}>{c}</span>)}
              </div>
            </div>
          </div>
        </section>

        {/* services */}
        <section className="klp-container klp-section" id="services">
          <div className="klp-sec-head klp-reveal">
            <div className="h">
              <span className="klp-eyebrow teal">Services · 01</span>
              <h2 className="klp-display-lg">Four disciplines,<br /><em>one team.</em></h2>
            </div>
            <p className="klp-lead p" style={cssVars({ alignSelf: 'end' })}>
              We deliberately kept the studio small. Every client works with the same designer, engineer and
              account lead from first call through year three of hosting.
            </p>
          </div>
          <div className="klp-grid-cells klp-reveal">
            {SERVICES.map((s) => (
              <article key={s.n} className="klp-cell">
                <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <a className="klp-readmore" onClick={onSignIn} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSignIn(); } }}>Read more <span>→</span></a>
              </article>
            ))}
          </div>
        </section>

        {/* philosophy band */}
        <section className="klp-band" id="about">
          <div className="klp-container klp-section">
            <div className="klp-band-grid">
              <div className="l">
                <span className="klp-mono eb">Philosophy · 02</span>
                <h2 className="klp-display-lg">We treat your site<br /><em style={cssVars({ color: 'var(--amber)' })}>like infrastructure.</em></h2>
              </div>
              <div className="r klp-reveal">
                <p className="big">Websites decay. Traffic patterns shift. Frameworks age. The gap between "we shipped it" and "it still works two years later" is where most agencies quietly disappear.</p>
                <p>Every Kipkiren engagement includes ongoing operation as a first-class deliverable, not a subscription bolted on afterwards. Monitoring, backups, security patching, quarterly performance reviews, content updates, and a real person who knows your business.</p>
                <p>It's less exciting than a redesign every eighteen months. It's also what serious businesses need.</p>
              </div>
            </div>
          </div>
        </section>

        {/* stats band */}
        <section className="klp-statband">
          <div className="klp-container klp-section">
            <div className="klp-sec-head">
              <div className="h">
                <span className="klp-eyebrow teal">By the numbers</span>
                <h2 className="klp-display-lg">The kind of numbers<br /><em>that take years.</em></h2>
              </div>
              <p className="klp-lead p">Operations you can see. Uptime, longevity and response times are the metrics that only exist when someone stays after launch.</p>
            </div>
            <div className="klp-stats klp-reveal">
              {STATS.map((s) => (
                <div key={s.n} className="klp-stat">
                  <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>{s.n}</div>
                  <div className="n">{s.v}</div>
                  <div className="l">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* process */}
        <section className="klp-container klp-section" id="process">
          <div className="klp-proc-grid">
            <div className="l klp-reveal">
              <span className="klp-eyebrow teal">Process · 03</span>
              <h2 className="klp-display-lg">How the work moves.</h2>
              <p className="klp-lead">Six steps. Predictable calendar. No mystery deliverables.</p>
              <button type="button" className="klp-btn ghost" onClick={go('contact')}>Start the conversation</button>
              <div className="klp-proc-promise">
                <div className="klp-mono">On every project</div>
                <ul>
                  <li><span className="m" />A fixed-price proforma before any work begins</li>
                  <li><span className="m" />Weekly demos with real content, never mockup theatre</li>
                  <li><span className="m" />The same senior team from the first call to year three</li>
                  <li><span className="m" />Everything handed over. You own all of it.</li>
                </ul>
              </div>
            </div>
            <ol className="klp-proc-list r klp-reveal" style={cssVars({ '--d': '120ms' })}>
              {PROCESS.map((p) => (
                <li key={p.n} className="klp-proc-item">
                  <span className="num">{p.n}</span>
                  <div><div className="t">{p.t}</div><div className="d">{p.d}</div></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* pricing */}
        <section className="klp-container klp-section klp-hairline-t" id="pricing">
          <div className="klp-sec-head klp-reveal">
            <div className="h">
              <span className="klp-eyebrow teal">Pricing · 04</span>
              <h2 className="klp-display-lg">Built once.<br /><em style={cssVars({ color: 'var(--teal-deep)' })}>Run for years.</em></h2>
            </div>
            <p className="klp-lead p" style={cssVars({ alignSelf: 'end' })}>One transparent build price to launch, one monthly care plan to keep it fast, secure and growing. No agency will quote you cleaner. Every figure is in Kenyan shillings, VAT itemised on the proforma.</p>
          </div>

          <div className="klp-guarantees klp-reveal">
            {GUARANTEES.map((g) => <span key={g} className="klp-guarantee"><span className="tick" />{g}</span>)}
          </div>

          <div className="klp-plans klp-reveal" style={cssVars({ marginTop: 44 })}>
            {PLANS.map((p) => (
              <div key={p.name} className={`klp-card klp-plan ${p.featured ? 'feat' : ''}`}>
                {p.featured && <div className="klp-plan-flag">Most chosen</div>}
                <div className="klp-plan-kick">{p.kick}</div>
                <div className="klp-plan-name">{p.name}</div>
                <p className="klp-plan-desc">{p.desc}</p>
                <div className="klp-plan-price">
                  <div className="build-row"><span className="cur">KES</span><span className="amt">{p.build}</span><span className="once">one-time<br />build</span></div>
                  <div className="care-row"><span className="k">then</span><strong>KES {p.care}</strong><span className="k">/ month care</span></div>
                </div>
                <ul className="klp-plan-feats">
                  {p.feats.map((f) => <li key={f}><span className="m" />{f}</li>)}
                </ul>
                <button type="button" className={`klp-btn ${p.featured ? 'primary' : 'ghost'}`} onClick={onSignIn}>{p.cta}</button>
              </div>
            ))}
          </div>

          {/* why managed beats a one-time build */}
          <div className="klp-compare klp-reveal" style={cssVars({ marginTop: 64 })}>
            <div className="klp-compare-col them">
              <span className="eb">The one-time build</span>
              <h3>What most agencies sell.</h3>
              <ul>{COMPARE_THEM.map((t) => <li key={t}><span className="m" />{t}</li>)}</ul>
            </div>
            <div className="klp-compare-col us">
              <span className="eb">The Kipkiren way</span>
              <h3>Build, then run. We stay.</h3>
              <ul>{COMPARE_US.map((t) => <li key={t}><span className="m" />{t}</li>)}</ul>
            </div>
          </div>

          <div className="klp-band-grid klp-reveal" style={cssVars({ marginTop: 72, paddingTop: 56, borderTop: '1px solid var(--hairline)' })}>
            <div className="l">
              <span className="klp-eyebrow teal">Custom</span>
              <h2 className="klp-display-lg" style={cssVars({ marginTop: 20 })}>Something else in mind?</h2>
            </div>
            <div className="r">
              <p className="klp-lead">Larger builds, migrations, rescue projects, ongoing product work. Open a ticket describing what you have and what you need. We reply personally, always.</p>
              <div className="klp-hero-ctas" style={cssVars({ marginTop: 24 })}>
                <button type="button" className="klp-btn primary" onClick={onSignIn}>Open a ticket</button>
                <a className="klp-btn ghost" href="mailto:studio@kipkiren.co.ke">Or email us</a>
              </div>
            </div>
          </div>

          <div className="klp-reveal" style={cssVars({ marginTop: 72, paddingTop: 56, borderTop: '1px solid var(--hairline)' })}>
            <h2 className="klp-display-md" style={cssVars({ marginBottom: 32 })}>Questions people ask, plainly answered.</h2>
            <div className="klp-faq">
              {FAQ.map((f, i) => {
                const open = openFaq === i;
                return (
                  <div key={f.q} className={`klp-faq-item ${open ? 'open' : ''}`}>
                    <button type="button" className="q" aria-expanded={open} onClick={() => setOpenFaq(open ? null : i)}>
                      <span>{f.q}</span>
                      <span className="ic" aria-hidden="true" />
                    </button>
                    <div className="a-wrap"><p className="a">{f.a}</p></div>
                  </div>
                );
              })}
            </div>
            <p className="klp-faq-more klp-mono">More in our <button type="button" onClick={() => onLegal('faq')}>full FAQ</button> and <button type="button" onClick={() => onLegal('terms')}>terms</button>.</p>
          </div>
        </section>

        {/* why choose (authentic trust builders, no borrowed logos) */}
        <section className="klp-container klp-section">
          <div className="klp-sec-head klp-reveal">
            <div className="h">
              <span className="klp-eyebrow teal">Why Kipkiren</span>
              <h2 className="klp-display-lg">Reasons to trust us<br /><em>with your website.</em></h2>
            </div>
            <p className="klp-lead p" style={cssVars({ alignSelf: 'end' })}>No borrowed logos, no invented awards. Just the things that actually matter when you hand a business over to a studio.</p>
          </div>
          <div className="klp-why klp-reveal">
            {WHY.map((w) => (
              <article key={w.n} className="klp-why-card">
                <div className="klp-mono num">{w.n}</div>
                <h3>{w.t}</h3>
                <p>{w.d}</p>
              </article>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="klp-container klp-section" id="contact" style={cssVars({ paddingTop: 0 })}>
          <div className="klp-cta klp-reveal">
            <div className="l">
              <span className="klp-eyebrow teal">Start · 05</span>
              <h2 className="klp-display-lg">Ready when you are.</h2>
              <p className="klp-lead">Pick a plan or open a ticket for something custom. Either path starts a real conversation with a real designer, usually the same day.</p>
            </div>
            <div className="r">
              <button type="button" className="klp-btn primary" onClick={go('pricing')}>See plans →</button>
              <button type="button" className="klp-btn ghost" onClick={onSignIn}>Open a custom ticket</button>
            </div>
          </div>
        </section>
      </main>

      {/* footer */}
      <footer className="klp-footer">
        <div className="klp-container">
          <div className="klp-footer-grid">
            <div className="col-brand">
              <div className="brandmark">
                <span className="mark">K</span>
                <div>
                  <div className="klp-mono" style={cssVars({ fontSize: 11, color: 'var(--ink)' })}>Kipkiren</div>
                  <div className="klp-mono" style={cssVars({ fontSize: 9, color: 'var(--mid)' })}>WEB SERVICES · NAIROBI</div>
                </div>
              </div>
              <p className="tagline">Precision websites,<br />managed end-to-end.</p>
              <p className="blurb klp-lead">A small, senior team designing, building, and quietly operating the web presence for teams that treat their site as core infrastructure.</p>
            </div>
            <div className="col-nav">
              <div className="klp-mono">Studio</div>
              <ul>
                <li><button type="button" onClick={go('services')}>Services</button></li>
                <li><button type="button" onClick={go('process')}>Process</button></li>
                <li><button type="button" onClick={go('about')}>About</button></li>
                <li><button type="button" onClick={go('contact')}>Contact</button></li>
              </ul>
            </div>
            <div className="col-nav">
              <div className="klp-mono">Legal &amp; trust</div>
              <ul>
                {LEGAL_NAV.map((n) => (
                  <li key={n.id}><button type="button" onClick={() => onLegal(n.id)}>{n.label}</button></li>
                ))}
              </ul>
            </div>
            <div className="col-contact">
              <div className="klp-mono">Get in touch</div>
              <ul>
                <li><a href="mailto:studio@kipkiren.co.ke">studio@kipkiren.co.ke</a></li>
                <li>Riverside Drive, Nairobi</li>
                <li>Monday to Friday, 09:00 to 18:00 EAT</li>
                <li><button type="button" onClick={onSignIn}>Client portal · Sign in</button></li>
              </ul>
            </div>
          </div>
          <div className="klp-footbar">
            <div className="klp-mono">© 2026 Kipkiren Web Services Ltd.</div>
            <nav className="klp-footlegal">
              {LEGAL_NAV.map((n) => <button key={n.id} type="button" onClick={() => onLegal(n.id)}>{n.label}</button>)}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
