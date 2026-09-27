// Local-only persistence (localStorage). Nothing is sent to a server.
// Every read tolerates missing, blocked, or corrupted storage.

const KEY = 'dopa-drill:v1';
const VERSION = 1;

export function defaultState() {
  return {
    version: VERSION,
    settings: { count: 10, sound: true, volume: 0.8, motion: null },
    history: [],
  };
}

function backend() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

let cache = null;

export function load(storage = backend()) {
  if (cache) return cache;
  const base = defaultState();
  let raw = null;
  try { raw = storage ? storage.getItem(KEY) : null; } catch { raw = null; }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data && data.version === VERSION) {
        base.settings = { ...base.settings, ...(data.settings || {}) };
        base.history = Array.isArray(data.history) ? data.history : [];
        for (const [k, v] of Object.entries(data)) if (!(k in base)) base[k] = v;
      }
    } catch { /* corrupted: start fresh */ }
  }
  cache = base;
  return cache;
}

export function save(storage = backend()) {
  if (!cache || !storage) return false;
  try { storage.setItem(KEY, JSON.stringify(cache)); return true; } catch { return false; }
}

export function settings() { return load().settings; }

export function updateSettings(patch) {
  Object.assign(load().settings, patch);
  save();
}

// ---------------------------------------------------------------- history
const MAX_HISTORY = 3000;
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// rec: { mode, score, ok, ng, timeMs, dopaL, ... }; returns the stored entry.
export function addRecord(rec, at = new Date()) {
  const st = load();
  const entry = { id: `${at.getTime().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, day: dayKey(at), at: at.getTime(), ...rec };
  st.history.push(entry);
  if (st.history.length > MAX_HISTORY) st.history.splice(0, st.history.length - MAX_HISTORY);
  save();
  return entry;
}

export function updateRecord(id, patch) {
  const e = load().history.find((h) => h.id === id);
  if (!e) return null;
  Object.assign(e, patch);
  save();
  return e;
}

// Map of day -> { best, plays, entries } for one month (month: 0-11).
export function monthSummary(year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const out = {};
  for (const h of load().history) {
    if (!h.day || !h.day.startsWith(prefix)) continue;
    const d = out[h.day] || (out[h.day] = { best: 0, plays: 0, entries: [] });
    d.best = Math.max(d.best, h.score || 0);
    d.plays += 1;
    d.entries.push(h);
  }
  return out;
}

export function playedDays() { return new Set(load().history.map((h) => h.day)); }

// Consecutive days played, counting back from today (or yesterday if today is empty).
export function streak(today = new Date()) {
  const days = playedDays();
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n += 1; d.setDate(d.getDate() - 1); }
  return n;
}

// Longest run of consecutive played days.
export function bestStreak() {
  const days = [...playedDays()].sort();
  let best = 0; let run = 0; let prev = null;
  for (const d of days) {
    const t = new Date(`${d}T12:00:00`);
    run = prev && (t - prev) / 864e5 < 1.5 ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  }
  return best;
}

// ---------------------------------------------------------------- login bonus
// A 7-day stamp card: the first visit of a day earns one sticker; day 7 is
// special. Missing a day restarts the card from day 1.
export const STICKERS = ['star', 'heart', 'flower', 'note', 'clover', 'hanamaru', 'crown'];

export function claimLogin(today = new Date()) {
  const st = load();
  const b = st.bonus || (st.bonus = { last: null, run: 0, stickers: {}, total: 0 });
  const key = dayKey(today);
  if (b.last === key) return null;
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  b.run = b.last === dayKey(y) ? b.run + 1 : 1;
  const slot = ((b.run - 1) % 7) + 1;
  const type = STICKERS[slot - 1];
  b.stickers[key] = type;
  b.last = key;
  b.total = (b.total || 0) + 1;
  save();
  return { run: b.run, slot, type, total: b.total };
}

export const stickerOn = (key) => (load().bonus?.stickers || {})[key] || null;
export const bonusState = () => load().bonus || { last: null, run: 0, stickers: {}, total: 0 };

// Test hook: forget the in-memory copy.
export function reset() { cache = null; }
