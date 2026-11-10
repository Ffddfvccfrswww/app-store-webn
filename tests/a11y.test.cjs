#!/usr/bin/env node
/* ==========================================================================
   ACCESSIBILITY TESTS — every page is scanned with axe-core against
   WCAG 2.0 / 2.1 level A and AA, in English, Hebrew (right-to-left) and
   Arabic, on desktop and phone sizes, including the open dialogs, the open
   mobile menu and the filled-in form with its error messages.

   Automated tools find only part of all accessibility problems, so this
   complements — it does not replace — the manual keyboard checks.
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
} = require('./helpers.cjs');

const runner = createRunner('Accessibility tests');
const { test, group } = runner;

const PAGES = ['index.html', 'submit.html', 'thanks.html', '404.html', 'privacy.html', 'terms.html', 'cookies.html', 'refunds.html', 'guidelines.html', 'accessibility.html', 'legal.html'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

(async () => {
  const { chromium } = loadPlaywright();
  const axeSource = require('axe-core').source;
  const mailDir = buildVariant('tests/fixtures/config.mail.js');
  const site = await startServer(DOCS);
  const mail = await startServer(mailDir);
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });

  async function open(base, urlPath, options = {}) {
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1366, height: 820 },
      isMobile: Boolean(options.mobile),
      hasTouch: Boolean(options.mobile),
      // Reduced motion gives a still page, so the scan sees everything in its final state.
      reducedMotion: 'reduce',
      // axe injects its own script; the site's own policy is verified in the other suites.
      bypassCSP: true,
    });
    if (options.consent !== false) await context.addInitScript(CONSENT_DONE);
    const page = await context.newPage();
    await page.goto(`${base.url}/${urlPath}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 20000 });
    await page.waitForTimeout(400);
    return { context, page };
  }

  async function scan(page, label) {
    await page.evaluate(axeSource);
    const result = await page.evaluate(async (tags) => {
      // eslint-disable-next-line no-undef
      const report = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
      return report.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.slice(0, 4).map((node) => `${node.target.join(' ')} — ${node.failureSummary.split('\n').slice(0, 3).join(' ')}`),
      }));
    }, TAGS);
    if (result.length) {
      const lines = result.map((violation) => `[${violation.impact}] ${violation.id}: ${violation.help}\n        ${violation.nodes.join('\n        ')}`);
      throw new Error(`${label}: ${result.length} accessibility violation(s)\n      ${lines.join('\n      ')}`);
    }
  }

  try {
    group('pages');
    for (const file of PAGES) {
      await test(`${file} in English`, async () => {
        const { context, page } = await open(file === 'submit.html' ? mail : site, file);
        await scan(page, file);
        await context.close();
      });
    }

    group('right-to-left');
    for (const code of ['he', 'ar']) {
      for (const file of ['index.html', 'submit.html', 'privacy.html']) {
        await test(`${file} in ${code}`, async () => {
          const { context, page } = await open(file === 'submit.html' ? mail : site, `${file}?lang=${code}`);
          assertEqual(await page.evaluate(() => document.documentElement.dir), 'rtl', 'direction');
          await scan(page, `${file} (${code})`);
          await context.close();
        });
      }
    }

    group('other scripts');
    for (const code of ['ru', 'zh', 'ja', 'de']) {
      await test(`index.html in ${code}`, async () => {
        const { context, page } = await open(site, `index.html?lang=${code}`);
        await scan(page, `index.html (${code})`);
        await context.close();
      });
    }

    group('phone size');
    for (const file of ['index.html', 'submit.html', 'terms.html']) {
      await test(`${file} at 390 pixels`, async () => {
        const { context, page } = await open(file === 'submit.html' ? mail : site, file, { viewport: { width: 390, height: 800 }, mobile: true });
        await scan(page, `${file} (phone)`);
        await context.close();
      });
    }

    group('states');

    await test('the privacy notice and the privacy settings dialog', async () => {
      const { context, page } = await open(site, 'index.html', { consent: false });
      assert(await page.locator('#consent-banner').isVisible(), 'notice not shown');
      await scan(page, 'privacy notice');
      await page.locator('#consent-settings').click();
      await scan(page, 'privacy settings dialog');
      await context.close();
    });

    await test('the app details dialog', async () => {
      const { context, page } = await open(site, 'index.html');
      await page.waitForSelector('#strip .poster');
      await page.locator('#strip .poster').first().click();
      await scan(page, 'app details dialog');
      await context.close();
    });

    await test('the open mobile menu', async () => {
      const { context, page } = await open(site, 'index.html', { viewport: { width: 390, height: 800 }, mobile: true });
      await page.locator('#menu-btn').click();
      await page.locator('#site-nav .nav__link').first().waitFor({ state: 'visible' });
      await scan(page, 'mobile menu');
      await context.close();
    });

    await test('the form with error messages, and the confirmation panel', async () => {
      const { context, page } = await open(mail, 'submit.html');
      await page.locator('#submit-btn').click();
      await scan(page, 'form with errors');
      await page.fill('#f-app-name', 'Test App');
      await page.fill('#f-app-url', 'https://apps.example.com/test');
      await page.selectOption('#f-category', 'tools');
      await page.fill('#f-tagline', 'A tagline.');
      await page.fill('#f-name', 'Dana');
      await page.fill('#f-email', 'dana@example.org');
      await page.check('#f-rights');
      await page.check('#f-terms');
      await page.check('#f-age');
      await page.waitForTimeout(3100);
      await page.locator('#submit-btn').click();
      await page.waitForSelector('#submit-mail:not([hidden])');
      await scan(page, 'confirmation panel');
      await context.close();
    });

    await test('every FAQ answer open', async () => {
      const { context, page } = await open(site, 'index.html');
      await page.evaluate(() => document.querySelectorAll('.faq__item').forEach((item) => item.setAttribute('open', '')));
      await scan(page, 'FAQ open');
      await context.close();
    });
  } finally {
    await browser.close();
    site.stop();
    mail.stop();
    fs.rmSync(mailDir, { recursive: true, force: true });
  }

  process.exit(runner.finish() ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
