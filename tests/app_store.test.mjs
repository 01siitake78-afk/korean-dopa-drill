// Local persistence for the public app (id016, id017).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../app/js/store.js';

function memory(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

test('defaults when storage is empty, corrupted, or throwing', () => {
  store.reset();
  assert.equal(store.load(memory()).settings.count, 10);
  store.reset();
  assert.deepEqual(store.load(memory({ 'dopa-drill:v1': '{broken' })).history, []);
  store.reset();
  const bad = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(store.load(bad).settings.sound, true);
  assert.equal(store.save(bad), false);
});

test('records group by day with best score and streak', () => {
  store.reset();
  const mem = memory();
  globalThis.localStorage = mem;
  store.load(mem);
  const d = (s) => new Date(`${s}T10:00:00`);
  store.addRecord({ mode: 'basic', score: 100 }, d('2026-09-25'));
  const e = store.addRecord({ mode: 'basic', score: 100 }, d('2026-09-26'));
  store.updateRecord(e.id, { score: 410 });
  store.addRecord({ mode: 'basic', score: 100 }, d('2026-09-26'));
  store.addRecord({ mode: 'basic', score: 130 }, d('2026-09-27'));
  const m = store.monthSummary(2026, 8);
  assert.equal(m['2026-09-26'].best, 410);
  assert.equal(m['2026-09-26'].plays, 2);
  assert.equal(store.streak(d('2026-09-27')), 3);
  assert.equal(store.streak(d('2026-09-28')), 3);
  assert.equal(store.streak(d('2026-09-30')), 0);
  // Persisted and reloadable.
  store.reset();
  assert.equal(store.load(mem).history.length, 4);
  delete globalThis.localStorage;
});

test('login bonus: once per day, 7-day card, restarts after a gap', () => {
  store.reset();
  const mem = memory();
  globalThis.localStorage = mem;
  store.load(mem);
  const d = (s) => new Date(`${s}T09:00:00`);
  const a = store.claimLogin(d('2026-09-01'));
  assert.deepEqual([a.run, a.slot, a.type], [1, 1, 'star']);
  assert.equal(store.claimLogin(d('2026-09-01')), null);
  let last;
  for (let i = 2; i <= 8; i++) last = store.claimLogin(d(`2026-09-${String(i).padStart(2, '0')}`));
  assert.equal(last.run, 8);
  assert.equal(last.slot, 1);
  assert.equal(store.stickerOn('2026-09-07'), 'crown');
  const gap = store.claimLogin(d('2026-09-12'));
  assert.equal(gap.run, 1);
  assert.equal(gap.total, 9);
  delete globalThis.localStorage;
});

test('best streak counts the longest run of played days', () => {
  store.reset();
  const mem = memory();
  globalThis.localStorage = mem;
  store.load(mem);
  const d = (s) => new Date(`${s}T10:00:00`);
  for (const day of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-05', '2026-09-06']) store.addRecord({ mode: 'level', score: 100 }, d(day));
  assert.equal(store.bestStreak(), 3);
  delete globalThis.localStorage;
});
