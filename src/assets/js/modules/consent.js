/* ==========================================================================
   CONSENT — the privacy notice and the privacy settings dialog
   - Essential storage (language, motion, this choice) is always on.
   - Analytics is the only optional category. It is off until the visitor
     turns it on, and the "reject" path is exactly as easy as "accept".
   - A Global Privacy Control signal from the browser is honoured.
   - The choice is stored on the visitor's device only, together with the
     consent version, so a changed policy asks again.
   ========================================================================== */

import { readJson, writeJson } from './store.js';
import { qs, qsa, announce } from './dom.js';
import { t, applyTranslations } from './i18n.js';
import { loadAnalytics } from './analytics.js';

const KEY = 'site:consent';

let config = null;
let banner = null;
let dialog = null;
let analyticsInput = null;
let lastFocus = null;

function hasOptional() {
  return Boolean(config.analytics && config.analytics.enabled);
}

function gpcActive() {
  return navigator.globalPrivacyControl === true;
}

function currentChoice() {
  const saved = readJson(KEY);
  if (!saved || saved.v !== config.consentVersion) return null;
  return { analytics: saved.analytics === true };
}

function save(choice) {
  const record = {
    v: config.consentVersion,
    analytics: Boolean(choice.analytics) && hasOptional(),
    ts: new Date().toISOString().slice(0, 10),
  };
  writeJson(KEY, record);
  apply(record);
  hideBanner();
  announce(t('consent.saved'));
}

function apply(choice) {
  if (choice && choice.analytics && hasOptional()) loadAnalytics(config);
}

function showBanner() {
  if (!banner) return;
  const optional = hasOptional() && !gpcActive();
  const text = qs('#consent-banner-text', banner);
  text.setAttribute('data-i18n', optional ? 'consent.textFull' : 'consent.textBasic');
  applyTranslations(text);
  qs('#consent-accept', banner).hidden = !optional;
  qs('#consent-reject', banner).hidden = !optional;
  qs('#consent-ok', banner).hidden = optional;
  qs('#consent-banner-gpc', banner).hidden = !(gpcActive() && hasOptional());
  banner.hidden = false;
}

function hideBanner() {
  if (banner) banner.hidden = true;
  // Let the page react (for example the mobile call-to-action dock).
  window.dispatchEvent(new Event('scroll'));
}

function openDialog() {
  if (!dialog) return;
  const choice = currentChoice();
  const optional = hasOptional();
  analyticsInput.disabled = !optional;
  analyticsInput.checked = optional && Boolean(choice && choice.analytics);
  qs('#consent-analytics-none', dialog).hidden = optional;
  qs('#consent-dialog-gpc', dialog).hidden = !(gpcActive() && optional);
  lastFocus = document.activeElement;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function closeDialog() {
  if (!dialog) return;
  if (typeof dialog.close === 'function') {
    if (dialog.open) dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}

export function initConsent(siteConfig) {
  config = siteConfig;
  banner = qs('#consent-banner');
  dialog = qs('#consent-dialog');
  if (!banner || !dialog) return;
  analyticsInput = qs('#consent-analytics', dialog);

  qs('#consent-ok', banner).addEventListener('click', () => save({ analytics: false }));
  qs('#consent-reject', banner).addEventListener('click', () => save({ analytics: false }));
  qs('#consent-accept', banner).addEventListener('click', () => save({ analytics: true }));
  qs('#consent-settings', banner).addEventListener('click', openDialog);
  qsa('.js-consent-open').forEach((button) => button.addEventListener('click', openDialog));

  qs('#consent-close', dialog).addEventListener('click', closeDialog);
  qs('#consent-form', dialog).addEventListener('submit', (event) => {
    event.preventDefault();
    save({ analytics: analyticsInput.checked });
    closeDialog();
  });
  dialog.addEventListener('click', (event) => {
    // A click on the dimmed backdrop (outside the panel) closes without saving.
    if (event.target === dialog) closeDialog();
  });

  const choice = currentChoice();
  if (choice) apply(choice);
  else showBanner();
}
