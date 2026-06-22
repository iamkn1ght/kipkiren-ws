import type { FormEvent } from 'react';
import { ThemeToggle } from './ThemeToggle.tsx';
import './landing.css';

/**
 * Public marketing landing page for Kipkiren Web Services.
 * Rebuilt from the brand-guide / Lovable design. Self-contained editorial
 * light styling (landing.css, lp-* classes) — independent of the app theme.
 * CTAs call onSignIn() to enter the portal flow.
 */
export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const submit = (e: FormEvent) => { e.preventDefault(); onSignIn(); };
  const go = (id: string) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="lp">
      {/* ── status bar ── */}
      <div className="lp-status">
        <div className="lp-wrap">
          <span><b>● SYS</b> · ONLINE&nbsp;&nbsp;·&nbsp;&nbsp;UPTIME · 99.998%&nbsp;&nbsp;·&nbsp;&nbsp;P50 · 38MS&nbsp;&nbsp;·&nbsp;&nbsp;DEPLOY · EDGE-IAD&nbsp;&nbsp;·&nbsp;&nbsp;14M AGO</span>
          <span>BUILD · V7.04.21&nbsp;&nbsp;·&nbsp;&nbsp;NBO · 16:40 EAT</span>
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
            <button className="lp-navlink" onClick={go('process')}>03 Process</button>
            <button className="lp-navlink" onClick={go('studio')}>04 Studio</button>
            <button className="lp-navlink" onClick={go('contact')}>05 Contact</button>
          </div>
          <div className="lp-nav-right">
            <ThemeToggle inline />
            <button className="lp-booking" onClick={onSignIn}><span className="lp-live" /> Sign in · Booking Q3</button>
          </div>
        </div>
      </nav>

      {/* ── hero ── */}
      <header className="lp-wrap lp-hero">
        <div className="lp-hero-grid">
          <div>
            <span className="lp-tagchip">◆ V7.04 · WEB · SYSTEMS · INFRA · <span className="lp-diamond">● ACCEPTING PARTNERS</span></span>
            <h1 className="lp-h1">We engineer the quiet parts of the <em>modern web</em><span className="lp-dot">.</span></h1>
            <p className="lp-lede">Kipkiren is a Nairobi studio shipping editorial websites, product UIs, and the platform infrastructure behind them — typed end-to-end, deployed at the edge, instrumented from day one.</p>
            <div className="lp-cta-row">
              <button className="lp-btn lp-btn-primary" onClick={onSignIn}>$ Init project →</button>
              <button className="lp-btn lp-btn-ghost" onClick={onSignIn}>View systems →</button>
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
              <span className="lp-term-title">~ / KIPKIREN — ZSH</span>
              <span className="lp-term-size">80×24</span>
            </div>
            <div className="lp-term-body">
              <div><span className="pr">▸</span> kpkrn <b>init</b> --client maridadi-press</div>
              <div><span className="ok">✓</span> brief synced <span className="mut">(24 pages, 1.2k assets)</span></div>
              <div><span className="ok">✓</span> tokens generated <span className="mut">(palette · type · scale)</span></div>
              <div><span className="ok">✓</span> repo provisioned <span className="mut">(tanstack · sanity)</span></div>
              <div style={{ height: 12 }} />
              <div><span className="pr">▸</span> kpkrn <b>deploy</b> --edge</div>
              <div><span className="ok">●</span> build <span className="mut">···············</span> 38s</div>
              <div><span className="ok">●</span> ship <span className="mut">···············</span> 11s</div>
              <div><span className="ok">●</span> warm <span className="mut">···············</span> 04s</div>
              <div style={{ height: 12 }} />
              <div>live → <a>maridadi.press</a></div>
              <div>lighthouse → <span className="amber">100 · 100 · 100 · 100</span></div>
              <div className="mut">next: tend — six month retainer</div>
              <div style={{ height: 10 }} /><div><span className="pr">▸</span> <span className="lp-term-cursor" /></div>
            </div>
          </div>
        </div>
      </header>

      {/* ── §01 systems ── */}
      <section className="lp-sec grid-bg" id="systems">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono">§01 · <span className="lp-diamond">systems we ship</span></span><span className="lp-rule" /><span className="lp-num">01 / 05</span></div>
          <p className="lp-intro">Four packages, practiced deeply. Composable. Versioned. Maintained on a long horizon — never a hand-off, always a system.</p>
          <div className="lp-cards">
            {[
              { pkg: '@kipkiren/brand', ver: 'v2.4.1', title: 'Brand systems', body: 'Wordmarks, type pairings, motion logos, and the design tokens that hold a brand together at scale.', tags: ['Identity', 'Tokens', 'Motion'] },
              { pkg: '@kipkiren/site', ver: 'v7.0.0', title: 'Editorial websites', body: 'Marketing surfaces, careers and pricing pages. Content-led, instrumented, fast on a thin pipe.', tags: ['TanStack', 'Sanity', 'Edge'] },
              { pkg: '@kipkiren/product', ver: 'v3.8.2', title: 'Product UI & design systems', body: 'Dashboards, onboarding flows, component libraries built alongside your engineering team.', tags: ['React', 'Storybook', 'A11Y'] },
              { pkg: '@kipkiren/infra', ver: 'v1.2.0', title: 'Platform & engineering', body: 'Typed end-to-end. Edge deployment, observability, CI, security, performance budgets.', tags: ['Workers', 'Postgres', 'OTEL'] },
            ].map((c) => (
              <div key={c.pkg} className="lp-card">
                <div className="lp-card-top"><span>◆ {c.pkg}</span><span className="lp-ver">{c.ver}</span></div>
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
          <div className="lp-eyebrow"><span className="lp-mono" style={{ color: 'var(--amber2)' }}>§02 · the stack</span><span className="lp-rule" /><span className="lp-num">02 / 05</span></div>
          <div className="lp-split">
            <div>
              <h2 className="lp-h2">Six layers,<br />one <em>typed</em> seam.</h2>
              <p className="lp-intro">A boring, well-loved stack. Stable choices at the edge, sharp tools at the surface. Every layer instrumented, every contract typed, every deploy reversible in under sixty seconds.</p>
              <div className="lp-badges">
                {['100 LH', 'WCAG 2.2', 'OWASP', 'GDPR', 'OTEL', 'SOC2-Ready'].map((b) => <span key={b} className="lp-badge">{b}</span>)}
              </div>
            </div>
            <table className="lp-table">
              <thead><tr><th>Layer</th><th>Tools</th><th>Role</th></tr></thead>
              <tbody>
                {[
                  ['00. Edge', 'Cloudflare Workers · Fastly · Vercel Edge', 'Render & route'],
                  ['01. App', 'TanStack Start · React 19 · Astro · Next', 'Compose'],
                  ['02. Data', 'Postgres · Supabase · Sanity · Payload', 'Persist'],
                  ['03. AI', 'Lovable AI Gateway · OpenAI · Anthropic', 'Reason'],
                  ['04. Obs', 'OpenTelemetry · Sentry · Axiom · Plausible', 'Watch'],
                  ['05. Quality', 'Vitest · Playwright · Zod · ESLint', 'Verify'],
                ].map((r) => (
                  <tr key={r[0]}><td className="layer">{r[0]}</td><td>{r[1]}</td><td className="role">{r[2]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── §03 deployments ── */}
      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono">§03 · <span className="lp-diamond">recent deployments</span></span><span className="lp-rule" /><span className="lp-num">03 / 05</span></div>
          <p className="lp-intro">A small, well-tended portfolio. Each engagement carried for six months past launch.</p>
          <table className="lp-dtable">
            <thead><tr><th>#</th><th>Client</th><th>Engagement</th><th>Sector</th><th>Year</th><th>Status</th><th>LH</th></tr></thead>
            <tbody>
              {[
                ['001', 'Maridadi Press', 'Editorial site', 'Publishing', '2026', 'live', '100'],
                ['002', 'Acacia Capital', 'Brand + site', 'Finance', '2025', 'live', '99'],
                ['003', 'Field Atlas', 'Product UI', 'Climate', '2025', 'live', '98'],
                ['004', 'Otieno & Co.', 'Marketing site', 'Legal', '2024', 'live', '100'],
                ['005', 'Stratum Health', 'Dashboard', 'Health', '2024', 'build', '—'],
              ].map((r) => (
                <tr key={r[0]}>
                  <td className="mono">{r[0]}</td>
                  <td className="cl">{r[1]}</td>
                  <td>{r[2]}</td>
                  <td><span className="lp-pill">{r[5] === 'build' ? r[4] : r[3]}</span></td>
                  <td className="mono">{r[4]}</td>
                  <td className="mono"><span className={`lp-stat-dot ${r[6] === '—' ? 'build' : ''}`}>●</span> {r[6] === '—' ? 'BUILD' : 'LIVE'}</td>
                  <td className="mono">{r[6]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── §04 process ── */}
      <section className="lp-sec grid-bg" id="process">
        <div className="lp-wrap">
          <div className="lp-eyebrow"><span className="lp-mono">§04 · <span className="lp-diamond">process</span></span><span className="lp-rule" /><span className="lp-num">04 / 05</span></div>
          <p className="lp-intro">A four-movement loop. Repeated slowly. Repeated well.</p>
          <div className="lp-proc">
            {[
              ['01', 'KPKRN READ', 'Listen', 'We read your existing material, your analytics, your inbox. A brief is written together — small, honest, signed.'],
              ['02', 'KPKRN DRAFT', 'Sketch', 'Type studies, palette directions, two or three editorial routes. Always on a real page, never on a moodboard.'],
              ['03', 'KPKRN SHIP', 'Build', 'Typed, accessible, edge-deployed. Your team is in the repo from week two. No hand-off, no surprise invoices.'],
              ['04', 'KPKRN WATCH', 'Tend', 'Six months on retainer. Performance budgets, content updates, observability, and the small fixes that compound.'],
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
          <div className="lp-eyebrow"><span className="lp-mono">§05 · <span className="lp-diamond">the studio</span></span><span className="lp-rule" /><span className="lp-num">05 / 05</span></div>
          <div className="lp-split">
            <div>
              <h2 className="lp-h2">A small team. A long horizon.<br /><em>No growth hacking,</em> no headcount theatre.</h2>
              <p className="lp-intro">Kipkiren grew out of a magazine and an engineering team that missed each other. We still think in spreads — pacing, hierarchy, the silence before a pull-quote — and in commits — typed, reviewed, reversible.</p>
              <div className="lp-tags">{['Editorial', 'Typed', 'Patient', 'Instrumented', 'Durable', 'Plain-spoken', 'Open-source-friendly'].map((t) => <span key={t} className="lp-tag">{t}</span>)}</div>
            </div>
            <div>
              <div className="lp-mono" style={{ marginBottom: 14 }}>◆ telemetry · 12mo</div>
              <div className="lp-statgrid">
                {[['07yr', 'In practice'], ['48', 'Systems shipped'], ['16', 'Long partners'], ['38ms', 'Median P50'], ['99.99%', 'Uptime'], ['100%', 'Referral']].map((s) => (
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
          <div className="lp-eyebrow"><span className="lp-mono"><span className="lp-dot">●</span> word from a partner · git log -1</span><span className="lp-rule" /></div>
          <blockquote className="lp-quote">"Kipkiren are the only studio I've worked with who treat a paragraph the way an editor does — and a build queue the way an engineer does. The rare <em>both</em>."</blockquote>
          <div className="lp-quote-by">— A. Njoroge / Editor-in-Chief, Maridadi Press / commit 4f2a1c · 2026-05-18</div>
        </div>
      </section>

      {/* ── §06 contact (teal) ── */}
      <section className="lp-sec teal" id="contact">
        <div className="lp-wrap lp-contact">
          <div className="lp-eyebrow"><span className="lp-mono" style={{ color: 'var(--amber2)' }}><span className="lp-dot">●</span> §06 · open a channel</span><span className="lp-rule" /></div>
          <div className="lp-contact-grid">
            <div>
              <h2>A short note is <em>enough</em>.</h2>
              <p>We read everything ourselves. Expect a thoughtful reply within two business days — usually with a question, sometimes with a referral if we're not the right fit.</p>
              <div className="lp-meta">
                <div className="lp-meta-row"><span className="lp-k">▸ Mail</span> studio@kipkiren.co</div>
                <div className="lp-meta-row"><span className="lp-k">▸ PGP</span> 0xA21F · 4DC9</div>
                <div className="lp-meta-row"><span className="lp-k">▸ Tel</span> +254 (0)20 ··· 0142</div>
                <div className="lp-meta-row"><span className="lp-k">▸ Geo</span> 01°17′S · 36°48′E</div>
              </div>
            </div>
            <form onSubmit={submit}>
              <div className="lp-field"><label>$ Name</label><input placeholder="Amara Njoroge" /></div>
              <div className="lp-field"><label>$ Email</label><input type="email" placeholder="amara@maridadi.press" /></div>
              <div className="lp-field"><label>$ Company</label><input placeholder="Maridadi Press" /></div>
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
            <p>A small studio engineering editorial websites, product surfaces, and the infrastructure behind them. Built in Nairobi, deployed at the edge.</p>
          </div>
          <div><div className="lp-fcol-l">/src</div><a>github/kipkiren</a></div>
          <div><div className="lp-fcol-l">/log</div><a>@kipkiren</a><div className="lp-fcol-l" style={{ marginTop: 12 }}>/rss</div><a>journal.xml</a></div>
          <div><div className="lp-fcol-l">/lib</div><a>are.na/kipkiren</a></div>
        </div>
        <div className="lp-wrap"><div className="lp-footbar"><span>© 2026 Kipkiren Web Services Ltd · CO. NO. KE-04421</span><span><span className="lp-diamond">●</span> All systems nominal · v7.04.21</span></div></div>
      </footer>
    </div>
  );
}
