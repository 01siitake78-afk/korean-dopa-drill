// Scoring and dopa curves for the public app (id014).
import test from 'node:test';
import assert from 'node:assert/strict';
import { extraPoints, extraTotal, basicDopaL, extraDopaL, extraProblemGain, fmtDopa, unitOf, unitLabel } from '../app/js/scoring.js';

test('extra points grow gently and stay in the 1000s for a very fast run', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(extraPoints), [10, 15, 20, 25, 30]);
  let sum = 0;
  for (let k = 0; k < 23; k++) sum += extraPoints(k);
  assert.equal(sum, extraTotal(23));
  const total23 = 100 + extraTotal(23);
  assert.ok(total23 >= 1000 && total23 < 2000, `23 extras -> ${total23}`);
  assert.ok(100 + extraTotal(28) < 2500);
});

test('dopa: 1万 after basic, about 100万 after five extras, a few 億 at most', () => {
  assert.equal(fmtDopa(basicDopaL(1)), '1.0万');
  let L = basicDopaL(1);
  for (let k = 0; k < 5; k++) L += extraProblemGain(k);
  assert.ok(Math.abs(L - extraDopaL(5)) < 1e-9);
  assert.match(fmtDopa(L), /^\d+万$/);
  assert.ok(L > 5.8 && L < 6.2, `five extras: ${fmtDopa(L)}`);
  assert.match(fmtDopa(extraDopaL(23)), /億$/);
  assert.ok(extraDopaL(60) < 9.1, 'levels off around 10億');
});

test('basic curve rises monotonically from small numbers', () => {
  let prev = -1;
  for (let i = 0; i <= 40; i++) { const L = basicDopaL(i / 40); assert.ok(L > prev); prev = L; }
  assert.equal(fmtDopa(basicDopaL(0.5)), Math.round(10 ** basicDopaL(0.5)).toLocaleString('ja-JP'));
});

test('milestone units below 万', () => {
  assert.equal(unitOf(1.9), '');
  assert.equal(unitOf(2.1), '百');
  assert.equal(unitOf(3.5), '千');
  assert.equal(unitOf(4.5), '万');
  assert.equal(unitOf(6.2), '百万');
  assert.equal(unitLabel('千万'), '1000万');
  assert.equal(unitOf(8.3), '億');
  assert.equal(unitLabel('百'), '100');
  assert.equal(unitLabel('億'), '1億');
});
