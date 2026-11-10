/* ==========================================================================
   MOTION — one switch for all animation
   Animation is off when the visitor pauses it with the button, or when the
   operating system asks for reduced motion (unless the visitor turned it
   back on here). The state lives in the class "motion-off" on <html>.
   ========================================================================== */

import { read, write } from './store.js';
import { qsa } from './dom.js';
import { t, onLanguageChange } from './i18n.js';

const root = document.documentElement;
const listeners = new Set();
let systemQuery = null;

export function isMotionOff() {
  return root.classList.contains('motion-off');
}

export function onMotionChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function reflect() {
  const off = isMotionOff();
  qsa('.js-motion-toggle').forEach((button) => {
    button.setAttribute('aria-pressed', off ? 'true' : 'false');
    // Icon-only buttons carry their name in aria-label; text buttons show it.
    if (button.hasAttribute('aria-label')) button.setAttribute('aria-label', t('a11y.motionPause'));
  });
}

function apply(off) {
  root.classList.toggle('motion-off', off);
  reflect();
  listeners.forEach((callback) => {
    try {
      callback(off);
    } catch (error) {
      console.error(error);
    }
  });
}

export function initMotion() {
  try {
    systemQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    systemQuery.addEventListener('change', () => {
      // Follow the system only while the visitor has not made a choice here.
      if (!read('site:motion')) apply(systemQuery.matches);
    });
  } catch {
    systemQuery = null;
  }

  qsa('.js-motion-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const off = !isMotionOff();
      write('site:motion', off ? 'off' : 'on');
      apply(off);
    });
  });

  onLanguageChange(reflect);
  reflect();
}
