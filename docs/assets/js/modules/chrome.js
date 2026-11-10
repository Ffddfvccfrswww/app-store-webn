/* ==========================================================================
   CHROME — the parts of the interface shared by every page:
   header state, mobile menu, language picker, scroll reveals, link safety.
   ========================================================================== */

import { qs, qsa, trapFocus } from './dom.js';
import { t, getLanguage, setLanguage, onLanguageChange } from './i18n.js';

const root = document.documentElement;
let releaseTrap = null;
let revealObserver = null;

/* ---------------------------------- header --------------------------------- */

function initHeader() {
  const header = qs('#site-header');
  if (!header) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    },
    { passive: true },
  );
  update();
}

/* ----------------------------------- menu ---------------------------------- */

function setMenu(open) {
  const button = qs('#menu-btn');
  const header = qs('#site-header');
  if (!button || !header) return;
  root.classList.toggle('menu-open', open);
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  button.setAttribute('aria-label', t(open ? 'a11y.menuClose' : 'a11y.menuOpen'));
  if (releaseTrap) {
    releaseTrap();
    releaseTrap = null;
  }
  if (open) releaseTrap = trapFocus(header);
}

function initMenu() {
  const button = qs('#menu-btn');
  const nav = qs('#site-nav');
  if (!button || !nav) return;

  button.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('menu-open')) {
      setMenu(false);
      button.focus();
    }
  });

  const wide = window.matchMedia('(min-width: 981px)');
  wide.addEventListener('change', (event) => {
    if (event.matches) setMenu(false);
  });

  onLanguageChange(() => {
    button.setAttribute('aria-label', t(root.classList.contains('menu-open') ? 'a11y.menuClose' : 'a11y.menuOpen'));
  });
}

/* --------------------------------- language -------------------------------- */

function initLanguagePicker() {
  const select = qs('#lang-select');
  if (!select) return;
  select.value = getLanguage();
  select.addEventListener('change', async () => {
    select.disabled = true;
    try {
      await setLanguage(select.value, { persist: true });
      // Keep shared links honest: drop a stale ?lang= once the visitor chooses.
      const url = new URL(window.location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.delete('lang');
        window.history.replaceState(null, '', url);
      }
    } catch (error) {
      console.error(error);
      select.value = getLanguage();
    } finally {
      select.disabled = false;
    }
  });
  onLanguageChange((code) => {
    select.value = code;
  });
}

/* ---------------------------------- reveals -------------------------------- */

/**
 * Start the scroll reveals. Called once the page is ready to be seen
 * (on the home page: when the film leader has finished).
 */
export function startReveals() {
  if (revealObserver) return;
  const targets = qsa('.reveal, .hero__title, .finale__title');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach((target) => target.classList.add('is-in'));
    return;
  }

  root.classList.add('reveal-on');
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  targets.forEach((target) => revealObserver.observe(target));

  // Anything revealed by keyboard focus must be visible immediately.
  document.addEventListener('focusin', (event) => {
    const hidden = event.target.closest && event.target.closest('.reveal:not(.is-in)');
    if (hidden) hidden.classList.add('is-in');
  });
}

/* ------------------------------- link hygiene ------------------------------ */

function initLinks() {
  // Links that open a new tab never hand the new page a reference to this one.
  qsa('a[target="_blank"]').forEach((link) => {
    link.setAttribute('rel', 'noopener noreferrer');
  });
}

export function initChrome() {
  initHeader();
  initMenu();
  initLanguagePicker();
  initLinks();
}
