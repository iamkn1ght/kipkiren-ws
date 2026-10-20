// Post-build step: inject server-rendered HTML into the built pages.
//   dist/index.html      <- landing + FAQPage JSON-LD
//   dist/<legal-id>.html <- each legal page with its own title/description/
//                           canonical (Cloudflare Pages serves it at /<id>)
// The staff console (VITE_PORTAL_AUDIENCE=staff) has no public pages, so it
// skips the prerender and tells crawlers to stay out instead.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = 'https://ws.kipkiren.co.ke';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const ssrDir = resolve(root, 'dist-ssr');
const audience = (process.env.VITE_PORTAL_AUDIENCE || 'all').trim();

if (audience === 'staff') {
  writeFileSync(resolve(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  rmSync(resolve(dist, 'sitemap.xml'), { force: true });
  rmSync(ssrDir, { recursive: true, force: true });
  console.log('prerender: staff build - skipped, robots set to Disallow');
  process.exit(0);
}

const ssr = await import(pathToFileURL(resolve(ssrDir, 'prerender.js')).href);
const template = readFileSync(resolve(dist, 'index.html'), 'utf8');
const marker = '<div id="root"></div>';
if (!template.includes(marker)) throw new Error('prerender: #root marker not found in dist/index.html');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Swap one attribute value on the first tag matching `pattern` (e.g. a meta).
function setAttr(html, pattern, attr, value) {
  const re = new RegExp(`(<[^>]*${pattern}[^>]*[ ]${attr}=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`prerender: no tag for ${pattern}`);
  return html.replace(re, `$1${esc(value)}$2`);
}

// Home: landing + FAQ structured data.
const faq = `<script type="application/ld+json">${ssr.faqJsonLd().replace(/</g, '\\u003c')}</script>\n  </head>`;
const home = template.replace(marker, `<div id="root">${ssr.renderLanding()}</div>`).replace('</head>', faq);
writeFileSync(resolve(dist, 'index.html'), home);

// 404 page: the bare app shell (it renders the NotFound view for any unknown
// path). Cloudflare Pages serves it with a real 404 status, and _redirects
// keeps the app's own routes (/staff, /portal/*, /admin/*) on index.html.
const notFound = template
  .replace(/<title>[^<]*<\/title>/, '<title>Page not found · Kipkiren Web Services</title>')
  .replace('</head>', '  <meta name="robots" content="noindex" />\n  </head>');
writeFileSync(resolve(dist, '404.html'), notFound);
// App shell for the app's own routes (/staff, /portal/*, /admin/*). _redirects
// rewrites them to /app; rewriting to /index.html instead makes Pages
// redirect to the homepage. Not for search engines.
const appShell = template.replace('</head>', '  <meta name="robots" content="noindex" />\n  </head>');
writeFileSync(resolve(dist, 'app.html'), appShell);

// Legal pages.
for (const id of ssr.legalIds) {
  const { title, description } = ssr.legalDocMeta(id);
  const url = `${SITE}/${id}`;
  let html = template.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = setAttr(html, 'name="description"', 'content', description);
  html = setAttr(html, 'rel="canonical"', 'href', url);
  html = setAttr(html, 'property="og:url"', 'content', url);
  html = setAttr(html, 'property="og:title"', 'content', title);
  html = setAttr(html, 'property="og:description"', 'content', description);
  html = setAttr(html, 'name="twitter:title"', 'content', title);
  html = setAttr(html, 'name="twitter:description"', 'content', description);
  html = html.replace(marker, `<div id="root">${ssr.renderLegal(id)}</div>`);
  writeFileSync(resolve(dist, `${id}.html`), html);
}

// Sitemap: home + every legal page.
const urls = ['/', ...ssr.legalIds.map((id) => `/${id}`)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><priority>${u === '/' ? '1.0' : '0.5'}</priority></url>`).join('\n')}
</urlset>
`;
writeFileSync(resolve(dist, 'sitemap.xml'), sitemap);

rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerender: landing + ${ssr.legalIds.length} legal pages, sitemap with ${urls.length} urls`);
