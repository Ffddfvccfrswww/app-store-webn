/* ==========================================================================
   SHOWCASE — "Now Showing"
   Loads assets/data/apps.json, validates every field, and renders the film
   strip of posters, the category filters and the details dialog.

   Safety notes
   - All text is written with textContent. Nothing from the data file is ever
     treated as markup.
   - Links must be https. Poster images must be files inside assets/apps/.
   - Every paid listing shows a "Sponsored" label; example listings show
     "Example" and never link anywhere.
   - Outbound links carry rel="sponsored noopener noreferrer".
   ========================================================================== */

import { qs, qsa, el, icon, safeHttpsUrl, safeAssetPath, safeColor, clamp } from './dom.js';
import { t, localized, onLanguageChange } from './i18n.js';
import { isMotionOff } from './motion.js';
import { track } from './analytics.js';

const TIERS = ['blockbuster', 'premiere', 'screening'];
const CATEGORIES = [
  'productivity',
  'health',
  'finance',
  'education',
  'entertainment',
  'games',
  'lifestyle',
  'travel',
  'tools',
  'social',
  'music',
  'photo',
  'shopping',
  'food',
  'business',
  'other',
];
const GLYPHS = ['wave', 'orbit', 'bolt', 'leaf', 'note', 'coin', 'compass', 'chat', 'lens', 'book', 'pulse', 'cube', 'spark'];
const LINK_KINDS = ['ios', 'android', 'web'];
const MAX_LINKS = { screening: 1, premiere: 3, blockbuster: 3 };

let apps = [];
let activeCategory = 'all';
let headliner = null;
let dialog = null;
let lastTrigger = null;
let onHeadlinerChange = null;

/* --------------------------------- data ---------------------------------- */

function cleanText(value, max) {
  if (typeof value === 'string') return value.trim().slice(0, max);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [code, text] of Object.entries(value)) {
      if (/^[a-z]{2}$/.test(code) && typeof text === 'string') out[code] = text.trim().slice(0, max);
    }
    return out;
  }
  return '';
}

function normalise(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && /^[a-z0-9][a-z0-9-]{0,48}$/.test(raw.id) ? raw.id : '';
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '';
  if (!id || !name) return null;

  const tier = TIERS.includes(raw.tier) ? raw.tier : 'screening';
  const demo = raw.demo === true;
  const links = {};
  if (!demo && raw.links && typeof raw.links === 'object') {
    for (const kind of LINK_KINDS) {
      const url = safeHttpsUrl(raw.links[kind]);
      if (url && Object.keys(links).length < MAX_LINKS[tier]) links[kind] = url;
    }
  }
  const colors = Array.isArray(raw.colors) ? raw.colors : [];

  return {
    id,
    name,
    demo,
    tier,
    category: CATEGORIES.includes(raw.category) ? raw.category : 'other',
    glyph: GLYPHS.includes(raw.glyph) ? raw.glyph : 'spark',
    colors: [safeColor(colors[0], '#173a4a'), safeColor(colors[1], '#0a1218')],
    poster: safeAssetPath(raw.poster),
    tagline: cleanText(raw.tagline, 160),
    description: cleanText(raw.description, 700),
    links,
  };
}

async function loadApps() {
  const url = new URL('../../data/apps.json', import.meta.url);
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`apps.json: ${response.status}`);
  const json = await response.json();
  const list = Array.isArray(json && json.apps) ? json.apps : [];
  const seen = new Set();
  const cleaned = [];
  for (const raw of list.slice(0, 200)) {
    const app = normalise(raw);
    if (!app || seen.has(app.id)) continue;
    seen.add(app.id);
    cleaned.push(app);
  }
  // Higher tiers first; the original order is kept inside each tier.
  return cleaned
    .map((app, index) => ({ app, index }))
    .sort((a, b) => TIERS.indexOf(a.app.tier) - TIERS.indexOf(b.app.tier) || a.index - b.index)
    .map((entry) => entry.app);
}

/* -------------------------------- posters -------------------------------- */

function platformsText(app) {
  const names = LINK_KINDS.filter((kind) => app.links[kind]).map((kind) => t(`app.${kind}`));
  return names.join(' · ');
}

function badges(app, { withHeadliner }) {
  const list = el('span', { class: 'badges' });
  if (app.demo) list.append(el('span', { class: 'badge badge--example', text: t('showing.example') }));
  else list.append(el('span', { class: 'badge badge--sponsored', text: t('showing.sponsored') }));
  if (withHeadliner && app.tier === 'blockbuster') {
    list.append(el('span', { class: 'badge badge--headliner' }, [icon('i-star', 10), t('showing.headliner')]));
  }
  return list;
}

function posterContent(app) {
  const parts = [];
  if (app.poster) {
    parts.push(
      el('img', {
        class: 'poster__img',
        attrs: { src: app.poster, alt: '', loading: 'lazy', decoding: 'async', width: 400, height: 600 },
      }),
    );
  } else {
    parts.push(icon(`g-${app.glyph}`, 200, 'poster__glyph'));
  }
  const badgeRow = badges(app, { withHeadliner: true });
  badgeRow.classList.add('poster__badges');
  parts.push(badgeRow);
  parts.push(el('span', { class: 'poster__title', text: app.name, attrs: { translate: 'no' } }));
  const tagline = localized(app.tagline);
  if (tagline) parts.push(el('span', { class: 'poster__tagline', text: tagline }));
  const billing = [t(`categories.${app.category}`), platformsText(app)].filter(Boolean).join(' · ');
  parts.push(el('span', { class: 'poster__billing', text: billing }));
  return parts;
}

function applyPosterColors(node, app) {
  node.style.setProperty('--p1', app.colors[0]);
  node.style.setProperty('--p2', app.colors[1]);
}

function buildPoster(app) {
  const button = el(
    'button',
    {
      class: `poster poster--${app.tier}`,
      attrs: { type: 'button', 'aria-haspopup': 'dialog' },
      dataset: { app: app.id },
    },
    posterContent(app),
  );
  applyPosterColors(button, app);
  button.addEventListener('click', () => openDialog(app, button));
  attachTilt(button);
  return button;
}

function buildOpenSeat() {
  return el('a', { class: 'poster poster--seat', attrs: { href: 'submit.html' } }, [
    el('span', { class: 'poster__plus' }, [icon('i-plus', 28)]),
    el('span', { class: 'poster__title', text: t('showing.openSeatTitle') }),
    el('span', { class: 'poster__tagline', text: t('showing.openSeatText') }),
    el('span', { class: 'poster__cta', text: t('showing.openSeatCta') }),
  ]);
}

function attachTilt(node) {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  node.addEventListener('pointermove', (event) => {
    if (!fine.matches || isMotionOff()) return;
    const rect = node.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    node.classList.add('is-tilting');
    node.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(2)}deg`);
    node.style.setProperty('--rx', `${((0.5 - y) * 12).toFixed(2)}deg`);
    node.style.setProperty('--sx', `${(x * 100).toFixed(1)}%`);
    node.style.setProperty('--sy', `${(y * 100).toFixed(1)}%`);
  });
  node.addEventListener('pointerleave', () => {
    node.classList.remove('is-tilting');
    node.style.setProperty('--ry', '0deg');
    node.style.setProperty('--rx', '0deg');
  });
}

/* --------------------------------- render -------------------------------- */

function visibleApps() {
  return activeCategory === 'all' ? apps : apps.filter((app) => app.category === activeCategory);
}

function renderFilters() {
  const host = qs('#filters');
  if (!host) return;
  const present = CATEGORIES.filter((category) => apps.some((app) => app.category === category));
  if (activeCategory !== 'all' && !present.includes(activeCategory)) activeCategory = 'all';
  const chips = ['all', ...present].map((category) => {
    const chip = el('button', {
      class: 'chip',
      text: category === 'all' ? t('showing.filterAll') : t(`categories.${category}`),
      attrs: { type: 'button', 'aria-pressed': category === activeCategory ? 'true' : 'false' },
      dataset: { category },
    });
    chip.addEventListener('click', () => {
      if (activeCategory === category) return;
      activeCategory = category;
      qsa('.chip', host).forEach((node) => {
        node.setAttribute('aria-pressed', node.dataset.category === category ? 'true' : 'false');
      });
      renderStrip();
      const strip = qs('#strip');
      if (strip) strip.scrollTo({ left: 0, behavior: 'auto' });
    });
    return chip;
  });
  host.replaceChildren(...chips);
  host.hidden = present.length < 2;
}

function renderStrip() {
  const strip = qs('#strip');
  const status = qs('#strip-status');
  if (!strip) return;
  const list = visibleApps();
  const items = list.map((app) => el('li', { class: 'strip__item' }, [buildPoster(app)]));
  items.push(el('li', { class: 'strip__item' }, [buildOpenSeat()]));
  strip.replaceChildren(...items);
  if (status) {
    status.hidden = list.length > 0;
    if (!list.length) status.textContent = t('showing.empty');
  }
  const note = qs('#example-note');
  if (note) note.hidden = !apps.some((app) => app.demo);
  updateStripNav();
}

function updateStripNav() {
  const strip = qs('#strip');
  const previous = qs('#strip-prev');
  const next = qs('#strip-next');
  if (!strip || !previous || !next) return;
  const max = strip.scrollWidth - strip.clientWidth;
  // scrollLeft runs negative in right-to-left layouts.
  const position = Math.abs(strip.scrollLeft);
  previous.disabled = position <= 4;
  next.disabled = position >= max - 4;
}

function initStripNav() {
  const strip = qs('#strip');
  const previous = qs('#strip-prev');
  const next = qs('#strip-next');
  if (!strip || !previous || !next) return;
  const step = (direction) => {
    const sign = document.documentElement.dir === 'rtl' ? -1 : 1;
    strip.scrollBy({
      left: direction * sign * Math.max(240, strip.clientWidth * 0.8),
      behavior: isMotionOff() ? 'auto' : 'smooth',
    });
  };
  previous.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  let ticking = false;
  strip.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        updateStripNav();
      });
    },
    { passive: true },
  );
  window.addEventListener('resize', updateStripNav);
}

/* --------------------------------- dialog -------------------------------- */

function storeLink(app, kind) {
  const link = el(
    'a',
    {
      class: 'btn btn--outline btn--sm',
      attrs: { href: app.links[kind], target: '_blank', rel: 'sponsored noopener noreferrer' },
    },
    [
      el('span', { text: t(`app.${kind}`) }),
      icon('i-external', 16),
      el('span', { class: 'sr-only', text: `(${t('a11y.newTab')})` }),
    ],
  );
  link.addEventListener('click', () => track('Outbound', { app: app.id, target: kind }));
  return link;
}

function fillDialog(app) {
  const poster = el('div', { class: `poster poster--${app.tier}` }, [
    app.poster
      ? el('img', { class: 'poster__img', attrs: { src: app.poster, alt: '', width: 400, height: 600 } })
      : icon(`g-${app.glyph}`, 200, 'poster__glyph'),
    el('span', { class: 'poster__title', text: app.name, attrs: { translate: 'no' } }),
  ]);
  applyPosterColors(poster, app);
  qs('#app-dialog-poster').replaceChildren(poster);

  qs('#app-dialog-badges').replaceChildren(...Array.from(badges(app, { withHeadliner: true }).childNodes));
  qs('#app-dialog-title').textContent = app.name;
  qs('#app-dialog-tagline').textContent = localized(app.tagline);
  qs('#app-dialog-category').textContent = t(`categories.${app.category}`);

  // The extended description is part of the Premiere and Blockbuster tickets.
  const description = app.tier === 'screening' && !app.demo ? '' : localized(app.description);
  qs('#app-dialog-description').textContent = description;
  qs('#app-dialog-about').hidden = !description;

  const kinds = LINK_KINDS.filter((kind) => app.links[kind]);
  qs('#app-dialog-links').replaceChildren(...kinds.map((kind) => storeLink(app, kind)));
  qs('#app-dialog-get').hidden = kinds.length === 0;

  qs('#app-dialog-note').textContent = t(app.demo ? 'app.exampleNote' : 'app.sponsoredNote');
}

function openDialog(app, trigger) {
  if (!dialog) return;
  fillDialog(app);
  dialog.dataset.app = app.id;
  lastTrigger = trigger || document.activeElement;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  const panel = qs('.dialog__panel', dialog);
  if (panel) panel.scrollTop = 0;
  track('Listing', { app: app.id });
}

function closeDialog() {
  if (!dialog) return;
  if (typeof dialog.close === 'function') {
    if (dialog.open) dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
}

function initDialog() {
  dialog = qs('#app-dialog');
  if (!dialog) return;
  qs('#app-dialog-close').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', () => {
    if (lastTrigger && document.contains(lastTrigger) && typeof lastTrigger.focus === 'function') lastTrigger.focus();
    lastTrigger = null;
  });
}

/* -------------------------------- headliner ------------------------------ */

function pickHeadliner() {
  const top = apps.filter((app) => app.tier === 'blockbuster');
  const real = top.filter((app) => !app.demo);
  const pool = real.length ? real : top;
  if (!pool.length) return null;
  // Rotation: every page view picks one of the Blockbuster listings.
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderHeadliner() {
  const chip = qs('#headliner');
  if (!chip) return;
  if (!headliner) {
    chip.hidden = true;
    return;
  }
  qs('#headliner-name').textContent = headliner.name;
  chip.hidden = false;
}

export function getHeadliner() {
  return headliner;
}

/* ---------------------------------- init --------------------------------- */

export async function initShowcase({ onHeadliner } = {}) {
  onHeadlinerChange = onHeadliner || null;
  initDialog();
  initStripNav();

  const status = qs('#strip-status');
  try {
    apps = await loadApps();
  } catch (error) {
    console.error(error);
    if (status) {
      status.hidden = false;
      status.setAttribute('data-i18n', 'showing.error');
      status.textContent = t('showing.error');
    }
    return;
  }
  if (status) status.removeAttribute('data-i18n');

  headliner = pickHeadliner();
  renderFilters();
  renderStrip();
  renderHeadliner();
  if (onHeadlinerChange) onHeadlinerChange(headliner);

  const chip = qs('#headliner');
  if (chip) chip.addEventListener('click', () => headliner && openDialog(headliner, chip));

  onLanguageChange(() => {
    renderFilters();
    renderStrip();
    renderHeadliner();
    if (dialog && dialog.open) {
      const open = apps.find((app) => app.id === dialog.dataset.app);
      if (open) fillDialog(open);
    }
  });
}
