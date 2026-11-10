/* ==========================================================================
   LEGAL — language handling for the legal documents
   Each legal page contains the document in English and in Hebrew.
   Hebrew visitors see the Hebrew text, everyone else sees the English text,
   and visitors using another language get a short note explaining that.
   Without JavaScript both versions are simply shown one after the other.
   ========================================================================== */

import { qs, qsa } from './modules/dom.js';
import { getLanguage, onLanguageChange } from './modules/i18n.js';

function show() {
  const language = getLanguage();
  const wanted = language === 'he' ? 'he' : 'en';
  qsa('[data-doc-lang]').forEach((node) => {
    node.hidden = node.getAttribute('data-doc-lang') !== wanted;
  });
  const notice = qs('#legal-lang-notice');
  if (notice) notice.hidden = language === 'en' || language === 'he';
}

function markCurrent() {
  const here = window.location.pathname.split('/').pop() || 'index.html';
  qsa('.doc-nav a').forEach((link) => {
    if (link.getAttribute('href') === here) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

export function initLegal() {
  markCurrent();
  show();
  onLanguageChange(show);
}
