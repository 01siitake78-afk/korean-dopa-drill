// Session planning and mastery (id021, id022, id023).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../app/js/problems.js';
import { SKILL, SKILLS, MASTERY } from '../app/js/skills.js';
import { ORDER, PLACEMENT, emptyProgress, recordResult, isUnlocked, isMastered, stateOf, gradePlan, levelPlan, placementPlan, frontier, problemFor } from '../app/js/session.js';

test('orders respect prerequisites', () => {
  for (const order of [ORDER, PLACEMENT]) {
  const seen = new Set();
  for (const id of order) { for (const r of SKILL[id].req) assert.ok(seen.has(r), `${id} before ${r}`); seen.add(id); }
  }
});

test('mastery needs 5 of the last 6 first-try clears and unlocks children', () => {
  const prog = emptyProgress();
  assert.equal(stateOf(prog, 'g1-add-c'), 'locked');
  let res;
  for (let i = 0; i < MASTERY.window; i++) res = recordResult(prog, 'g1-add-nc', i !== 2);
  assert.ok(isMastered(prog, 'g1-add-nc'));
  assert.ok(res.unlocked.includes('g1-sub-nb'));
  assert.ok(!isUnlocked(prog, 'g1-add-c')); // also needs g1-compose10
  for (let i = 0; i < 6; i++) recordResult(prog, 'g1-compose10', i % 3 !== 0);
  assert.ok(!isMastered(prog, 'g1-compose10')); // only 4 of 6
});

test('grade plans stay inside the grade for basic problems', () => {
  const rng = makeRng(4);
  for (let g = 1; g <= 6; g++) {
    const plan = gradePlan(g, 10, rng);
    for (const id of plan.basic) assert.equal(SKILL[id].grade, g);
    for (let k = 0; k < 12; k++) assert.ok(SKILL[plan.extra(k)]);
  }
});

test('placement walks forward on clean answers and grants ancestors', () => {
  const prog = emptyProgress();
  const plan = placementPlan(prog, 10);
  const asked = [];
  for (let i = 0; i < 8; i++) { const id = plan.pick(); asked.push(id); plan.answer(true); }
  const mastered = SKILLS.filter((x) => isMastered(prog, x.id)).length;
  assert.ok(mastered >= 20, `mastered ${mastered} after 8 clean answers (at ${asked[7]})`);
  for (const r of SKILL[asked[6]].req) assert.ok(isMastered(prog, r));
  // A slip eases back.
  const p0 = plan.walk.p;
  plan.answer(false);
  assert.ok(plan.walk.p <= p0);
});

test('level plan mixes review and frontier, problems avoid recent repeats', () => {
  const prog = emptyProgress();
  prog.placed = true;
  for (let i = 0; i < 6; i++) recordResult(prog, 'g1-add-nc', true);
  for (let i = 0; i < 6; i++) recordResult(prog, 'g1-compose10', true);
  const plan = levelPlan(prog, 10, makeRng(1));
  assert.ok(plan.basic.some((id) => isMastered(prog, id)));
  assert.ok(plan.basic.some((id) => frontier(prog).includes(id)));
  const rng = makeRng(2);
  const sigs = [];
  for (let i = 0; i < 8; i++) { const p = problemFor(prog, 'g1-add-c', rng); sigs.push(`${p.text}`); recordResult(prog, 'g1-add-c', true, `${p.title}|${p.text}`); }
  assert.equal(new Set(sigs).size, sigs.length);
  assert.ok(SKILLS.length === ORDER.length);
});
