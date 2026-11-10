/* ==========================================================================
   DELIGHT — the small responses that make the interface feel alive
     - a soft light follows the pointer across buttons, chips and cards
     - primary buttons lean a few pixels towards the pointer ("magnetic")
     - a quiet companion ring trails the cursor and swells over controls
     - numbers can count up when they first come into view
   All of it is decoration: it runs only with a mouse or trackpad, stops when
   animations are paused, and never changes what a control does.
   ========================================================================== */

import { clamp } from './dom.js';
import { isMotionOff, onMotionChange } from './motion.js';

const GLOW = '.btn, .chip, .headliner, .ticket, .rule, .plan-option__box, .invite';
const MAGNET = '.btn--primary, .btn--lg, .btn--xl, .icon-btn--lg, .headliner';
const INTERACTIVE = 'a[href], button, summary, select, input, textarea, label, [role="button"]';

let fine = null;
let magnet = null;
let lastEvent = null;
let frame = 0;

let cursor = null;
let ring = null;
let dot = null;
let cursorFrame = 0;
const pointer = { x: 0, y: 0 };
const trail = { x: 0, y: 0 };

function enabled() {
  return Boolean(fine && fine.matches) && !isMotionOff();
}

function releaseMagnet() {
  if (!magnet) return;
  magnet.style.setProperty('--tx', '0px');
  magnet.style.setProperty('--ty', '0px');
  magnet.classList.remove('is-magnet');
  magnet = null;
}

function update() {
  frame = 0;
  const event = lastEvent;
  if (!event || !enabled()) {
    releaseMagnet();
    return;
  }
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const glow = target.closest(GLOW);
  if (glow) {
    const rect = glow.getBoundingClientRect();
    if (rect.width && rect.height) {
      glow.style.setProperty('--px', `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
      glow.style.setProperty('--py', `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
    }
  }

  const next = target.closest(MAGNET);
  if (next !== magnet) releaseMagnet();
  if (next && !next.disabled) {
    const rect = next.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    next.style.setProperty('--tx', `${clamp(dx * 0.16, -8, 8).toFixed(1)}px`);
    next.style.setProperty('--ty', `${clamp(dy * 0.24, -6, 6).toFixed(1)}px`);
    next.classList.add('is-magnet');
    magnet = next;
  }

  if (cursor) cursor.classList.toggle('is-hover', Boolean(target.closest(INTERACTIVE)));
}

/* ------------------------------ cursor companion --------------------------- */

function moveCursor() {
  cursorFrame = 0;
  if (!cursor) return;
  trail.x += (pointer.x - trail.x) * 0.2;
  trail.y += (pointer.y - trail.y) * 0.2;
  dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
  ring.style.transform = `translate3d(${trail.x.toFixed(1)}px, ${trail.y.toFixed(1)}px, 0)`;
  if (Math.abs(pointer.x - trail.x) > 0.2 || Math.abs(pointer.y - trail.y) > 0.2) {
    cursorFrame = window.requestAnimationFrame(moveCursor);
  }
}

function buildCursor() {
  cursor = document.createElement('div');
  cursor.className = 'cursor';
  cursor.setAttribute('aria-hidden', 'true');
  ring = document.createElement('span');
  ring.className = 'cursor__ring';
  dot = document.createElement('span');
  dot.className = 'cursor__dot';
  cursor.append(ring, dot);
  document.body.append(cursor);
}

/* --------------------------------- count up -------------------------------- */

/**
 * Animate a number from zero to `value`. `format` turns a number into text.
 * With animations paused the final value is written straight away.
 */
export function countUp(node, value, format, duration = 900) {
  if (!node) return;
  if (isMotionOff() || !Number.isFinite(value)) {
    node.textContent = format(value);
    return;
  }
  const start = performance.now();
  const whole = Number.isInteger(value);
  const tick = (now) => {
    const progress = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = whole ? Math.round(value * eased) : value * eased;
    node.textContent = format(progress >= 1 ? value : current);
    if (progress < 1) window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

/* ----------------------------------- init ---------------------------------- */

export function initDelight() {
  try {
    fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  } catch {
    return;
  }

  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return;
      lastEvent = event;
      if (!frame) frame = window.requestAnimationFrame(update);

      if (!enabled()) return;
      if (!cursor) {
        buildCursor();
        trail.x = event.clientX;
        trail.y = event.clientY;
      }
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      cursor.classList.add('is-on');
      if (!cursorFrame) cursorFrame = window.requestAnimationFrame(moveCursor);
    },
    { passive: true },
  );

  document.addEventListener('pointerdown', () => cursor && cursor.classList.add('is-down'), { passive: true });
  document.addEventListener('pointerup', () => cursor && cursor.classList.remove('is-down'), { passive: true });
  document.documentElement.addEventListener('pointerleave', () => {
    releaseMagnet();
    if (cursor) cursor.classList.remove('is-on');
  });
  window.addEventListener('blur', () => {
    releaseMagnet();
    if (cursor) cursor.classList.remove('is-on');
  });

  onMotionChange((off) => {
    if (off) releaseMagnet();
  });
}
