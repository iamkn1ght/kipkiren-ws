import { useEffect, type CSSProperties } from 'react';
import './landing.css';

/**
 * Public landing page, rebuilt to the warm editorial design reference
 * (design_reference/index.html + styles.css). Self-contained warm "paper"
 * system scoped under .klp; Playfair Display / Syne / JetBrains Mono; hairline
 * dividers, ink pill buttons, teal-deep philosophy band. onSignIn() enters the
 * portal flow; nav links smooth-scroll to sections.
 */

const cssVars = (v: Record<string, string | number>) => v as CSSProperties;

const NAV = [
  { id: 'services', label: 'Services' },
  { id: 'process', label: 'Process' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

const CLIENTS = ['Riverside Capital', 'Mara Coffee', 'Nyali Ceramics', 'Kilifi Cargo', 'Sable & Sons', 'Two Rivers Legal', 'Ubuntu Health', 'Amber Threads'];

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

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const go = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>('.klp-reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="klp">
      {/* ── header ── */}
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
            <button type="button" className="klp-btn ghost" onClick={onSignIn}>Sign in</button>
            <button type="button" className="klp-btn primary" onClick={onSignIn}>Start a project</button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ── hero ── */}
        <section className="klp-container klp-hero">
          <div className="klp-hero-grid">
            <div className="klp-hero-main">
              <span className="klp-eyebrow teal klp-reveal"><span className="dot" />A managed web services studio · Nairobi</span>
              <h1 className="klp-display-xl klp-reveal" style={cssVars({ '--d': '80ms' })}>Precision websites,<br /><em style={cssVars({ color: 'var(--teal-deep)' })}>quietly operated.</em></h1>
              <p className="klp-lead klp-reveal" style={cssVars({ '--d': '160ms' })}>
                Kipkiren designs, ships and runs the digital presence for founders and teams across East Africa.
                No packages that look like everyone else's. No dashboards you never open. Just a senior team, a
                considered site, and a phone number that answers.
              </p>
              <div className="klp-hero-ctas klp-reveal" style={cssVars({ '--d': '240ms' })}>
                <button type="button" className="klp-btn primary" onClick={onSignIn}>See plans <span>→</span></button>
                <button type="button" className="klp-btn ghost" onClick={go('contact')}>Book a conversation</button>
              </div>
            </div>
            <aside className="klp-hero-aside klp-reveal" style={cssVars({ '--d': '320ms' })}>
              <div className="klp-mono">Studio note · 004</div>
              <p className="quote">"The web is quieter than it looks. Almost every site we're asked to rescue was shipped in a rush by someone who wasn't going to answer the phone six months later."</p>
              <div className="klp-mono by" style={cssVars({ color: 'var(--mid)' })}>— Kipkiren Studio<br />on why we do managed work</div>
            </aside>
          </div>
        </section>

        {/* ── trusted-by marquee ── */}
        <section className="klp-marquee-band">
          <div className="klp-container inner">
            <span className="klp-mono" style={cssVars({ flexShrink: 0 })}>Trusted by</span>
            <div className="klp-marquee">
              <div className="klp-marquee-track">
                {[...CLIENTS, ...CLIENTS].map((c, i) => <span key={i}>{c}</span>)}
              </div>
            </div>
          </div>
        </section>

        {/* ── services ── */}
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
                <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>{s.n} —</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <a className="klp-readmore" onClick={onSignIn} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSignIn(); } }}>Read more <span>→</span></a>
              </article>
            ))}
          </div>
        </section>

        {/* ── philosophy band ── */}
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

        {/* ── stats ── */}
        <section className="klp-container klp-section">
          <div className="klp-stats klp-reveal">
            {STATS.map((s) => (
              <div key={s.n} className="klp-stat">
                <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>{s.n}</div>
                <div className="n">{s.v}</div>
                <div className="l">{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── process ── */}
        <section className="klp-container klp-section klp-hairline-t" id="process">
          <div className="klp-proc-grid">
            <div className="l klp-reveal">
              <span className="klp-eyebrow teal">Process · 03</span>
              <h2 className="klp-display-lg">How the work moves.</h2>
              <p className="klp-lead">Six steps. Predictable calendar. No mystery deliverables.</p>
              <button type="button" className="klp-btn ghost" onClick={go('contact')}>Start the conversation</button>
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

        {/* ── testimonial ── */}
        <section className="klp-container klp-section">
          <figure className="klp-quote klp-reveal">
            <span className="klp-eyebrow teal">In their words</span>
            <blockquote className="klp-display-md">"We interviewed six studios. Kipkiren was the only one that asked about our support process before showing us design mockups. Two years in, they still answer within the hour."</blockquote>
            <figcaption className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Wanjiku Njoroge · Head of Marketing, Riverside Capital</figcaption>
          </figure>
        </section>

        {/* ── CTA ── */}
        <section className="klp-container klp-section" id="contact" style={cssVars({ paddingTop: 0 })}>
          <div className="klp-cta klp-reveal">
            <div className="l">
              <span className="klp-eyebrow teal">Start</span>
              <h2 className="klp-display-lg">Ready when you are.</h2>
              <p className="klp-lead">Pick a plan or open a ticket for something custom. Either path starts a real conversation with a real designer, usually the same day.</p>
            </div>
            <div className="r">
              <button type="button" className="klp-btn primary" onClick={onSignIn}>See plans →</button>
              <button type="button" className="klp-btn ghost" onClick={onSignIn}>Open a custom ticket</button>
            </div>
          </div>
        </section>
      </main>

      {/* ── footer ── */}
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
              <div className="klp-mono">Portal</div>
              <ul>
                <li><button type="button" onClick={onSignIn}>Sign in</button></li>
                <li><button type="button" onClick={onSignIn}>Dashboard</button></li>
                <li><button type="button" onClick={onSignIn}>Open ticket</button></li>
              </ul>
            </div>
            <div className="col-contact">
              <div className="klp-mono">Get in touch</div>
              <ul>
                <li>studio@kipkiren.co.ke</li>
                <li>+254 700 000 000</li>
                <li>Riverside Drive, Nairobi</li>
                <li>Mon - Fri · 09:00 - 18:00 EAT</li>
              </ul>
            </div>
          </div>
          <div className="klp-footbar">
            <div className="klp-mono">© 2026 Kipkiren Web Services Ltd.</div>
            <div className="klp-mono" style={cssVars({ color: 'var(--mid)' })}>Version 1.0 · Nairobi · Built with care</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
