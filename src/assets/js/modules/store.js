/* ==========================================================================
   STORE — a safe wrapper around localStorage
   The site keeps exactly three things on the visitor's device, all of them
   strictly necessary for features the visitor asked for:
     site:lang     the chosen language
     site:motion   the animation preference (on / off)
     site:consent  the privacy choice
   If storage is blocked (private mode, strict settings) everything still
   works for the current page view using an in-memory fallback.
   ========================================================================== */

const memory = new Map();

function backend() {
  try {
    const storage = window.localStorage;
    const probe = 'site:probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

const storage = backend();

export function read(key) {
  try {
    if (storage) return storage.getItem(key);
  } catch {
    /* fall through to memory */
  }
  return memory.has(key) ? memory.get(key) : null;
}

export function write(key, value) {
  memory.set(key, String(value));
  try {
    if (storage) storage.setItem(key, String(value));
  } catch {
    /* quota or policy: the in-memory copy still serves this page view */
  }
}

export function remove(key) {
  memory.delete(key);
  try {
    if (storage) storage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

export function readJson(key) {
  const raw = read(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJson(key, value) {
  write(key, JSON.stringify(value));
}
