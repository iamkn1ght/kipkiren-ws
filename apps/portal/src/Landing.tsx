import type { FormEvent } from 'react';
import { ThemeToggle } from './ThemeToggle.tsx';
import './landing.css';

/**
 * Public marketing landing page for Kipkiren Web Services.
 * Rebuilt from the brand-guide / Lovable design. Self-contained editorial
 * light styling (landing.css, lp-* classes) - independent of the app theme.
 * CTAs call onSignIn() to enter the portal flow.
 */
const PLANS = [
  { name: 'Starter', price: 'KES 4,999', per: '/mo', target: 'Micro SME', feats: ['2 task-hours included / mo', 'Up to 3 open tickets', '48-hour SLA', 'Hosting · domain · email'], cta: 'Choose Starter', featured: false },
  { name: 'Growth', price: 'KES 9,999', per: '/mo', target: 'Growing SME', feats: ['5 task-hours included / mo', 'Up to 5 open tickets', '24-hour SLA', 'SEO + social add-ons'], cta: 'Choose Growth', featured: true },
  { name: 'Business', price: 'KES 24,999', per: '/mo', target: 'Mid-market', feats: ['12 task-hours included / mo', 'Up to 10 open tickets', '12-hour SLA', 'Priority delivery'], cta: 'Choose Business', featured: false },
  { name: 'Enterprise', price: 'Custom', per: '', target: 'Govt / large business', feats: ['Dedicated capacity', 'Unlimited tickets', '4-hour SLA', 'Cloud provisioning + vendor reg.'], cta: 'Contact us', featured: false },
];

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const submit = (e: FormEvent) => { e.preventDefault(); onSignIn(); };
  const go = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="lp">
      {/* ── status bar ── */}
      <div className="lp-status">
        <div className="lp-wrap">
          <span><b>● KIPKIREN</b> · WEB SERVICES&nbsp;&nbsp;·&nbsp;&nbsp;NAIROBI, KE&nbsp;&nbsp;·&nbsp;&nbsp;EDGE · eu-west-1&nbsp;&nbsp;·&nbsp;&nbsp;RETAINER + PROFORMA</span>
          <span>M-PESA · PAYSTACK&nbsp;&nbsp;·&nbsp;&nbsp;NBO · EAT</span>
        </div>
      </div>

      {/* ── nav ── */}
      <nav className="lp-nav">
        <div className="lp-wrap">
          <div className="lp-brand">
            <span className="lp-diamond">◆</span>
            <span className="lp-brand-mark">KIPKIREN</span>
            <span className="lp-brand-sub">/ web-services</span>
          </div>
          <div className="lp-navlinks">
            <button className="lp-navlink active" onClick={go('systems')}>01 Systems</button>
            <button className="lp-navlink" onClick={go('stack')}>02 Stack</button>
            <button className="lp-navlink" onClick={go('plans')}>03 Plans</button>
            <button className="lp-navlink" onClick={go('process')}>04 Process</button>
            <button className="lp-navlink" onClick={go('contact')}>05 Contact</button>
          </div>
          <div className="lp-nav-right">
            <ThemeToggle inline />
            <button className="lp-booking" onClick={onSignIn}><span className="lp-live" /> Sign in</button>
          </div>
        </div>
      </nav>

      {/* ── hero ── */}
      <header className="lp-wrap lp-hero">
        <div className="lp-hero-grid">
          <div>
            <span className="lp-tagchip">◆ MANAGED WEB SERVICES · KENYA · <span className="lp-diamond">● NOW ONBOARDING</span></span>
            <h1 className="lp-h1">We run the quiet parts of your <em>website</em><span className="lp-dot">.</span></h1>
            <p className="lp-lede"><strong>Websites, hosting, SEO and business email for Kenyan SMEs</strong> - on a monthly retainer. Every task is priced and approved on a proforma before we build, so there are no surprise invoices.</p>
            <div className="lp-cta-row">
              <button className="lp-btn lp-btn-primary" onClick={onSignIn}>Get started →</button>
              <button className="lp-btn lp-btn-ghost" onClick={go('plans')}>See plans →</button>
            </div>
            <div className="lp-scroll">↓ Scroll · the stack</div>

            <div className="lp-strip">
              <div><div className="k">Languages</div><div className="v">TS / Rust / SQL</div></div>
              <div><div className="k">Runtimes</div><div className="v">Edge / Workers</div></div>
              <div><div className="k">Surfaces</div><div className="v">Web · API · CMS</div></div>
              <div><div className="k">Coverage</div><div className="v">WCAG 2.2 AA</div></div>
            </div>
          </div>

          {/* terminal */}
          <div className="lp-term">
            <div className="lp-term-bar">
              <span className="lp-tl r" /><span className="lp-tl y" /><span className="lp-tl g" />
              <span className="lp-term-title">~ / KIPKIREN - ZSH</span>
              <span className="lp-term-size">80×24</span>
            </div>
            <div className="lp-term-body">
              <div><span className="pr">▸</span> kpkrn <b>init</b> --client your-brand</div>
              <div><span className="ok">✓</span> brief synced <span className="mut">(24 pages, 1.2k assets)</span></div>
              <div><span className="ok">✓</span> tokens generated <span className="mut">(palette · type · scale)</span></div>
              <div><span className="ok">✓</span> repo provisioned <span className="mut">(tanstack · sanity)</span></div>
              <div style={{ height: 12 }} />
              <div><span className="pr">▸</span> kpkrn <b>deploy</b> --edge</div>
              <div><span className="ok">●</span> build <span className="mut">···············</span> 38s</div>
              <div><span className="ok">●</span> ship <span className="mut">···············</span> 11s</div>
              <div><span className="ok">●</span> warm <span className="mut">···············</span> 04s</div>
              <div style={{ height: 12 }} />
              <div>live → <a>your-brand.co.ke</a></div>
              <div>lighthouse → <span className="amber">performance budget enforced</span></div>
              <div className="mut">next: tend - six month retainer</div>
              <div style={{ height: 10 }} /><div><span className="pr">▸</span> <span className="lp-term-cursor" /></div>
            </div>
          </div>
        </div>
      </header>

      {/* ── §01 systems ── */}
      <section className="lp-sec grid-bg" id="systems">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono">§01 · <span className="lp-diamond">systems we ship</span></span><span className="lp-rule" /><span className="lp-num">01 / 05</span></div>
          <p className="lp-intro">Four things every small business needs online - done properly and kept running. Pick a retainer; we handle the rest, priced and approved before we build.</p>
          <div className="lp-cards">
            {[
              { pkg: '@kipkiren/site', kind: 'WEBSITE', title: 'Websites that load fast', body: 'Marketing sites, landing and pricing pages - built to load quickly on a thin Kenyan pipe and rank on Google.', tags: ['Design', 'Build', 'SEO'] },
              { pkg: '@kipkiren/host', kind: 'HOSTING', title: 'Hosting, domain & email', body: 'Your domain, secure hosting with backups, and business email on your own name that actually lands in the inbox.', tags: ['Domain', 'Email', 'Backups'] },
              { pkg: '@kipkiren/grow', kind: 'SEO', title: 'SEO & social', body: 'On-page SEO, Google indexing and the social presence that brings new customers in - measured, not guessed.', tags: ['Search', 'Social', 'Analytics'] },
              { pkg: '@kipkiren/infra', kind: 'CLOUD', title: 'Cloud & support', body: 'Cloud provisioning, monitoring and fast support when something breaks - so you can run the business, not the website.', tags: ['Cloud', 'Monitoring', 'Support'] },
            ].map((c) => (
              <div key={c.pkg} className="lp-card">
                <div className="lp-card-top"><span>◆ {c.pkg}</span><span className="lp-ver">{c.kind}</span></div>
                <div className="lp-card-title">{c.title}</div>
                <div className="lp-card-body">{c.body}</div>
                <div className="lp-tags">{c.tags.map((t) => <span key={t} className="lp-tag">{t}</span>)}</div>
                <div className="lp-readspec">→ Read spec</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── §02 stack (dark) ── */}
      <section className="lp-sec dark" id="stack">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono" style={{ color: 'var(--amber2)' }}>§02 · what you get</span><span className="lp-rule" /><span className="lp-num">02 / 05</span></div>
          <div className="lp-split">
            <div>
              <h2 className="lp-h2">Built to load fast,<br />and <em>keep working</em>.</h2>
              <p className="lp-intro">What this means for your business: pages that open in a couple of seconds on Kenyan mobile data, a site Google can actually find, email that reaches the inbox, and secure hosting with backups. If something breaks, we fix it fast - you never have to touch the technical side.</p>
              <div className="lp-badges">
                {['Loads in seconds', 'Found on Google', 'Secure + backed up', 'Email that lands', 'Mobile-first', 'No lock-in'].map((b) => <span key={b} className="lp-badge">{b}</span>)}
              </div>
            </div>
            <div>
              <div className="lp-mono" style={{ color: 'rgba(255,255,255,.45)', marginBottom: 12 }}>◆ for the technical · the stack behind it</div>
              <table className="lp-table">
                <thead><tr><th>Layer</th><th>Tools</th><th>Role</th></tr></thead>
                <tbody>
                  {[
                    ['00. Edge', 'Cloudflare Workers · Vercel Edge', 'Render & route'],
                    ['01. App', 'TanStack Start · React 19 · Astro', 'Compose'],
                    ['02. Data', 'Postgres · Supabase · Sanity', 'Persist'],
                    ['03. AI', 'Anthropic Claude · OpenAI', 'Reason'],
                    ['04. Obs', 'OpenTelemetry · Sentry · Plausible', 'Watch'],
                    ['05. Quality', 'Vitest · Playwright · Zod · ESLint', 'Verify'],
                  ].map((r) => (
                    <tr key={r[0]}><td className="layer">{r[0]}</td><td>{r[1]}</td><td className="role">{r[2]}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── §03 plans ── */}
      <section className="lp-sec" id="plans">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono">§03 · <span className="lp-diamond">plans</span></span><span className="lp-rule" /><span className="lp-num">03 / 05</span></div>
          <p className="lp-intro">A monthly retainer for access &amp; SLA - then every task priced on a proforma you approve before we build. No surprise invoices, ever.</p>
          <div className="lp-plans">
            {PLANS.map((p) => (
              <div key={p.name} className={`lp-plan ${p.featured ? 'feat' : ''}`}>
                {p.featured && <div className="lp-plan-flag">Most popular</div>}
                <div className="lp-plan-name">{p.name}</div>
                <div className="lp-plan-price">{p.price}<span>{p.per}</span></div>
                <div className="lp-plan-target">{p.target}</div>
                <ul className="lp-plan-feats">{p.feats.map((f) => <li key={f}>{f}</li>)}</ul>
                <button type="button" className={`lp-btn ${p.featured ? 'lp-btn-primary' : 'lp-btn-ghost'}`} onClick={onSignIn}>{p.cta}</button>
              </div>
            ))}
          </div>
          <p className="lp-fineprint">Task-hours beyond the included allocation are quoted on the rate card and itemised on the proforma before you approve. One-time onboarding fee at activation. Prices in KES, VAT exclusive.</p>
        </div>
      </section>

      {/* ── §04 process ── */}
      <section className="lp-sec grid-bg" id="process">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono">§04 · <span className="lp-diamond">process</span></span><span className="lp-rule" /><span className="lp-num">04 / 05</span></div>
          <p className="lp-intro">A simple four-step loop we run on every job - and keep running for as long as you're with us.</p>
          <div className="lp-proc">
            {[
              ['01', 'KPKRN READ', 'Listen', 'We learn your business - what you sell, who buys, and what is not working online today. We agree a short, honest brief together.'],
              ['02', 'KPKRN PRICE', 'Approve', 'You get a proforma: each task, what it costs, and the deadline. Nothing starts until you approve it. No surprise invoices.'],
              ['03', 'KPKRN SHIP', 'Build', 'We build it - fast, secure, mobile-first, on your own domain. You follow progress in your portal, never a black box.'],
              ['04', 'KPKRN WATCH', 'Tend', 'We keep it running on retainer: updates, backups, monitoring, and quick fixes when you need them. No hand-off, no disappearing.'],
            ].map((p) => (
              <div key={p[0]} className="lp-proc-col">
                <div className="lp-proc-top"><span>{p[0]}</span><span className="step">{p[1]}</span></div>
                <div className="lp-proc-title">{p[2]}</div>
                <div className="lp-proc-body">{p[3]}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── §05 studio ── */}
      <section className="lp-sec" id="studio">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono">§05 · <span className="lp-diamond">who you work with</span></span><span className="lp-rule" /><span className="lp-num">05 / 05</span></div>
          <div className="lp-split">
            <div>
              <h2 className="lp-h2">A small team.<br />A <em>long horizon</em>.</h2>
              <p className="lp-intro">We would rather look after a handful of businesses well than chase many and vanish. You get the same people each time, plain answers in plain language, and a price you agreed before any work begins.</p>
              <div className="lp-tags">{['Honest pricing', 'Same team each time', 'Fast support', 'Secure & backed up', 'Kenyan-built', 'Plain-spoken', 'No lock-in'].map((t) => <span key={t} className="lp-tag">{t}</span>)}</div>
            </div>
            <div>
              <div className="lp-mono" style={{ marginBottom: 14 }}>◆ at a glance</div>
              <div className="lp-statgrid">
                {[['2026', 'Launching'], ['Nairobi', '+ edge · eu-west-1'], ['4-48h', 'SLA by plan'], ['Per task', 'Proforma-priced'], ['M-Pesa', '+ Paystack card'], ['6 mo', 'Retainer horizon']].map((s) => (
                  <div key={s[1]} className="lp-statcard"><div className="n">{s[0]}</div><div className="l">{s[1]}</div></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── testimonial ── */}
      <section className="lp-sec grid-bg">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono"><span className="lp-dot">●</span> the promise · why a proforma</span><span className="lp-rule" /></div>
          <blockquote className="lp-quote">Every task is <em>priced, listed, and approved</em> before a line of work begins - a paragraph treated the way an editor would, a build queue the way an engineer would.</blockquote>
          <div className="lp-quote-by">- how Kipkiren works · the proforma is the contract</div>
        </div>
      </section>

      {/* ── §06 contact (teal) ── */}
      <section className="lp-sec teal" id="contact">
        <div className="lp-wrap lp-contact">
          <div className="lp-eyebrow"><span className="lp-mono" style={{ color: 'var(--amber2)' }}><span className="lp-dot">●</span> §06 · open a channel</span><span className="lp-rule" /></div>
          <div className="lp-contact-grid">
            <div>
              <h2>A short note is <em>enough</em>.</h2>
              <p>We read everything ourselves. Expect a thoughtful reply within two business days - usually with a question, sometimes with a referral if we're not the right fit.</p>
              {/* TODO: replace with the real handles/numbers before launch */}
              <div className="lp-meta">
                <div className="lp-meta-row"><span className="lp-k">▸ Mail</span> hello@kipkiren.co.ke</div>
                <div className="lp-meta-row"><span className="lp-k">▸ WhatsApp</span> chat us - fastest reply</div>
                <div className="lp-meta-row"><span className="lp-k">▸ Hours</span> Mon-Fri · 9-5 EAT</div>
                <div className="lp-meta-row"><span className="lp-k">▸ Based</span> Nairobi, Kenya</div>
              </div>
            </div>
            <form onSubmit={submit}>
              <div className="lp-field"><label>$ Name</label><input placeholder="Your name" /></div>
              <div className="lp-field"><label>$ Email</label><input type="email" placeholder="you@yourcompany.co.ke" /></div>
              <div className="lp-field"><label>$ Company</label><input placeholder="Your company" /></div>
              <div className="lp-field"><label>$ Brief</label><textarea placeholder="One sentence about what you're making and a date you'd like to ship by." /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="lp-mono" style={{ color: 'rgba(255,255,255,.55)' }}>◆ no trackers · no autoresponders</span>
                <button type="submit" className="lp-send">Send →</button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* ── footer ── */}
      <footer className="lp-footer">
        <div className="lp-wrap">
          <div>
            <h4><span className="lp-diamond">◆</span> KIPKIREN <span style={{ color: 'rgba(255,255,255,.4)' }}>/web-services</span></h4>
            <p>Managed web services for Kenyan SMEs - websites, hosting, SEO, email and cloud on a monthly retainer, every task priced on a proforma before we build. Based in Nairobi.</p>
          </div>
          <div><div className="lp-fcol-l">/pages</div><a onClick={go('systems')}>Services</a><a onClick={go('plans')}>Plans</a><a onClick={go('process')}>How it works</a></div>
          <div><div className="lp-fcol-l">/talk</div><a onClick={go('contact')}>Contact</a><a>hello@kipkiren.co.ke</a></div>
          <div><div className="lp-fcol-l">/where</div><a>Nairobi, Kenya</a><a>eu-west-1 edge</a></div>
        </div>
        <div className="lp-wrap"><div className="lp-footbar"><span>© 2026 Kipkiren Web Services · Nairobi, Kenya</span><span><span className="lp-diamond">●</span> Proforma-priced · no surprise invoices</span></div></div>
      </footer>
    </div>
  );
}
