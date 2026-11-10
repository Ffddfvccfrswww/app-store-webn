#!/usr/bin/env node
/* Runs the three test-suites one after another and prints a summary. */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const suites = [
  ['Static checks', 'static.test.cjs'],
  ['Browser tests', 'e2e.test.cjs'],
  ['Accessibility tests', 'a11y.test.cjs'],
  ['Compliance tests', 'legal.test.cjs'],
];

const summary = [];
for (const [title, file] of suites) {
  console.log(`\n━━ ${title} ${'━'.repeat(Math.max(0, 60 - title.length))}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  summary.push([title, result.status === 0]);
}

console.log(`\n${'━'.repeat(64)}`);
for (const [title, ok] of summary) console.log(`  ${ok ? '✓' : '✗'} ${title}`);
console.log('━'.repeat(64));
process.exit(summary.every(([, ok]) => ok) ? 0 : 1);
