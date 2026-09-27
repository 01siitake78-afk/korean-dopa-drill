// Game flow, input, scoring, and the "director" that turns every event into
// escalating visuals and sound.
import { startClock, onFrame, wait, tween, clamp, lerp, rand, pick, chance, centerOf, params,
  easeOutBack, easeOutCubic, easeInCubic, easeInOutCubic, easeOutQuint } from './core.js';
import { makeRng, generate, makeProblem, signature, BASIC_SETS, EXTRA_TIERS } from './problems.js';
import { AudioEngine } from './audio.js';
import { Dopakichi } from './dopakichi.js';
import { FX } from './fx.js';
import { Backdrop } from './bg.js';
import * as store from './store.js';
import { SKILLS, SKILL, LANES, DEPTH } from './skills.js';
import { ORDER, emptyProgress, recordResult, stateOf, masteryRatio, gradePlan, levelPlan, reviewPlan, problemFor, frontier, isUnlocked } from './session.js';
import { BASIC_SCORE, extraPoints, basicDopaL, extraProblemGain, fmtDopa, unitOf, unitLabel } from './scoring.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const capture = params.has('capture');
const EXTRA_MS = Number(params.get('extra') || 90) * 1000;
const audio = new AudioEngine({ capture });
const fx = new FX($('#fx'), 300);
const fxBack = new FX($('#fx-back'), 520);
const bg = new Backdrop($('#bg'), $('#rays-fallback'));
const backLayer = $('#actors-back');
const frontLayer = $('#actors-front');
const hero = new Dopakichi(backLayer, { scale: 0.72, front: frontLayer });
const actors = [hero];
const crowd = [];
const body = document.body;
const sheet = $('#sheet');
const card = $('#card');
const stage = $('#stage');
const padButtons = Object.fromEntries($$('#pad button').map((b) => [b.dataset.key, b]));

const S = {
  screen: 'title', N: 10, rng: null, qi: 0, problems: [], problem: null, step: 0,
  E: 0.06, visualE: 0.02, level: 0, ready: false, reach: false, shownWrong: null, wrongInQ: false,
  firstTry: 0, solved: 0, misses: 0, combo: 0, startT: 0, endT: 0, targetMs: 0, mode: 'basic',
  extra: { score: 0, solved: 0, misses: 0, end: 0, over: false }, digitsDone: 0, digitsTotal: 1,
  dopa: { L: 0, shown: 0, unit: '' }, reduced: false, motion: 1, settingsOpen: false,
  muted: false, kick: 0, flash: 0, shake: 0, cells: {}, lines: {}, idleAt: 0, busyUntil: 0,
};
window.__dopa = { S, audio };

// ---------------------------------------------------------------- utilities
const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const now = () => performance.now();

function setLevelClasses(L) {
  for (let i = 0; i <= 10; i++) body.classList.toggle(`lv${i}`, i <= L);
}

function showScreen(name) {
  S.screen = name;
  $$('.screen').forEach((s) => s.classList.toggle('is-active', s.id === `screen-${name}`));
  const el = $(`#screen-${name}`);
  if (!S.reduced) tween(260, (k) => { el.style.opacity = k; el.style.transform = `translateY(${(1 - k) * 18}px)`; }).then(() => { el.style.transform = ''; });
  requestAnimationFrame(layoutActors);
}

function layoutActors() {
  // Cancel any running body action so it does not drag the hero back to old coordinates.
  hero.begin();
  let r;
  if (S.settingsOpen || S.bonusOpen) {
    const c = $(S.bonusOpen ? '#bonus .modal-card' : '#settings .modal-card').getBoundingClientRect();
    hero.S = 0.5; hero.place(c.left + c.width * 0.78, c.top + 4); hero.lift = 0; hero.rot = 0;
    return;
  }
  if (S.screen === 'tree') {
    const h = $('#screen-tree .tree-head').getBoundingClientRect();
    hero.S = 0.36; hero.place(h.right - 110, h.bottom + 2); hero.lift = 0; hero.rot = 0;
    crowd.forEach((c, i) => placeCrowd(c, i));
    return;
  }
  if (S.screen === 'title') r = $('#title-stage').getBoundingClientRect();
  else if (S.screen === 'play') r = stage.getBoundingClientRect();
  else r = $(`#screen-${S.screen} .result-card`).getBoundingClientRect();
  const onCard = S.screen === 'result' || S.screen === 'final';
  const scale = S.screen === 'title' ? clamp(r.height / 190, 0.7, 1.1) : onCard ? 0.6 : clamp(r.height / 175, 0.5, 0.74);
  hero.S = scale;
  const x = r.left + r.width / 2;
  const y = onCard ? r.top + 6 : r.bottom - 12;
  hero.place(x, y);
  hero.lift = 0; hero.rot = 0;
  crowd.forEach((c, i) => placeCrowd(c, i));
}

// ---------------------------------------------------------------- problems
// ---------------------------------------------------------------- sessions
const progress = () => { const st = store.load(); if (!st.progress) st.progress = emptyProgress(); return st.progress; };
const REVIEW_MAX = 40;
const MODE_LABEL = { level: 'じぶんレベル', grade: (g) => `${g}ねんせい`, review: 'ふくしゅう', practice: 'れんしゅう', drill: 'ドリル' };

// kind: 'level' | 'grade' | 'review' | 'practice' | 'drill'
function makePlan(kind, arg) {
  const prog = progress();
  if (kind === 'grade') return gradePlan(arg, S.N, S.rng);
  if (kind === 'review') { const items = prog.review.slice(-Math.min(S.N, 10)); return reviewPlan(items); }
  if (kind === 'practice') return { mode: 'practice', skill: arg, basic: Array.from({ length: S.N }, () => arg), extra: () => { const kids = SKILLS.filter((x) => x.req.includes(arg) && isUnlocked(prog, x.id)); return kids.length ? kids[Math.floor(S.rng() * kids.length)].id : arg; } };
  if (kind === 'demo') {
    // Random skills from every grade, ordered easy -> hard so the show escalates.
    const pool = SKILLS.slice();
    const basic = Array.from({ length: S.N }, () => pool[Math.floor(S.rng() * pool.length)])
      .sort((x, y) => x.grade - y.grade || DEPTH[x.id] - DEPTH[y.id]).map((x) => x.id);
    const upper = SKILLS.filter((x) => x.grade >= 4).map((x) => x.id);
    return { mode: 'demo', basic, extra: () => upper[Math.floor(S.rng() * upper.length)] };
  }
  if (kind === 'drill' || params.has('demo')) return { mode: 'drill', legacy: true, basic: BASIC_SETS[S.N] || BASIC_SETS[10] };
  return levelPlan(prog, S.N, S.rng);
}

function nextProblem(i) {
  const plan = S.plan;
  if (plan.mode === 'review') return structuredClone(plan.items[i].problem);
  if (plan.legacy) return generate(plan.basic[i], S.rng, i === 0 ? { kind: 'add', a: 27, b: 35 } : null);
  const skill = params.get('skill') || (plan.placement ? plan.pick() : plan.basic[i]);
  return sessionProblem(skill);
}
function sessionProblem(skill) {
  const prog = progress();
  const r = prog.skills[skill];
  const recent = new Set([...(r ? r.recent : []), ...S.sessionSigs]);
  let p = makeProblem(skill, S.rng, recent);
  S.sessionSigs.add(signature(p));
  return p;
}

function basicE(i) { return S.N <= 1 ? 1 : 0.08 + 0.92 * (i / (S.N - 1)) ** 1.3; }

function applyLevel(E, { key, bpm } = {}) {
  S.E = E;
  const L = Math.min(10, Math.round(E * 10));
  S.level = L;
  setLevelClasses(L);
  if (key !== undefined) audio.key = key;
  audio.setLevel(L, bpm || 112 + 16 * Math.min(1, E));
  hero.bob = clamp(E * 1.4);
  ensureCrowd(E);
}

function renderSheet(p) {
  sheet.innerHTML = '';
  sheet.className = `sheet ${p.kind}`;
  sheet.style.setProperty('--cols', p.cols);
  sheet.style.setProperty('--rows', p.rows);
  S.cells = {}; S.lines = {};
  if (p.bracket) {
    const b = document.createElement('div');
    b.className = 'bracket';
    b.style.gridRow = `${p.bracket.r + 1}`;
    b.style.gridColumn = `${p.bracket.c0 + 1} / ${p.bracket.c1 + 2}`;
    sheet.appendChild(b);
  }
  for (const l of p.lines) {
    const d = document.createElement('div');
    d.className = `hline${l.hidden ? ' hidden' : ''}${l.frac ? ' fbar' : ''}`;
    d.style.gridRow = `${l.r + 1}`;
    d.style.gridColumn = `${l.c0 + 1} / ${l.c1 + 2}`;
    sheet.appendChild(d);
    if (l.id) S.lines[l.id] = d;
  }
  for (const c of p.cells) {
    const d = document.createElement('div');
    d.className = `cell ${c.kind}${c.small ? ' small' : ''}${c.cls ? ` ${c.cls}` : ''}`;
    d.style.gridRow = c.rs ? `${c.r + 1} / span ${c.rs}` : `${c.r + 1}`;
    d.style.gridColumn = c.cs ? `${c.c + 1} / span ${c.cs}` : `${c.c + 1}`;
    if (c.kind === 'input') { d.textContent = ''; d.setAttribute('aria-label', '入力欄'); }
    else if (c.kind === 'auto' || c.kind === 'carry') { d.textContent = c.text; d.classList.add('hidden'); }
    else d.textContent = c.text;
    if (c.text === '.' && c.kind === 'auto') d.classList.add('dot');
    sheet.appendChild(d);
    S.cells[c.id] = d;
    d.dataset.id = c.id;
  }
  fitSheet(p);
}

// Size the grid so any layout (wide expressions, tall long division) fits the card.
function fitSheet(p) {
  const wrap = sheet.parentElement;
  const availW = Math.max(200, wrap.clientWidth - 16);
  const availH = parseFloat(getComputedStyle(wrap).minHeight) || 200;
  const base = p.kind === 'div' ? 46 : 56;
  const cw = Math.min(base, availW / p.cols);
  const ch = Math.min(cw * (p.kind === 'div' ? 0.78 : 0.95), availH / p.rows);
  sheet.style.setProperty('--cw', `${cw.toFixed(1)}px`);
  sheet.style.setProperty('--ch', `${ch.toFixed(1)}px`);
}

function activate(k) {
  const p = S.problem;
  $$('.cell.active').forEach((c) => c.classList.remove('active', 'has'));
  const st = p.steps[k];
  if (!st) return;
  const cell = S.cells[st.cell];
  cell.classList.add('active');
  if (st.marks) {
    for (const m of st.marks) {
      const mk = S.cells[`m${m.c}`]; const top = S.cells[`a${m.c}`];
      if (!mk) continue;
      mk.textContent = m.text;
      top && top.classList.add('struck');
      if (!S.reduced) tween(360, (e) => { mk.style.transform = `translateY(${(1 - e) * -14}px) scale(${0.4 + 0.6 * e})`; mk.style.opacity = e; }, easeOutBack);
    }
  }
  S.stepMisses = 0;
  $$('.cell.hint-glow').forEach((c) => c.classList.remove('hint-glow'));
  $('#step-label').innerHTML = `<b>${st.label}</b>${st.hint ? `　${st.hint}` : ''}`;
  if (k === p.steps.length - 1 && k > 0 && S.E >= 0.45 && !S.reach) startReach();
}

// ---------------------------------------------------------------- flow
function startGame(kind = 'level', arg) {
  audio.unlock();
  if (S.bonusOpen) { $('#bonus').hidden = true; S.bonusOpen = false; }
  S.N = Number($('.pick [aria-checked="true"]').dataset.count);
  S.rng = makeRng(Number(params.get('seed') || Math.floor(Math.random() * 1e9)));
  S.sessionSigs = new Set();
  S.kind = kind; S.kindArg = arg;
  S.plan = makePlan(kind, arg);
  if (S.plan.mode === 'review') S.N = S.plan.items.length;
  S.problems = [];
  S.wrongList = []; S.newUnlocks = []; S.newMastered = [];
  Object.assign(S, { endT: 0, qi: 0, firstTry: 0, solved: 0, misses: 0, combo: 0, mode: 'basic', reach: false });
  S.dopa = { L: 0, shown: 0, unit: '' };
  S.extra = { score: 0, solved: 0, misses: 0, end: 0, over: false };
  S.targetMs = Math.ceil((S.N * 18) / 10) * 10 * 1000;
  $('#clock-label').textContent = `目標 ${fmtTime(S.targetMs)}`;
  $('.clock').classList.remove('over', 'extra', 'hurry');
  $('#ok-total').textContent = `/${S.N}`;
  const pips = $('#pips');
  pips.innerHTML = '';
  pips.classList.toggle('many', S.N > 10);
  for (let i = 0; i < S.N; i++) { const s = document.createElement('span'); s.className = 'pip'; pips.appendChild(s); }
  updateTally();
  audio.key = 0;
  audio.startMusic();
  audio.jingle();
  showScreen('play');
  S.startT = now();
  setupProblem();
}

function updateTally() {
  $('#ok').textContent = S.mode === 'extra' ? S.extra.solved : S.solved;
  $('#ng').textContent = S.mode === 'extra' ? S.extra.misses : S.misses;
}

async function setupProblem() {
  S.ready = false;
  const extra = S.mode === 'extra';
  let E;
  if (extra) {
    const tier = Math.floor(S.extra.solved / 3);
    E = 1 + Math.min(0.5, tier * 0.1);
    applyLevel(E, { key: 2 + Math.min(tier, 5), bpm: 134 + tier * 5 });
    if (S.plan.legacy) { const pool = EXTRA_TIERS[Math.min(tier, EXTRA_TIERS.length - 1)]; S.problem = generate(pool[S.extra.solved % pool.length], S.rng); }
    else S.problem = sessionProblem(params.get('skill') || S.plan.extra(S.extra.solved));
  } else {
    E = basicE(S.qi);
    applyLevel(E, { key: S.qi === S.N - 1 ? 2 : 0 });
    S.problem = S.problems[S.qi] || (S.problems[S.qi] = nextProblem(S.qi));
  }
  const p = S.problem;
  S.step = 0; S.wrongInQ = false; S.shownWrong = null;
  $$('.pip').forEach((pp, i) => pp.classList.toggle('now', !extra && i === S.qi));
  $('#qtitle').textContent = p.title;
  $('#qno').textContent = extra ? `EX ${S.extra.solved + 1}` : `第${S.qi + 1}問`;
  renderSheet(p);
  $('#step-label').innerHTML = '&nbsp;';
  const last = !extra && S.qi === S.N - 1;
  if (E > 0.22 || extra) cutin(extra ? `EX ${S.extra.solved + 1}` : last ? 'ラスト1問' : `第${S.qi + 1}問`, E);
  await cardEnter(E);
  if (S.screen !== 'play') return;
  S.ready = true;
  activate(0);
}

async function cardEnter(E) {
  if (S.reduced) { card.style.transform = ''; card.style.opacity = 1; return; }
  if (E < 0.4) {
    await tween(300, (k) => { card.style.transform = `translateX(${(1 - k) * 60}px) rotate(${(1 - k) * 3}deg)`; card.style.opacity = k; }, easeOutCubic);
  } else {
    const drop = 260 + 120 * Math.min(1, E);
    await tween(drop, (k) => { card.style.transform = `translateY(${(1 - k) * -120}px) rotate(${(1 - k) * -8}deg) scale(${0.8 + 0.2 * k})`; card.style.opacity = Math.min(1, k * 3); }, easeInCubic);
    const r = card.getBoundingClientRect();
    fx.puff(r.left + 20, r.bottom, 5); fx.puff(r.right - 20, r.bottom, 5);
    S.shake = Math.max(S.shake, 4 * E);
    audio.land();
    await tween(220, (k) => { card.style.transform = `scale(${1 + Math.sin(k * Math.PI) * 0.035 * E}, ${1 - Math.sin(k * Math.PI) * 0.05 * E})`; });
  }
  card.style.transform = '';
  card.style.opacity = 1;
}

// ---------------------------------------------------------------- input
function pressVisual(btn) {
  if (!btn) return;
  btn.classList.add('press');
  setTimeout(() => btn.classList.remove('press'), 110);
}

function press(key, btn = padButtons[key]) {
  if (S.screen !== 'play') return;
  pressVisual(btn);
  if (key === 'Backspace') { erase(); return; }
  if (!S.ready) return;
  const p = S.problem;
  const st = p.steps[S.step];
  if (!st) return;
  const cell = S.cells[st.cell];
  audio.keyTap(S.combo);
  const from = btn ? centerOf(btn) : centerOf(cell);
  if (key === st.digit) {
    S.step += 1;
    S.combo += 1;
    S.digitsDone += 1;
    const last = S.step >= p.steps.length;
    if (last) S.ready = false;
    S.shownWrong = null;
    cell.classList.remove('bad', 'active', 'has');
    cell.classList.add('ok', 'pending');
    cell.textContent = key;
    bumpDopa(cell);
    carry(from, cell, key, () => { cell.classList.remove('pending'); onCorrect(st, cell, last); });
    if (!last) activate(S.step);
  } else {
    // A slip keeps half the combo so the music and show keep their drive.
    S.combo = Math.floor(S.combo / 2);
    S.wrongInQ = true;
    S.stepMisses = (S.stepMisses || 0) + 1;
    if (S.mode === 'extra') S.extra.misses += 1; else S.misses += 1;
    updateTally();
    cell.classList.add('bad', 'has', 'pending');
    cell.textContent = key;
    S.shownWrong = key;
    carry(from, cell, key, () => { cell.classList.remove('pending'); onWrong(cell, st); });
  }
}

function carry(from, cell, digit, done) {
  if (S.reduced) { done(); return; }
  const to = centerOf(cell);
  hero.carry(from, to, digit, { E: S.E, onGrab: () => audio.grab(), onPlace: () => { audio.place(); done(); } });
}

function erase() {
  if (!S.shownWrong || !S.problem) return;
  const st = S.problem.steps[S.step];
  const cell = S.cells[st.cell];
  cell.textContent = '';
  cell.classList.remove('bad', 'has', 'pending');
  S.shownWrong = null;
  audio.erase();
  const c = centerOf(cell);
  fx.puff(c.x, c.y, 6);
  if (!S.reduced) hero.swipe(c);
}

// ---------------------------------------------------------------- director
function popEl(el, amount = 0.6, dur = 320) {
  if (S.reduced) return;
  tween(dur, (k) => { el.style.transform = `scale(${1 + amount * (1 - k) ** 2})`; }, easeOutCubic).then(() => { el.style.transform = ''; });
}

function reveal(ids, fromCell) {
  ids.forEach((id, i) => {
    const el = S.cells[id] || S.lines[id];
    if (!el) return;
    setTimeout(() => {
      el.classList.remove('hidden');
      if (S.reduced) return;
      if (el.classList.contains('hline')) { tween(220, (k) => { el.style.transform = `scaleX(${k})`; }, easeOutCubic); return; }
      const cellDef = S.problem.cells.find((c) => c.id === id);
      const src = cellDef && cellDef.drop ? S.cells[cellDef.drop] : (cellDef && cellDef.kind === 'carry' ? fromCell : null);
      if (src) {
        const a = src.getBoundingClientRect(); const b = el.getBoundingClientRect();
        const dx = a.left - b.left; const dy = a.top - b.top;
        tween(380, (k) => { el.style.transform = `translate(${dx * (1 - k)}px, ${dy * (1 - k) - Math.sin(k * Math.PI) * 26}px) scale(${1 + Math.sin(k * Math.PI) * 0.5})`; }, easeInOutCubic)
          .then(() => { el.style.transform = ''; const c = centerOf(el); fx.burst(c.x, c.y, { count: 6, kinds: ['star'], speed: 160 }); });
        audio.play('whistle', audio.now(), { from: 900, to: 1500, dur: 0.18, v: 0.05 });
      } else {
        tween(260, (k) => { el.style.transform = `scale(${0.3 + 0.7 * k})`; el.style.opacity = k; }, easeOutBack).then(() => { el.style.transform = ''; });
      }
    }, i * 70);
  });
}

function burstKinds(E) {
  const k = ['confetti'];
  if (E > 0.18) k.push('star');
  if (E > 0.4) k.push('spark', 'spark');
  if (E > 0.58) k.push('coin');
  if (E > 0.72) k.push('mini', 'heart');
  return k;
}

function onCorrect(st, cell, last) {
  const E = S.E;
  const c = centerOf(cell);
  popEl(cell, 0.7 + E * 0.5);
  cell.classList.add('ok');
  reveal(st.after || [], cell);
  if (!S.reduced) {
    fx.burst(c.x, c.y, { count: Math.round(6 + 22 * E), speed: 260 + 260 * E, kinds: burstKinds(E).filter((k) => k !== 'mini' && k !== 'coin'), up: 120, life: 0.55 });
    if (E > 0.35) fxBack.burst(c.x, c.y, { count: Math.round(30 * E), speed: 700, kinds: burstKinds(E), up: 200 });
    fx.ring(c.x, c.y, { color: E > 0.5 ? '#ffd23f' : '#ff7ab6', radius: 40 + 60 * E, width: 6 });
    if (E > 0.5) S.shake = Math.max(S.shake, 2 + 3 * E);
  }
  if (!last) {
    audio.correct(S.combo, E);
    if (!S.reduced && performance.now() > S.busyUntil) {
      hero.earL.kick(500); hero.earR.kick(500);
      hero.setFace('happy', E > 0.4 ? 'grin' : 'cat');
      setTimeout(() => hero.resetFace(), 380);
      if (E > 0.3 && chance(0.6)) { S.busyUntil = performance.now() + 450; hero.hop(14 + 30 * E, 300, { audio }); }
    }
    crowd.forEach((m) => { if (chance(0.7)) m.hop(18 + rand(0, 20), 300); });
  }
  if (last) clearProblem();
}

function onWrong(cell, st) {
  const E = S.E;
  audio.wrong(E);
  const c = centerOf(cell);
  giveHelp(st);
  if (S.reduced) return;
  tween(360, (k) => { cell.style.transform = `translateX(${Math.sin(k * 28) * 7 * (1 - k)}px)`; }).then(() => { cell.style.transform = ''; });
  const h = hero.headCenter;
  const t = 0.3;
  fx.add({ kind: 'text', x: c.x, y: c.y, vx: (h.x - c.x) / t, vy: (h.y - c.y) / t - 200, g: 1300, drag: 0, str: cell.textContent, color: '#ff4f6d', size: 34, life: t });
  setTimeout(() => {
    fx.burst(h.x, h.y - 20, { count: 10, kinds: ['star'], speed: 220, up: 60 });
    fx.ring(h.x, h.y, { color: '#fff', radius: 60, width: 7 });
    S.busyUntil = performance.now() + 900;
    hero.hurt(E, c, { audio });
    if (E > 0.5) { S.shake = Math.max(S.shake, 8); S.flash = Math.max(S.flash, 0.12); }
    crowd.forEach((m) => { m.setFace('wide', 'o'); m.sq.kick(-3); setTimeout(() => m.resetFace(), 600); });
  }, t * 1000);
}

// Repeated slips on the same digit: 2nd highlights the digits to look at
// and Dopakichi points there; 3rd also spells out the sub-calculation.
function giveHelp(st) {
  if (!st || !st.help || S.problem.steps[S.step] !== st) return;
  const n = S.stepMisses;
  if (n < 2) return;
  const els = st.help.ids.map((id) => S.cells[id]).filter((el) => el && !el.classList.contains('hidden'));
  els.forEach((el) => el.classList.add('hint-glow'));
  if (els[0] && !S.reduced) setTimeout(() => hero.point(centerOf(els[0])), 900);
  if (n >= 3) {
    $('#step-label').innerHTML = `<b>${st.label}</b><span class="help-text">ヒント　${st.help.text}</span>`;
    audio.play('blip', audio.now(), { m: 81, v: 0.08 });
  }
}

// Mastery bookkeeping, review list, and unlock announcements.
function noteProblem(p, firstTry) {
  if (S.demo) return;
  const prog = progress();
  if (!firstTry && S.plan.mode !== 'review') {
    S.wrongList.push(p);
    const sig = signature(p);
    if (!prog.review.some((it) => it.sig === sig)) prog.review.push({ sig, skill: p.skill || null, problem: stripProblem(p), at: Date.now() });
    if (prog.review.length > REVIEW_MAX) prog.review.splice(0, prog.review.length - REVIEW_MAX);
  }
  if (S.plan.mode === 'review') {
    const sig = signature(p);
    if (firstTry) prog.review = prog.review.filter((it) => it.sig !== sig);
    else S.wrongList.push(p);
  }
  if (S.plan.placement && S.mode !== 'extra') S.plan.answer(firstTry);
  if (p.skill && !params.has('skill')) {
    const res = recordResult(prog, p.skill, firstTry, signature(p));
    if (res.mastered) S.newMastered.push(p.skill);
    for (const id of res.unlocked) { S.newUnlocks.push(id); announceUnlock(id); }
  }
  store.save();
}
const stripProblem = (p) => JSON.parse(JSON.stringify(p));

function announceUnlock(id) {
  const name = SKILL[id].name;
  setTimeout(() => {
    audio.unit(Math.min(1, S.E + 0.3));
    if (S.reduced) return;
    cutin(`かいほう！ ${name}`, Math.max(0.6, S.E));
    const r = stage.getBoundingClientRect();
    fx.burst(r.left + r.width / 2, r.top + r.height * 0.4, { count: 40, kinds: ['star', 'confetti', 'coin'], speed: 700, up: 200 });
  }, 700);
}

function startReach() {
  S.reach = true;
  body.classList.add('reach');
  const tag = $('#reach-tag');
  tween(S.reduced ? 1 : 420, (k) => { if (S.reach) tag.style.transform = `translateX(-50%) scale(${k})`; }, easeOutBack);
  audio.setReach(true);
  if (!S.reduced) hero.reachPose(true);
  crowd.forEach((m) => { m.setFace('wide', 'puff'); m.cheekPuff = 1; m.shake = 1; });
}
function endReach() {
  S.reach = false;
  body.classList.remove('reach');
  $('#reach-tag').style.transform = 'translateX(-50%) scale(0)';
  audio.setReach(false);
  hero.reachPose(false);
  crowd.forEach((m) => { m.cheekPuff = 0; m.shake = 0; m.resetFace(); });
}

async function clearProblem() {
  const E = S.E;
  const wasReach = S.reach;
  if (wasReach) endReach();
  const extra = S.mode === 'extra';
  noteProblem(S.problem, !S.wrongInQ);
  let gained = 0;
  if (extra) { gained = extraPoints(S.extra.solved); S.extra.solved += 1; S.extra.score += gained; } else { S.solved += 1; if (!S.wrongInQ) S.firstTry += 1; }
  updateTally();
  if (!extra) {
    const pip = $$('.pip')[S.qi];
    pip.classList.remove('now');
    pip.classList.add('done');
    const cols = ['#3b6bff', '#3fdcb0', '#ff5a4f', '#ffd23f'];
    if (E > 0.85) pip.classList.add('rainbow'); else pip.style.setProperty('--c', cols[Math.min(3, Math.floor(E * 4.5))]);
    popEl(pip, 1.2);
  }
  $('#step-label').innerHTML = `<b>${S.problem.answerText}</b>`;
  if (gained) pointsPop(gained);
  if (wasReach) audio.reachHit(E); else audio.clear(E);
  hanamaru(E);
  const lastBasic = !extra && S.qi === S.N - 1;
  celebrate(E, wasReach, lastBasic);
  if (lastBasic) { await finale(); return; }
  await wait((extra ? 520 : lerp(600, 1150, clamp(E))) + (wasReach ? 250 : 0));
  if (S.screen !== 'play' || (extra && S.extra.over)) return;
  if (!extra) S.qi += 1;
  setupProblem();
}

function celebrate(E, big, lastBasic) {
  const r = card.getBoundingClientRect();
  const cx = r.left + r.width / 2; const cy = r.top + r.height * 0.4;
  const W = innerWidth; const H = innerHeight;
  S.busyUntil = performance.now() + 900;
  if (S.reduced) { hero.setFace('happy', 'grin'); setTimeout(() => hero.resetFace(), 700); return; }
  hero.celebrate(Math.min(1, E), { big: E > 0.5 || big, audio });
  crowd.forEach((m, i) => setTimeout(() => m.celebrate(Math.min(1, E), { big: E > 0.8 }), 60 * i));
  const n = Math.round(18 + 80 * Math.min(1.2, E) + (big ? 50 : 0));
  fx.burst(cx, cy, { count: n, speed: 500 + 500 * E, kinds: burstKinds(E), up: 250, life: 0.6 });
  fx.ring(cx, cy, { color: '#ffd23f', radius: 120 + 200 * E, width: 10 });
  if (E > 0.25) fxBack.burst(cx, cy, { count: Math.round(100 * Math.min(1.2, E)), speed: 900 + 400 * E, kinds: burstKinds(E), up: 400 });
  if (E > 0.3) fx.streamers(W, H, Math.round(2 + 6 * E));
  if (E > 0.5) { fxBack.fireworks(W, H, Math.round(2 + 6 * E) + (big ? 4 : 0), 0.06, 0.3); S.flash = Math.max(S.flash, 0.25 * E); }
  if (E > 0.62) fxBack.rain(W, Math.round(20 + 30 * E), { kinds: ['confetti', 'confetti', 'mini', 'coin'] });
  if (E > 0.74 || big) parade(E, big);
  if (big) { S.flash = 1; fx.burst(cx, cy, { count: 50, speed: 900, kinds: ['spark', 'star', 'coin'], up: 100, life: 0.6 }); fxBack.burst(cx, cy, { count: 120, speed: 1300, kinds: ['spark', 'star', 'mini', 'coin'], up: 300 }); }
  S.shake = Math.max(S.shake, 3 + 9 * E + (big ? 6 : 0));
  tween(260, (k) => { card.style.transform = `scale(${1 + Math.sin(k * Math.PI) * 0.04 * E})`; }).then(() => { card.style.transform = ''; });
}

// Hand-drawn "hanamaru" (flower circle) mark, the classic Japanese school "correct".
function hanamaru(E) {
  const el = $('#stamp');
  const flower = E >= 0.45;
  const size = flower ? 150 : 110;
  const N = 11; const R = 58;
  let spiral = ''; const turns = flower ? 2.3 : 1.12;
  for (let i = 0; i <= 90; i++) { const t = i / 90; const a = -1.9 + t * turns * Math.PI * 2; const r = flower ? 9 + t * 29 : 44 + t * 7 + Math.sin(t * 9) * 1.2; spiral += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`; }
  let petals = '';
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2; const a1 = ((i + 1) / N) * Math.PI * 2;
    const p0 = [Math.cos(a0) * R * 0.78, Math.sin(a0) * R * 0.78]; const p1 = [Math.cos(a1) * R * 0.78, Math.sin(a1) * R * 0.78];
    const m = [(Math.cos((a0 + a1) / 2)) * R * 1.12, (Math.sin((a0 + a1) / 2)) * R * 1.12];
    petals += `${i ? '' : `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`}Q${m[0].toFixed(1)} ${m[1].toFixed(1)} ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
  }
  const stroke = E > 0.85 ? 'url(#rb)' : '#ff4f6d';
  el.style.cssText = `width:${size}px;height:${size}px;border:none;box-shadow:none;opacity:1;right:${flower ? 6 : 14}px;top:${flower ? 18 : 34}px`;
  el.innerHTML = `<svg viewBox="-70 -70 140 140" width="100%" height="100%"><defs><linearGradient id="rb" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff4f6d"/><stop offset=".35" stop-color="#ffb000"/><stop offset=".65" stop-color="#3fdcb0"/><stop offset="1" stop-color="#3b6bff"/></linearGradient></defs>
    <path class="sp" d="${spiral}" fill="none" stroke="${stroke}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${flower ? `<path class="pt" d="${petals}" fill="none" stroke="${stroke}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</svg>`;
  const paths = [...el.querySelectorAll('path')];
  paths.forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = S.reduced ? 0 : L; p.dataset.len = L; });
  if (S.reduced) { setTimeout(() => { el.style.opacity = 0; }, 900); return; }
  const drawDur = 260 + (flower ? 120 : 0);
  tween(drawDur, (k) => {
    const a = Math.min(1, k * (flower ? 1.6 : 1));
    paths[0].style.strokeDashoffset = paths[0].dataset.len * (1 - a);
    if (paths[1]) paths[1].style.strokeDashoffset = paths[1].dataset.len * (1 - clamp((k - 0.4) / 0.6));
    el.style.transform = `rotate(${-20 + 20 * k}deg) scale(${1.3 - 0.3 * k})`;
  }, easeOutCubic).then(async () => {
    if (E > 0.85) tween(900, (k) => { el.style.transform = `rotate(${k * 360}deg)`; }, easeOutQuint);
    await wait(760);
    await tween(200, (k) => { el.style.opacity = 1 - k; });
  });
}

function cutin(text, E) {
  if (S.reduced) return;
  audio.cutin();
  const r = stage.getBoundingClientRect();
  const band = document.createElement('div');
  band.className = 'cutin-band';
  const h = 58 + 26 * Math.min(1, E);
  const palettes = [['#3b6bff', '#5b8cff'], ['#ff7ab6', '#ff9ccc'], ['#ffb000', '#ffd23f'], ['#1b1d4d', '#3b3f8f']];
  const pal = palettes[Math.min(3, Math.floor(E * 3.6))];
  band.style.cssText = `top:${r.top + r.height / 2 - h / 2}px;height:${h}px;--c1:${pal[0]};--c2:${pal[1]}`;
  band.innerHTML = `<div class="band-bg"></div><div class="band-text" style="font-size:${34 + 16 * Math.min(1, E)}px">${text}</div>`;
  $('#cutins').appendChild(band);
  const rot = -6;
  (async () => {
    await tween(240, (k) => { band.style.transform = `translateX(${(1 - k) * 110}%) rotate(${rot}deg) scaleY(${0.6 + 0.4 * k})`; }, easeOutBack);
    await wait(360 + 160 * E);
    await tween(200, (k) => { band.style.transform = `translateX(${-k * 110}%) rotate(${rot}deg)`; }, easeInCubic);
    band.remove();
  })();
}

function bumpDopa(cell) {
  const prev = S.dopa.L;
  let L;
  if (S.mode === 'extra') L = prev + extraProblemGain(S.extra.solved) / S.problem.steps.length;
  else L = basicDopaL((S.qi + S.step / S.problem.steps.length) / S.N);
  S.dopa.L = Math.max(prev + 0.05, L);
  const E = S.E;
  if (E > 0.12 && !S.reduced) {
    const gain = S.dopa.L + Math.log10(1 - 10 ** (prev - S.dopa.L));
    const c = centerOf(cell);
    fx.text(c.x, c.y - 30, `+${10 ** gain < 1 ? 1 : fmtDopa(gain)}`, { color: pick(['#ffd23f', '#fff', '#8fd3ff', '#ffb3d6']), size: 16 + 10 * Math.min(1, E), vy: -120 });
  }
  popEl($('#dopa-box'), 0.12 + 0.2 * E, 260);
}

// Floating "+N点" above the card when an extra problem is cleared.
function pointsPop(points) {
  const r = card.getBoundingClientRect();
  const x = r.left + r.width / 2; const y = r.top + 26;
  if (S.reduced) return;
  fx.text(x, y, `+${points.toLocaleString('ja-JP')}点`, { color: '#ffd23f', size: 30 + Math.min(26, Math.log2(points / 10) * 4), vy: -160, life: 1.1 });
}

function unitSlam(unit, L) {
  const E = S.E;
  audio.unit(E);
  if (S.reduced) return;
  const box = $('#dopa-box').getBoundingClientRect();
  const r = stage.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'unit-slam';
  const big = E > 0.45 && unit !== '百';
  const size = big ? 64 + 40 * Math.min(1, E) : 30;
  el.style.fontSize = `${size}px`;
  el.textContent = unitLabel(unit);
  $('#cutins').appendChild(el);
  const w = el.offsetWidth; const h = el.offsetHeight;
  const x0 = big ? r.left + r.width / 2 - w / 2 : box.left + box.width / 2 - w / 2;
  const y0 = big ? r.top + r.height * 0.35 - h / 2 : box.bottom + 4;
  el.style.left = `${x0}px`; el.style.top = `${y0}px`;
  if (big) {
    const c = { x: x0 + w / 2, y: y0 + h / 2 };
    fx.burst(c.x, c.y, { count: 30 + 40 * E, kinds: ['coin', 'star', 'spark'], speed: 600 });
    fx.ring(c.x, c.y, { color: '#ffd23f', radius: 180, width: 12 });
    S.shake = Math.max(S.shake, 6);
  }
  (async () => {
    await tween(big ? 280 : 200, (k) => { el.style.transform = `scale(${lerp(big ? 3.2 : 1.8, 1, k)}) rotate(${lerp(-18, -4, k)}deg)`; el.style.opacity = Math.min(1, k * 2); }, easeOutBack);
    await wait(big ? 520 : 400);
    const tx = box.left + box.width / 2 - (x0 + w / 2); const ty = box.top + box.height / 2 - (y0 + h / 2);
    await tween(260, (k) => { el.style.transform = `translate(${tx * k}px, ${ty * k}px) scale(${1 - 0.8 * k}) rotate(-4deg)`; el.style.opacity = 1 - k * 0.6; }, easeInCubic);
    el.remove();
    popEl($('#dopa-box'), 0.35, 300);
  })();
}

async function parade(E, big) {
  if (actors.length > 10 || S.motion < 0.5) return;
  const r = stage.getBoundingClientRect();
  const pals = ['blue', 'yellow', 'mint', 'violet', 'pink'];
  const n = Math.round(3 + 4 * Math.min(1, E) + (big ? 2 : 0));
  const dir = chance(0.5) ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const m = new Dopakichi(backLayer, { scale: 0.32 + rand(0, 0.12), palette: pals[i % pals.length], front: frontLayer });
    const y = r.top + rand(r.height * 0.25, r.height * 0.55);
    const x0 = dir > 0 ? -60 - i * 70 : innerWidth + 60 + i * 70;
    m.place(x0, y);
    m.setFace(pick(['happy', 'star', 'wink']), pick(['grin', 'big', 'cat']), true);
    m.hands.forEach((h) => { h.raise = 1; });
    actors.push(m);
    (async () => {
      const x1 = dir > 0 ? innerWidth + 80 : -80;
      const hops = 5 + Math.floor(rand(0, 3));
      for (let k = 1; k <= hops; k++) {
        const tx = lerp(x0, x1, k / hops);
        await m.hop(30 + rand(0, 40), 300 + rand(0, 80), { to: { x: tx, y }, spin: chance(0.25) ? 360 * dir : 0 });
      }
      m.destroy();
      actors.splice(actors.indexOf(m), 1);
    })();
  }
}

function ensureCrowd(E) {
  const want = [];
  if (E >= 0.45) want.push({ pal: 'blue', side: -1, s: 0.46 });
  if (E >= 0.68) want.push({ pal: 'yellow', side: 1, s: 0.46 });
  if (E >= 0.88) want.push({ pal: 'mint', side: -1.9, s: 0.36 }, { pal: 'violet', side: 1.9, s: 0.36 });
  if (S.reduced || S.motion < 0.5) want.length = 0;
  while (crowd.length > want.length) { const m = crowd.pop(); m.destroy(); actors.splice(actors.indexOf(m), 1); }
  for (let i = crowd.length; i < want.length; i++) {
    const w = want[i];
    const m = new Dopakichi(backLayer, { scale: w.s, palette: w.pal, front: frontLayer });
    m.side = w.side; m.bob = 1;
    crowd.push(m); actors.push(m);
    placeCrowd(m, i);
    const home = { ...m.home };
    m.place(w.side < 0 ? -80 : innerWidth + 80, home.y);
    m.hop(80, 520, { to: home }).then(() => { m.place(home.x, home.y); });
  }
}
function placeCrowd(m, i) {
  if (S.screen !== 'play') { m.visible = false; return; }
  m.visible = true;
  const r = stage.getBoundingClientRect();
  const off = Math.abs(m.side) > 1.5 ? 0.06 : 0.2;
  const x = m.side < 0 ? r.left + r.width * off : r.right - r.width * off;
  m.place(x, r.bottom - 12 - (Math.abs(m.side) > 1.5 ? 18 : 0));
  void i;
}

async function finale() {
  S.ready = false;
  S.endT = now();
  const W = innerWidth; const H = innerHeight;
  audio.finale();
  await wait(120);
  if (!S.reduced) {
    S.flash = 1;
    fxBack.fireworks(W, H, 10, 0.06, 0.45);
    fx.streamers(W, H, 12);
    fxBack.rain(W, 70, { kinds: ['confetti', 'confetti', 'mini', 'star', 'coin'] });
    fx.burst(W / 2, H * 0.4, { count: 70, speed: 1200, kinds: ['confetti', 'star', 'spark', 'coin', 'mini'], up: 300, life: 0.7 });
    const giant = new Dopakichi(backLayer, { scale: Math.min(2.2, W / 200), palette: 'pink', front: frontLayer });
    giant.place(W / 2, H + 380 * giant.S / 3);
    giant.setFace('happy', 'grin', true);
    giant.hands.forEach((h) => { h.raise = 1; });
    actors.push(giant);
    const y0 = giant.y; const y1 = H + 10;
    await tween(700, (k) => { giant.y = lerp(y0, y1, k); giant.ground = giant.y; }, easeOutBack);
    bigStamp('100点');
    S.shake = 16;
    for (let i = 0; i < 3; i++) { giant.earL.kick(700); giant.earR.kick(700); await tween(260, (k) => { giant.lift = Math.sin(k * Math.PI) * 60; giant.rot = Math.sin(k * Math.PI * 2) * 6; }); giant.lift = 0; giant.rot = 0; giant.sq.value = 0.85; }
    parade(1, true);
    await wait(900);
    fxBack.fireworks(W, H, 6, 0.06, 0.35);
    fx.fireworks(W, H, 3, 0.06, 0.3);
    await tween(500, (k) => { giant.y = lerp(y1, y0, k); giant.ground = giant.y; }, easeInCubic);
    giant.destroy(); actors.splice(actors.indexOf(giant), 1);
  } else {
    await wait(800);
  }
  showResult();
}

function bigStamp(text) {
  const el = document.createElement('div');
  el.className = 'unit-slam';
  el.style.fontSize = `${Math.min(110, innerWidth * 0.26)}px`;
  el.style.color = '#ff7ab6';
  el.textContent = text;
  $('#cutins').appendChild(el);
  const w = el.offsetWidth; const h = el.offsetHeight;
  el.style.left = `${innerWidth / 2 - w / 2}px`; el.style.top = `${innerHeight * 0.2 - h / 2}px`;
  (async () => {
    await tween(320, (k) => { el.style.transform = `scale(${lerp(4, 1, k)}) rotate(${lerp(-25, -6, k)}deg)`; el.style.opacity = Math.min(1, k * 2); }, easeOutBack);
    await wait(1500);
    await tween(300, (k) => { el.style.opacity = 1 - k; el.style.transform = `scale(${1 + k * 0.3}) rotate(-6deg)`; });
    el.remove();
  })();
}

function showResult() {
  const rate = S.firstTry / S.N;
  $('#r-score').textContent = String(BASIC_SCORE);
  $('#r-ok').innerHTML = `${S.solved}<small>問</small>`;
  $('#r-ng').innerHTML = `${S.misses}<small>回</small>`;
  $('#r-rate').textContent = `${Math.round(rate * 100)}%`;
  const t = S.endT - S.startT;
  $('#r-time').textContent = fmtTime(t);
  $('#r-dopa').textContent = fmtDopa(S.dopa.L);
  const review = S.plan.mode === 'review';
  const ok = rate >= 0.8 && !review;
  if (S.plan.placement && !S.demo) { progress().placed = true; store.save(); }
  S.record = S.demo ? null : store.addRecord({ mode: S.plan.mode, grade: S.plan.grade, skill: S.plan.skill, count: S.N, score: BASIC_SCORE, ok: S.solved, ng: S.misses, firstRate: rate, timeMs: Math.round(t), dopaL: S.dopa.L });
  $('#result-title').textContent = review ? 'ふくしゅう クリア' : `${modeName(S.plan)} クリア`;
  const un = $('#r-unlock');
  un.textContent = review ? '' : ok ? 'エクストラ解放' : '初回正解率80%以上でエクストラ';
  un.classList.toggle('yes', ok);
  $('#go-extra').hidden = !ok;
  $('#go-extra small').textContent = `${Math.round(EXTRA_MS / 1000)}秒`;
  $('#go-again').hidden = ok;
  renderSkillNews($('#r-skills'));
  $('#go-tree').hidden = !(S.newUnlocks.length || S.newMastered.length || S.plan.placement);
  setReviewButton($('#go-review'), ok ? 0 : S.wrongList.length);
  audio.play('musicGain', audio.now(), { v: 0.55, ramp: 0.6 });
  showScreen('result');
  countUp($('#r-score'), BASIC_SCORE, 900);
  demoAfterResult('result');
}

function countUp(el, to, dur, from = 0) {
  if (S.reduced) { el.textContent = to.toLocaleString('ja-JP'); return; }
  let lastV = -1;
  tween(dur, (k) => { const v = Math.round(lerp(from, to, k)); if (v !== lastV) { el.textContent = v.toLocaleString('ja-JP'); lastV = v; if (v % 5 === 0 || to > 400) audio.play('blip', audio.now(), { m: 72 + Math.floor((v / Math.max(1, to)) * 24), v: 0.06 }); } }, easeOutCubic)
    .then(() => { audio.clear(1); const c = centerOf(el); fx.burst(c.x, c.y, { count: 40, kinds: ['confetti', 'star', 'coin'], speed: 700, up: 200, life: 0.6 }); fxBack.burst(c.x, c.y, { count: 90, kinds: ['confetti', 'star', 'coin', 'mini'], speed: 1100, up: 300 }); hero.celebrate(1, { big: true, audio }); });
}

function startExtra() {
  S.mode = 'extra';
  S.extra = { score: 0, solved: 0, misses: 0, end: 0, over: false };
  S.combo = 0;
  $('.clock').classList.add('extra');
  $('#clock-label').textContent = 'のこり';
  $('#ok-total').textContent = '';
  updateTally();
  audio.play('musicGain', audio.now(), { v: 0.8, ramp: 0.2 });
  showScreen('play');
  S.extra.end = now() + EXTRA_MS + 900;
  audio.gong();
  cutin('EXTRA', 1);
  S.flash = 0.8;
  setupProblem();
}

async function endExtra() {
  S.extra.over = true;
  S.ready = false;
  if (S.reach) endReach();
  audio.gong();
  bigStamp('終了');
  S.flash = 0.6;
  await wait(1700);
  showFinal();
}

function showFinal() {
  const total = BASIC_SCORE + S.extra.score;
  if (S.record) store.updateRecord(S.record.id, { score: total, extraOk: S.extra.solved, extraNg: S.extra.misses, dopaL: S.dopa.L });
  $('#f-break').textContent = `基本 ${BASIC_SCORE} ＋ エクストラ ${S.extra.score.toLocaleString('ja-JP')}`;
  $('#f-ok').innerHTML = `${S.extra.solved}<small>問</small>`;
  $('#f-ng').innerHTML = `${S.extra.misses}<small>回</small>`;
  $('#f-bng').innerHTML = `${S.misses}<small>回</small>`;
  $('#f-time').textContent = fmtTime(S.endT - S.startT);
  $('#f-dopa').textContent = fmtDopa(S.dopa.L);
  renderSkillNews($('#f-skills'));
  $('#f-tree').hidden = !(S.newUnlocks.length || S.newMastered.length || S.plan.placement);
  setReviewButton($('#f-review'), S.wrongList.length);
  audio.play('musicGain', audio.now(), { v: 0.55, ramp: 0.6 });
  showScreen('final');
  demoAfterResult('final');
  countUp($('#f-score'), total, 1300 + Math.min(1400, S.extra.solved * 160));
}

// ---------------------------------------------------------------- demo play
// Plays by itself through the normal input and judging path, with human-ish
// timing and occasional slips, then loops. Any tap or key ends it.
const DEMO = { next: 0, since: 0, timer: 0 };
function startDemo() {
  closeSettings();
  S.demo = true;
  DEMO.since = now();
  body.classList.add('demo');
  DEMO.slipped = 0;
  startGame('demo');
}
function stopDemo() {
  if (!S.demo) return;
  S.demo = false;
  clearTimeout(DEMO.timer);
  body.classList.remove('demo');
  toTitle();
}
function demoTick(t) {
  if (!S.demo) return;
  if (S.screen === 'play' && S.ready && t > DEMO.next && S.problem) {
    const st = S.problem.steps[S.step];
    if (!st) return;
    // Keep slips rare enough in the basic set that the extra stage still unlocks.
    const room = S.mode === 'extra' || S.wrongInQ || (DEMO.slipped || 0) < Math.floor(S.N * 0.2);
    const slip = room && !S.shownWrong && Math.random() < (S.mode === 'extra' ? 0.05 : 0.1);
    if (slip && S.mode !== 'extra' && !S.wrongInQ) DEMO.slipped = (DEMO.slipped || 0) + 1;
    const key = slip ? String((Number(st.digit) + 1 + Math.floor(Math.random() * 8)) % 10) : st.digit;
    press(key, padButtons[key]);
    DEMO.next = t + (slip ? 650 : rand(230, 480) * (S.mode === 'extra' ? 0.8 : 1));
  }
}
function demoAfterResult(screen) {
  if (!S.demo) return;
  clearTimeout(DEMO.timer);
  DEMO.timer = setTimeout(() => {
    if (!S.demo) return;
    if (screen === 'result' && !$('#go-extra').hidden) startExtra();
    else { toTitle(); DEMO.timer = setTimeout(() => { if (S.demo) { DEMO.slipped = 0; startGame('demo'); } }, 1800); }
  }, screen === 'result' ? 3800 : 5200);
}
addEventListener('pointerdown', (e) => {
  if (!S.demo || now() - DEMO.since < 600) return;
  e.stopPropagation(); e.preventDefault();
  stopDemo();
}, true);

function modeName(plan) {
  if (plan.mode === 'grade') return MODE_LABEL.grade(plan.grade);
  if (plan.mode === 'practice') return `れんしゅう`;
  if (plan.mode === 'demo') return 'デモ';
  return MODE_LABEL[plan.mode] || 'ドリル';
}
function renderSkillNews(el) {
  const items = [
    ...S.newMastered.map((id) => `<p class="mastered">マスター！ ${SKILL[id].name}</p>`),
    ...S.newUnlocks.map((id) => `<p>かいほう！ ${SKILL[id].name}</p>`),
  ];
  if (S.plan.placement) items.unshift(`<p>じつりょくチェック おわり　${SKILLS.filter((x) => stateOf(progress(), x.id) === 'mastered').length}こ クリア</p>`);
  el.innerHTML = items.slice(0, 5).join('');
}
function setReviewButton(btn, n) {
  btn.hidden = !n;
  btn.textContent = `まちがえた ${n}問を やりなおす`;
}
function startReview() {
  const prog = progress();
  if (!prog.review.length) return;
  startGame('review');
}
function refreshTitle() {
  const prog = progress();
  const n = prog.review.length;
  $('#start-review').hidden = !n;
  $('#review-count').textContent = n;
  $('#level-sub').textContent = prog.placed ? `つぎは「${SKILL[frontier(prog)[0] || ORDER[ORDER.length - 1]].name}」` : 'はじめは じつりょくチェック';
  const done = SKILLS.filter((x) => stateOf(prog, x.id) === 'mastered').length;
  $('#tree-badge').textContent = `${done}/${SKILLS.length}`;
}

function toTitle() {
  audio.stopMusic();
  refreshTitle();
  S.mode = 'basic';
  applyLevel(0.02, { key: 0 });
  audio.play('musicGain', audio.now(), { v: 0.8, ramp: 0.1 });
  renderCalendar(true);
  showScreen('title');
  checkLoginBonus();
}

// ---------------------------------------------------------------- frame loop
let lastClockText = '';
onFrame((dt, t) => {
  audio.update();
  demoTick(t);
  const pulse = audio.pulse();
  const targetKick = audio.playing ? pulse.kick * (S.level >= 1 ? 1 : 0.2) : 0;
  S.kick = S.reduced ? 0 : targetKick;
  body.style.setProperty('--kick', S.kick.toFixed(3));

  // dopa counter rolls in log space
  const d = S.dopa;
  if (d.shown < d.L) {
    d.shown = Math.min(d.L, d.shown + Math.max(0.02, (d.L - d.shown) * Math.min(1, dt * 7)));
    $('#dopa').textContent = fmtDopa(d.shown);
    const u = unitOf(d.shown);
    if (u !== d.unit) { if (u) unitSlam(u, d.shown); d.unit = u; }
  }

  if (S.screen === 'play') {
    let txt;
    if (S.mode === 'extra') {
      const left = Math.max(0, S.extra.end - t);
      txt = fmtTime(left + 999);
      $('.clock').classList.toggle('hurry', left < 10000);
      if (left < 5500 && left > 0) {
        const sec = Math.ceil(left / 1000);
        if (sec !== S.lastTick) { S.lastTick = sec; audio.tick(sec <= 1); }
      }
      if (left <= 0 && !S.extra.over) endExtra();
    } else {
      const el = (S.endT || t) - S.startT;
      txt = fmtTime(el);
      $('.clock').classList.toggle('over', el > S.targetMs);
      if (el > S.targetMs) $('#clock-label').textContent = '目標超過';
    }
    if (txt !== lastClockText) { $('#clock').textContent = txt; lastClockText = txt; }

    // Hero wanders around the stage between actions.
    if (!S.reduced && S.motion >= 0.35 && S.E > 0.3 && t > S.idleAt && t > S.busyUntil && !S.reach && !hero.hands.some((h) => h.job)) {
      S.idleAt = t + rand(2200, 4200) / (0.6 + S.E);
      const r = stage.getBoundingClientRect();
      const x = clamp(r.left + r.width / 2 + rand(-0.28, 0.28) * r.width, r.left + 50, r.right - 50);
      hero.hop(20 + 40 * S.E, 420, { to: { x, y: hero.home.y }, spin: S.E > 0.6 && chance(0.3) ? 360 : 0 }).then((ok) => { if (ok) hero.x = x; });
    }
    const target = S.problem && S.problem.steps[S.step] ? S.cells[S.problem.steps[S.step].cell] : null;
    if (target && !hero.hands.some((h) => h.job)) hero.lookAt(centerOf(target));
  }

  // screen shake (keypad stays still to keep tap targets stable)
  S.shake = Math.max(0, S.shake - dt * 30);
  const shk = S.shake * S.motion;
  const sx = shk > 0.1 && !S.reduced ? rand(-shk, shk) : 0;
  const sy = shk > 0.1 && !S.reduced ? rand(-shk, shk) : 0;
  const tr = shk > 0.1 ? `translate(${sx}px, ${sy}px)` : '';
  stage.style.translate = tr ? `${sx}px ${sy}px` : '';
  $('.hud').style.translate = tr ? `${sx * 0.5}px ${sy * 0.5}px` : '';
  S.flash = Math.max(0, S.flash - dt * 3.2);
  $('#flash').style.opacity = S.reduced ? 0 : ((S.flash * S.motion) ** 1.5 * 0.6).toFixed(3);

  // backdrop
  const vE = S.settingsOpen ? S.previewE : (S.screen === 'title' || S.screen === 'tree') ? 0.04 : lerp(Math.min(S.E, 0.3), S.E, S.motion);
  S.visualE = lerp(S.visualE, vE, Math.min(1, dt * 2.2));
  const st = bg.state;
  st.E = S.visualE;
  st.kick = S.kick;
  st.flash = S.reduced ? 0 : S.flash * S.motion;
  st.reach = lerp(st.reach, S.reach ? 1 : 0, Math.min(1, dt * 5));
  st.hue += dt * 0.03 * S.visualE;
  const hc = hero.headCenter;
  st.cx = lerp(st.cx || hc.x, S.screen === 'play' ? stage.getBoundingClientRect().left + stage.clientWidth / 2 : innerWidth / 2, Math.min(1, dt * 3));
  st.cy = lerp(st.cy || hc.y, S.screen === 'play' ? stage.getBoundingClientRect().top + stage.clientHeight * 0.55 : innerHeight * 0.4, Math.min(1, dt * 3));
  bg.render(t);
  fx.update(dt);
  fx.draw();
  fxBack.update(dt);
  fxBack.draw();
  const ctx = { beat: S.kick };
  for (const a of actors) a.update(dt, t, ctx);
});

// Title screen idle performance.
onFrame((dt, t) => {
  if (S.screen !== 'title' || S.reduced || S.settingsOpen || S.bonusOpen) return;
  if (t > S.idleAt && t > S.busyUntil) {
    S.idleAt = t + rand(1600, 2800);
    const r = $('#title-stage').getBoundingClientRect();
    const x = r.left + r.width / 2 + rand(-0.25, 0.25) * r.width;
    const roll = Math.random();
    if (roll < 0.35) hero.hop(40, 420, { to: { x, y: hero.home.y } }).then((ok) => { if (ok) hero.x = x; });
    else if (roll < 0.55) hero.hop(70, 560, { spin: 360 });
    else if (roll < 0.75) hero.celebrate(0.4, { variant: 'earflap' });
    else hero.clap(3);
  }
});

// ---------------------------------------------------------------- wiring
function setMotion(v, { persist = true } = {}) {
  S.motion = clamp(v);
  S.reduced = S.motion <= 0.001;
  fx.reduced = S.reduced; fxBack.reduced = S.reduced;
  fx.motion = S.motion; fxBack.motion = S.motion;
  body.classList.toggle('reduced', S.reduced);
  const sl = $('#motion');
  sl.value = Math.round(S.motion * 100);
  sl.style.setProperty('--v', S.motion);
  $('#motion-val').textContent = `${Math.round(S.motion * 100)}%`;
  ensureCrowd(S.E);
  if (persist) store.updateSettings({ motion: S.motion });
}
function setMuted(m, { persist = true } = {}) {
  S.muted = m;
  audio.setMuted(m);
  const b = $('[data-toggle="sound"]');
  b.setAttribute('aria-pressed', String(!m));
  b.querySelector('b').textContent = m ? 'オフ' : 'オン';
  $('#mute').setAttribute('aria-pressed', String(m));
  $('#mute').setAttribute('aria-label', m ? '音を出す' : '音を消す');
  if (persist) store.updateSettings({ sound: !m });
}
function setVolume(v, { persist = true } = {}) {
  audio.setVolume(v);
  const sl = $('#volume');
  sl.value = Math.round(v * 100);
  sl.style.setProperty('--v', v);
  if (persist) store.updateSettings({ volume: v });
}
function setCount(n, { persist = true } = {}) {
  $$('.pick button').forEach((x) => x.setAttribute('aria-checked', String(Number(x.dataset.count) === n)));
  if (persist) store.updateSettings({ count: n });
}

// ---------------------------------------------------------------- skill tree
// Lanes are columns; a node sits below all of its prerequisites and never
// shares a row with another node of the same lane, so the tree grows downward.
const TREE = (() => {
  const row = {}; const used = LANES.map(() => new Set());
  for (const id of ORDER) {
    const sk = SKILL[id];
    let r = sk.req.length ? Math.max(...sk.req.map((q) => row[q])) + 1 : 0;
    while (used[sk.lane].has(r)) r += 1;
    used[sk.lane].add(r); row[id] = r;
  }
  return { row, rows: Math.max(...Object.values(row)) + 1 };
})();
const NODE_H = 58; const ROW_H = 80;

function renderTree(justIds = []) {
  const prog = progress();
  const tree = $('#tree');
  const W = tree.clientWidth || 360;
  const laneW = W / LANES.length;
  const nodeW = laneW - 8;
  tree.style.height = `${TREE.rows * ROW_H + 20}px`;
  tree.querySelectorAll('.node').forEach((n) => n.remove());
  const pos = {};
  for (const sk of SKILLS) pos[sk.id] = { x: sk.lane * laneW + 4, y: TREE.row[sk.id] * ROW_H + 14 };
  let links = '';
  for (const sk of SKILLS) for (const q of sk.req) {
    const a = pos[q]; const b = pos[sk.id];
    const x1 = a.x + nodeW / 2; const y1 = a.y + NODE_H; const x2 = b.x + nodeW / 2; const y2 = b.y;
    const on = stateOf(prog, q) === 'mastered';
    const grow = justIds.includes(sk.id);
    links += `<path class="${on ? 'on' : ''}${grow ? ' grow' : ''}" data-to="${sk.id}" d="M${x1} ${y1} C${x1} ${y1 + 34} ${x2} ${y2 - 34} ${x2} ${y2}"/>`;
  }
  $('#tree-links').innerHTML = links;
  for (const sk of SKILLS) {
    const st = stateOf(prog, sk.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `node ${st}${justIds.includes(sk.id) ? ' just' : ''}`;
    b.dataset.id = sk.id;
    b.style.cssText = `left:${pos[sk.id].x}px;top:${pos[sk.id].y}px;width:${nodeW}px;height:${NODE_H}px;--p:${masteryRatio(prog, sk.id)}`;
    b.innerHTML = `<span class="g">${sk.grade}年</span><span>${sk.name}</span>${st === 'learning' ? '<i class="ring"></i>' : ''}`;
    b.setAttribute('aria-label', `${sk.name} ${{ locked: 'まだ', new: 'あたらしい', learning: 'れんしゅうちゅう', mastered: 'マスター' }[st]}`);
    tree.appendChild(b);
  }
  $('#tree-count').textContent = `${SKILLS.filter((x) => stateOf(prog, x.id) === 'mastered').length} / ${SKILLS.length}`;
  // Animate new branches growing.
  if (!S.reduced) tree.querySelectorAll('.tree-links path.grow').forEach((path) => {
    const L = path.getTotalLength();
    path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
    tween(700, (k) => { path.style.strokeDashoffset = L * (1 - k); }, easeOutCubic);
  });
}

function openTree(justIds = []) {
  audio.unlock();
  audio.play('blip', audio.now(), { m: 79, v: 0.1 });
  $('#tree-lanes').innerHTML = LANES.map((l) => `<span>${l}</span>`).join('');
  showScreen('tree');
  requestAnimationFrame(() => {
    renderTree(justIds);
    const prog = progress();
    const focus = justIds[0] || frontier(prog)[0];
    const el = focus && $(`.node[data-id="${focus}"]`);
    if (el) $('#tree-scroll').scrollTop = Math.max(0, el.offsetTop - 140);
    requestAnimationFrame(() => {
      layoutActors();
      if (el && !S.reduced) setTimeout(() => {
        const r = el.getBoundingClientRect();
        hero.leapTo({ x: r.left + r.width / 2, y: r.top - 2 }, 120, { audio, spin: 360 }).then(() => { hero.home = { x: hero.x, y: hero.y }; hero.celebrate(0.8, { variant: 'clapjump', audio }); const c = centerOf(el); fx.burst(c.x, c.y, { count: 30, kinds: ['star', 'confetti'], speed: 400, up: 120 }); });
      }, justIds.length ? 500 : 200);
    });
  });
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------------------------------------------------------------- calendar
const cal = { y: new Date().getFullYear(), m: new Date().getMonth(), seen: new Set() };
const MODE_NAMES = { drill: (h) => `${h.count || ''}問ドリル`, level: () => 'じぶんレベル', grade: (h) => `${h.grade}ねんせい`, review: () => 'ふくしゅう', practice: (h) => `れんしゅう（${SKILL[h.skill]?.name || ''}）` };
const stampSvg = (score) => {
  const gold = score > 100;
  const col = gold ? '#ffb000' : '#ff4f6d';
  return `<svg viewBox="-20 -20 40 40" aria-hidden="true"><path d="M-2 -15 C10 -16 16 -6 14 4 C12 13 1 17 -8 13 C-16 9 -16 -4 -8 -11 C-3 -15 5 -14 9 -10" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round"/>${gold ? '<path d="M0 -19 l2 4 4 .5 -3 3 .8 4 -3.8 -2 -3.8 2 .8 -4 -3 -3 4 -.5z" fill="#ffd23f" stroke="#1b1d4d" stroke-width="1"/>' : ''}</svg>`;
};
function renderCalendar(animateNew = false) {
  const { y, m } = cal;
  const today = new Date();
  const todayKey = store.dayKey(today);
  $('#cal-title').textContent = `${y}年${m + 1}月`;
  const sum = store.monthSummary(y, m);
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < first; i++) html += '<span class="cal-day blank"></span>';
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const info = sum[key];
    const cls = ['cal-day'];
    if (key === todayKey) cls.push('today');
    if (info) { cls.push('played'); if (animateNew && !cal.seen.has(`${key}:${info.best}`)) cls.push('pop'); }
    const label = info ? `${m + 1}月${d}日 ${info.plays}回 さいこう${info.best}点` : `${m + 1}月${d}日`;
    const sticker = store.stickerOn(key);
    const stk = sticker ? `<span class="stk">${stickerSvg(sticker)}</span>` : '';
    html += info
      ? `<button type="button" class="${cls.join(' ')}" data-day="${key}" aria-label="${label}"><span class="n">${d}</span>${stampSvg(info.best)}<span class="sc${info.best >= 10000 ? ' big' : ''}">${info.best.toLocaleString('ja-JP')}</span>${stk}</button>`
      : `<span class="${cls.join(' ')}" aria-label="${label}"><span class="n">${d}</span>${stk}</span>`;
    if (info) cal.seen.add(`${key}:${info.best}`);
  }
  $('#cal-grid').innerHTML = html;
  const n = store.streak(today);
  const playedToday = store.playedDays().has(todayKey);
  const best = store.bestStreak();
  const bonus = store.bonusState();
  const badges = [];
  if (n >= 1) badges.push(`<span class="cal-badge${n >= 3 ? ' hot' : ''}">れんぞく<b>${n}</b>日${playedToday ? '' : '（きょうで' + (n + 1) + '日）'}</span>`);
  else badges.push(`<span class="cal-badge">きょうから れんぞく記録スタート</span>`);
  if (best >= 2) badges.push(`<span class="cal-badge best">さいこう<b>${best}</b>日</span>`);
  if (bonus.total) badges.push(`<span class="cal-badge stk">シール<b>${bonus.total}</b>まい</span>`);
  $('#cal-badges').innerHTML = badges.join('');
  $('#cal-next').disabled = y > today.getFullYear() || (y === today.getFullYear() && m >= today.getMonth());
  if (animateNew && !S.reduced) $$('.cal-day.pop').forEach((el, i) => setTimeout(() => { const c = centerOf(el); fx.burst(c.x, c.y, { count: 14, kinds: ['confetti', 'star'], speed: 260, up: 80 }); audio.play('blip', audio.now(), { m: 84, v: 0.08 }); }, 350 + i * 120));
}
// Login-bonus stickers (hand-cut paper shapes).
function stickerSvg(type) {
  const k = '#1b1d4d';
  const shapes = {
    star: `<path d="M0 -17 L5 -6 L17 -5 L8 3 L11 15 L0 9 L-11 15 L-8 3 L-17 -5 L-5 -6Z" fill="#ffd23f" stroke="${k}" stroke-width="2.5" stroke-linejoin="round"/>`,
    heart: `<path d="M0 15 C-20 2 -15 -14 -6 -13 C-2 -13 0 -9 0 -7 C0 -9 2 -13 6 -13 C15 -14 20 2 0 15Z" fill="#ff7ab6" stroke="${k}" stroke-width="2.5"/>`,
    flower: `${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-9" rx="6.5" ry="9" transform="rotate(${a})" fill="#8fb4ff" stroke="${k}" stroke-width="2.2"/>`).join('')}<circle r="6" fill="#ffd23f" stroke="${k}" stroke-width="2.2"/>`,
    note: `<path d="M-4 9 V-13 L12 -16 V5" fill="none" stroke="${k}" stroke-width="3.5" stroke-linejoin="round"/><ellipse cx="-9" cy="10" rx="6.5" ry="5" fill="#3fdcb0" stroke="${k}" stroke-width="2.5"/><ellipse cx="7" cy="6" rx="6.5" ry="5" fill="#3fdcb0" stroke="${k}" stroke-width="2.5"/>`,
    clover: `${[0, 90, 180, 270].map((a) => `<circle cx="0" cy="-7.5" r="7" transform="rotate(${a})" fill="#6fd66f" stroke="${k}" stroke-width="2.2"/>`).join('')}<path d="M2 6 Q6 12 5 17" stroke="${k}" stroke-width="2.5" fill="none"/>`,
    hanamaru: `<path d="M-2 -15 C10 -16 16 -6 14 4 C12 13 1 17 -8 13 C-16 9 -16 -4 -8 -11 C-3 -15 5 -14 9 -10" fill="none" stroke="#ff4f6d" stroke-width="3.5" stroke-linecap="round"/><path d="M-6 -1 Q0 -9 6 -1 Q0 7 -6 -1Z" fill="#ffb3d6" stroke="#ff4f6d" stroke-width="2"/>`,
    crown: `<g stroke="${k}" stroke-width="1.8"><circle cx="-14" cy="3" r="7.5" fill="#ffd23f"/><circle cx="-14" cy="3" r="5" fill="#fff3c4"/><circle cx="14" cy="3" r="7.5" fill="#ffd23f"/><circle cx="14" cy="3" r="5" fill="#fff3c4"/><ellipse cy="4" rx="12.5" ry="10.5" fill="#ffd23f"/><ellipse cy="5.5" rx="10" ry="7.5" fill="#fff3e4"/><circle cx="-4.5" cy="5" r="2.6" fill="#fff" stroke-width="1"/><circle cx="-4.5" cy="5" r="1.9" fill="#ff97bf" stroke-width="1"/><circle cx="4.5" cy="5" r="2.6" fill="#fff" stroke-width="1"/><circle cx="4.5" cy="5" r="1.9" fill="#ff97bf" stroke-width="1"/><path d="M-2 9 Q0 10.5 2 9" fill="none" stroke-width="1.2" stroke-linecap="round"/><path d="M-9 -4 L-9 -14 L-4.5 -9 L0 -16 L4.5 -9 L9 -14 L9 -4Z" fill="#ff97bf" stroke-linejoin="round"/></g>`,
  };
  return `<svg viewBox="-20 -20 40 40" aria-hidden="true">${shapes[type] || shapes.star}</svg>`;
}

function openBonus(res) {
  S.bonusOpen = true;
  const m = $('#bonus');
  m.hidden = false;
  $('#bonus-run').innerHTML = res.run >= 2 ? `れんぞく<b>${res.run}</b>日め` : 'きょうの ボーナス';
  const slots = [];
  for (let i = 1; i <= 7; i++) {
    const got = i <= res.slot;
    const type = store.STICKERS[i - 1];
    slots.push(`<div class="bonus-slot${got ? ' got' : ''}${i === res.slot ? ' today stamping' : ''}${i === 7 ? ' big' : ''}"><span class="d">${i}日め</span>${got ? stickerSvg(type) : i === 7 ? '？' : i}</div>`);
  }
  $('#bonus-grid').innerHTML = slots.join('');
  $('#bonus-note').textContent = res.slot === 7 ? 'とくべつシール！ カレンダーに はったよ' : `あと${7 - res.slot}日で とくべつシール`;
  audio.unlock();
  requestAnimationFrame(() => {
    layoutActors();
    if (S.reduced) return;
    setTimeout(() => {
      const el = $('#bonus-grid .today');
      if (!el) return;
      const c = centerOf(el);
      audio.play('blip', audio.now(), { m: 84, v: 0.12 });
      audio.unit(res.slot === 7 ? 1 : 0.4);
      fx.burst(c.x, c.y, { count: res.slot === 7 ? 60 : 24, kinds: ['star', 'confetti', ...(res.slot === 7 ? ['coin', 'heart'] : [])], speed: res.slot === 7 ? 700 : 380, up: 150 });
      hero.celebrate(res.slot === 7 ? 1 : 0.5, { big: res.slot === 7, audio });
    }, 700);
  });
  $('#bonus-ok').focus({ preventScroll: true });
}
function closeBonus() {
  $('#bonus').hidden = true;
  S.bonusOpen = false;
  audio.play('blip', audio.now(), { m: 76, v: 0.1 });
  renderCalendar(true);
  requestAnimationFrame(layoutActors);
}
function checkLoginBonus() {
  if (S.demo || S.screen !== 'title' || params.has('capture')) return;
  const res = store.claimLogin();
  if (res) setTimeout(() => openBonus(res), 500);
}

function moveMonth(dir) {
  cal.m += dir;
  if (cal.m < 0) { cal.m = 11; cal.y -= 1; }
  if (cal.m > 11) { cal.m = 0; cal.y += 1; }
  audio.unlock();
  audio.play('blip', audio.now(), { m: dir > 0 ? 76 : 72, v: 0.08 });
  renderCalendar();
}
function openDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  const list = store.monthSummary(y, m - 1)[key]?.entries || [];
  $('#day-title').textContent = `${m}月${d}日のきろく`;
  $('#day-list').innerHTML = list.slice().reverse().map((h) => {
    const t = new Date(h.at);
    const name = (MODE_NAMES[h.mode] || (() => h.mode))(h);
    const extra = h.extraOk ? `　エクストラ ${h.extraOk}問` : '';
    return `<li><span class="t">${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}</span><span class="m">${name}</span><span class="s">${(h.score || 0).toLocaleString('ja-JP')}点</span><span class="d">正解 ${h.ok ?? '-'}　おしい ${h.ng ?? '-'}${extra}　${fmtTime(h.timeMs || 0)}</span></li>`;
  }).join('');
  $('#day-log').hidden = false;
  audio.unlock();
  audio.play('blip', audio.now(), { m: 79, v: 0.1 });
  $('#close-day').focus({ preventScroll: true });
}

// ---------------------------------------------------------------- settings panel
S.previewE = 0.04;
function openSettings() {
  audio.unlock();
  const m = $('#settings');
  m.hidden = false;
  S.settingsOpen = true;
  S.previewE = 0.04 + 0.3 * S.motion;
  audio.play('blip', audio.now(), { m: 79, v: 0.1 });
  const card = m.querySelector('.modal-card');
  if (!S.reduced) tween(300, (k) => { card.style.transform = `translateY(${(1 - k) * 40}px) scale(${0.9 + 0.1 * k})`; }, easeOutBack).then(() => { card.style.transform = ''; });
  requestAnimationFrame(() => { layoutActors(); if (!S.reduced) hero.hop(40, 380, { audio }); });
  $('#close-settings').focus({ preventScroll: true });
}
function closeSettings() {
  $('#settings').hidden = true;
  S.settingsOpen = false;
  audio.play('blip', audio.now(), { m: 72, v: 0.08 });
  requestAnimationFrame(layoutActors);
  $('#open-settings').focus({ preventScroll: true });
}

// Dragging the motion slider previews the effect strength: the thumb
// throws particles, Dopakichi reacts, and the pitch climbs with the value.
let lastSliderFx = 0;
function motionSliderFx(v) {
  const t = now();
  S.previewE = 0.04 + 0.9 * v;
  if (t - lastSliderFx < 70) return;
  lastSliderFx = t;
  const sl = $('#motion').getBoundingClientRect();
  const x = sl.left + 16 + (sl.width - 32) * v; const y = sl.top + sl.height / 2;
  audio.play('blip', audio.now(), { m: 60 + Math.round(v * 24), v: 0.05 + 0.08 * v });
  if (v <= 0.001) { hero.setFace('closed', 'smile'); setTimeout(() => hero.resetFace(), 500); return; }
  fx.burst(x, y, { count: Math.round(2 + 26 * v), speed: 160 + 520 * v, kinds: burstKinds(v), up: 120, life: 0.5 });
  if (v > 0.5) fx.ring(x, y, { color: v > 0.85 ? '#ffd23f' : '#ff7ab6', radius: 20 + 50 * v, width: 5 });
  S.shake = Math.max(S.shake, 6 * v * v);
  if (v > 0.9) S.flash = Math.max(S.flash, 0.25);
  if (performance.now() > S.busyUntil) {
    S.busyUntil = performance.now() + 260 + 200 * v;
    hero.setFace(v > 0.7 ? 'star' : 'happy', v > 0.5 ? 'grin' : 'cat');
    setTimeout(() => hero.resetFace(), 420);
    if (v > 0.8) hero.hop(30 + 50 * v, 420, { spin: 360, audio });
    else hero.hop(8 + 40 * v, 280, { audio });
  }
}

$$('.pick button').forEach((b) => b.addEventListener('click', () => {
  setCount(Number(b.dataset.count));
  audio.unlock();
  audio.play('blip', audio.now(), { m: 76 + Number(b.dataset.count) / 2, v: 0.12 });
  if (!S.reduced) hero.hop(20 + Number(b.dataset.count) * 2 * S.motion, 320, { audio });
}));
$('#start').addEventListener('click', () => startGame('level'));
$('#cal-prev').addEventListener('click', () => moveMonth(-1));
$('#cal-next').addEventListener('click', () => moveMonth(1));
$('#cal-grid').addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) openDay(b.dataset.day); });
$('#close-day').addEventListener('click', () => { $('#day-log').hidden = true; });
$('#day-log').addEventListener('click', (e) => { if (e.target.id === 'day-log') $('#day-log').hidden = true; });
$('#screen-title').addEventListener('scroll', () => requestAnimationFrame(layoutActors), { passive: true });
$$('#screen-result, #screen-final, #tree-scroll').forEach((el) => el.addEventListener('scroll', () => requestAnimationFrame(layoutActors), { passive: true }));
$('#open-settings').addEventListener('click', openSettings);
$('#close-settings').addEventListener('click', closeSettings);
$('#demo-play').addEventListener('click', startDemo);
$('#bonus-ok').addEventListener('click', closeBonus);
$('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });
$('[data-toggle="sound"]').addEventListener('click', () => { audio.unlock(); setMuted(!S.muted); if (!S.muted) audio.play('blip', audio.now(), { m: 84, v: 0.12 }); });
$('#volume').addEventListener('input', (e) => { audio.unlock(); const v = e.target.value / 100; setVolume(v); audio.play('blip', audio.now(), { m: 64 + Math.round(v * 20), v: 0.12 }); });
$('#motion').addEventListener('input', (e) => { const v = e.target.value / 100; setMotion(v); motionSliderFx(v); });
$('#motion').addEventListener('change', () => { S.previewE = 0.04 + 0.3 * S.motion; });
$('#mute').addEventListener('click', () => setMuted(!S.muted));
$('#go-extra').addEventListener('click', startExtra);
$('#go-title').addEventListener('click', toTitle);
$('#go-again').addEventListener('click', () => startGame(S.kind, S.kindArg));
$('#again').addEventListener('click', toTitle);
$('#go-review').addEventListener('click', startReview);
$('#f-review').addEventListener('click', startReview);
$('#start-review').addEventListener('click', startReview);
$$('.grades button').forEach((b) => b.addEventListener('click', () => startGame('grade', Number(b.dataset.grade))));
$('#open-tree').addEventListener('click', () => openTree());
$('#tree').addEventListener('click', (e) => {
  const b = e.target.closest('.node');
  if (!b) return;
  const id = b.dataset.id; const st = stateOf(progress(), id);
  if (st === 'locked') {
    const need = SKILL[id].req.filter((q) => stateOf(progress(), q) !== 'mastered').map((q) => `「${SKILL[q].name}」`);
    toast(`${need.join('と')}を マスターすると ひらくよ`);
    audio.play('boing', audio.now(), { v: 0.12 });
    if (!S.reduced) tween(300, (k) => { b.style.translate = `${Math.sin(k * 20) * 5 * (1 - k)}px 0`; }).then(() => { b.style.translate = ''; });
    return;
  }
  audio.play('blip', audio.now(), { m: 84, v: 0.12 });
  startGame('practice', id);
});
$('#go-tree').addEventListener('click', () => openTree(S.newUnlocks));
$('#f-tree').addEventListener('click', () => openTree(S.newUnlocks));
$('#tree-back').addEventListener('click', () => { audio.play('blip', audio.now(), { m: 72, v: 0.08 }); toTitle(); });

for (const [key, b] of Object.entries(padButtons)) {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); press(key, b); });
  b.addEventListener('click', (e) => { if (e.detail === 0) press(key, b); });
}
addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (S.demo) { e.preventDefault(); stopDemo(); return; }
  if (S.settingsOpen) { if (e.key === 'Escape') closeSettings(); return; }
  if (S.bonusOpen) { if (e.key === 'Escape' || e.key === 'Enter') closeBonus(); return; }
  if (!$('#day-log').hidden) { if (e.key === 'Escape') $('#day-log').hidden = true; return; }
  if (/^[0-9]$/.test(e.key)) { audio.unlock(); press(e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { press('Backspace'); e.preventDefault(); }
});
addEventListener('pointermove', (e) => { if (S.screen !== 'play') hero.lookAt({ x: e.clientX, y: e.clientY }); });
addEventListener('resize', () => requestAnimationFrame(layoutActors));

// Bunting flags
(() => {
  const g = $('#flags');
  const cols = ['#ff7ab6', '#3b6bff', '#ffd23f', '#3fdcb0', '#a77bff'];
  let s = '';
  for (let i = 0; i < 13; i++) {
    const x = 12 + i * 29.5; const y = 4 + Math.sin((x / 400) * Math.PI) * 26;
    s += `<path d="M${x - 10} ${y - 2} L${x + 10} ${y - 1} L${x} ${y + 14}Z" fill="${cols[i % 5]}" stroke="#1b1d4d" stroke-width="2" stroke-linejoin="round"/>`;
  }
  g.innerHTML = s;
})();

// Logo burst: a hand-cut star with slightly irregular points.
(() => {
  const star = (R, r, n, jitter, seed) => {
    let d = ''; let s0 = seed;
    const rnd = () => { s0 = (s0 * 9301 + 49297) % 233280; return s0 / 233280; };
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = (i % 2 ? r : R) * (1 + (rnd() - 0.5) * jitter);
      d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`;
    }
    return `${d}Z`;
  };
  $('#logo-burst-path').setAttribute('d', star(96, 66, 14, 0.14, 7));
  $('#logo-burst-inner').setAttribute('d', star(70, 52, 14, 0.1, 3));
  const burst = $('.logo-burst');
  onFrame((dt, t) => { if (S.screen === 'title' && !S.reduced) burst.style.setProperty('--spin', (t / 1000 * 10 * (0.3 + S.motion)) % 360); });
})();

const saved = store.settings();
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
setCount(params.has('count') ? Number(params.get('count')) : saved.count, { persist: false });
setMotion(saved.motion ?? (prefersReduced ? 0 : 1), { persist: false });
setMuted(!saved.sound, { persist: false });
setVolume(saved.volume, { persist: false });
renderCalendar();
refreshTitle();
checkLoginBonus();
applyLevel(0.02);
startClock();
document.fonts.ready.then(layoutActors);
layoutActors();
Object.assign(window.__dopa, { fx, fxBack, actors, crowd, press, startGame, startExtra, fmtDopa });
