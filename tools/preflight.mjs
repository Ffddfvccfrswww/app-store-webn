#!/usr/bin/env node
/* ==========================================================================
   PREFLIGHT — בדיקת מוכנות לעלייה לאוויר
   בודק את קובץ ההגדרות (site.config.js) ומדפיס מה עוד חסר לפני שהאתר
   נפתח לציבור. הרצה:  npm run preflight

   Checks site.config.js and reports what is still missing before launch.
   Exit code 1 means at least one blocking item is open.
   ========================================================================== */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = (await import(pathToFileURL(path.join(ROOT, 'site.config.js')).href)).default;

const blocking = [];
const warnings = [];
const notes = [];
const done = [];

const filled = (value) => typeof value === 'string' && value.trim().length > 0;

/* ------------------------------ חובה לפני השקה ----------------------------- */

if (filled(config.operator.legalName)) done.push('שם המפעיל המשפטי מולא');
else blocking.push('operator.legalName — השם המשפטי של מפעיל האתר (חובה בעמוד "הודעה משפטית")');

if (filled(config.operator.address) && filled(config.operator.country)) done.push('כתובת ומדינה מולאו');
else blocking.push('operator.address + operator.country — כתובת ומדינה של המפעיל');

if (filled(config.contact.email)) done.push('כתובת דוא"ל ליצירת קשר מולאה (טופס ההגשה פתוח)');
else blocking.push('contact.email — כתובת דוא"ל ציבורית. בלעדיה טופס ההגשה סגור ואי אפשר לקבל לקוחות');

if (filled(config.operator.governingLaw) && filled(config.operator.courts) && filled(config.operator.governingLawHe) && filled(config.operator.courtsHe)) {
  done.push('הדין החל ומקום השיפוט מולאו');
} else {
  blocking.push('operator.governingLaw / courts (+ הגרסאות בעברית) — הדין החל ומקום השיפוט בתנאי השימוש');
}

if (filled(config.siteUrl)) done.push(`כתובת האתר מוגדרת: ${config.siteUrl}`);
else blocking.push('siteUrl — כתובת האתר המלאה (נדרשת למפת האתר, לשיתוף ברשתות ולקובץ security.txt)');

try {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), '--check', '--quiet'], { cwd: ROOT, stdio: 'pipe' });
  done.push('תיקיית docs מעודכנת');
} catch {
  blocking.push('תיקיית docs אינה מעודכנת — יש להריץ: npm run build');
}

/* --------------------------------- מומלץ ---------------------------------- */

if (config.brand.name === 'ZARKOR') {
  warnings.push('brand.name — "ZARKOR" הוא שם עבודה. יש לבדוק שהשם פנוי (סימן מסחר ודומיין) או להחליף אותו');
}
if (!filled(config.contact.accessibilityName)) {
  warnings.push('contact.accessibilityName — שם רכז/ת הנגישות (נדרש בישראל בהצהרת הנגישות)');
}
const withoutCheckout = config.plans.filter((plan) => !filled(plan.checkoutUrl)).map((plan) => plan.id);
if (withoutCheckout.length) {
  warnings.push(`plans.checkoutUrl — אין קישור תשלום למסלולים: ${withoutCheckout.join(', ')}. עד שיוגדר, תצטרך לשלוח ללקוח קישור תשלום ידנית בדוא"ל`);
} else {
  done.push('לכל המסלולים יש קישור תשלום');
}
if (!filled(config.forms.endpoint)) {
  notes.push('forms.endpoint ריק — הטופס יפתח את תוכנת הדוא"ל של הגולש (עובד, אבל שירות טפסים נוח יותר)');
}

const apps = JSON.parse(await readFile(path.join(ROOT, 'src', 'assets', 'data', 'apps.json'), 'utf8')).apps || [];
const real = apps.filter((app) => !app.demo).length;
if (real === 0) notes.push('כל האפליקציות ברשימה הן דוגמאות. הן מסומנות "דוגמה" באתר; כדאי להחליף אותן כשמגיעים לקוחות אמיתיים');
else done.push(`${real} אפליקציות אמיתיות ברשימה`);

const slotted = config.plans.filter((plan) => plan.slots);
for (const plan of slotted) {
  notes.push(`plans.${plan.id}.slots = ${plan.slots} — האתר מציג "מקומות פנויים". יש להקפיד שההגבלה אמיתית`);
}

notes.push('מומלץ מאוד: לתת לעורך/ת דין לעבור על המסמכים המשפטיים לפני ההשקה');

/* --------------------------------- דו"ח ----------------------------------- */

const line = '─'.repeat(64);
console.log(`\n${line}\n  בדיקת מוכנות לעלייה לאוויר\n${line}`);
if (done.length) {
  console.log('\n  ✓ מוכן');
  for (const item of done) console.log(`      ${item}`);
}
if (blocking.length) {
  console.log('\n  ✗ חובה להשלים לפני ההשקה');
  for (const item of blocking) console.log(`      ${item}`);
}
if (warnings.length) {
  console.log('\n  ! מומלץ להשלים');
  for (const item of warnings) console.log(`      ${item}`);
}
if (notes.length) {
  console.log('\n  · לידיעה');
  for (const item of notes) console.log(`      ${item}`);
}
console.log(`\n${line}`);
console.log(blocking.length ? `  נותרו ${blocking.length} פריטי חובה. עורכים את site.config.js ומריצים npm run build.` : '  כל פריטי החובה הושלמו. האתר מוכן לעלייה לאוויר.');
console.log(`${line}\n`);

process.exit(blocking.length ? 1 : 0);
