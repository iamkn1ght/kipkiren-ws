// Post-build step: inject the server-rendered landing into dist/index.html.
// The staff console (VITE_PORTAL_AUDIENCE=staff) has no public landing, so it
// skips the prerender and tells crawlers to stay out instead.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const { render } = await import(pathToFileURL(resolve(ssrDir, 'prerender.js')).href);
const html = render();
const indexPath = resolve(dist, 'index.html');
const index = readFileSync(indexPath, 'utf8');
const marker = '<div id="root"></div>';
if (!index.includes(marker)) throw new Error('prerender: #root marker not found in dist/index.html');
writeFileSync(indexPath, index.replace(marker, `<div id="root">${html}</div>`));
rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerender: injected ${html.length} chars of landing HTML`);
