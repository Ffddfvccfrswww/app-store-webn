#!/usr/bin/env node
/* ==========================================================================
   MAKE IMAGES — draws the app icons and the social sharing image
   Run it again whenever the brand name changes:
       node tools/make-images.cjs && npm run build

   It needs Playwright with Chromium (a development tool only; the finished
   website does not use it). Output goes to src/assets/img/.
   ========================================================================== */

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'assets', 'img');
const FONT = pathToFileURL(path.join(ROOT, 'src', 'assets', 'fonts', 'oswald-latin-wght-normal.woff2')).href;

const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MARK = `
  <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <path d="M32 32L58 13v38z" fill="#ffb454" opacity=".4"/>
    <circle cx="32" cy="32" r="21" fill="none" stroke="#ffb454" stroke-width="4.4"/>
    <circle cx="32" cy="32" r="8" fill="#ffd08a"/>
  </svg>`;

function iconPage(size, padding) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${size}px; height: ${size}px; background: #05070a; }
    .wrap { width: 100%; height: 100%; display: grid; place-items: center;
      background: radial-gradient(circle at 70% 25%, rgba(255,180,84,.28), transparent 60%), #05070a; }
    svg { width: ${100 - padding * 2}%; height: ${100 - padding * 2}%; }
  </style></head><body><div class="wrap">${MARK}</div></body></html>`;
}

function socialPage(brand) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: 'Oswald'; font-weight: 200 700; src: url('${FONT}') format('woff2'); }
    html, body { margin: 0; width: 1200px; height: 630px; }
    body { position: relative; overflow: hidden; background: #05070a; color: #f4eee3; font-family: 'Oswald', sans-serif; }
    .glow { position: absolute; inset: 0; background:
      radial-gradient(ellipse 50% 70% at 82% 20%, rgba(255,180,84,.34), transparent 62%),
      radial-gradient(ellipse 60% 60% at 10% 100%, rgba(69,224,208,.2), transparent 64%),
      radial-gradient(ellipse 90% 70% at 50% 0%, rgba(14,74,85,.55), transparent 70%); }
    .beam { position: absolute; top: -260px; right: 150px; width: 520px; height: 1300px;
      background: linear-gradient(180deg, rgba(255,228,180,.3), rgba(255,228,180,0) 78%);
      clip-path: polygon(46% 0, 54% 0, 100% 100%, 0 100%); transform: rotate(26deg); transform-origin: top center; filter: blur(20px); }
    .bar { position: absolute; left: 0; right: 0; height: 46px; background: #000; }
    .bar.top { top: 0; } .bar.bottom { bottom: 0; }
    .content { position: absolute; left: 80px; top: 104px; right: 80px; }
    .brand { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; }
    .brand svg { width: 56px; height: 56px; }
    h1 { margin: 44px 0 0; font-size: 122px; line-height: .96; font-weight: 600; text-transform: uppercase; letter-spacing: -.005em; }
    h1 span { color: #ffb454; }
    p { margin: 30px 0 0; font-family: system-ui, sans-serif; font-size: 27px; color: #b4bcc3; letter-spacing: .01em; }
  </style></head><body>
    <div class="glow"></div><div class="beam"></div>
    <div class="bar top"></div><div class="bar bottom"></div>
    <div class="content">
      <div class="brand">${MARK}<span>${escapeHtml(brand)}</span></div>
      <h1>Every app deserves<br><span>a premiere.</span></h1>
      <p>A cinematic stage for apps</p>
    </div>
  </body></html>`;
}

(async () => {
  const config = (await import(pathToFileURL(path.join(ROOT, 'site.config.js')).href)).default;
  const browser = await chromium.launch();
  try {
    const shots = [
      { file: 'icon-192.png', size: 192, padding: 14 },
      { file: 'icon-512.png', size: 512, padding: 14 },
      { file: 'icon-maskable-512.png', size: 512, padding: 24 },
      { file: 'apple-touch-icon.png', size: 180, padding: 14 },
    ];
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.size, height: shot.size }, deviceScaleFactor: 1 });
      await page.setContent(iconPage(shot.size, shot.padding));
      await page.screenshot({ path: path.join(OUT, shot.file) });
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(socialPage(config.brand.name));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, 'og-image.png') });
    await page.close();
    console.log('Images written to src/assets/img/');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
