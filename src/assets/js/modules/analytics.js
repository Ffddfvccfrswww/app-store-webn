/* ==========================================================================
   ANALYTICS — optional, off by default, and only ever after consent
   Nothing in this file runs unless:
     1. analytics is switched on in site.config.js, and
     2. the visitor has said yes in the privacy settings.
   The script address comes from the site's own configuration and must be the
   exact https address that the Content-Security-Policy allows.
   ========================================================================== */

import { safeHttpsUrl } from './dom.js';

let loaded = false;
let policy = null;

function trustedScriptUrl(url) {
  // Trusted Types: the only script URL this site will ever load dynamically
  // is the single analytics address from its own configuration.
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    if (!policy) {
      policy = window.trustedTypes.createPolicy('site-loader', {
        createScriptURL(value) {
          const safe = safeHttpsUrl(value);
          if (!safe) throw new TypeError('Blocked script URL');
          return safe;
        },
      });
    }
    return policy.createScriptURL(url);
  }
  return url;
}

export function loadAnalytics(config) {
  if (loaded) return;
  if (!config.analytics || !config.analytics.enabled) return;
  const url = safeHttpsUrl(config.analytics.scriptUrl);
  if (!url) return;
  const script = document.createElement('script');
  script.defer = true;
  if (config.analytics.domain) script.setAttribute('data-domain', String(config.analytics.domain));
  script.src = trustedScriptUrl(url);
  document.head.append(script);
  loaded = true;
}

/** Record an anonymous event (for example an outbound click). Does nothing without consent. */
export function track(name, props) {
  if (!loaded) return;
  try {
    if (typeof window.plausible === 'function') window.plausible(name, props ? { props } : undefined);
  } catch {
    /* analytics must never break the page */
  }
}

export function analyticsLoaded() {
  return loaded;
}
