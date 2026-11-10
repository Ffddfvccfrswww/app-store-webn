/* ==========================================================================
   BOOT — runs before the page is painted (tiny, no dependencies)
   - marks the document as script-capable
   - picks the language and text direction early, so nothing jumps
   - applies the visitor's motion preference
   - guarantees the page can never stay hidden if a later script fails
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;

  // Browsers without module support get the complete static page instead.
  if (!('noModule' in HTMLScriptElement.prototype)) return;

  root.classList.remove('no-js');
  root.classList.add('js');

  var store = null;
  try {
    store = window.localStorage;
    store.getItem('site:lang');
  } catch (error) {
    store = null;
  }

  var supported = (root.getAttribute('data-langs') || 'en').split(',');
  var rtl = (root.getAttribute('data-rtl') || '').split(',');
  var fallback = root.getAttribute('data-default-lang') || 'en';

  function match(candidate) {
    if (!candidate) return '';
    var lower = String(candidate).toLowerCase();
    if (lower === 'iw') lower = 'he';
    if (supported.indexOf(lower) !== -1) return lower;
    var base = lower.split('-')[0];
    if (base === 'iw') base = 'he';
    return supported.indexOf(base) !== -1 ? base : '';
  }

  var language = '';
  var fromUrl = false;
  try {
    language = match(new URLSearchParams(window.location.search).get('lang'));
    fromUrl = Boolean(language);
  } catch (error) {
    language = '';
  }
  if (!language && store) language = match(store.getItem('site:lang'));
  if (!language) {
    var preferred = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < preferred.length && !language; i += 1) language = match(preferred[i]);
  }
  if (!language) language = fallback;

  root.lang = language;
  root.dir = rtl.indexOf(language) !== -1 ? 'rtl' : 'ltr';
  if (fromUrl) root.setAttribute('data-lang-source', 'url');
  if (language !== 'en') root.classList.add('i18n-pending');

  var motion = store ? store.getItem('site:motion') : null;
  var prefersReduced = false;
  try {
    prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (error) {
    prefersReduced = false;
  }
  if (motion === 'off' || (motion !== 'on' && prefersReduced)) root.classList.add('motion-off');

  // Safety net: whatever happens, reveal the page after a few seconds.
  window.setTimeout(function () {
    root.classList.remove('i18n-pending');
    var leader = document.getElementById('leader');
    if (leader) leader.classList.add('is-done');
  }, 4500);
})();
