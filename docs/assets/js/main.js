/* ==========================================================================
   MAIN — entry point for every page
   ========================================================================== */

import config from './config.js';
import { initI18n } from './modules/i18n.js';
import { initMotion } from './modules/motion.js';
import { initChrome, startReveals } from './modules/chrome.js';
import { initConsent } from './modules/consent.js';
import { initDelight } from './modules/delight.js';

const root = document.documentElement;

function failSafe() {
  root.classList.remove('i18n-pending');
  root.classList.remove('reveal-on');
  const leader = document.getElementById('leader');
  if (leader) leader.classList.add('is-done');
}

async function start() {
  await initI18n(config);
  initMotion();
  initChrome();
  initConsent(config);
  initDelight();

  const page = document.body.dataset.page;
  if (page === 'home') {
    const { initHome } = await import('./home.js');
    await initHome(config);
  } else if (page === 'submit') {
    const { initSubmit } = await import('./submit.js');
    initSubmit(config);
    startReveals();
  } else if (page === 'legal') {
    const { initLegal } = await import('./legal.js');
    initLegal(config);
    startReveals();
  } else {
    startReveals();
  }

  root.classList.add('is-ready');
}

start().catch((error) => {
  console.error(error);
  failSafe();
});

window.addEventListener('error', failSafe, { once: true });
