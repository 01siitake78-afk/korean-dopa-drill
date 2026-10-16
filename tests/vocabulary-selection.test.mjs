import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeVocabularyBatch, loadVocabulary, vocabularyProblem } from '../app/js/vocabulary.js';
import { learningPool, recordVocabularyAnswer } from '../app/js/vocabulary-curriculum.js';
import { batchSize } from '../app/js/vocabulary-protocol.js';
import { makeRng } from '../app/js/problems.js';

const data = JSON.parse(readFileSync(new URL('../app/data/krdict-beginner.json', import.meta.url)));
const now = Date.UTC(2026, 9, 16);
const options = { basicCount: 10, extraMs: 90000, now };
const words = batch => batch.map(q => q.word);
const studied = (entries, patch = {}) => Object.fromEntries(entries.map(e =>
  [e.word, { attempts: 1, streak: 1, due: now, lastSeen: now - 1000, ...patch }]));
const batch = (extra = {}) => makeVocabularyBatch(data, { ...options, rng: makeRng(42), ...extra });

test('first normal round has ten different beginner words and a full EX batch', () => {
  const result = batch();
  assert.equal(result.length, batchSize(10, 90000));
  assert.equal(new Set(words(result.slice(0, 10))).size, 10);
  const initial = new Set(learningPool(data.entries).map(e => e.word));
  for (const q of result) {
    assert.ok(initial.has(q.word));
    assert.equal(new Set([q.meaning, ...q.distractors]).size, 4);
    assert.equal(vocabularyProblem(q).steps.length, 1);
  }
});

test('next normal round includes four unseen words and six reviews', () => {
  const first = batch().slice(0, 10);
  const history = studied(first);
  const result = batch({ history, recent: words(first) }).slice(0, 10);
  assert.equal(result.filter(q => !history[q.word]).length, 4);
  assert.equal(new Set(words(result)).size, 10);
  assert.notEqual(result[0].word, first.at(-1).word);
});

test('recent history rotates reviews even with the same random seed', () => {
  const initial = learningPool(data.entries);
  const history = studied(initial);
  const before = batch({ history }).slice(0, 10);
  const after = batch({ history, recent: words(before) }).slice(0, 10);
  const old = new Set(words(before));
  assert.ok(after.filter(q => history[q.word] && !old.has(q.word)).length >= 6);
});

test('fifteen attempted words unlock the next ten immediately without mastery', () => {
  const initial = learningPool(data.entries);
  assert.equal(initial.length, 20);
  const history = studied(initial.slice(0, 15), { streak: 0 });
  assert.equal(learningPool(data.entries, history).length, 30);
});

test('due reviews take priority and mastered words wait when alternatives exist', () => {
  const active = learningPool(data.entries);
  const history = studied(active, { streak: 3, due: now + 86400000 });
  const due = active.slice(0, 6);
  Object.assign(history, studied(due, { streak: 0 }));
  const result = batch({ history, recent: words(due) });
  assert.equal(result.slice(0, 10).filter(q => history[q.word]?.due <= now).length, 6);
  const waiting = new Set(active.slice(6).map(e => e.word));
  assert.ok(result.every(q => !waiting.has(q.word)));
});

test('repeated sessions introduce words beyond the first twenty with no time advance', () => {
  const history = {};
  let recent = [];
  for (let i = 0; i < 8; i++) {
    const round = batch({ history, recent, rng: makeRng(i) }).slice(0, 10);
    recent = [...recent, ...words(round)];
    round.forEach(q => recordVocabularyAnswer(history, q.word, true, now));
  }
  assert.ok(Object.keys(history).length >= 35);
});

test('all supported counts terminate, fill EX, and avoid consecutive repeats', () => {
  for (const basicCount of [1, 6, 10, 14, 30]) {
    const result = batch({ basicCount });
    assert.equal(result.length, batchSize(basicCount, 90000));
    result.forEach((q, i) => { if (i) assert.notEqual(q.word, result[i - 1].word); });
  }
});

test('selection preserves existing history and spaced-credit rules', () => {
  const history = studied(learningPool(data.entries));
  const saved = structuredClone(history);
  batch({ history });
  assert.deepEqual(history, saved);
  const word = Object.keys(history)[0];
  recordVocabularyAnswer(history, word, true, now);
  const streak = history[word].streak;
  recordVocabularyAnswer(history, word, true, now + 1000);
  assert.equal(history[word].streak, streak);
});

test('static dictionary loading passes history and recent words to selection', async () => {
  const first = batch().slice(0, 10);
  const history = studied(first);
  let calls = 0;
  const result = await loadVocabulary({ ...options, history, recent: words(first), rng: makeRng(42),
    fetchImpl: async url => {
      calls++;
      assert.ok(url.endsWith('/data/krdict-beginner.json'));
      return Response.json(data);
    } });
  assert.equal(calls, 1);
  assert.equal(result.slice(0, 10).filter(q => !history[q.word]).length, 4);
});
