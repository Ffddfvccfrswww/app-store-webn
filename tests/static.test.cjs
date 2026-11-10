#!/usr/bin/env node
/* ==========================================================================
   STATIC TESTS — checks that need no browser
   They read the built site in docs/ and the sources, and fail on anything
   that would weaken security, privacy, translations or basic correctness.
   ========================================================================== */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT, DOCS, assert, assertEqual, createRunner } = require('./helpers.cjs');

const runner = createRunner('Static tests');
const { test, group } = runner;

const read = (file) => fs.readFileSync(file, 'utf8');
const exists = (file) => fs.existsSync(file);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function flatten(object, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value && typeof value === 'object') Object.assign(out, flatten(value, `${prefix}${key}.`));
    else out[`${prefix}${key}`] = value;
  }
  return out;
}

const LANGUAGES = ['en', 'he', 'ar', 'es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja'];
const PAGES = fs.readdirSync(DOCS).filter((file) => file.endsWith('.html'));
const html = Object.fromEntries(PAGES.map((file) => [file, read(path.join(DOCS, file))]));
const english = flatten(JSON.parse(read(path.join(ROOT, 'src', 'i18n', 'en.json'))));
const sourceScripts = walk(path.join(ROOT, 'src', 'assets', 'js')).filter((file) => file.endsWith('.js'));

(async () => {
  /* ------------------------------------------------------------------ build */
  group('build');

  await test('docs/ is up to date with the sources', () => {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), '--check', '--quiet'], { cwd: ROOT, stdio: 'pipe' });
  });

  await test('all expected pages exist', () => {
    const expected = ['index.html', 'submit.html', 'thanks.html', '404.html', 'privacy.html', 'terms.html', 'cookies.html', 'refunds.html', 'guidelines.html', 'accessibility.html', 'legal.html'];
    for (const file of expected) assert(PAGES.includes(file), `missing page: ${file}`);
  });

  await test('no template tags are left in any page', () => {
    for (const [file, source] of Object.entries(html)) {
      assert(!/\{\{[^}]*\}\}/.test(source), `${file} contains an unresolved template tag`);
      assert(!/%%CONTENT%%/.test(source), `${file} contains the content placeholder`);
    }
  });

  /* --------------------------------------------------------------- security */
  group('security');

  await test('every page carries a strict Content-Security-Policy', () => {
    for (const [file, source] of Object.entries(html)) {
      const match = source.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
      assert(match, `${file}: no CSP meta tag`);
      const policy = match[1].replace(/&#39;/g, "'");
      for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-src 'none'", "require-trusted-types-for 'script'"]) {
        assert(policy.includes(directive), `${file}: CSP is missing "${directive}"`);
      }
      assert(!/unsafe-inline|unsafe-eval|\*/.test(policy), `${file}: CSP contains an unsafe source`);
    }
  });

  await test('no inline scripts, inline styles or inline event handlers', () => {
    for (const [file, source] of Object.entries(html)) {
      const scripts = source.match(/<script\b[^>]*>/g) || [];
      for (const tag of scripts) {
        assert(/\ssrc="/.test(tag) || /type="application\/ld\+json"/.test(tag), `${file}: inline script ${tag}`);
      }
      assert(!/<style\b/i.test(source), `${file}: <style> element found`);
      assert(!/\sstyle="/i.test(source), `${file}: style attribute found`);
      assert(!/\son[a-z]+\s*=/i.test(source.replace(/data-i18n[^=]*="[^"]*"/g, '')), `${file}: inline event handler found`);
      assert(!/javascript:/i.test(source), `${file}: javascript: URL found`);
    }
  });

  await test('scripts, styles, images and fonts are all loaded from this site', () => {
    for (const [file, source] of Object.entries(html)) {
      const tags = source.match(/<(?:script|link|img|source|video|audio|iframe|object|embed)\b[^>]*>/g) || [];
      for (const tag of tags) {
        const target = (tag.match(/\s(?:src|href)="([^"]*)"/) || [])[1];
        if (!target) continue;
        if (/rel="(?:canonical|alternate)"/.test(tag)) continue;
        assert(!/^(?:https?:)?\/\//.test(target), `${file}: external resource ${tag}`);
      }
      assert(!/<(?:iframe|object|embed)\b/i.test(source), `${file}: embedded frame or object found`);
    }
  });

  await test('no third-party addresses anywhere in the built site', () => {
    const allowed = new Set(['www.w3.org', 'schema.org']);
    const files = walk(DOCS).filter((file) => /\.(?:html|css|js|json|webmanifest|txt|xml)$/.test(file) && !file.includes(`${path.sep}vendor${path.sep}`) && !file.endsWith('.txt'));
    for (const file of files) {
      const found = read(file).match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/gi) || [];
      for (const url of found) {
        const host = url.replace(/^https?:\/\//, '').toLowerCase();
        assert(allowed.has(host), `${path.relative(ROOT, file)} mentions ${url}`);
      }
    }
  });

  await test('links that open a new tab cannot reach back into this page', () => {
    for (const [file, source] of Object.entries(html)) {
      for (const tag of source.match(/<a\b[^>]*target="_blank"[^>]*>/g) || []) {
        assert(/rel="[^"]*noopener[^"]*"/.test(tag), `${file}: ${tag} has no rel="noopener"`);
      }
    }
  });

  await test('scripts never build HTML from strings or evaluate code', () => {
    const banned = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\b/, /setTimeout\s*\(\s*['"`]/];
    for (const file of sourceScripts) {
      const source = read(file);
      for (const pattern of banned) assert(!pattern.test(source), `${path.relative(ROOT, file)} uses ${pattern}`);
    }
  });

  await test('security headers are defined for hosts that support them', () => {
    const headers = read(path.join(DOCS, '_headers'));
    for (const name of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'X-Frame-Options: SAMEORIGIN', 'Referrer-Policy', 'Permissions-Policy', "frame-ancestors 'self'"]) {
      assert(headers.includes(name), `_headers is missing ${name}`);
    }
    const vercel = JSON.parse(read(path.join(ROOT, 'vercel.json')));
    const keys = vercel.headers[0].headers.map((header) => header.key);
    for (const name of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options']) {
      assert(keys.includes(name), `vercel.json is missing ${name}`);
    }
    assertEqual(vercel.outputDirectory, 'docs', 'vercel.json output directory');
  });

  await test('no personal email addresses or secrets are published', () => {
    const files = walk(DOCS).filter((file) => /\.(?:html|js|json|txt|xml|webmanifest)$/.test(file) && !file.includes(`${path.sep}vendor${path.sep}`));
    for (const file of files) {
      const source = read(file);
      assert(!/[a-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|icloud|walla|proton)\.[a-z.]+/i.test(source), `${path.relative(ROOT, file)} contains a personal email address`);
      assert(!/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i.test(source), `${path.relative(ROOT, file)} looks like it contains a secret`);
    }
  });

  /* ------------------------------------------------------------------ pages */
  group('pages');

  await test('every page has a language, one main heading, a title and a description', () => {
    for (const [file, source] of Object.entries(html)) {
      assert(/^<!DOCTYPE html>/i.test(source), `${file}: missing doctype`);
      assert(/<html lang="en" dir="ltr"/.test(source), `${file}: missing lang/dir`);
      const title = (source.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1];
      assert(title && title.trim().length > 5, `${file}: empty title`);
      const description = (source.match(/<meta name="description"[^>]*content="([^"]*)"/) || source.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"/) || [])[1];
      assert(description && description.length > 20, `${file}: missing description`);
      assert(/<main id="main"/.test(source), `${file}: missing <main id="main">`);
      assert(/class="skip-link" href="#main"/.test(source), `${file}: missing skip link`);
      // Legal pages hold the same document in two languages, so they have two headings.
      const headings = (source.match(/<h1\b/g) || []).length;
      const expected = /data-doc-lang="he"/.test(source) ? 2 : 1;
      assertEqual(headings, expected, `${file}: number of <h1> elements`);
    }
  });

  await test('every internal link and asset points at something that exists', () => {
    const ids = Object.fromEntries(Object.entries(html).map(([file, source]) => [file, new Set((source.match(/\sid="([^"]+)"/g) || []).map((m) => m.slice(5, -1)))]));
    for (const [file, source] of Object.entries(html)) {
      const targets = [...source.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
      for (const target of targets) {
        if (/^(?:https?:|mailto:|tel:|data:)/.test(target)) continue;
        const [pathPart, hash] = target.split('#');
        const cleanPath = pathPart.split('?')[0];
        const page = cleanPath || file;
        const full = path.join(DOCS, page);
        assert(exists(full), `${file}: broken link ${target}`);
        if (hash && page.endsWith('.html')) assert(ids[page] && ids[page].has(hash), `${file}: missing anchor ${target}`);
      }
    }
  });

  await test('ids are unique within each page', () => {
    for (const [file, source] of Object.entries(html)) {
      const seen = new Set();
      for (const match of source.matchAll(/\sid="([^"]+)"/g)) {
        assert(!seen.has(match[1]), `${file}: duplicate id "${match[1]}"`);
        seen.add(match[1]);
      }
    }
  });

  await test('legal documents exist in English and Hebrew', () => {
    for (const file of ['privacy.html', 'terms.html', 'cookies.html', 'refunds.html', 'guidelines.html', 'accessibility.html', 'legal.html']) {
      assert(/<article class="doc" lang="en" dir="ltr" data-doc-lang="en">/.test(html[file]), `${file}: English version missing`);
      assert(/<article class="doc" lang="he" dir="rtl" data-doc-lang="he">/.test(html[file]), `${file}: Hebrew version missing`);
    }
  });

  await test('paid listings are disclosed as advertising on every page', () => {
    for (const [file, source] of Object.entries(html)) {
      assert(source.includes('data-i18n="footer.adDisclosure"'), `${file}: advertising disclosure missing from the footer`);
      assert(source.includes('data-i18n="footer.trademarks"'), `${file}: trademark notice missing from the footer`);
    }
  });

  /* ----------------------------------------------------------- translations */
  group('translations');

  await test('all ten languages have exactly the same keys and placeholders', () => {
    const tokens = (text) => (text.match(/\{\w+\}|<\/?\d+>/g) || []).sort().join(' ');
    for (const code of LANGUAGES) {
      const dictionary = flatten(JSON.parse(read(path.join(ROOT, 'src', 'i18n', `${code}.json`))));
      const missing = Object.keys(english).filter((key) => !(key in dictionary));
      const extra = Object.keys(dictionary).filter((key) => !(key in english));
      assert(!missing.length, `${code}: missing keys ${missing.join(', ')}`);
      assert(!extra.length, `${code}: unknown keys ${extra.join(', ')}`);
      for (const key of Object.keys(english)) {
        assert(String(dictionary[key]).trim().length > 0, `${code}: ${key} is empty`);
        assertEqual(tokens(dictionary[key]), tokens(english[key]), `${code}: placeholders differ in ${key}`);
      }
    }
  });

  await test('every language is really translated', () => {
    for (const code of LANGUAGES.filter((language) => language !== 'en')) {
      const dictionary = flatten(JSON.parse(read(path.join(ROOT, 'src', 'i18n', `${code}.json`))));
      const long = Object.keys(english).filter((key) => english[key].length > 25);
      const same = long.filter((key) => dictionary[key] === english[key]);
      assert(same.length <= 2, `${code}: ${same.length} long strings are identical to English (${same.slice(0, 5).join(', ')})`);
    }
  });

  await test('every key used in pages and scripts exists, and no key is unused', () => {
    const used = new Set();
    const sources = [...walk(path.join(ROOT, 'src', 'pages')), ...walk(path.join(ROOT, 'src', 'partials')), path.join(ROOT, 'src', 'layout.html')].map(read).join('\n');
    for (const match of sources.matchAll(/data-i18n(?:-rich)?="([^"{]+)"/g)) used.add(match[1]);
    for (const match of sources.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of match[1].split(';')) used.add(pair.slice(pair.indexOf(':') + 1).trim());
    }
    for (const match of sources.matchAll(/"(?:titleKey|descKey)":\s*"([^"]+)"/g)) used.add(match[1]);
    const scripts = sourceScripts.map(read).join('\n');
    for (const match of scripts.matchAll(/\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g)) used.add(match[1]);
    for (const match of scripts.matchAll(/label: '([a-zA-Z0-9_.]+)'/g)) used.add(match[1]);
    for (const match of scripts.matchAll(/['"]((?:a11y|consent|showing|submit|tickets|app|share|hero|nav)\.(?!html|js|json)[a-zA-Z0-9]+)['"]/g)) used.add(match[1]);

    for (const key of used) {
      if (key.includes('{{')) continue;
      assert(key in english, `key "${key}" is used but not defined in en.json`);
    }
    // Keys that are assembled at run time: categories.<name>, tickets.<plan>.<field>, app.<store>
    const dynamic = [/^categories\./, /^tickets\.(?:screening|premiere|blockbuster)\./, /^app\.(?:ios|android|web)$/];
    const unused = Object.keys(english).filter((key) => !used.has(key) && !dynamic.some((pattern) => pattern.test(key)));
    assert(!unused.length, `unused translation keys: ${unused.join(', ')}`);
  });

  /* ------------------------------------------------------------------- data */
  group('data');

  await test('the app list is valid and example listings never link anywhere', () => {
    const data = JSON.parse(read(path.join(DOCS, 'assets', 'data', 'apps.json')));
    assert(Array.isArray(data.apps) && data.apps.length > 0, 'apps.json has no apps');
    const ids = new Set();
    for (const app of data.apps) {
      assert(/^[a-z0-9][a-z0-9-]{0,48}$/.test(app.id), `bad id: ${app.id}`);
      assert(!ids.has(app.id), `duplicate id: ${app.id}`);
      ids.add(app.id);
      assert(['screening', 'premiere', 'blockbuster'].includes(app.tier), `${app.id}: bad tier`);
      assert(typeof app.name === 'string' && app.name.length > 0 && app.name.length <= 60, `${app.id}: bad name`);
      const links = Object.values(app.links || {});
      if (app.demo) assert(links.length === 0, `${app.id}: an example listing must not have links`);
      for (const link of links) assert(/^https:\/\//.test(link), `${app.id}: link must be https`);
    }
  });

  await test('the web manifest and its icons are valid', () => {
    const manifest = JSON.parse(read(path.join(DOCS, 'site.webmanifest')));
    assert(manifest.name && manifest.icons.length >= 2, 'manifest is incomplete');
    for (const icon of manifest.icons) assert(exists(path.join(DOCS, icon.src)), `missing icon ${icon.src}`);
    for (const file of ['favicon.svg', 'assets/img/og-image.png', 'assets/img/apple-touch-icon.png', 'assets/img/grain.png', 'robots.txt', '.nojekyll']) {
      assert(exists(path.join(DOCS, file)), `missing ${file}`);
    }
  });

  await test('third-party components ship with their licences', () => {
    for (const file of ['assets/vendor/three/LICENSE', 'assets/fonts/LICENSE-Oswald.txt', 'assets/fonts/LICENSE-Rubik.txt', 'assets/fonts/LICENSE-Karantina.txt']) {
      assert(exists(path.join(DOCS, file)), `missing ${file}`);
    }
  });

  await test('style sheets load nothing from other servers', () => {
    for (const file of walk(path.join(DOCS, 'assets', 'css'))) {
      const source = read(file);
      assert(!/@import/.test(source), `${path.basename(file)} uses @import`);
      assert(!/url\(\s*['"]?(?:https?:)?\/\//.test(source), `${path.basename(file)} loads an external URL`);
    }
  });

  process.exit(runner.finish() ? 0 : 1);
})();
