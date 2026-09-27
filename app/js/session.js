// Session planning (which skills to ask) and per-skill progress.
// Pure logic over a plain progress object so it can be unit tested;
// persistence is handled by store.js.
import { SKILLS, SKILL, DEPTH, MASTERY, skillsOfGrade } from './skills.js';
import { makeProblem, signature } from './problems.js';

// Skills in a single easy -> hard order (placement walks along it).
export const ORDER = SKILLS.slice().sort((a, b) => DEPTH[a.id] - DEPTH[b.id] || a.grade - b.grade || SKILLS.indexOf(a) - SKILLS.indexOf(b)).map((s) => s.id);

// Placement walks grade by grade (prerequisites never come from a later grade).
export const PLACEMENT = SKILLS.slice().sort((a, b) => a.grade - b.grade || DEPTH[a.id] - DEPTH[b.id]).map((s) => s.id);

export function emptyProgress() { return { placed: false, skills: {}, review: [] }; }

const rec = (prog, id) => prog.skills[id] || (prog.skills[id] = { n: 0, hist: [], mastered: false, recent: [] });

export const isMastered = (prog, id) => !!(prog.skills[id] && prog.skills[id].mastered);
export const isUnlocked = (prog, id) => SKILL[id].req.every((r) => isMastered(prog, r));

export function stateOf(prog, id) {
  if (isMastered(prog, id)) return 'mastered';
  if (isUnlocked(prog, id)) return (prog.skills[id] && prog.skills[id].n) ? 'learning' : 'new';
  return 'locked';
}

// Mark a skill (and everything it depends on) as mastered.
export function masterWithAncestors(prog, id) {
  const r = rec(prog, id);
  r.mastered = true;
  for (const p of SKILL[id].req) if (!isMastered(prog, p)) masterWithAncestors(prog, p);
}

// Record one finished problem. Returns ids that became unlocked because of it.
export function recordResult(prog, id, firstTry, sig) {
  const before = new Set(SKILLS.filter((s) => isUnlocked(prog, s.id)).map((s) => s.id));
  const r = rec(prog, id);
  r.n += 1;
  r.hist.push(firstTry ? 1 : 0);
  if (r.hist.length > MASTERY.window) r.hist.splice(0, r.hist.length - MASTERY.window);
  r.last = Date.now();
  if (sig) { r.recent.push(sig); if (r.recent.length > 24) r.recent.splice(0, r.recent.length - 24); }
  const wasMastered = r.mastered;
  if (!r.mastered && r.hist.length >= MASTERY.window && r.hist.reduce((a, b) => a + b, 0) >= MASTERY.need) r.mastered = true;
  const unlocked = SKILLS.filter((s) => !before.has(s.id) && isUnlocked(prog, s.id)).map((s) => s.id);
  return { unlocked, mastered: !wasMastered && r.mastered };
}

// Progress toward mastery, 0..1, for display.
export function masteryRatio(prog, id) {
  const r = prog.skills[id];
  if (!r) return 0;
  if (r.mastered) return 1;
  const ok = r.hist.reduce((a, b) => a + b, 0);
  return Math.min(0.95, ok / MASTERY.need);
}

// ---------------------------------------------------------------- planners
// A plan answers: which skill for basic problem i, and for extra problem k.
// "adaptive" plans also react to answers (placement walk).

export function gradePlan(grade, N, rng) {
  const list = skillsOfGrade(grade).sort((a, b) => DEPTH[a.id] - DEPTH[b.id]).map((s) => s.id);
  const next = skillsOfGrade(Math.min(6, grade + 1)).sort((a, b) => DEPTH[a.id] - DEPTH[b.id]).map((s) => s.id);
  const basic = Array.from({ length: N }, (_, i) => {
    // Walk from easy to hard across the grade with a little jitter.
    const t = N <= 1 ? 1 : i / (N - 1);
    const j = Math.round(t * (list.length - 1) + (rng() - 0.5) * 1.6);
    return list[Math.max(0, Math.min(list.length - 1, j))];
  });
  const hard = list.slice(Math.floor(list.length * 0.55));
  return {
    mode: 'grade', grade, basic,
    extra: (k) => (k < 6 || grade === 6 ? hard[k % hard.length] : next[(k - 6) % Math.max(1, Math.min(next.length, 4))]),
  };
}

// Frontier = unlocked but not mastered; "warm" = mastered (light review).
export function frontier(prog) { return ORDER.filter((id) => isUnlocked(prog, id) && !isMastered(prog, id)); }

export function levelPlan(prog, N, rng) {
  if (!prog.placed) return placementPlan(prog, N);
  const front = frontier(prog);
  const warm = ORDER.filter((id) => isMastered(prog, id));
  // Recent mastered skills first, then the frontier (least practised first).
  const warmPick = warm.slice(-6);
  const nWarm = Math.min(warmPick.length, Math.max(1, Math.round(N * 0.3)));
  const frontSorted = front.slice(0, 4);
  const basic = [];
  for (let i = 0; i < nWarm; i++) basic.push(warmPick[Math.floor(rng() * warmPick.length)]);
  for (let i = nWarm; i < N; i++) basic.push(frontSorted.length ? frontSorted[(i - nWarm) % frontSorted.length] : warm[Math.floor(rng() * warm.length)]);
  const hardest = front.length ? front.slice(-3) : warm.slice(-3);
  return { mode: 'level', basic, extra: (k) => hardest[k % hardest.length] };
}

// First session: walk along PLACEMENT, jumping ahead after clean answers and
// easing back after slips. A clean answer grants that skill and its ancestors,
// so a skill may be asked before it is unlocked (skipping ahead).
export function placementPlan(prog, N) {
  const walk = { p: 0, jump: 6, lastOk: -1 };
  return {
    mode: 'level', placement: true, walk,
    basic: Array.from({ length: N }, () => null),
    pick() { return PLACEMENT[Math.min(PLACEMENT.length - 1, walk.p)]; },
    answer(firstTry) {
      if (firstTry) {
        masterWithAncestors(prog, PLACEMENT[walk.p]);
        walk.lastOk = walk.p;
        walk.p = Math.min(PLACEMENT.length - 1, walk.p + walk.jump);
        walk.jump = Math.min(12, Math.ceil(walk.jump * 1.3));
      } else {
        walk.jump = Math.max(1, Math.floor(walk.jump / 2));
        walk.p = Math.min(walk.p, Math.max(walk.lastOk + 1, walk.p - walk.jump));
      }
    },
    extra: () => { const f = frontier(prog); return f.length ? f[0] : PLACEMENT[walk.p]; },
  };
}

export function reviewPlan(items) {
  return { mode: 'review', basic: items.map((it) => it.skill || null), items };
}

// Problem factory honouring per-skill recent signatures.
export function problemFor(prog, skillId, rng) {
  const r = prog.skills[skillId];
  const recent = new Set(r ? r.recent : []);
  const p = makeProblem(skillId, rng, recent);
  return p;
}

export { signature };
