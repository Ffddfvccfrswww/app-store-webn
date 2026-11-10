#!/usr/bin/env node
/* ==========================================================================
   BROWSER TESTS — the site is opened in a real browser (headless Chromium)
   and used the way a visitor would: pages, languages, privacy choices,
   the showcase, the submission form, keyboard use, small screens, no script.

   Three builds are tested:
     docs/            the site exactly as shipped (operator details not yet set)
     "mail" variant   operator details set; the form opens the visitor's email app
     "endpoint"       a form service and consent-gated analytics configured
   ========================================================================== */

const fs = require('node:fs');
const {
  DOCS,
  CHROMIUM_ARGS,
  CONSENT_DONE,
  assert,
  assertEqual,
  buildVariant,
  createRunner,
  loadPlaywright,
  startServer,
  watchPage,
} = require('./helpers.cjs');

const runner = createRunner('Browser tests');
const { test, group } = runner;

const PAGES = ['index.html', 'submit.html', 'thanks.html', 'privacy.html', 'terms.html', 'cookies.html', 'refunds.html', 'guidelines.html', 'accessibility.html', 'legal.html'];
const LANGUAGES = ['en', 'he', 'ar', 'es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja'];
const DESKTOP = { width: 1366, height: 820 };

(async () => {
  const { chromium } = loadPlaywright();
  const mailDir = buildVariant('tests/fixtures/config.mail.js');
  const endpointDir = buildVariant('tests/fixtures/config.endpoint.js');
  const site = await startServer(DOCS);
  const mail = await startServer(mailDir);
  const endpoint = await startServer(endpointDir);
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });

  /** Open a page in a fresh, isolated browser profile. */
  async function open(base, urlPath, options = {}) {
    const context = await browser.newContext({
      viewport: options.viewport || DESKTOP,
      locale: options.locale || 'en-US',
      reducedMotion: options.reducedMotion || 'no-preference',
      javaScriptEnabled: options.javaScriptEnabled !== false,
      isMobile: Boolean(options.mobile),
      hasTouch: Boolean(options.mobile),
      permissions: options.permissions || [],
    });
    if (options.consent !== false) await context.addInitScript(CONSENT_DONE);
    if (options.init) await context.addInitScript(options.init);
    const page = await context.newPage();
    const problems = watchPage(page, options.allowOrigin || base.url);
    if (options.route) await options.route(context, page);
    await page.goto(`${base.url}/${urlPath}`, { waitUntil: 'load' });
    if (options.javaScriptEnabled !== false) {
      await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 20000 });
    }
    return { context, page, problems };
  }

  const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  try {
    /* ------------------------------------------------------------ every page */
    group('every page');

    for (const file of PAGES) {
      await test(`${file} loads cleanly, with no errors and no third-party requests`, async () => {
        const { context, page, problems } = await open(site, file);
        await page.waitForTimeout(file === 'index.html' ? 2500 : 500);
        assert((await page.locator('h1:visible').count()) >= 1, 'no visible main heading');
        assertEqual(await noOverflow(page), 0, 'horizontal overflow at desktop width');
        assertEqual(problems.join('\n'), '', 'problems reported by the browser');
        await context.close();
      });
    }

    await test('pages fit a 320 pixel wide screen without sideways scrolling', async () => {
      for (const file of ['index.html', 'submit.html', 'privacy.html', 'thanks.html']) {
        const { context, page } = await open(file === 'submit.html' ? mail : site, file, { viewport: { width: 320, height: 640 }, mobile: true });
        await page.waitForTimeout(600);
        assert((await noOverflow(page)) <= 1, `${file} overflows at 320px`);
        await context.close();
      }
    });

    await test('an unknown address returns the 404 page with a 404 status', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const response = await page.goto(`${site.url}/no-such-page.html`);
      assertEqual(response.status(), 404, 'status code');
      assert(await page.locator('.page-code').isVisible(), '404 page not shown');
      await context.close();
    });

    await test('responses carry the security headers', async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const response = await page.goto(`${site.url}/index.html`);
      const headers = response.headers();
      assert(/default-src 'none'/.test(headers['content-security-policy'] || ''), 'CSP header missing');
      assert(/frame-ancestors 'self'/.test(headers['content-security-policy'] || ''), 'frame-ancestors missing');
      assertEqual(headers['x-content-type-options'], 'nosniff', 'X-Content-Type-Options');
      assertEqual(headers['x-frame-options'], 'SAMEORIGIN', 'X-Frame-Options');
      assert(headers['referrer-policy'], 'Referrer-Policy missing');
      assert(headers['permissions-policy'], 'Permissions-Policy missing');
      await context.close();
    });

    /* ------------------------------------------------------------------ home */
    group('home');

    await test('the film leader lifts and the 3D stage starts', async () => {
      const { context, page, problems } = await open(site, 'index.html');
      await page.waitForFunction(() => document.querySelector('#leader').classList.contains('is-done'), null, { timeout: 8000 });
      const live = await page
        .waitForFunction(() => document.querySelector('.stage').classList.contains('is-live'), null, { timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      assert(live, 'the 3D stage did not start (WebGL unavailable in this browser?)');
      assertEqual(problems.join('\n'), '', 'problems');
      await context.close();
    });

    await test('the showcase lists the apps, filters them and opens details', async () => {
      const { context, page, problems } = await open(site, 'index.html');
      await page.waitForSelector('#strip .poster');
      assertEqual(await page.locator('#strip .poster:not(.poster--seat)').count(), 8, 'number of posters');
      assertEqual(await page.locator('#strip .poster--seat').count(), 1, 'open seat card');
      assert(await page.locator('#strip .badge--example').first().isVisible(), 'example badge missing');
      assertEqual(await page.locator('#strip .badge--sponsored').count(), 0, 'example listings must not be labelled as sponsored');
      assert(await page.locator('#example-note').isVisible(), 'example disclaimer missing');

      await page.locator('#filters .chip[data-category="travel"]').click();
      assertEqual(await page.locator('#strip .poster:not(.poster--seat)').count(), 2, 'posters after filtering');
      await page.locator('#filters .chip[data-category="all"]').click();

      const first = page.locator('#strip .poster').first();
      await first.focus();
      await page.keyboard.press('Enter');
      assert(await page.locator('#app-dialog').evaluate((dialog) => dialog.open), 'dialog did not open');
      assertEqual(await page.locator('#app-dialog-title').textContent(), 'Quillfern', 'dialog title');
      assert(await page.locator('#app-dialog-get').isHidden(), 'an example listing must not offer download links');
      await page.keyboard.press('Escape');
      assert(!(await page.locator('#app-dialog').evaluate((dialog) => dialog.open)), 'dialog did not close');
      assert(await first.evaluate((node) => node === document.activeElement), 'focus did not return to the poster');
      assertEqual(problems.join('\n'), '', 'problems');
      await context.close();
    });

    await test('prices, per-day price, open spots and the daily headliner are shown', async () => {
      const { context, page } = await open(site, 'index.html');
      await page.waitForSelector('#strip .poster');
      assertEqual(await page.locator('[data-plan-price="premiere"]').textContent(), '$49', 'price');
      assertEqual(await page.locator('[data-plan-perday="screening"]').textContent(), 'About $0.63 a day', 'per-day price');
      assertEqual(await page.locator('[data-plan-spots="blockbuster"]').textContent(), '5 of 5 spots open', 'open spots');
      assert(await page.locator('[data-plan-spots="screening"]').isHidden(), 'spots must be hidden for unlimited plans');
      assert(await page.locator('#showing-count').isHidden(), 'the app counter must stay hidden while only examples are listed');
      assertEqual(await page.locator('#headliner-name').textContent(), 'Quillfern', 'headliner');
      assert(await page.locator('.ticket.is-featured .ticket__pick').isVisible(), 'featured plan badge');
      await context.close();
    });

    await test('scrolling drives the pinned scene, the HUD and the navigation', async () => {
      const { context, page } = await open(site, 'index.html');
      await page.waitForTimeout(1500);
      assert(await page.evaluate(() => document.documentElement.classList.contains('pin-on')), 'pin mode is off');
      const pin = await page.evaluate(() => {
        const rect = document.querySelector('#production-pin').getBoundingClientRect();
        return { top: rect.top + window.scrollY, height: rect.height };
      });
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), pin.top + pin.height * 0.62);
      await page.waitForTimeout(600);
      const active = await page.locator('#steps .step.is-active').getAttribute('data-step');
      assert(Number(active) >= 2, `expected a later step to be active, got ${active}`);
      assert((await page.locator('#hud-tc').textContent()) !== '00:00:00:00', 'the HUD timecode did not move');

      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('.nav__link[href$="#tickets"]').click();
      await page.waitForFunction(() => Math.abs(document.querySelector('#tickets').getBoundingClientRect().top) < 140, null, { timeout: 8000 });
      assert(page.url().endsWith('#tickets'), 'the address did not update');
      await context.close();
    });

    await test('a shared link opens the listing, and the invitation copies a link', async () => {
      const { context, page } = await open(site, 'index.html?app=tidewake', { permissions: ['clipboard-read', 'clipboard-write'] });
      await page.waitForFunction(() => document.querySelector('#app-dialog').open, null, { timeout: 8000 });
      assertEqual(await page.locator('#app-dialog-title').textContent(), 'Tidewake', 'deep-linked listing');
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        // Desktop Chromium has no share sheet in tests; make sure the copy path is used.
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      });
      await page.locator('#invite-btn').scrollIntoViewIfNeeded();
      await page.locator('#invite-btn').click();
      await page.waitForFunction(() => document.querySelector('#invite-btn').classList.contains('is-done'), null, { timeout: 4000 });
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      assert(copied.startsWith(site.url), `unexpected copied link: ${copied}`);
      await context.close();
    });

    /* ------------------------------------------------------------- languages */
    group('languages');

    await test('all ten languages load, translate the page and set the direction', async () => {
      for (const code of LANGUAGES) {
        const { context, page, problems } = await open(site, `index.html?lang=${code}`, { reducedMotion: 'reduce' });
        const state = await page.evaluate(() => ({
          lang: document.documentElement.lang,
          dir: document.documentElement.dir,
          title: document.querySelector('#hero-title').textContent.trim(),
          untranslated: [...document.querySelectorAll('[data-i18n]')].filter((node) => node.textContent.trim() === node.getAttribute('data-i18n')).length,
          empty: [...document.querySelectorAll('main [data-i18n]')].filter((node) => !node.textContent.trim()).length,
        }));
        assertEqual(state.lang, code, 'html lang');
        assertEqual(state.dir, code === 'he' || code === 'ar' ? 'rtl' : 'ltr', `direction for ${code}`);
        assertEqual(state.untranslated, 0, `${code}: untranslated elements`);
        assertEqual(state.empty, 0, `${code}: empty elements`);
        if (code !== 'en') assert(!/Every app/.test(state.title), `${code}: the headline is still English`);
        assert((await noOverflow(page)) <= 1, `${code}: horizontal overflow`);
        assertEqual(problems.join('\n'), '', `${code}: problems`);
        await context.close();
      }
    });

    await test('the language picker switches language and remembers it', async () => {
      const { context, page } = await open(site, 'index.html');
      await page.selectOption('#lang-select', 'he');
      await page.waitForFunction(() => document.documentElement.lang === 'he');
      assertEqual(await page.evaluate(() => document.documentElement.dir), 'rtl', 'direction');
      assertEqual(await page.locator('[data-plan-spots="blockbuster"]').textContent(), '5 מתוך 5 מקומות פנויים', 'translated dynamic text');
      await page.goto(`${site.url}/terms.html`);
      await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'));
      assertEqual(await page.evaluate(() => document.documentElement.lang), 'he', 'language on the next page');
      assert(await page.locator('article[data-doc-lang="he"]').isVisible(), 'Hebrew document not shown');
      assert(await page.locator('article[data-doc-lang="en"]').isHidden(), 'English document should be hidden');
      await context.close();
    });

    await test('the browser language is respected, and legal pages explain their languages', async () => {
      const { context, page } = await open(site, 'privacy.html', { locale: 'fr-FR' });
      assertEqual(await page.evaluate(() => document.documentElement.lang), 'fr', 'detected language');
      assert(await page.locator('#legal-lang-notice').isVisible(), 'language notice missing');
      assert(await page.locator('article[data-doc-lang="en"]').isVisible(), 'English document not shown');
      await context.close();
    });

    /* --------------------------------------------------------------- privacy */
    group('privacy');

    await test('the first visit stores nothing until the visitor answers the notice', async () => {
      const { context, page } = await open(site, 'index.html', { consent: false });
      assert(await page.locator('#consent-banner').isVisible(), 'privacy notice not shown');
      assert(await page.locator('#consent-ok').isVisible(), 'the simple notice should offer one button');
      assert(await page.locator('#consent-accept').isHidden(), 'no accept button is needed without optional storage');
      assertEqual(await page.evaluate(() => window.localStorage.length), 0, 'storage before any choice');
      assertEqual((await context.cookies()).length, 0, 'cookies');
      await page.locator('#consent-ok').click();
      assert(await page.locator('#consent-banner').isHidden(), 'notice still visible');
      const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('site:consent')));
      assertEqual(stored.analytics, false, 'analytics choice');
      await page.reload();
      await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'));
      assert(await page.locator('#consent-banner').isHidden(), 'notice shown again after reload');
      assertEqual((await context.cookies()).length, 0, 'cookies after use');
      await context.close();
    });

    await test('the privacy settings dialog opens from the footer and saves', async () => {
      const { context, page } = await open(site, 'privacy.html');
      await page.locator('.js-consent-open').click();
      assert(await page.locator('#consent-dialog').evaluate((dialog) => dialog.open), 'settings did not open');
      assert(await page.locator('#consent-analytics').isDisabled(), 'analytics switch must be disabled when unused');
      assert(await page.locator('#consent-analytics-none').isVisible(), '"not in use" note missing');
      await page.locator('#consent-save').click();
      assert(!(await page.locator('#consent-dialog').evaluate((dialog) => dialog.open)), 'settings did not close');
      await context.close();
    });

    await test('analytics never loads without consent, and loads after it', async () => {
      const requests = [];
      const route = async (context) => {
        await context.route('https://stats.example.com/**', (request) => {
          requests.push(request.request().url());
          request.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.plausible = function () {};' });
        });
      };
      const first = await open(endpoint, 'privacy.html', { consent: false, route, allowOrigin: 'http' });
      assert(await first.page.locator('#consent-accept').isVisible(), 'accept button missing');
      assert(await first.page.locator('#consent-reject').isVisible(), 'reject button missing');
      await first.page.waitForTimeout(500);
      assertEqual(requests.length, 0, 'analytics requested before consent');
      await first.page.locator('#consent-reject').click();
      await first.page.waitForTimeout(400);
      assertEqual(requests.length, 0, 'analytics requested after rejecting');
      await first.context.close();

      const second = await open(endpoint, 'privacy.html', { consent: false, route, allowOrigin: 'http' });
      await second.page.locator('#consent-accept').click();
      await second.page.waitForFunction(() => typeof window.plausible === 'function', null, { timeout: 5000 });
      assertEqual(requests.length, 1, 'analytics requests after accepting');
      await second.context.close();
    });

    await test('a Global Privacy Control signal keeps optional storage off', async () => {
      const init = () => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true });
      const { context, page } = await open(endpoint, 'privacy.html', { consent: false, init });
      assert(await page.locator('#consent-accept').isHidden(), 'accept button must not be offered');
      assert(await page.locator('#consent-banner-gpc').isVisible(), 'GPC note missing');
      await context.close();
    });

    /* ---------------------------------------------------------------- motion */
    group('motion');

    await test('the pause button stops animation and the choice is remembered', async () => {
      const { context, page } = await open(site, 'index.html');
      await page.waitForTimeout(1600);
      await page.locator('.site-header .js-motion-toggle').click();
      assert(await page.evaluate(() => document.documentElement.classList.contains('motion-off')), 'motion still on');
      assertEqual(await page.locator('.site-header .js-motion-toggle').getAttribute('aria-pressed'), 'true', 'aria-pressed');
      assert(!(await page.evaluate(() => document.documentElement.classList.contains('pin-on'))), 'pinned scene should be off');
      assertEqual(await page.locator('#steps .step.is-active').count(), 4, 'all steps should be readable');
      await page.reload();
      await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'));
      assert(await page.evaluate(() => document.documentElement.classList.contains('motion-off')), 'choice not remembered');
      await context.close();
    });

    await test('the system "reduce motion" setting is respected', async () => {
      const { context, page } = await open(site, 'index.html', { reducedMotion: 'reduce' });
      assert(await page.evaluate(() => document.documentElement.classList.contains('motion-off')), 'motion should be off');
      assert(await page.locator('#leader').isHidden(), 'the film leader should not play');
      await context.close();
    });

    /* ------------------------------------------------------------- no script */
    group('without JavaScript');

    await test('the home page is complete and readable', async () => {
      const { context, page } = await open(site, 'index.html', { javaScriptEnabled: false });
      assert(await page.locator('#hero-title').isVisible(), 'headline hidden');
      assert(await page.locator('#leader').isHidden(), 'film leader covers the page');
      assert(await page.locator('#plan-premiere-name').isVisible(), 'tickets hidden');
      assertEqual((await page.locator('[data-plan-price="premiere"]').textContent()).trim(), '$49', 'static price');
      assertEqual(await page.locator('#steps .step:visible').count(), 4, 'steps hidden');
      assert((await page.locator('.faq__q').first().textContent()).trim().length > 5, 'FAQ empty');
      assert(await page.locator('.site-footer__disclosure').isVisible(), 'advertising disclosure hidden');
      await context.close();
    });

    await test('legal pages show both languages', async () => {
      const { context, page } = await open(site, 'privacy.html', { javaScriptEnabled: false });
      assert(await page.locator('article[data-doc-lang="en"]').isVisible(), 'English hidden');
      assert(await page.locator('article[data-doc-lang="he"]').isVisible(), 'Hebrew hidden');
      await context.close();
    });

    /* ------------------------------------------------------------------ form */
    group('submission form');

    await test('before the operator sets a contact address, the form stays closed', async () => {
      const { context, page } = await open(site, 'submit.html');
      assert(await page.locator('#submit-closed').isVisible(), 'closed notice missing');
      assert(await page.locator('#submit-form').isHidden(), 'form should be hidden');
      await context.close();
    });

    const fill = async (page) => {
      await page.fill('#f-app-name', 'Test App');
      await page.fill('#f-app-url', 'https://apps.example.com/test-app');
      await page.selectOption('#f-category', 'tools');
      await page.fill('#f-tagline', 'A tagline for testing.');
      await page.fill('#f-name', 'Dana Tester');
      await page.fill('#f-email', 'dana@example.org');
      await page.check('#f-rights');
      await page.check('#f-terms');
      await page.check('#f-age');
    };

    await test('validation explains every problem and moves focus to the first one', async () => {
      const { context, page, problems } = await open(mail, 'submit.html?plan=blockbuster');
      assert(await page.locator('#submit-form').isVisible(), 'form hidden');
      assert(await page.locator('input[name="plan"][value="blockbuster"]').isChecked(), 'plan from the link not selected');
      await page.locator('#submit-btn').click();
      assert(await page.locator('#form-errors').isVisible(), 'summary missing');
      assertEqual(await page.locator('#f-app-name').getAttribute('aria-invalid'), 'true', 'aria-invalid');
      assert(await page.locator('#f-app-name-error').isVisible(), 'field message missing');
      assert(await page.locator('#f-app-name').evaluate((node) => node === document.activeElement), 'focus not on the first problem');
      await page.fill('#f-app-url', 'http://insecure.example.com');
      await page.locator('#f-app-url').blur();
      assert(/https/.test(await page.locator('#f-app-url-error').textContent()), 'insecure link accepted');
      await page.fill('#f-email', 'not-an-email');
      await page.locator('#f-email').blur();
      assert(await page.locator('#f-email-error').isVisible(), 'bad email accepted');
      assertEqual(problems.join('\n'), '', 'problems');
      await context.close();
    });

    await test('the progress bar fills as the form is completed', async () => {
      const { context, page } = await open(mail, 'submit.html');
      const before = Number(await page.locator('#form-progress-bar').getAttribute('aria-valuenow'));
      await fill(page);
      const after = Number(await page.locator('#form-progress-bar').getAttribute('aria-valuenow'));
      assert(before < 20, `progress should start low, got ${before}`);
      assertEqual(after, 100, 'progress when complete');
      await context.close();
    });

    await test('a complete submission opens the email app with the details', async () => {
      const { context, page } = await open(mail, 'submit.html?plan=screening');
      await fill(page);
      await page.locator('#submit-btn').click();
      assert(await page.locator('#form-errors').isVisible(), 'the "too fast" guard did not trigger');
      await page.waitForTimeout(3100);
      await page.locator('#submit-btn').click();
      await page.waitForSelector('#submit-mail:not([hidden])');
      const href = await page.locator('#submit-mail-open').getAttribute('href');
      assert(href.startsWith('mailto:hello%40example.com?subject='), `unexpected mail link: ${href.slice(0, 60)}`);
      const body = decodeURIComponent(href);
      for (const part of ['Test App', 'https://apps.example.com/test-app', 'dana@example.org', 'Screening']) {
        assert(body.includes(part), `mail body is missing "${part}"`);
      }
      assert(await page.locator('#submit-form').isHidden(), 'form still visible');
      await context.close();
    });

    await test('with a form service: the data is posted once and checkout is offered', async () => {
      const posts = [];
      const route = async (context) => {
        await context.route('https://forms.example.com/**', (request) => {
          posts.push({ method: request.request().method(), body: request.request().postData() });
          request.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' });
        });
      };
      const { context, page } = await open(endpoint, 'submit.html?plan=premiere', { route, allowOrigin: 'http' });
      await fill(page);
      await page.waitForTimeout(3100);
      await page.locator('#submit-btn').click();
      await page.waitForSelector('#submit-success:not([hidden])');
      const sent = posts.filter((post) => post.method === 'POST');
      assertEqual(sent.length, 1, 'number of posts');
      const payload = JSON.parse(sent[0].body);
      assertEqual(payload.appName, 'Test App', 'app name');
      assertEqual(payload.plan, 'premiere', 'plan');
      assertEqual(payload.email, 'dana@example.org', 'email');
      assertEqual(payload.access_key, 'test-public-key', 'access key');
      assertEqual(await page.locator('#submit-checkout').getAttribute('href'), 'https://checkout.example.com/premiere', 'checkout link');
      assert(await page.locator('#submit-success-pay').isVisible(), 'payment note missing');
      await context.close();
    });

    await test('with a form service: a failure is reported and nothing is lost', async () => {
      const route = async (context) => {
        await context.route('https://forms.example.com/**', (request) => request.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: 'error' }));
      };
      const context = await browser.newContext({ viewport: DESKTOP });
      await context.addInitScript(CONSENT_DONE);
      await route(context);
      const page = await context.newPage();
      await page.goto(`${endpoint.url}/submit.html`);
      await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'));
      await fill(page);
      await page.waitForTimeout(3100);
      await page.locator('#submit-btn').click();
      await page.waitForSelector('#form-errors:not([hidden])');
      assert(await page.locator('#submit-form').isVisible(), 'form disappeared');
      assertEqual(await page.inputValue('#f-app-name'), 'Test App', 'typed data lost');
      assert(!(await page.locator('#submit-btn').isDisabled()), 'button left disabled');
      await context.close();
    });

    await test('a bot that fills the hidden field is not sent anywhere', async () => {
      const posts = [];
      const route = async (context) => {
        await context.route('https://forms.example.com/**', (request) => {
          posts.push(1);
          request.fulfill({ status: 200, body: '{}' });
        });
      };
      const { context, page } = await open(endpoint, 'submit.html', { route, allowOrigin: 'http' });
      await fill(page);
      await page.evaluate(() => {
        document.querySelector('#f-website').value = 'https://spam.example';
      });
      await page.waitForTimeout(3100);
      await page.locator('#submit-btn').click();
      await page.waitForSelector('#submit-success:not([hidden])');
      assertEqual(posts.length, 0, 'spam was posted');
      await context.close();
    });

    await test('the form refuses to work inside a frame', async () => {
      // 1. Hosts that send our headers: the browser itself refuses to show the page in a foreign frame.
      const blocked = await browser.newContext({ viewport: DESKTOP });
      const outer = await blocked.newPage();
      await outer.setContent(`<iframe id="probe" src="${mail.url}/submit.html" width="900" height="700"></iframe>`);
      await outer.waitForTimeout(1200);
      const framedUrl = outer.frames().find((frame) => frame !== outer.mainFrame());
      const rendered = framedUrl ? await framedUrl.locator('#submit-form').count().catch(() => 0) : 0;
      assertEqual(rendered, 0, 'the page was rendered inside a foreign frame despite the headers');
      await blocked.close();

      // 2. Hosts that cannot send headers (for example GitHub Pages): the script notices and locks the form.
      const context = await browser.newContext({ viewport: DESKTOP });
      await context.route(`${mail.url}/submit.html`, async (route) => {
        const response = await route.fetch();
        const headers = { ...response.headers() };
        delete headers['x-frame-options'];
        delete headers['content-security-policy'];
        await route.fulfill({ response, headers });
      });
      const page = await context.newPage();
      await page.setContent(`<iframe id="probe" src="${mail.url}/submit.html" width="900" height="700"></iframe>`);
      const frame = page.frameLocator('#probe');
      await frame.locator('#submit-framed').waitFor({ state: 'visible', timeout: 8000 });
      assert(await frame.locator('#submit-form').isHidden(), 'form usable inside a frame');
      await context.close();
    });

    /* ------------------------------------------------------- keyboard + mobile */
    group('keyboard and small screens');

    await test('the skip link is the first stop and jumps to the content', async () => {
      const { context, page } = await open(site, 'terms.html');
      await page.keyboard.press('Tab');
      assert(await page.locator('.skip-link').evaluate((node) => node === document.activeElement), 'skip link is not first');
      await page.keyboard.press('Enter');
      assert(await page.evaluate(() => window.location.hash === '#main'), 'did not jump to the content');
      await context.close();
    });

    await test('the mobile menu opens, traps focus and closes with Escape', async () => {
      const { context, page } = await open(site, 'index.html', { viewport: { width: 390, height: 800 }, mobile: true, reducedMotion: 'reduce' });
      await page.locator('#menu-btn').click();
      assertEqual(await page.locator('#menu-btn').getAttribute('aria-expanded'), 'true', 'aria-expanded');
      await page.locator('#site-nav .nav__link').first().waitFor({ state: 'visible', timeout: 3000 });
      const box = await page.locator('#site-nav').boundingBox();
      assert(box.height > 600, `the menu should fill the screen, got a height of ${box.height}`);
      await page.keyboard.press('Escape');
      assertEqual(await page.locator('#menu-btn').getAttribute('aria-expanded'), 'false', 'menu still open');
      await context.close();

      // The same on an inner page, after scrolling (the header has a frosted background there).
      const inner = await open(site, 'terms.html', { viewport: { width: 390, height: 800 }, mobile: true, reducedMotion: 'reduce' });
      await inner.page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
      await inner.page.locator('#menu-btn').click();
      await inner.page.locator('#site-nav .nav__link').first().waitFor({ state: 'visible', timeout: 3000 });
      const innerBox = await inner.page.locator('#site-nav').boundingBox();
      assert(innerBox.height > 600, `the menu on inner pages should fill the screen, got ${innerBox.height}`);
      await inner.context.close();
    });

    await test('on phones a call-to-action dock appears after the opening shot', async () => {
      const { context, page } = await open(site, 'index.html', { viewport: { width: 390, height: 800 }, mobile: true });
      await page.waitForTimeout(1500);
      assert(await page.locator('#dock').isHidden(), 'dock visible at the top');
      await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 2.2, behavior: 'instant' }));
      await page.waitForFunction(() => !document.querySelector('#dock').hidden, null, { timeout: 5000 });
      await context.close();
    });
  } finally {
    await browser.close();
    site.stop();
    mail.stop();
    endpoint.stop();
    fs.rmSync(mailDir, { recursive: true, force: true });
    fs.rmSync(endpointDir, { recursive: true, force: true });
  }

  process.exit(runner.finish() ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
