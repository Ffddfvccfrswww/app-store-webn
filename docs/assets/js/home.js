/* ==========================================================================
   HOME — directs the film
   - raises the curtain (film leader) and starts the scroll reveals
   - turns the scroll position into camera shots for the 3D stage
   - runs the pinned "production" scene, the HUD timecode and letterbox bars
   - loads the showcase and keeps prices formatted for the visitor's language
   The 3D stage is loaded last and is optional: without WebGL, with data
   saving on, or if anything fails, the page keeps its painted backdrop.
   ========================================================================== */

import { qs, qsa, clamp, smoothstep } from './modules/dom.js';
import { t, formatPrice, getLanguage, isRtl, onLanguageChange } from './modules/i18n.js';
import { isMotionOff, onMotionChange } from './modules/motion.js';
import { startReveals } from './modules/chrome.js';
import { initShowcase, getHeadliner } from './modules/showcase.js';
import { resolveShot, blendShots } from './scene/shots.js';

const root = document.documentElement;
const LEADER_MIN_MS = 1250;
const FILM_SECONDS = 142; // the pretend running time shown in the HUD timecode
const FRAMES_PER_SECOND = 24;

let config = null;
let stage = null;
let marks = [];
let sections = [];
let narrowQuery = null;
let ticking = false;

/* -------------------------------- curtain --------------------------------- */

function raiseCurtain(startedAt) {
  const leader = qs('#leader');
  const finish = () => {
    if (leader) leader.classList.add('is-done');
    startReveals();
  };
  if (!leader || isMotionOff()) {
    finish();
    return;
  }
  const wait = Math.max(0, LEADER_MIN_MS - (performance.now() - startedAt));
  window.setTimeout(finish, wait);
}

/* --------------------------------- prices --------------------------------- */

function renderPrices() {
  for (const plan of config.plans) {
    const node = qs(`[data-plan-price="${plan.id}"]`);
    if (node) node.textContent = formatPrice(plan.price, config.currency);
  }
}

/* ------------------------------ scroll → shots ---------------------------- */

function view() {
  return {
    narrow: narrowQuery ? narrowQuery.matches : false,
    mirror: isRtl() ? -1 : 1,
    aspect: window.innerWidth / Math.max(1, window.innerHeight),
  };
}

function measure() {
  const scrollY = window.scrollY;
  const half = window.innerHeight / 2;
  marks = [];
  for (const node of qsa('[data-shot]')) {
    const rect = node.getBoundingClientRect();
    const top = rect.top + scrollY;
    const name = node.dataset.shot;
    if (rect.height > window.innerHeight) {
      // A tall section holds its shot from the moment it fills the screen
      // until it starts to leave, so the camera only moves between sections.
      marks.push({ name, y: top + half });
      marks.push({ name, y: top + rect.height - half });
    } else {
      marks.push({ name, y: top + rect.height / 2 });
    }
  }
  marks = marks.filter((mark) => Number.isFinite(mark.y)).sort((a, b) => a.y - b.y);

  // The opening shot holds until the page has actually been scrolled.
  if (marks.length) marks[0].y = Math.min(marks[0].y, window.innerHeight / 2);

  sections = qsa('main > section[id]').map((node) => ({
    id: node.id,
    top: node.getBoundingClientRect().top + scrollY,
  }));
  const total = qs('#hud-total');
  if (total) total.textContent = String(sections.length).padStart(2, '0');
}

function sample() {
  const centre = window.scrollY + window.innerHeight / 2;
  const currentView = view();
  if (!marks.length) return resolveShot('hero', currentView);
  if (centre <= marks[0].y) return resolveShot(marks[0].name, currentView);
  const lastMark = marks[marks.length - 1];
  if (centre >= lastMark.y) return resolveShot(lastMark.name, currentView);

  let index = 0;
  while (index < marks.length - 2 && centre >= marks[index + 1].y) index += 1;
  const from = marks[index];
  const to = marks[index + 1];
  const raw = (centre - from.y) / Math.max(1, to.y - from.y);
  // Hold each shot a little before and after the move between them.
  const amount = smoothstep(0.12, 0.88, clamp(raw, 0, 1));
  return blendShots(resolveShot(from.name, currentView), resolveShot(to.name, currentView), amount);
}

function timecode(progress) {
  const totalFrames = Math.round(progress * FILM_SECONDS * FRAMES_PER_SECOND);
  const frames = totalFrames % FRAMES_PER_SECOND;
  const seconds = Math.floor(totalFrames / FRAMES_PER_SECOND);
  const pad = (value) => String(value).padStart(2, '0');
  return `00:${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}:${pad(frames)}`;
}

function updateHud(progress) {
  const tc = qs('#hud-tc');
  if (tc) tc.textContent = timecode(progress);

  const centre = window.scrollY + window.innerHeight / 2;
  let active = 0;
  for (let i = 0; i < sections.length; i += 1) if (sections[i].top <= centre) active = i;
  const scene = qs('#hud-scene');
  if (scene) scene.textContent = String(active + 1).padStart(2, '0');

  // Mark the current section in the navigation for assistive technology and styling.
  const id = sections[active] ? sections[active].id : '';
  qsa('.nav__link').forEach((link) => {
    const hash = link.getAttribute('href').split('#')[1] || '';
    if (hash && hash === id) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}

function updatePin() {
  const pin = qs('#production-pin');
  if (!pin || !root.classList.contains('pin-on')) return;
  const rect = pin.getBoundingClientRect();
  const travel = rect.height - window.innerHeight;
  const progress = travel > 0 ? clamp(-rect.top / travel, 0, 1) : 0;
  const steps = qsa('.step', pin);
  const active = Math.min(steps.length - 1, Math.floor(progress * steps.length * 0.999));
  steps.forEach((step, index) => {
    step.classList.toggle('is-active', index === active);
    step.classList.toggle('is-past', index < active);
  });
  qsa('.pin__dot', pin).forEach((dot, index) => dot.classList.toggle('is-active', index <= active));
}

function update() {
  ticking = false;
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = clamp(window.scrollY / max, 0, 1);
  const shot = sample();

  root.style.setProperty('--progress', progress.toFixed(4));
  root.style.setProperty('--dim', shot.dim.toFixed(3));
  root.style.setProperty('--bars', shot.bars > 0.5 ? '1' : '0');

  updateHud(progress);
  updatePin();
  if (stage) stage.setTarget(shot);
}

function requestUpdate() {
  if (ticking) return;
  ticking = true;
  window.requestAnimationFrame(update);
}

/* ---------------------------------- pin ----------------------------------- */

function syncPinMode() {
  // The pinned scene needs motion; otherwise the four steps are a plain grid.
  root.classList.toggle('pin-on', !isMotionOff());
  if (isMotionOff()) {
    qsa('#production-pin .step').forEach((step) => {
      step.classList.remove('is-past');
      step.classList.add('is-active');
    });
  }
}

/* ------------------------------ in-page links ----------------------------- */

function initAnchors() {
  // "index.html#tickets" on the home page should scroll, not reload.
  document.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[href*="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const url = new URL(link.href, window.location.href);
    const here = new URL(window.location.href);
    const samePage =
      url.origin === here.origin &&
      url.pathname.replace(/index\.html$/, '') === here.pathname.replace(/index\.html$/, '');
    if (!samePage || !url.hash) return;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: isMotionOff() ? 'auto' : 'smooth', block: 'start' });
    window.history.pushState(null, '', url.hash);
    // Move keyboard focus with the view.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

/* --------------------------------- pointer -------------------------------- */

function initPointer() {
  const spot = qs('#fx-spot');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  let x = 0;
  let y = 0;
  window.addEventListener(
    'pointermove',
    (event) => {
      if (!fine.matches || event.pointerType === 'touch') return;
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (spot && !isMotionOff()) {
          spot.style.setProperty('--mx', `${x}px`);
          spot.style.setProperty('--my', `${y}px`);
          spot.classList.add('is-on');
        }
        if (stage) stage.setPointer((x / window.innerWidth) * 2 - 1, (y / window.innerHeight) * 2 - 1);
      });
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    if (spot) spot.classList.remove('is-on');
    if (stage) stage.setPointer(0, 0);
  });
}

/* --------------------------------- 3D stage ------------------------------- */

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

function screenContent() {
  const headliner = getHeadliner();
  return {
    label: t('hero.screenSub'),
    title: headliner && !headliner.demo ? headliner.name : t('hero.screenTitle'),
    colors: headliner && !headliner.demo ? headliner.colors : ['#0f6d80', '#04090d'],
    rtl: isRtl(),
  };
}

async function drawScreenWhenFontsReady() {
  if (!stage) return;
  try {
    const language = getLanguage();
    const family = language === 'he' ? 'Karantina' : language === 'ar' ? 'Rubik' : 'Oswald';
    await Promise.all([document.fonts.load(`600 80px ${family}`, t('hero.screenTitle')), document.fonts.ready]);
  } catch {
    /* draw with whatever font is available */
  }
  if (stage) stage.setScreen(screenContent());
}

async function initStage() {
  const canvas = qs('#stage-canvas');
  const holder = qs('.stage');
  if (!canvas || !holder) return;
  if (navigator.connection && navigator.connection.saveData) return;
  if (!webglAvailable()) return;

  try {
    const { createStage } = await import('./scene/stage.js');
    stage = createStage(canvas, {
      initial: sample(),
      mirror: isRtl() ? -1 : 1,
      narrow: narrowQuery.matches,
      animate: !isMotionOff(),
      onFallback(restored) {
        holder.classList.toggle('is-live', Boolean(restored));
      },
    });
    holder.classList.add('is-live');
    holder.dataset.tier = stage.tier;
    await drawScreenWhenFontsReady();
    requestUpdate();
  } catch (error) {
    // The painted backdrop stays in place; the page is complete without 3D.
    console.warn('3D stage unavailable:', error);
    stage = null;
    holder.classList.remove('is-live');
  }
}

/* ----------------------------------- init --------------------------------- */

export async function initHome(siteConfig) {
  const startedAt = performance.now();
  config = siteConfig;
  narrowQuery = window.matchMedia('(max-width: 860px), (max-aspect-ratio: 9/10)');

  renderPrices();
  syncPinMode();
  initAnchors();
  initPointer();
  measure();
  update();

  window.addEventListener('scroll', requestUpdate, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (stage) {
        stage.setView(view());
        stage.resize();
      }
      measure();
      requestUpdate();
    }, 120);
  });
  narrowQuery.addEventListener('change', () => {
    if (stage) stage.setView(view());
    requestUpdate();
  });

  onLanguageChange(() => {
    renderPrices();
    if (stage) stage.setView(view());
    // Text lengths change with the language, so section positions do too.
    window.requestAnimationFrame(() => {
      measure();
      requestUpdate();
    });
    drawScreenWhenFontsReady();
  });

  onMotionChange((off) => {
    syncPinMode();
    if (stage) stage.setAnimated(!off);
    window.requestAnimationFrame(() => {
      measure();
      requestUpdate();
    });
  });

  // Content first; the showcase and the stage load side by side.
  const showcase = initShowcase({
    onHeadliner() {
      if (stage) stage.setScreen(screenContent());
    },
  }).then(() => {
    measure();
    requestUpdate();
  });

  raiseCurtain(startedAt);
  initStage();

  // Fonts and images can shift the layout after load.
  window.addEventListener('load', () => {
    measure();
    requestUpdate();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      measure();
      requestUpdate();
    });
  }

  await showcase;
}
