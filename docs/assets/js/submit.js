/* ==========================================================================
   SUBMIT — the "Submit your app" form

   Where the submission goes depends on site.config.js:
     1. forms.endpoint set      → sent as JSON to that https form service
     2. only contact.email set  → the visitor's own email app opens with the
                                  details filled in (nothing leaves the
                                  browser until they press send themselves)
     3. neither set             → the page says submissions open soon

   Protection
     - every field is validated here before anything is sent
     - links must be https; lengths are capped
     - a hidden "honeypot" field and a minimum fill time stop simple bots
     - the form refuses to work when embedded inside another website
     - no data is stored in the browser
   ========================================================================== */

import { qs, qsa, safeHttpsUrl, announce } from './modules/dom.js';
import { t, formatPrice, getLanguage, onLanguageChange } from './modules/i18n.js';
import { isMotionOff } from './modules/motion.js';
import { track } from './modules/analytics.js';

const MIN_FILL_MS = 3000;
const EMAIL_PATTERN = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;

const FIELDS = [
  { name: 'appName', id: 'f-app-name', label: 'submit.appName', required: true, max: 60 },
  { name: 'appUrl', id: 'f-app-url', label: 'submit.appUrl', required: true, max: 300, type: 'url' },
  { name: 'appUrl2', id: 'f-app-url2', label: 'submit.appUrl2', required: false, max: 300, type: 'url' },
  { name: 'category', id: 'f-category', label: 'submit.category', required: true, max: 40 },
  { name: 'tagline', id: 'f-tagline', label: 'submit.tagline', required: true, max: 120 },
  { name: 'description', id: 'f-description', label: 'submit.description', required: false, max: 600 },
  { name: 'name', id: 'f-name', label: 'submit.name', required: true, max: 80 },
  { name: 'email', id: 'f-email', label: 'submit.email', required: true, max: 254, type: 'email' },
  { name: 'company', id: 'f-company', label: 'submit.company', required: false, max: 100 },
  { name: 'message', id: 'f-message', label: 'submit.message', required: false, max: 1000 },
];
const CHECKS = [
  { name: 'rights', id: 'f-rights' },
  { name: 'terms', id: 'f-terms' },
  { name: 'age', id: 'f-age' },
];

let config = null;
let form = null;
let openedAt = 0;
let sending = false;
let touched = false;
let lastMailto = '';

/* -------------------------------- helpers -------------------------------- */

function mode() {
  if (safeHttpsUrl(config.forms && config.forms.endpoint)) return 'endpoint';
  if (config.contactEmail && EMAIL_PATTERN.test(config.contactEmail)) return 'mail';
  return 'closed';
}

function framed() {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

function value(field) {
  const input = qs(`#${field.id}`);
  // Collapse control characters so pasted text cannot smuggle extra lines into an email header.
  return input ? input.value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
}

function selectedPlan() {
  const checked = qs('input[name="plan"]:checked', form);
  return checked && config.plans.some((plan) => plan.id === checked.value) ? checked.value : '';
}

function setError(input, errorNode, message) {
  if (message) {
    errorNode.textContent = message;
    errorNode.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  } else {
    errorNode.textContent = '';
    errorNode.hidden = true;
    input.removeAttribute('aria-invalid');
  }
}

function fieldProblem(field) {
  const text = value(field);
  if (!text) return field.required ? t('submit.errRequired') : '';
  if (text.length > field.max) return t('submit.errTooLong', { max: field.max });
  if (field.type === 'url' && !safeHttpsUrl(text)) return t('submit.errUrl');
  if (field.type === 'email' && !EMAIL_PATTERN.test(text)) return t('submit.errEmail');
  if (field.name === 'category' && !qs(`#${field.id} option[value="${CSS.escape(text)}"]`)) return t('submit.errRequired');
  return '';
}

function validateField(field) {
  const input = qs(`#${field.id}`);
  const problem = fieldProblem(field);
  setError(input, qs(`#${field.id}-error`), problem);
  return !problem;
}

function validateCheck(check) {
  const input = qs(`#${check.id}`);
  const ok = input.checked;
  setError(input, qs(`#${check.id}-error`), ok ? '' : t('submit.errCheck'));
  return ok;
}

function validatePlan() {
  const ok = Boolean(selectedPlan());
  const error = qs('#plan-error');
  error.textContent = ok ? '' : t('submit.errPlan');
  error.hidden = ok;
  qsa('input[name="plan"]', form).forEach((input) => {
    if (ok) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
  });
  return ok;
}

function validateAll() {
  const invalid = [];
  if (!validatePlan()) invalid.push(qs('input[name="plan"]', form));
  for (const field of FIELDS) if (!validateField(field)) invalid.push(qs(`#${field.id}`));
  for (const check of CHECKS) if (!validateCheck(check)) invalid.push(qs(`#${check.id}`));
  return invalid;
}

function showSummary(message) {
  const box = qs('#form-errors');
  if (!message) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.textContent = message;
  box.hidden = false;
}

function setSending(state) {
  sending = state;
  const button = qs('#submit-btn');
  button.disabled = state;
  qs('#submit-btn-label').textContent = t(state ? 'submit.sending' : 'submit.send');
}

/* ------------------------------- submission ------------------------------ */

function collect() {
  const data = { plan: selectedPlan() };
  for (const field of FIELDS) data[field.name] = value(field);
  data.appUrl = safeHttpsUrl(data.appUrl);
  data.appUrl2 = data.appUrl2 ? safeHttpsUrl(data.appUrl2) : '';
  data.language = getLanguage();
  data.confirmedRights = true;
  data.acceptedTerms = true;
  data.confirmedAge = true;
  return data;
}

function planLabel(id) {
  const plan = config.plans.find((candidate) => candidate.id === id);
  if (!plan) return id;
  return `${t(`tickets.${id}.name`)} — ${formatPrice(plan.price, config.currency)} ${t('tickets.perMonth')}`;
}

function summaryText(data) {
  const lines = [`${t('submit.mailPlan')}: ${planLabel(data.plan)}`];
  for (const field of FIELDS) {
    const text = data[field.name];
    if (!text) continue;
    const label = t(field.label).replace(/\s*\([^)]*\)\s*$/, '');
    const shown = field.name === 'category' ? t(`categories.${text}`) : text;
    lines.push(`${label}: ${shown}`);
  }
  lines.push('');
  lines.push(`[x] ${t('submit.cRights')}`);
  lines.push(`[x] ${t('submit.cTerms').replace(/<\/?\d+>/g, '')}`);
  lines.push(`[x] ${t('submit.cAge')}`);
  return lines.join('\n');
}

function showPanel(id) {
  form.hidden = true;
  const panel = qs(id);
  panel.hidden = false;
  panel.scrollIntoView({ behavior: isMotionOff() ? 'auto' : 'smooth', block: 'start' });
  panel.focus({ preventScroll: true });
}

function showSuccess(data) {
  const plan = config.plans.find((candidate) => candidate.id === data.plan);
  const checkout = plan ? safeHttpsUrl(plan.checkoutUrl) : '';
  const link = qs('#submit-checkout');
  if (checkout) {
    link.href = checkout;
    link.hidden = false;
    link.addEventListener('click', () => track('Checkout', { plan: data.plan }), { once: true });
  }
  qs('#submit-success-pay').hidden = !checkout;
  qs('#submit-success-later').hidden = Boolean(checkout);
  showPanel('#submit-success');
  announce(t('submit.successTitle'));
  track('Submission', { plan: data.plan });
}

function showMail(data) {
  const body = summaryText(data);
  const subject = t('submit.mailSubject', { app: data.appName });
  lastMailto = `mailto:${encodeURIComponent(config.contactEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const address = qs('#submit-mail-address');
  address.textContent = config.contactEmail;
  address.href = `mailto:${encodeURIComponent(config.contactEmail)}`;
  qs('#submit-mail-body').value = `${subject}\n\n${body}`;
  qs('#submit-mail-open').href = lastMailto;
  qs('#submit-mail-pay').hidden = false;
  showPanel('#submit-mail');
  announce(t('submit.mailTitle'));
  track('Submission', { plan: data.plan });

  // Open the visitor's email app. If none is installed, the panel explains what to do.
  window.location.href = lastMailto;
}

async function sendToEndpoint(data) {
  const endpoint = safeHttpsUrl(config.forms.endpoint);
  const payload = {
    ...data,
    subject: t('submit.mailSubject', { app: data.appName }),
    summary: summaryText(data),
  };
  if (config.forms.accessKey) payload.access_key = config.forms.accessKey;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Form service answered ${response.status}`);
  } finally {
    window.clearTimeout(timeout);
  }
}

async function onSubmit(event) {
  event.preventDefault();
  if (sending) return;
  touched = true;
  showSummary('');

  if (framed()) {
    showSummary(t('submit.errFramed'));
    return;
  }

  const invalid = validateAll();
  if (invalid.length) {
    showSummary(t('submit.errSummary'));
    invalid[0].focus();
    return;
  }

  if (performance.now() - openedAt < MIN_FILL_MS) {
    showSummary(t('submit.errTooFast'));
    qs('#form-errors').focus();
    return;
  }

  const data = collect();

  // A filled honeypot means a bot. Answer as if it worked and send nothing.
  if (qs('#f-website').value) {
    showSuccess(data);
    return;
  }

  const current = mode();
  if (current === 'mail') {
    showMail(data);
    return;
  }
  if (current !== 'endpoint') return;

  setSending(true);
  try {
    await sendToEndpoint(data);
    showSuccess(data);
  } catch (error) {
    console.error(error);
    showSummary(t('submit.errNetwork'));
    qs('#form-errors').focus();
  } finally {
    setSending(false);
  }
}

/* ---------------------------------- init --------------------------------- */

function renderPrices() {
  for (const plan of config.plans) {
    const node = qs(`[data-plan-price="${plan.id}"]`);
    if (node) node.textContent = formatPrice(plan.price, config.currency);
  }
}

function preselectPlan() {
  let wanted = '';
  try {
    wanted = new URLSearchParams(window.location.search).get('plan') || '';
  } catch {
    wanted = '';
  }
  const featured = config.plans.find((plan) => plan.featured);
  const id = config.plans.some((plan) => plan.id === wanted) ? wanted : featured ? featured.id : '';
  const input = id ? qs(`input[name="plan"][value="${id}"]`, form) : null;
  if (input) input.checked = true;
}

async function copyDetails() {
  const area = qs('#submit-mail-body');
  const button = qs('#submit-mail-copy');
  let copied = false;
  try {
    await navigator.clipboard.writeText(area.value);
    copied = true;
  } catch {
    area.focus();
    area.select();
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
  }
  if (copied) {
    button.textContent = t('submit.mailCopied');
    announce(t('submit.mailCopied'));
    window.setTimeout(() => {
      button.textContent = t('submit.mailCopy');
    }, 2500);
  }
}

export function initSubmit(siteConfig) {
  config = siteConfig;
  form = qs('#submit-form');
  if (!form) return;
  openedAt = performance.now();

  renderPrices();
  onLanguageChange(() => {
    renderPrices();
    // Re-translate any visible error messages.
    if (touched && !form.hidden) {
      validateAll();
      if (!qs('#form-errors').hidden) showSummary(t('submit.errSummary'));
    }
    if (!sending) qs('#submit-btn-label').textContent = t('submit.send');
  });

  if (framed()) {
    qs('#submit-framed').hidden = false;
    return;
  }

  if (mode() === 'closed') {
    qs('#submit-closed').hidden = false;
    return;
  }

  form.hidden = false;
  preselectPlan();

  form.addEventListener('submit', onSubmit);

  // Once the visitor has tried to send, fix-ups are confirmed as they type.
  for (const field of FIELDS) {
    const input = qs(`#${field.id}`);
    const recheck = () => {
      if (touched || input.getAttribute('aria-invalid') === 'true') validateField(field);
    };
    input.addEventListener('blur', () => {
      if (value(field) || touched) validateField(field);
    });
    input.addEventListener('input', recheck);
    input.addEventListener('change', recheck);
  }
  for (const check of CHECKS) {
    qs(`#${check.id}`).addEventListener('change', () => {
      if (touched) validateCheck(check);
    });
  }
  qsa('input[name="plan"]', form).forEach((input) => {
    input.addEventListener('change', () => {
      if (touched) validatePlan();
    });
  });

  qs('#submit-mail-copy').addEventListener('click', copyDetails);
  qs('#submit-mail-open').addEventListener('click', () => track('Mail', {}));
}
