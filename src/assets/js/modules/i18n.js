/* ==========================================================================
   I18N — translations in the browser
   English is already baked into the HTML by the build. This module swaps in
   another language when needed and keeps <html lang> and dir in step.

   Markup contract (same as tools/build.mjs):
     data-i18n="key"                       → element text
     data-i18n-attr="attr:key;attr2:key2"  → attributes
     data-i18n-rich="key"                  → text with <1>…</1> slots that map
                                             to child elements [data-i18n-slot]
   ========================================================================== */

import { read, write } from './store.js';

const root = document.documentElement;
const cache = new Map();
const listeners = new Set();

let languages = [{ code: 'en', name: 'English', dir: 'ltr' }];
let current = 'en';
let dictionary = {};
let fallback = {};
let variables = {};

function lookup(source, key) {
  let node = source;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

function interpolate(text, extra) {
  return text.replace(/\{(\w+)\}/g, (match, name) => {
    if (extra && extra[name] !== undefined) return String(extra[name]);
    if (variables[name] !== undefined) return String(variables[name]);
    return match;
  });
}

async function load(code) {
  if (cache.has(code)) return cache.get(code);
  const url = new URL(`../../i18n/${code}.json`, import.meta.url);
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Could not load language "${code}" (${response.status})`);
  const json = await response.json();
  cache.set(code, json);
  return json;
}

export function t(key, extra) {
  let value = lookup(dictionary, key);
  if (typeof value !== 'string') value = lookup(fallback, key);
  if (typeof value !== 'string') return key;
  return interpolate(value, extra);
}

/** Translate a value that is either a plain string or a { en: '…', he: '…' } map. */
export function localized(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof value[current] === 'string') return value[current];
    if (typeof value.en === 'string') return value.en;
    const first = Object.values(value).find((entry) => typeof entry === 'string');
    return first || '';
  }
  return '';
}

export function getLanguage() {
  return current;
}

export function getLanguages() {
  return languages;
}

export function isRtl() {
  const entry = languages.find((language) => language.code === current);
  return Boolean(entry && entry.dir === 'rtl');
}

export function onLanguageChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function formatPrice(amount, currency) {
  try {
    return new Intl.NumberFormat(current, {
      style: 'currency',
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function applyRich(element) {
  const key = element.getAttribute('data-i18n-rich');
  const slots = new Map();
  element.querySelectorAll('[data-i18n-slot]').forEach((slot) => {
    slots.set(slot.getAttribute('data-i18n-slot'), slot);
  });
  const text = t(key);
  const fragment = document.createDocumentFragment();
  const pattern = /<(\d+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let found;
  while ((found = pattern.exec(text))) {
    if (found.index > last) fragment.append(text.slice(last, found.index));
    const slot = slots.get(found[1]);
    if (slot) {
      slot.textContent = found[2];
      fragment.append(slot);
    } else {
      fragment.append(found[2]);
    }
    last = found.index + found[0].length;
  }
  if (last < text.length) fragment.append(text.slice(last));
  element.replaceChildren(fragment);
}

/** Apply the current language to every marked element inside `scope`. */
export function applyTranslations(scope = document) {
  const base = scope === document ? document.documentElement : scope;

  const textNodes = base.querySelectorAll('[data-i18n]');
  if (base.matches && base.matches('[data-i18n]')) base.textContent = t(base.getAttribute('data-i18n'));
  textNodes.forEach((element) => {
    element.textContent = t(element.getAttribute('data-i18n'));
  });

  const attrNodes = Array.from(base.querySelectorAll('[data-i18n-attr]'));
  if (base.matches && base.matches('[data-i18n-attr]')) attrNodes.push(base);
  attrNodes.forEach((element) => {
    for (const pair of element.getAttribute('data-i18n-attr').split(';')) {
      const index = pair.indexOf(':');
      if (index < 0) continue;
      const attribute = pair.slice(0, index).trim();
      const key = pair.slice(index + 1).trim();
      if (!/^(?:aria-[a-z]+|title|placeholder|content|alt|label)$/.test(attribute)) continue;
      element.setAttribute(attribute, t(key));
    }
  });

  base.querySelectorAll('[data-i18n-rich]').forEach(applyRich);
}

export async function setLanguage(code, { persist = false } = {}) {
  const entry = languages.find((language) => language.code === code) || languages[0];
  const [next, english] = await Promise.all([load(entry.code), load('en')]);
  dictionary = next;
  fallback = english;
  current = entry.code;
  root.lang = entry.code;
  root.dir = entry.dir === 'rtl' ? 'rtl' : 'ltr';
  if (persist) write('site:lang', entry.code);
  applyTranslations(document);
  root.classList.remove('i18n-pending');
  listeners.forEach((callback) => {
    try {
      callback(entry.code);
    } catch (error) {
      console.error(error);
    }
  });
  return entry.code;
}

export async function initI18n(config) {
  languages = config.languages;
  variables = {
    brand: config.brand.name,
    owner: config.owner || config.brand.name,
    currency: config.currency,
    year: String(new Date().getFullYear()),
  };

  // boot.js already resolved the language (URL → saved choice → browser → default).
  const resolved = languages.some((language) => language.code === root.lang) ? root.lang : config.defaultLanguage;

  // A language that arrives through a shared link (?lang=xx) is remembered,
  // because opening that link is the visitor asking for that language.
  const fromUrl = root.getAttribute('data-lang-source') === 'url';
  try {
    await setLanguage(resolved, { persist: fromUrl && read('site:lang') !== resolved });
  } catch (error) {
    console.error(error);
    root.lang = 'en';
    root.dir = 'ltr';
    root.classList.remove('i18n-pending');
    try {
      dictionary = fallback = await load('en');
      current = 'en';
      applyTranslations(document);
    } catch (inner) {
      console.error(inner);
    }
  }
  return current;
}
