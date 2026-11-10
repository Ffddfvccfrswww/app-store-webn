#!/usr/bin/env node
/* ==========================================================================
   BUILD — בונה את האתר המוכן לעלייה לאוויר אל תוך התיקייה docs/

   Reads   : site.config.js, src/layout.html, src/partials, src/pages,
             src/i18n, src/assets
   Writes  : docs/ (the complete static site) and vercel.json

   Usage   : node tools/build.mjs            build into docs/
             node tools/build.mjs --check    verify docs/ is up to date

   The build has no dependencies. Everything it writes is plain static
   files, so the result can be hosted anywhere.
   ========================================================================== */

import { readFile, writeFile, mkdir, rm, cp, readdir, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const CHECK = process.argv.includes('--check');
const QUIET = process.argv.includes('--quiet');

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

// --config and --out exist so the test-suite can build variants of the site
// (for example with a form service configured) without touching docs/.
const CONFIG_FILE = path.resolve(ROOT, option('config', 'site.config.js'));
const OUT_DIR = path.resolve(ROOT, option('out', 'docs'));
const IS_MAIN_BUILD = OUT_DIR === path.join(ROOT, 'docs') && CONFIG_FILE === path.join(ROOT, 'site.config.js');

/* --------------------------------------------------------------------------
   Small helpers
   -------------------------------------------------------------------------- */

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeXml = escapeHtml;

const getPath = (object, dotted) =>
  dotted.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), object);

const isHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

const isEmail = (value) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(value);

const originOf = (value) => new URL(value).origin;

async function listFiles(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/* --------------------------------------------------------------------------
   Configuration: load + validate
   -------------------------------------------------------------------------- */

async function loadConfig() {
  const module = await import(pathToFileURL(CONFIG_FILE).href + `?t=${Date.now()}`);
  const config = module.default;
  const problems = [];

  if (!config || typeof config !== 'object') throw new Error('site.config.js must export an object.');
  if (!config.brand || !config.brand.name || !String(config.brand.name).trim()) problems.push('brand.name is required.');

  if (config.siteUrl) {
    if (!isHttpsUrl(config.siteUrl)) problems.push('siteUrl must be a full https:// address.');
    if (/\/$/.test(config.siteUrl)) problems.push('siteUrl must not end with a slash.');
  }

  const emailFields = ['email', 'privacyEmail', 'accessibilityEmail', 'securityEmail'];
  for (const field of emailFields) {
    const value = config.contact && config.contact[field];
    if (value && !isEmail(value)) problems.push(`contact.${field} is not a valid email address.`);
  }

  if (!Array.isArray(config.plans) || config.plans.length === 0) problems.push('plans must be a non-empty list.');
  const knownPlans = new Set(['screening', 'premiere', 'blockbuster']);
  for (const plan of config.plans || []) {
    if (!knownPlans.has(plan.id)) problems.push(`plans: unknown plan id "${plan.id}".`);
    if (typeof plan.price !== 'number' || !(plan.price > 0)) problems.push(`plans.${plan.id}.price must be a positive number.`);
    if (plan.checkoutUrl && !isHttpsUrl(plan.checkoutUrl)) problems.push(`plans.${plan.id}.checkoutUrl must start with https://`);
    if (plan.slots !== undefined && !(Number.isInteger(plan.slots) && plan.slots > 0)) {
      problems.push(`plans.${plan.id}.slots must be a positive whole number.`);
    }
  }
  if (!/^[A-Z]{3}$/.test(config.currency || '')) problems.push('currency must be a three-letter code such as USD.');

  if (config.forms && config.forms.endpoint && !isHttpsUrl(config.forms.endpoint)) {
    problems.push('forms.endpoint must start with https://');
  }
  if (config.analytics && config.analytics.enabled) {
    if (!config.analytics.scriptUrl || !isHttpsUrl(config.analytics.scriptUrl)) {
      problems.push('analytics.scriptUrl must start with https:// when analytics.enabled is true.');
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test((config.legal && config.legal.effectiveDate) || '')) {
    problems.push('legal.effectiveDate must look like 2026-01-31.');
  }
  if (!Array.isArray(config.languages) || !config.languages.some((l) => l.code === config.defaultLanguage)) {
    problems.push('defaultLanguage must be one of languages.');
  }

  if (problems.length) {
    throw new Error('site.config.js has problems:\n  - ' + problems.join('\n  - '));
  }
  return config;
}

/* --------------------------------------------------------------------------
   Security policy (one source of truth for the <meta> tag and for headers)
   -------------------------------------------------------------------------- */

function buildCsp(config, { forHeader }) {
  const connect = new Set(["'self'"]);
  const script = new Set(["'self'"]);
  const formAction = new Set(["'self'"]);

  if (config.forms && config.forms.endpoint) {
    connect.add(originOf(config.forms.endpoint));
    formAction.add(originOf(config.forms.endpoint));
  }
  if (config.analytics && config.analytics.enabled && config.analytics.scriptUrl) {
    script.add(originOf(config.analytics.scriptUrl));
    connect.add(originOf(config.analytics.scriptUrl));
  }

  const directives = [
    "default-src 'none'",
    `script-src ${[...script].join(' ')}`,
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${[...connect].join(' ')}`,
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    `form-action ${[...formAction].join(' ')}`,
    "require-trusted-types-for 'script'",
    'trusted-types site-loader',
  ];
  if (forHeader) {
    // These two directives are ignored inside a <meta> tag, so they only go in real headers.
    directives.push("frame-ancestors 'self'");
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}

function securityHeaders(config) {
  return [
    ['Content-Security-Policy', buildCsp(config, { forHeader: true })],
    ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'SAMEORIGIN'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    [
      'Permissions-Policy',
      [
        'accelerometer=()',
        'autoplay=()',
        'browsing-topics=()',
        'camera=()',
        'display-capture=()',
        'encrypted-media=()',
        'fullscreen=(self)',
        'geolocation=()',
        'gyroscope=()',
        'interest-cohort=()',
        'magnetometer=()',
        'microphone=()',
        'midi=()',
        'payment=()',
        'picture-in-picture=()',
        'publickey-credentials-get=()',
        'screen-wake-lock=()',
        'usb=()',
        'xr-spatial-tracking=()',
      ].join(', '),
    ],
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ['X-Permitted-Cross-Domain-Policies', 'none'],
  ];
}

const CACHE_RULES = [
  ['/assets/fonts/*', 'public, max-age=31536000, immutable'],
  ['/assets/vendor/*', 'public, max-age=31536000, immutable'],
  ['/assets/img/*', 'public, max-age=86400'],
  ['/assets/apps/*', 'public, max-age=86400'],
  ['/assets/css/*', 'public, max-age=0, must-revalidate'],
  ['/assets/js/*', 'public, max-age=0, must-revalidate'],
  ['/assets/i18n/*', 'public, max-age=0, must-revalidate'],
  ['/assets/data/*', 'public, max-age=0, must-revalidate'],
];

function renderHeadersFile(config) {
  const lines = [
    '# Security and caching headers.',
    '# Read automatically by Netlify and Cloudflare Pages. Generated by tools/build.mjs — do not edit.',
    '',
    '/*',
  ];
  for (const [name, value] of securityHeaders(config)) lines.push(`  ${name}: ${value}`);
  lines.push('');
  for (const [pattern, value] of CACHE_RULES) {
    lines.push(pattern);
    lines.push(`  Cache-Control: ${value}`);
    lines.push('');
  }
  return lines.join('\n');
}

function renderVercelJson(config) {
  const headers = [
    {
      source: '/(.*)',
      headers: securityHeaders(config).map(([key, value]) => ({ key, value })),
    },
    ...CACHE_RULES.map(([pattern, value]) => ({
      source: pattern.replace('/*', '/(.*)'),
      headers: [{ key: 'Cache-Control', value }],
    })),
  ];
  return (
    JSON.stringify(
      {
        $schema: 'https://openapi.vercel.sh/vercel.json',
        outputDirectory: 'docs',
        cleanUrls: false,
        trailingSlash: false,
        headers,
      },
      null,
      2,
    ) + '\n'
  );
}

/* --------------------------------------------------------------------------
   Translation stamping: bakes the English text into the HTML so that the
   pages are complete without JavaScript and for search engines.
   The same rules are implemented for the browser in assets/js/modules/i18n.js
   -------------------------------------------------------------------------- */

function makeTranslator(dictionary, vars) {
  return (key) => {
    const value = getPath(dictionary, key);
    if (typeof value !== 'string') throw new Error(`Missing translation key: ${key}`);
    return value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match));
  };
}

function stampTranslations(html, t) {
  // 1. Attributes:  data-i18n-attr="aria-label:some.key;title:other.key"
  html = html.replace(/<[a-zA-Z][^<>]*\sdata-i18n-attr="([^"]+)"[^<>]*>/g, (tag, spec) => {
    let out = tag;
    for (const pair of spec.split(';')) {
      const index = pair.indexOf(':');
      if (index < 0) throw new Error(`Bad data-i18n-attr value: ${spec}`);
      const attr = pair.slice(0, index).trim();
      const key = pair.slice(index + 1).trim();
      out = out.replace(new RegExp(`\\s${attr}="[^"]*"`), '');
      const closing = out.endsWith('/>') ? '/>' : '>';
      out = `${out.slice(0, -closing.length).trimEnd()} ${attr}="${escapeHtml(t(key))}"${closing}`;
    }
    return out;
  });

  // 2. Rich text with slots:  "I agree to the <1>Terms</1> and the <2>Rules</2>."
  html = html.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*?)?\sdata-i18n-rich="([^"]+)"[^<>]*)>([\s\S]*?)<\/\1>/g,
    (match, tag, attrs, key, inner) => {
      const slots = {};
      inner.replace(
        /<([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*?)?\sdata-i18n-slot="(\d+)"[^<>]*)>[\s\S]*?<\/\1>/g,
        (slotMatch, slotTag, slotAttrs, slotId) => {
          slots[slotId] = { tag: slotTag, attrs: slotAttrs };
          return slotMatch;
        },
      );
      const text = t(key);
      let out = '';
      let last = 0;
      const pattern = /<(\d+)>([\s\S]*?)<\/\1>/g;
      let found;
      while ((found = pattern.exec(text))) {
        out += escapeHtml(text.slice(last, found.index));
        const slot = slots[found[1]];
        if (!slot) throw new Error(`Translation ${key} uses slot ${found[1]} which is missing in the HTML.`);
        out += `<${slot.tag}${slot.attrs}>${escapeHtml(found[2])}</${slot.tag}>`;
        last = found.index + found[0].length;
      }
      out += escapeHtml(text.slice(last));
      return `<${tag}${attrs}>${out}</${tag}>`;
    },
  );

  // 3. Plain text:  <h2 data-i18n="some.key"></h2>
  html = html.replace(
    /<([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*?)?\sdata-i18n="([^"]+)"[^<>]*)>([^<]*)<\/\1>/g,
    (match, tag, attrs, key) => `<${tag}${attrs}>${escapeHtml(t(key))}</${tag}>`,
  );

  return html;
}

/* --------------------------------------------------------------------------
   Template helpers
   {{name}}                         simple variable
   {{> partial}}                    include src/partials/partial.html
   {{cfg:a.b,c.d|fallback}}         first non-empty config value, else fallback
   {{mailto:a.b,c.d|fallback}}      email link from config, else fallback
   {{#if cfg:a.b}} … {{else}} … {{/if}}
   -------------------------------------------------------------------------- */

function firstConfigValue(config, paths) {
  for (const p of paths.split(',')) {
    const value = getPath(config, p.trim());
    if (value !== undefined && value !== null && value !== false && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function renderTemplate(template, { config, vars, partials }, depth = 0) {
  if (depth > 8) throw new Error('Partials are nested too deeply.');
  let out = template;

  out = out.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (match, name) => {
    if (!(name in partials)) throw new Error(`Unknown partial: ${name}`);
    return renderTemplate(partials[name], { config, vars, partials }, depth + 1);
  });

  // Conditional blocks may be nested, so the innermost ones are resolved first.
  const innermostIf = /\{\{#if cfg:([\w.,]+)\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/g;
  for (let pass = 0; pass < 12 && /\{\{#if /.test(out); pass += 1) {
    out = out.replace(innermostIf, (match, paths, body) => {
      const [yes, no = ''] = body.split('{{else}}');
      return firstConfigValue(config, paths) ? yes : no;
    });
  }

  out = out.replace(/\{\{cfg:([\w.,]+)(?:\|([^}]*))?\}\}/g, (match, paths, fallback = '') => {
    const value = firstConfigValue(config, paths);
    return value ? escapeHtml(value) : fallback;
  });

  out = out.replace(/\{\{mailto:([\w.,]+)(?:\|([^}]*))?\}\}/g, (match, paths, fallback = '') => {
    const value = firstConfigValue(config, paths);
    return value ? `<a href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>` : fallback;
  });

  out = out.replace(/\{\{price:(\w+)\}\}/g, (match, id) => {
    const plan = config.plans.find((candidate) => candidate.id === id);
    if (!plan) throw new Error(`{{price:${id}}}: no such plan in site.config.js`);
    return escapeHtml(formatPrice(plan.price, config.currency, 'en'));
  });

  out = out.replace(/\{\{featured:(\w+)\}\}/g, (match, id) => {
    const plan = config.plans.find((candidate) => candidate.id === id);
    return plan && plan.featured ? ' is-featured' : '';
  });

  out = out.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    if (!(name in vars)) throw new Error(`Unknown template variable: {{${name}}}`);
    return vars[name];
  });

  return out;
}

function formatPrice(amount, currency, locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

function parsePage(source, file) {
  const match = source.match(/^\s*<!--page\s*([\s\S]*?)-->/);
  if (!match) throw new Error(`${file}: missing <!--page {...} --> header.`);
  let meta;
  try {
    meta = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`${file}: page header is not valid JSON (${error.message}).`);
  }
  return { meta, body: source.slice(match[0].length).trim() };
}

/* --------------------------------------------------------------------------
   Extra generated files
   -------------------------------------------------------------------------- */

function renderRuntimeConfig(config) {
  // Only what the browser needs. Operator details stay out of the script.
  const runtime = {
    brand: { name: config.brand.name },
    siteUrl: config.siteUrl || '',
    contactEmail: (config.contact && config.contact.email) || '',
    currency: config.currency,
    plans: config.plans.map((plan) => ({
      id: plan.id,
      price: plan.price,
      checkoutUrl: plan.checkoutUrl || '',
      featured: Boolean(plan.featured),
      slots: Number.isInteger(plan.slots) && plan.slots > 0 ? plan.slots : 0,
    })),
    forms: {
      endpoint: (config.forms && config.forms.endpoint) || '',
      accessKey: (config.forms && config.forms.accessKey) || '',
    },
    analytics: {
      enabled: Boolean(config.analytics && config.analytics.enabled && config.analytics.scriptUrl),
      scriptUrl: (config.analytics && config.analytics.enabled && config.analytics.scriptUrl) || '',
      domain: (config.analytics && config.analytics.domain) || '',
    },
    consentVersion: Number(config.consentVersion) || 1,
    defaultLanguage: config.defaultLanguage,
    languages: config.languages.map(({ code, name, dir }) => ({ code, name, dir })),
    owner: ((config.operator && config.operator.legalName) || config.brand.name).replace(/\.$/, ''),
  };
  return (
    '/* Generated from site.config.js by tools/build.mjs — do not edit this file. */\n' +
    `export default ${JSON.stringify(runtime, null, 2)};\n`
  );
}

function renderManifest(config) {
  return (
    JSON.stringify(
      {
        name: config.brand.name,
        short_name: config.brand.name,
        description: 'A cinematic stage for apps.',
        start_url: './index.html',
        scope: './',
        display: 'standalone',
        background_color: '#05070a',
        theme_color: '#05070a',
        icons: [
          { src: 'assets/img/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'assets/img/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'assets/img/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      null,
      2,
    ) + '\n'
  );
}

function renderRobots(config) {
  const lines = ['User-agent: *', 'Allow: /', 'Disallow: /thanks.html', ''];
  if (config.siteUrl) lines.push(`Sitemap: ${config.siteUrl}/sitemap.xml`, '');
  return lines.join('\n');
}

function renderSitemap(config, pages) {
  const urls = pages
    .filter((page) => page.meta.sitemap !== false)
    .map((page) => {
      const loc = page.meta.file === 'index.html' ? `${config.siteUrl}/` : `${config.siteUrl}/${page.meta.file}`;
      const alternates = config.languages
        .map(
          (language) =>
            `    <xhtml:link rel="alternate" hreflang="${language.code}" href="${escapeXml(`${loc}?lang=${language.code}`)}"/>`,
        )
        .join('\n');
      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        `    <lastmod>${config.legal.effectiveDate}</lastmod>`,
        alternates,
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(loc)}"/>`,
        '  </url>',
      ].join('\n');
    });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

function renderSecurityTxt(config) {
  const email = (config.contact && (config.contact.securityEmail || config.contact.email)) || '';
  if (!email) return null;
  // RFC 9116 requires an expiry date. One year after the legal effective date keeps the build reproducible.
  const expires = new Date(`${config.legal.effectiveDate}T00:00:00Z`);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  const lines = [
    `Contact: mailto:${email}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: en, he',
  ];
  if (config.siteUrl) {
    lines.push(`Canonical: ${config.siteUrl}/.well-known/security.txt`);
    lines.push(`Policy: ${config.siteUrl}/legal.html#security`);
  }
  return lines.join('\n') + '\n';
}

function renderHeadExtras(config, page) {
  const lines = [];
  const file = page.meta.file;
  if (config.siteUrl && page.meta.sitemap !== false) {
    const loc = file === 'index.html' ? `${config.siteUrl}/` : `${config.siteUrl}/${file}`;
    lines.push(`<link rel="canonical" href="${escapeHtml(loc)}">`);
    for (const language of config.languages) {
      lines.push(
        `<link rel="alternate" hreflang="${language.code}" href="${escapeHtml(`${loc}?lang=${language.code}`)}">`,
      );
    }
    lines.push(`<link rel="alternate" hreflang="x-default" href="${escapeHtml(loc)}">`);
    lines.push(`<meta property="og:url" content="${escapeHtml(loc)}">`);
  }
  const image = config.siteUrl ? `${config.siteUrl}/assets/img/og-image.png` : 'assets/img/og-image.png';
  lines.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
  lines.push('<meta property="og:image:width" content="1200">');
  lines.push('<meta property="og:image:height" content="630">');
  for (const name of page.meta.css || []) {
    lines.push(`<link rel="stylesheet" href="assets/css/${name}.css">`);
  }
  if (config.siteUrl && file === 'index.html') {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: config.brand.name,
      url: `${config.siteUrl}/`,
      inLanguage: config.languages.map((language) => language.code),
    };
    lines.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
  }
  return lines.join('\n');
}

function renderLanguageOptions(config) {
  return config.languages
    .map((language) => `<option value="${language.code}" lang="${language.code}">${escapeHtml(language.name)}</option>`)
    .join('\n          ');
}

/* --------------------------------------------------------------------------
   Build
   -------------------------------------------------------------------------- */

async function build(outDir) {
  const config = await loadConfig();
  const dictionary = JSON.parse(await readFile(path.join(SRC, 'i18n', 'en.json'), 'utf8'));
  const year = String(new Date().getUTCFullYear());
  const owner = ((config.operator && config.operator.legalName) || config.brand.name).replace(/\.$/, '');

  const vars = {
    brand: escapeHtml(config.brand.name),
    year,
    owner: escapeHtml(owner),
    currency: escapeHtml(config.currency),
    effectiveDate: escapeHtml(config.legal.effectiveDate),
    minimumAge: escapeHtml(String(config.legal.minimumAge)),
    csp: escapeHtml(buildCsp(config, { forHeader: false })),
    languageOptions: renderLanguageOptions(config),
    langCodes: config.languages.map((language) => language.code).join(','),
    rtlCodes: config.languages
      .filter((language) => language.dir === 'rtl')
      .map((language) => language.code)
      .join(','),
    defaultLang: config.defaultLanguage,
  };
  const t = makeTranslator(dictionary, {
    brand: config.brand.name,
    year,
    owner,
    currency: config.currency,
  });

  const partials = {};
  for (const file of await listFiles(path.join(SRC, 'partials'))) {
    partials[file.replace(/\.html$/, '')] = await readFile(path.join(SRC, 'partials', file), 'utf8');
  }
  const layout = await readFile(path.join(SRC, 'layout.html'), 'utf8');

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Static assets
  await cp(path.join(SRC, 'assets'), path.join(outDir, 'assets'), { recursive: true });
  await mkdir(path.join(outDir, 'assets', 'i18n'), { recursive: true });
  for (const language of config.languages) {
    const file = path.join(SRC, 'i18n', `${language.code}.json`);
    if (!existsSync(file)) throw new Error(`Missing translation file: src/i18n/${language.code}.json`);
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(path.join(outDir, 'assets', 'i18n', `${language.code}.json`), JSON.stringify(parsed) + '\n');
  }
  await writeFile(path.join(outDir, 'assets', 'js', 'config.js'), renderRuntimeConfig(config));

  // Pages
  const pages = [];
  for (const file of await listFiles(path.join(SRC, 'pages'))) {
    const page = parsePage(await readFile(path.join(SRC, 'pages', file), 'utf8'), file);
    pages.push(page);
  }
  pages.sort((a, b) => a.meta.file.localeCompare(b.meta.file));

  for (const page of pages) {
    const pageVars = {
      ...vars,
      titleKey: page.meta.titleKey,
      descKey: page.meta.descKey,
      robots: page.meta.robots || 'index, follow',
      bodyClass: page.meta.bodyClass || '',
      page: page.meta.page || 'plain',
      headExtras: renderHeadExtras(config, page),
      content: '%%CONTENT%%',
    };
    let html = renderTemplate(layout, { config, vars: pageVars, partials });
    const body = renderTemplate(page.body, { config, vars: pageVars, partials });
    html = html.replace('%%CONTENT%%', () => body);
    html = stampTranslations(html, t);
    if (page.meta.absoluteUrls && config.siteUrl) {
      // The 404 page can be served at any depth, so its links must not be relative.
      html = html.replace(
        /\b(href|src)="(?!https?:|mailto:|tel:|#|data:)([^"]+)"/g,
        (match, attribute, target) => `${attribute}="${config.siteUrl}/${target}"`,
      );
    }
    if (/data-i18n(?:-attr|-rich)?="[^"]*"[^<>]*>\s*<\/(?:title)>/.test(html)) {
      throw new Error(`${page.meta.file}: an element was left untranslated.`);
    }
    if (/\{\{[^}]*\}\}/.test(html)) {
      const leftover = html.match(/\{\{[^}]*\}\}/)[0];
      throw new Error(`${page.meta.file}: unresolved template tag ${leftover}`);
    }
    await writeFile(path.join(outDir, page.meta.file), html.trimEnd() + '\n');
  }

  // Root files
  await writeFile(path.join(outDir, '.nojekyll'), '');
  await writeFile(path.join(outDir, 'robots.txt'), renderRobots(config));
  await writeFile(path.join(outDir, 'site.webmanifest'), renderManifest(config));
  await writeFile(path.join(outDir, '_headers'), renderHeadersFile(config));
  if (config.siteUrl) await writeFile(path.join(outDir, 'sitemap.xml'), renderSitemap(config, pages));
  const securityTxt = renderSecurityTxt(config);
  if (securityTxt) {
    await mkdir(path.join(outDir, '.well-known'), { recursive: true });
    await writeFile(path.join(outDir, '.well-known', 'security.txt'), securityTxt);
  }
  for (const file of ['favicon.svg', 'favicon.ico']) {
    const from = path.join(SRC, 'root', file);
    if (existsSync(from)) await cp(from, path.join(outDir, file));
  }

  return { config, pages, vercel: renderVercelJson(config) };
}

async function compareDirs(expectedDir, actualDir) {
  const expected = await listFiles(expectedDir);
  const actual = await listFiles(actualDir);
  const problems = [];
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  for (const file of expected) {
    if (!actualSet.has(file)) {
      problems.push(`missing: ${file}`);
      continue;
    }
    const [a, b] = await Promise.all([readFile(path.join(expectedDir, file)), readFile(path.join(actualDir, file))]);
    if (!a.equals(b)) problems.push(`out of date: ${file}`);
  }
  for (const file of actual) if (!expectedSet.has(file)) problems.push(`unexpected: ${file}`);
  return problems;
}

async function main() {
  if (CHECK) {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'site-build-'));
    try {
      const result = await build(temp);
      const problems = await compareDirs(temp, path.join(ROOT, 'docs'));
      const vercelPath = path.join(ROOT, 'vercel.json');
      if (!existsSync(vercelPath) || (await readFile(vercelPath, 'utf8')) !== result.vercel) {
        problems.push('out of date: vercel.json');
      }
      if (problems.length) {
        console.error('docs/ is not up to date with src/. Run: npm run build');
        for (const problem of problems.slice(0, 40)) console.error('  ' + problem);
        process.exit(1);
      }
      if (!QUIET) console.log('docs/ is up to date.');
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
    return;
  }

  const result = await build(OUT_DIR);
  if (IS_MAIN_BUILD) await writeFile(path.join(ROOT, 'vercel.json'), result.vercel);
  if (!QUIET) {
    const files = await listFiles(OUT_DIR);
    console.log(`Built ${result.pages.length} pages, ${files.length} files → ${path.relative(ROOT, OUT_DIR) || '.'}/`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
