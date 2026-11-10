/* Shared helpers for the test-suite: a tiny test runner, a site builder and a local server. */

const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

/* ------------------------------- test runner ------------------------------ */

function createRunner(title) {
  const results = [];
  let current = '';

  async function test(name, fn) {
    const started = Date.now();
    try {
      await fn();
      results.push({ name, ok: true, ms: Date.now() - started });
      console.log(`  ✓ ${current ? `${current} › ` : ''}${name}`);
    } catch (error) {
      results.push({ name: `${current ? `${current} › ` : ''}${name}`, ok: false, error });
      console.log(`  ✗ ${current ? `${current} › ` : ''}${name}`);
      console.log(`      ${String((error && error.message) || error).split('\n').join('\n      ')}`);
    }
  }

  function group(name) {
    current = name;
  }

  function finish() {
    const failed = results.filter((result) => !result.ok);
    console.log(`\n${title}: ${results.length - failed.length} passed, ${failed.length} failed`);
    return failed.length === 0;
  }

  return { test, group, finish, results };
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values differ'}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

/* --------------------------------- building -------------------------------- */

/** Build a variant of the site with another configuration into a temporary folder. */
function buildVariant(configFile) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'site-variant-'));
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), '--config', configFile, '--out', out, '--quiet'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return out;
}

/* ---------------------------------- serving -------------------------------- */

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startServer(dir) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs'), '--port', String(port), '--dir', dir], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The local server did not start.')), 8000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('Serving')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', () => reject(new Error('The local server stopped unexpectedly.')));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    stop() {
      child.kill();
    },
  };
}

/* --------------------------------- browsers -------------------------------- */

const CHROMIUM_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    console.error('Playwright is required for the browser tests (npm install --no-save playwright && npx playwright install chromium).');
    throw error;
  }
}

/** Collect everything that should never happen on a healthy page. */
function watchPage(page, origin) {
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
    else if (message.type() === 'warning' && /Content Security Policy|Trusted Type/i.test(message.text())) {
      problems.push(`policy warning: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    if (failure && /ERR_ABORTED/.test(failure.errorText)) return; // navigation away
    problems.push(`request failed: ${request.url()} (${failure ? failure.errorText : 'unknown'})`);
  });
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) return;
    if (!url.startsWith(origin)) problems.push(`third-party request: ${url}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(origin) && !/favicon\.ico$/.test(response.url())) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return problems;
}

const CONSENT_DONE = () => {
  try {
    window.localStorage.setItem('site:consent', JSON.stringify({ v: 1, analytics: false, ts: '2026-01-01' }));
  } catch (error) {
    /* ignore */
  }
};

module.exports = {
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
  watchPage,
};
