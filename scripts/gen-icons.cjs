/**
 * Generate the branding raster set from the SVG sources in apps/portal/public.
 * Run: node scripts/gen-icons.cjs   (needs devDependency @resvg/resvg-js)
 *
 * Sources : favicon.svg (square mark), og.svg (1200x630 social card)
 * Outputs : favicon-16.png, favicon-32.png, apple-touch-icon.png (180),
 *           icon-192.png, icon-512.png, favicon.ico, og.png
 */
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'apps', 'portal', 'public');

function renderWidth(svgFile, width) {
  const svg = fs.readFileSync(path.join(PUB, svgFile), 'utf8');
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng();
}

// Wrap a PNG in a single-image .ico (ICO supports embedded PNG since Vista).
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, png]);
}

const out = (name, buf) => { fs.writeFileSync(path.join(PUB, name), buf); console.log(`  ${name}  (${buf.length} bytes)`); };

console.log('Generating branding assets ->', PUB);
out('favicon-16.png', renderWidth('favicon.svg', 16));
const p32 = renderWidth('favicon.svg', 32);
out('favicon-32.png', p32);
out('apple-touch-icon.png', renderWidth('favicon.svg', 180));
out('icon-192.png', renderWidth('favicon.svg', 192));
out('icon-512.png', renderWidth('favicon.svg', 512));
out('favicon.ico', pngToIco(p32, 32));
out('og.png', renderWidth('og.svg', 1200));
console.log('Done.');
