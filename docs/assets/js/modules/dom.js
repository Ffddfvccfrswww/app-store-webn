/* ==========================================================================
   DOM — small helpers
   Nothing here ever parses HTML from a string. Elements are created with
   createElement and text is set with textContent, so data that comes from
   files or forms can never turn into markup or script.
   ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';

export const qs = (selector, scope = document) => scope.querySelector(selector);
export const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

/**
 * Create an element.
 * @param {string} tag
 * @param {Object} [options]  class, text, attrs (object), dataset (object)
 * @param {Array<Node|string|null|undefined|false>} [children]
 */
export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined && options.text !== null) node.textContent = String(options.text);
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value === false || value === null || value === undefined) continue;
      if (name === 'style' || name.toLowerCase().startsWith('on')) continue;
      node.setAttribute(name, value === true ? '' : String(value));
    }
  }
  if (options.dataset) {
    for (const [name, value] of Object.entries(options.dataset)) node.dataset[name] = String(value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

/** An icon from the inline SVG sprite: <svg><use href="#id"/></svg> */
export function icon(id, size = 18, className = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (className) svg.setAttribute('class', className);
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}`);
  svg.append(use);
  return svg;
}

/** Returns a normalised https URL string, or '' when the value is not a safe https link. */
export function safeHttpsUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    if (!url.hostname || !url.hostname.includes('.')) return '';
    return url.href;
  } catch {
    return '';
  }
}

/** Only allows a relative path to a file inside this site's assets folder. */
export function safeAssetPath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim();
  if (!/^assets\/apps\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:png|jpg|jpeg|webp|avif)$/.test(path)) return '';
  if (path.includes('..')) return '';
  return path;
}

/** Accepts #rgb / #rrggbb colours only. */
export function safeColor(value, fallback) {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim()) ? value.trim() : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Announce a short message to screen-reader users. */
export function announce(message) {
  const region = document.getElementById('live-region');
  if (!region) return;
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 60);
}

/** Keep keyboard focus inside a container while it is open. Returns a release function. */
export function trapFocus(container) {
  const selector = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function onKeydown(event) {
    if (event.key !== 'Tab') return;
    const items = qsa(selector, container).filter((node) => node.offsetParent !== null || node === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  container.addEventListener('keydown', onKeydown);
  return () => container.removeEventListener('keydown', onKeydown);
}
