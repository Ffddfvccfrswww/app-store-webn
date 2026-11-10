/* ==========================================================================
   SHARE — "send an invitation"
   Uses the device's own share sheet when there is one (phones, some desktop
   browsers) and otherwise copies the link. Nothing is sent to us and no
   third-party share widgets are loaded: the visitor's own apps do the sharing.
   ========================================================================== */

import { announce } from './dom.js';
import { t, getLanguage } from './i18n.js';
import { track } from './analytics.js';

/** The public address of the home page, with the current language and optional extras. */
export function shareUrl(config, params = {}) {
  let base;
  if (config.siteUrl) {
    base = new URL(`${config.siteUrl}/`);
  } else {
    base = new URL(window.location.href);
    base.hash = '';
    base.search = '';
    base.pathname = base.pathname.replace(/[^/]*$/, '');
  }
  const language = getLanguage();
  if (language !== config.defaultLanguage) base.searchParams.set('lang', language);
  for (const [key, value] of Object.entries(params)) base.searchParams.set(key, value);
  return base.href;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers: select a temporary field and copy from it.
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.className = 'sr-only';
    document.body.append(field);
    field.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    field.remove();
    return ok;
  }
}

/**
 * Share a link. Returns 'shared', 'copied', 'cancelled' or 'failed'.
 * When the link was copied, the button briefly says so.
 */
export async function share({ title, text, url, button, kind }) {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text, url });
      track('Share', { kind, method: 'sheet' });
      return 'shared';
    } catch (error) {
      if (error && error.name === 'AbortError') return 'cancelled';
      // Fall through to copying the link.
    }
  }

  const copied = await copy(url);
  if (!copied) return 'failed';
  track('Share', { kind, method: 'copy' });
  announce(t('share.copied'));
  if (button) {
    const label = button.querySelector('[data-share-label]') || button;
    const original = label.textContent;
    label.textContent = t('share.copied');
    button.classList.add('is-done');
    window.setTimeout(() => {
      label.textContent = original;
      button.classList.remove('is-done');
    }, 2200);
  }
  return 'copied';
}
