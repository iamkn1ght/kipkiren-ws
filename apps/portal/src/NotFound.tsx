import { useEffect, type MouseEvent } from 'react';
import { KlpToggle } from './klpTheme.tsx';
import './landing.css';
import './landing-x.css';

/**
 * Site-wide "page not found". Rendered by App for any path that is not a real
 * route (the SPA fallback serves index.html for every URL, so this is where
 * unknown links end up). Same .kx glass language as the landing: a giant
 * fading 404 with a frosted card over its lower half. Marked noindex.
 */
export function NotFound({ onHome, onSignIn }: { onHome: () => void; onSignIn: () => void }) {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Page not found · Kipkiren Web Services';
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex';
    document.head.appendChild(meta);
    window.scrollTo({ top: 0 });
    return () => { document.title = prevTitle; meta.remove(); };
  }, []);

  const home = (e: MouseEvent) => { e.preventDefault(); onHome(); };

  return (
    <div className="kx nf">
      <div id="tone" aria-hidden="true" />
      <div className="haze" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <header className="wrap nf-top">
        <a className="brand" href="/" onClick={home} aria-label="Kipkiren Web Services home"><span className="mark">K</span><span className="nm">Kipkiren<small>Web services</small></span></a>
        <KlpToggle />
      </header>
      <main className="nf-main">
        <div className="nf-404" aria-hidden="true">4<em>0</em>4</div>
        <section className="nf-card glass">
          <span className="eyebrow">Error · 404</span>
          <h1>This page took <em>a different route.</em></h1>
          <p className="lead">The link may be old, or the page may have moved. Everything else is right where you left it.</p>
          <div className="ctas">
            <a className="btn primary" href="/" onClick={home}>Back to homepage <span className="ar">&rarr;</span></a>
            <button type="button" className="btn ghost" onClick={onSignIn}>Open the client portal</button>
          </div>
          <p className="nf-path mono">Requested <code>{path}</code></p>
        </section>
      </main>
      <footer className="nf-foot mono">&copy; 2026 Kipkiren Web Services Ltd. · studio@kipkiren.co.ke</footer>
    </div>
  );
}
