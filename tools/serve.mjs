#!/usr/bin/env node
/* ==========================================================================
   SERVE — a small local web server for previewing docs/
   It sends the same security headers that the live host will send (read
   from docs/_headers), so what you test locally is what visitors get.

   Usage:  node tools/serve.mjs [--port 4173] [--host 127.0.0.1] [--dir docs]
   ========================================================================== */

import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const PORT = Number(argument('port', process.env.PORT || 4173));
const HOST = argument('host', '127.0.0.1');
const DIR = path.resolve(ROOT, argument('dir', 'docs'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Parse the Netlify / Cloudflare Pages "_headers" format. */
function loadHeaderRules() {
  const file = path.join(DIR, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
    } else if (current) {
      const index = line.indexOf(':');
      if (index > 0) current.headers.push([line.slice(0, index).trim(), line.slice(index + 1).trim()]);
    }
  }
  return rules.map((rule) => ({
    ...rule,
    test: new RegExp(`^${rule.pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`),
  }));
}

const headerRules = loadHeaderRules();

function headersFor(urlPath, secure) {
  const headers = {};
  for (const rule of headerRules) {
    if (!rule.test.test(urlPath)) continue;
    for (const [name, value] of rule.headers) {
      let finalValue = value;
      if (!secure) {
        // Plain http on localhost: these two only make sense over https.
        if (name.toLowerCase() === 'strict-transport-security') continue;
        if (name.toLowerCase() === 'content-security-policy') {
          finalValue = value.replace(/;\s*upgrade-insecure-requests/, '');
        }
      }
      headers[name] = finalValue;
    }
  }
  return headers;
}

async function resolveFile(urlPath) {
  let relative = decodeURIComponent(urlPath);
  if (relative.endsWith('/')) relative += 'index.html';
  const full = path.normalize(path.join(DIR, relative));
  if (!full.startsWith(DIR + path.sep) && full !== DIR) return null; // never serve outside the site folder
  try {
    const info = await stat(full);
    if (info.isDirectory()) return resolveFile(`${urlPath.replace(/\/?$/, '/')}`);
    return full;
  } catch {
    return null;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let status = 200;
    let file = await resolveFile(url.pathname);
    if (!file) {
      status = 404;
      file = path.join(DIR, '404.html');
      if (!existsSync(file)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
    }
    const body = await readFile(file);
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const secure = request.headers['x-forwarded-proto'] === 'https';
    response.writeHead(status, {
      'Content-Type': type,
      'Content-Length': body.length,
      ...headersFor(url.pathname, secure),
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Server error');
    console.error(error);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Serving ${path.relative(ROOT, DIR) || '.'} at http://${HOST}:${PORT}/`);
});
