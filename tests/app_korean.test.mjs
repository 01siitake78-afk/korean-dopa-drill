import test from 'node:test';
import assert from 'node:assert/strict';
import { KOREAN_SYLLABLES, KOREAN_INITIALS, KOREAN_VOWELS, _internal } from '../app/js/problems.js';

test('all 399 open syllables have unique Revised Romanization and four valid choices in both directions', () => {
  const initials = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
  const vowels = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
  assert.deepEqual(KOREAN_INITIALS, initials);
  assert.deepEqual(KOREAN_VOWELS, vowels);
  assert.equal(KOREAN_SYLLABLES.length, 399);
  assert.equal(new Set(KOREAN_SYLLABLES.map(x => x.hangul)).size, 399);
  assert.equal(new Set(KOREAN_SYLLABLES.map(x => x.roman)).size, 399);
  for (let i = 0; i < 399; i++) {
    const hangul = String.fromCharCode(0xAC00 + i * 28);
    const roman = initials[Math.floor(i / 21)] + vowels[i % 21];
    for (const [generator, prompt, answer] of [
      ['koreanConsonants', hangul, roman], ['koreanSoundToHangul', roman, hangul], ['koreanVowels', hangul, roman]
    ]) {
      let first = true;
      const p = _internal.GEN[generator](() => { if (first) { first = false; return (i + 0.5) / 399; } return 0; });
      assert.equal(p.text, prompt);
      assert.equal(p.answer, answer);
      assert.equal(p.steps.length, 1);
      assert.equal(p.steps[0].digit, answer);
      assert.equal(p.choices.length, 4);
      assert.equal(new Set(p.choices).size, 4);
      assert.equal(p.choices.filter(x => x === answer).length, 1);
      assert.doesNotMatch(p.title, /Lv|レベル/);
    }
  }
});

import { gradePlan } from '../app/js/session.js';
import { makeRng, makeProblem } from '../app/js/problems.js';
test('reading sessions and long extra runs use both directions without difficulty progression', () => {
  const rng = makeRng(123);
  for (const n of [6, 10, 20]) {
    const plan = gradePlan(1, n, rng);
    assert.deepEqual(new Set(plan.basic), new Set(['read-consonants', 'sound-to-hangul']));
    for (let i = 0; i < 100; i++) {
      const id = plan.extra(i);
      assert.ok(['read-consonants', 'sound-to-hangul'].includes(id));
      assert.equal(makeProblem(id, rng).steps.length, 1);
    }
  }
  assert.equal(makeProblem('read-vowels', rng).choices.length, 4);
});
