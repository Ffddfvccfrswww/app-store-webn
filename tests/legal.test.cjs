#!/usr/bin/env node
/* ==========================================================================
   COMPLIANCE TESTS — בדיקות עמידה בדרישות החוק
   These tests check the concrete things that keep a website like this out
   of legal trouble: honest advertising, clear disclosure, valid consent,
   complete legal documents, respect for other people's trademarks, and
   promises on the page that match the written policies.

   They cannot prove that nobody will ever sue. They prove that the usual
   reasons for a claim are not present, and they fail as soon as a later
   change introduces one. A lawyer's review is still recommended.
   ========================================================================== */

const fs = require('node:fs');
const path = require('node:path');
const {
  ROOT,
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

const runner = createRunner('Compliance tests');
const { test, group } = runner;

const read = (file) => fs.readFileSync(file, 'utf8');
const LANGUAGES = ['en', 'he', 'ar', 'es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja'];
const LEGAL = ['privacy.html', 'terms.html', 'cookies.html', 'refunds.html', 'guidelines.html', 'accessibility.html', 'legal.html'];
const PAGES = fs.readdirSync(DOCS).filter((file) => file.endsWith('.html'));

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function flatten(object, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (value && typeof value === 'object') Object.assign(out, flatten(value, `${prefix}${key}.`));
    else out[`${prefix}${key}`] = value;
  }
  return out;
}

const dictionaries = Object.fromEntries(LANGUAGES.map((code) => [code, flatten(JSON.parse(read(path.join(ROOT, 'src', 'i18n', `${code}.json`))))]));
const english = dictionaries.en;
const html = Object.fromEntries(PAGES.map((file) => [file, read(path.join(DOCS, file))]));
const scripts = walk(path.join(ROOT, 'src', 'assets', 'js')).filter((file) => file.endsWith('.js'));
const scriptSource = scripts.map(read).join('\n');

/** The English or Hebrew half of a legal page. */
function article(file, language) {
  const match = html[file].match(new RegExp(`<article class="doc" lang="${language}"[\\s\\S]*?</article>`));
  assert(match, `${file}: ${language} document not found`);
  return match[0];
}

(async () => {
  /* ----------------------------------------------------------------------
     1. Honest advertising  (unfair commercial practices, FTC rules,
        Israeli Consumer Protection Law: no misleading statements)
     ---------------------------------------------------------------------- */
  group('honest advertising');

  await test('no invented numbers of users, downloads, ratings or reviews', () => {
    const pattern = /\d[\d.,]*\s*(?:\+|k|m|million|thousand|billion)?\s*(?:happy\s+)?(?:users|downloads|installs|customers|clients|reviews|ratings|developers|publishers|apps listed)\b/i;
    for (const [key, text] of Object.entries(english)) assert(!pattern.test(text), `"${key}" states a number that cannot be proven: ${text}`);
    for (const [file, source] of Object.entries(html)) {
      assert(!/testimonial|★★★|⭐|aggregateRating|"@type":\s*"Review"/i.test(source), `${file} contains a testimonial, star rating or review markup`);
    }
  });

  await test('no superlatives or promises that cannot be proven', () => {
    const banned = [/#\s?1\b/, /\bnumber one\b/i, /\bthe best\b/i, /\bbest app/i, /\bguaranteed\b/i, /\brisk[- ]free\b/i, /\binstant results\b/i, /\bgo viral\b/i, /\bskyrocket/i, /\b100\s?%/, /\bdouble your\b/i];
    for (const [key, text] of Object.entries(english)) {
      for (const pattern of banned) assert(!pattern.test(text), `"${key}" makes a claim that cannot be proven: ${text}`);
    }
  });

  await test('no false urgency: no countdown offers, "only today" or "last chance" wording', () => {
    const banned = [/\bonly today\b/i, /\blast chance\b/i, /\bhurry\b/i, /\bact now\b/i, /\blimited[- ]time\b/i, /\boffer ends\b/i, /\bexpires in\b/i, /\bselling fast\b/i, /\bpeople are viewing\b/i, /\bjust (?:bought|signed up)\b/i];
    for (const [key, text] of Object.entries(english)) {
      for (const pattern of banned) assert(!pattern.test(text), `"${key}" uses pressure wording: ${text}`);
    }
    assert(!/deadline|countdownTo|offerEnds|fakeCount|Math\.random\(\)\s*\*\s*\d+\s*\)\s*\+\s*\d+\s*;?\s*\/\/\s*viewers/i.test(scriptSource), 'scripts contain a countdown or invented counter');
  });

  await test('scarcity and social proof are computed from the real listings only', () => {
    const home = read(path.join(ROOT, 'src', 'assets', 'js', 'home.js'));
    assert(/plan\.slots - realCount\(plan\.id\)/.test(home), 'open spots must be calculated from real listings');
    assert(/total < 3/.test(home), 'the listing counter must stay hidden until there are real listings');
    const showcase = read(path.join(ROOT, 'src', 'assets', 'js', 'modules', 'showcase.js'));
    assert(/filter\(\(app\) => !app\.demo/.test(showcase), 'example listings must not be counted as real ones');
  });

  await test('the site says plainly that results are not guaranteed', () => {
    assert(/do not guarantee/i.test(english['tickets.taxNote']), 'the pricing note must say that results are not guaranteed');
    assert(/^No\b/.test(english['faq.a7']), 'the FAQ must answer "Do you guarantee downloads?" with a clear no');
    assert(/We do not guarantee results/.test(article('terms.html', 'en')), 'Terms: "no guarantee of results" clause missing');
    assert(/איננו מבטיחים תוצאות/.test(article('terms.html', 'he')), 'Terms (Hebrew): "no guarantee of results" clause missing');
  });

  /* ----------------------------------------------------------------------
     2. Advertising disclosure  (paid placements must be recognisable)
     ---------------------------------------------------------------------- */
  group('advertising disclosure');

  await test('every page states that listings are paid advertisements', () => {
    for (const [file, source] of Object.entries(html)) {
      assert(source.includes('Listings on this site are paid advertisements.'), `${file}: disclosure missing`);
    }
  });

  await test('real listings are labelled "Sponsored"; examples are labelled "Example" and say so', () => {
    const showcase = read(path.join(ROOT, 'src', 'assets', 'js', 'modules', 'showcase.js'));
    assert(/badge--sponsored/.test(showcase) && /showing\.sponsored/.test(showcase), 'sponsored badge missing');
    assert(/rel: 'sponsored noopener noreferrer'/.test(showcase), 'paid links must carry rel="sponsored"');
    for (const code of LANGUAGES) {
      assert(dictionaries[code]['showing.sponsored'].trim().length > 0, `${code}: sponsored label empty`);
      assert(dictionaries[code]['showing.exampleNote'].trim().length > 20, `${code}: example disclaimer missing`);
      assert(dictionaries[code]['app.sponsoredNote'].includes('{brand}'), `${code}: sponsored note incomplete`);
    }
  });

  await test('example listings are fictitious and do not use well-known brand names', () => {
    const famous = /\b(whatsapp|instagram|tiktok|facebook|youtube|spotify|netflix|uber|telegram|snapchat|twitter|gmail|waze|duolingo|tinder|airbnb|amazon|paypal|zoom|notion|slack|discord|pinterest|linkedin|shazam|canva)\b/i;
    const data = JSON.parse(read(path.join(DOCS, 'assets', 'data', 'apps.json')));
    for (const app of data.apps) {
      assert(!famous.test(app.name), `listing "${app.name}" uses a well-known brand name`);
      if (app.demo) assert(!app.links || Object.keys(app.links).length === 0, `${app.id}: an example must not link anywhere`);
      else assert(app.links && Object.values(app.links).every((link) => /^https:\/\//.test(link)), `${app.id}: real listings need https links`);
    }
  });

  /* ----------------------------------------------------------------------
     3. Other people's trademarks and copyright
     ---------------------------------------------------------------------- */
  group('trademarks and copyright');

  await test('no store badges or third-party logos are used as images', () => {
    // "apple-touch-icon.png" is the standard file name for this site's own home-screen icon.
    const own = new Set(['apple-touch-icon.png']);
    const images = walk(path.join(DOCS, 'assets', 'img')).concat(walk(path.join(DOCS, 'assets', 'apps')));
    for (const file of images) {
      const name = path.basename(file);
      if (own.has(name)) continue;
      assert(!/apple|google|play|app-?store|badge/i.test(name), `${name} looks like a third-party badge`);
    }
    for (const [file, source] of Object.entries(html)) assert(!/<img\b/i.test(source), `${file} embeds an image that needs a rights check`);
  });

  await test('every page carries the trademark notice and the independence statement', () => {
    for (const [file, source] of Object.entries(html)) {
      assert(/Apple and App Store are trademarks of Apple Inc\./.test(source), `${file}: Apple notice missing`);
      assert(/Google Play is a trademark of Google LLC\./.test(source), `${file}: Google notice missing`);
      assert(/not affiliated with, sponsored by or endorsed by Apple, Google/.test(source), `${file}: independence statement missing`);
    }
  });

  await test('open-source components are credited and their licences are published', () => {
    const notice = article('legal.html', 'en');
    for (const name of ['three.js', 'Oswald', 'Rubik', 'Karantina']) assert(notice.includes(name), `Legal Notice does not credit ${name}`);
    for (const file of ['assets/vendor/three/LICENSE', 'assets/fonts/LICENSE-Oswald.txt', 'assets/fonts/LICENSE-Rubik.txt', 'assets/fonts/LICENSE-Karantina.txt']) {
      assert(fs.existsSync(path.join(DOCS, file)), `missing ${file}`);
    }
  });

  await test('publishers must confirm their rights, and the terms hold them to it', () => {
    assert(/own this app or am authorised/.test(english['submit.cRights']), 'rights confirmation wording');
    const terms = article('terms.html', 'en');
    for (const id of ['publisher', 'licence', 'indemnity']) assert(terms.includes(`id="${id}"`), `Terms: section "${id}" missing`);
    const guidelines = article('guidelines.html', 'en');
    assert(guidelines.includes('id="ip"') && /counter-notice/.test(guidelines), 'notice-and-takedown procedure missing');
    assert(/repeatedly/.test(guidelines), 'repeat-infringer policy missing');
  });

  /* ----------------------------------------------------------------------
     4. Legal documents  (complete, in both languages, linked everywhere)
     ---------------------------------------------------------------------- */
  group('legal documents');

  const REQUIRED = {
    'privacy.html': ['who', 'what', 'why', 'sharing', 'transfers', 'retention', 'rights', 'children', 'security', 'changes', 'contact'],
    'terms.html': ['agreement', 'eligibility', 'service', 'review', 'publisher', 'fees', 'cancellation', 'removal', 'ads', 'disclaimer', 'liability', 'indemnity', 'changes', 'law', 'contact'],
    'cookies.html': ['essential', 'analytics', 'none', 'control'],
    'refunds.html': ['cancel', 'guarantee', 'always', 'not', 'how', 'consumer'],
    'guidelines.html': ['accept', 'refuse', 'listing', 'label', 'process', 'report', 'ip'],
    'accessibility.html': ['commitment', 'features', 'limits', 'testing', 'feedback', 'enforcement'],
    'legal.html': ['operator', 'contacts', 'advertising', 'trademarks', 'links', 'security', 'disputes', 'credits'],
  };

  await test('each document contains every required section, in English and in Hebrew', () => {
    for (const [file, ids] of Object.entries(REQUIRED)) {
      const en = article(file, 'en');
      const he = article(file, 'he');
      for (const id of ids) {
        assert(en.includes(`id="${id}"`), `${file} (English): section "${id}" missing`);
        assert(he.includes(`id="${id}-he"`), `${file} (Hebrew): section "${id}" missing`);
      }
      const count = (text) => (text.match(/<h2\b/g) || []).length;
      assertEqual(count(he), count(en), `${file}: the Hebrew and English versions must have the same sections`);
      assert(/Last updated: \d{4}-\d{2}-\d{2}/.test(en), `${file}: date missing`);
    }
  });

  await test('every page links to all seven legal documents', () => {
    for (const [file, source] of Object.entries(html)) {
      for (const target of LEGAL) assert(source.includes(`href="${target}"`), `${file} does not link to ${target}`);
    }
  });

  await test('the privacy policy covers the rights people have in each region', () => {
    const en = article('privacy.html', 'en');
    for (const phrase of ['GDPR', 'UK GDPR', 'California', 'Global Privacy Control', 'Protection of Privacy Law', 'LGPD', 'legitimate interests', 'withdraw consent', 'We do not sell personal information', 'no legal duty']) {
      assert(en.includes(phrase), `Privacy Policy: "${phrase}" missing`);
    }
    const he = article('privacy.html', 'he');
    for (const phrase of ['חוק הגנת הפרטיות', 'GDPR', 'לא חלה עליך חובה חוקית', 'איננו מוכרים מידע אישי']) {
      assert(he.includes(phrase), `Privacy Policy (Hebrew): "${phrase}" missing`);
    }
  });

  await test('liability is limited only as far as the law allows, and consumers keep their rights', () => {
    const en = article('terms.html', 'en');
    assert(/Nothing in these Terms limits liability that cannot be limited by law/.test(en), 'carve-out for non-excludable liability missing');
    assert(/If you are a consumer, you keep the protection of the mandatory laws/.test(en), 'consumer protection carve-out missing');
    assert(/at least 30 days' notice/.test(en), 'notice period for changes missing');
    const he = article('terms.html', 'he');
    assert(/חוק הגנת הצרכן/.test(he), 'Terms (Hebrew): Consumer Protection Law not mentioned');
  });

  /* ----------------------------------------------------------------------
     5. Subscriptions and refunds  (automatic renewal and withdrawal rules)
     ---------------------------------------------------------------------- */
  group('subscriptions and refunds');

  await test('automatic renewal is disclosed next to the prices and in the form', () => {
    for (const file of ['index.html', 'submit.html']) {
      assert(html[file].includes('data-i18n-rich="tickets.renewNote"'), `${file}: renewal notice missing`);
      assert(/Plans renew automatically every month until you cancel\./.test(html[file]), `${file}: renewal wording missing`);
    }
    for (const code of LANGUAGES) assert(/<1>.+<\/1>/.test(dictionaries[code]['tickets.renewNote']), `${code}: renewal notice must link to the refund policy`);
    assert(/renew automatically each month until cancelled/.test(article('terms.html', 'en')), 'Terms: renewal clause missing');
  });

  await test('what the page promises about refunds matches the written policy', () => {
    for (const code of LANGUAGES) assert(/14/.test(dictionaries[code]['tickets.trust2']), `${code}: the 14-day promise must state the number`);
    const en = article('refunds.html', 'en');
    assert(/within 14 days of your first payment/.test(en) && /refund that payment in full/.test(en), 'Refund Policy: 14-day refund missing');
    assert(/You can cancel at any time/.test(en), 'Refund Policy: cancel-anytime missing');
    assert(/We decline your app/.test(en), 'Refund Policy: refund on decline missing');
    const he = article('refunds.html', 'he');
    assert(/14 יום/.test(he) && /חוק הגנת הצרכן/.test(he), 'Refund Policy (Hebrew): 14 days or Consumer Protection Law missing');
  });

  await test('prices on the pages are exactly the configured prices, with a tax note', async () => {
    const config = (await import(`file://${path.join(ROOT, 'site.config.js')}`)).default;
    for (const plan of config.plans) {
      const expected = new Intl.NumberFormat('en', { style: 'currency', currency: config.currency, maximumFractionDigits: 0 }).format(plan.price);
      for (const file of ['index.html', 'submit.html']) {
        assert(new RegExp(`data-plan-price="${plan.id}">\\${expected}<`).test(html[file]), `${file}: price for ${plan.id} is not ${expected}`);
      }
    }
    assert(/Taxes may be added at checkout/.test(html['index.html']), 'tax note missing');
    assert(/per month/.test(html['index.html']), 'billing period missing');
  });

  /* ----------------------------------------------------------------------
     6. Privacy in the code itself
     ---------------------------------------------------------------------- */
  group('privacy by design');

  await test('the code stores exactly what the Cookie Policy lists, and nothing else', () => {
    const used = new Set([...scriptSource.matchAll(/['"`](site:[a-z]+)['"`]/g)].map((match) => match[1]).filter((key) => key !== 'site:probe'));
    const documented = new Set([...article('cookies.html', 'en').matchAll(/<code>(site:[a-z]+)<\/code>/g)].map((match) => match[1]));
    assertEqual([...used].sort().join(','), [...documented].sort().join(','), 'storage keys in the code vs the Cookie Policy');
    assert(!/document\.cookie/.test(scriptSource), 'a script touches document.cookie');
    assert(!/sessionStorage|indexedDB|openDatabase|navigator\.sendBeacon/.test(scriptSource), 'a script uses another storage or beacon API');
  });

  await test('no fingerprinting or device probing beyond what the 3D scene needs', () => {
    for (const api of ['getBattery', 'enumerateDevices', 'RTCPeerConnection', 'canvas.toDataURL', 'AudioContext', 'navigator.plugins', 'getClientRects().length']) {
      assert(!scriptSource.includes(api), `scripts use ${api}`);
    }
  });

  await test('analytics is off by default and can only load after consent', () => {
    const consent = read(path.join(ROOT, 'src', 'assets', 'js', 'modules', 'consent.js'));
    assert(/if \(choice && choice\.analytics && hasOptional\(\)\) loadAnalytics/.test(consent), 'analytics must be gated by the stored choice');
    const references = scripts.filter((file) => /loadAnalytics\(/.test(read(file))).map((file) => path.basename(file));
    assertEqual(references.sort().join(','), 'analytics.js,consent.js', 'only the consent module may start analytics');
  });

  /* ----------------------------------------------------------------------
     7. Behaviour in a real browser
     ---------------------------------------------------------------------- */
  const { chromium } = loadPlaywright();
  const mailDir = buildVariant('tests/fixtures/config.mail.js');
  const endpointDir = buildVariant('tests/fixtures/config.endpoint.js');
  const site = await startServer(DOCS);
  const mail = await startServer(mailDir);
  const endpoint = await startServer(endpointDir);
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });

  async function open(base, urlPath, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 820 }, reducedMotion: 'reduce' });
    if (options.consent !== false) await context.addInitScript(CONSENT_DONE);
    if (options.route) await options.route(context);
    const page = await context.newPage();
    await page.goto(`${base.url}/${urlPath}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 20000 });
    return { context, page };
  }

  try {
    group('in the browser');

    await test('a real paid listing shows "Sponsored", its notice, and links marked rel="sponsored"', async () => {
      const listing = {
        apps: [
          { id: 'real-app', name: 'Real App', tier: 'premiere', category: 'tools', glyph: 'spark', colors: ['#1f7a6b', '#06201d'], tagline: 'A real listing.', description: 'A longer description.', links: { ios: 'https://apps.example.com/real', web: 'http://insecure.example.com', android: 'javascript:alert(1)' } },
        ],
      };
      const route = (context) => context.route('**/assets/data/apps.json', (request) => request.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(listing) }));
      const { context, page } = await open(site, 'index.html', { route });
      await page.waitForSelector('#strip .poster');
      assertEqual((await page.locator('#strip .badge--sponsored').first().textContent()).trim(), 'Sponsored', 'sponsored badge');
      assertEqual(await page.locator('#strip .badge--example').count(), 0, 'a real listing must not be labelled as an example');
      await page.locator('#strip .poster').first().click();
      assert(/Sponsored listing\./.test(await page.locator('#app-dialog-note').textContent()), 'sponsored notice in the details');
      const links = page.locator('#app-dialog-links a');
      assertEqual(await links.count(), 1, 'only the safe https link may be shown');
      assertEqual(await links.first().getAttribute('rel'), 'sponsored noopener noreferrer', 'rel on the paid link');
      assertEqual(await links.first().getAttribute('target'), '_blank', 'target on the paid link');
      assertEqual(await links.first().getAttribute('href'), 'https://apps.example.com/real', 'link address');
      await context.close();
    });

    await test('consent is never pre-ticked, and refusing is as easy as accepting', async () => {
      const { context, page } = await open(endpoint, 'privacy.html', { consent: false });
      const accept = await page.locator('#consent-accept').boundingBox();
      const reject = await page.locator('#consent-reject').boundingBox();
      assert(accept && reject, 'both buttons must be visible');
      assertEqual(Math.round(accept.height), Math.round(reject.height), 'button heights');
      assert(Math.abs(accept.width - reject.width) < accept.width * 0.6, 'the two buttons must be of comparable size');
      const style = (selector) => page.locator(selector).evaluate((node) => `${getComputedStyle(node).backgroundColor}|${getComputedStyle(node).color}|${getComputedStyle(node).fontWeight}`);
      assertEqual(await style('#consent-accept'), await style('#consent-reject'), 'the two buttons must look the same');
      await page.locator('#consent-settings').click();
      assert(!(await page.locator('#consent-analytics').isChecked()), 'the analytics switch must start switched off');
      await page.locator('#consent-close').click();
      assertEqual(await page.evaluate(() => window.localStorage.getItem('site:consent')), null, 'closing the dialog must not record consent');
      await context.close();
    });

    await test('the form cannot be sent without the three confirmations, and none is pre-ticked', async () => {
      const { context, page } = await open(mail, 'submit.html');
      for (const id of ['#f-rights', '#f-terms', '#f-age']) assert(!(await page.locator(id).isChecked()), `${id} is pre-ticked`);
      assertEqual(await page.locator('#submit-form input[type="checkbox"]').count(), 3, 'no hidden marketing opt-in may exist');
      await page.fill('#f-app-name', 'Test App');
      await page.fill('#f-app-url', 'https://apps.example.com/test');
      await page.selectOption('#f-category', 'tools');
      await page.fill('#f-tagline', 'A tagline.');
      await page.fill('#f-name', 'Dana');
      await page.fill('#f-email', 'dana@example.org');
      await page.waitForTimeout(3100);
      await page.locator('#submit-btn').click();
      assert(await page.locator('#submit-form').isVisible(), 'the form was sent without the confirmations');
      for (const id of ['#f-rights-error', '#f-terms-error', '#f-age-error']) assert(await page.locator(id).isVisible(), `${id} not shown`);
      assert(await page.locator('#submit-mail').isHidden(), 'the submission went through');
      for (const [selector, target] of [['label[for="f-terms"] a >> nth=0', 'terms.html'], ['label[for="f-terms"] a >> nth=1', 'guidelines.html'], ['.form__privacy a', 'privacy.html']]) {
        assertEqual(await page.locator(selector).getAttribute('href'), target, `link to ${target} next to the consent`);
      }
      assert(/renew automatically/.test(await page.locator('#submit-form .renew-note').textContent()), 'renewal notice missing in the form');
      await context.close();
    });

    await test('there is no newsletter or other email collection outside the submission form', async () => {
      for (const file of ['index.html', 'thanks.html', 'privacy.html']) {
        const { context, page } = await open(site, file);
        assertEqual(await page.locator('input[type="email"]').count(), 0, `${file} collects email addresses`);
        await context.close();
      }
    });

    await test('once the operator details are filled in, the legal pages identify the operator', async () => {
      const { context, page } = await open(mail, 'legal.html');
      const text = await page.locator('article[data-doc-lang="en"]').textContent();
      for (const part of ['Example Studio Ltd.', '1 Example Street, Example City', 'Exampleland', '123456789', 'hello@example.com', 'privacy@example.com', 'security@example.com']) {
        assert(text.includes(part), `Legal Notice does not show "${part}"`);
      }
      assert(!/to be completed|will be published here/.test(text), 'placeholders remain although the details are set');
      await page.goto(`${mail.url}/terms.html`);
      const terms = await page.locator('article[data-doc-lang="en"]').textContent();
      assert(/governed by the laws of Exampleland/.test(terms), 'governing law not filled in');
      assert(fs.existsSync(path.join(mailDir, '.well-known', 'security.txt')), 'security.txt missing');
      assert(fs.existsSync(path.join(mailDir, 'sitemap.xml')), 'sitemap missing');
      await context.close();
    });

    await test('before the operator details are filled in, the site says so instead of inventing them', async () => {
      const { context, page } = await open(site, 'legal.html');
      const text = await page.locator('article[data-doc-lang="en"]').textContent();
      assert(/will be published here before the website opens/.test(text), 'missing-details note absent');
      assert(!/@/.test(text.replace(/three\.js/g, '')), 'an email address appears although none is configured');
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
