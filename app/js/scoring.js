// Pure scoring and "dopa" curves (kept separate from the director for testing).

export const BASIC_SCORE = 100;
export const EXTRA_BASE = 10;

// Points for the k-th (0-based) extra problem grow gently: 10, 15, 20, ...
// A very fast player (20-25 extra problems in 90 s) ends in the 1000s.
export const EXTRA_STEP = 5;
export const extraPoints = (k) => EXTRA_BASE + EXTRA_STEP * k;
export const extraTotal = (n) => EXTRA_BASE * n + EXTRA_STEP * (n * (n - 1)) / 2;

// Dopa is tracked as log10. Finishing the basic set lands on 10^4 (1万).
// Extra problems follow a saturating curve: about 100万 after five and
// levelling off at roughly 10億 (a few 億 for a very fast run).
export const BASIC_DOPA_L = 4;
export function basicDopaL(frac) {
  const f = Math.min(1, Math.max(0, frac));
  return BASIC_DOPA_L * f ** 1.15;
}
const EXTRA_SPAN = 5.08; const EXTRA_TAU = 10;
export const extraDopaL = (n) => BASIC_DOPA_L + EXTRA_SPAN * (1 - Math.exp(-n / EXTRA_TAU));
export const extraProblemGain = (k) => extraDopaL(k + 1) - extraDopaL(k);

const UNITS = [[68, '無量大数'], [64, '不可思議'], [60, '那由他'], [56, '阿僧祇'], [52, '恒河沙'], [48, '極'], [44, '載'], [40, '正'], [36, '澗'], [32, '溝'], [28, '穣'], [24, '秭'], [20, '垓'], [16, '京'], [12, '兆'], [8, '億'], [4, '万']];
// Milestones below 万 are celebrated but not used as display units.
const MILESTONES = [[3, '千'], [2, '百']];

export function fmtDopa(L) {
  if (!Number.isFinite(L) || L >= 72) return '∞';
  if (L < 4) return Math.round(10 ** L).toLocaleString('ja-JP');
  const u = UNITS.find(([e]) => L >= e - 1e-9);
  const m = 10 ** (L - u[0]);
  return (m < 10 ? m.toFixed(1) : String(Math.floor(m))) + u[1];
}

export function unitOf(L) {
  if (L >= 72) return '∞';
  // Between 万 and 億, each extra digit is its own milestone (10万, 100万, 1000万).
  if (L >= 4 && L < 8) return ['万', '十万', '百万', '千万'][Math.floor(L + 1e-9) - 4];
  const u = UNITS.find(([e]) => L >= e - 1e-9) || MILESTONES.find(([e]) => L >= e - 1e-9);
  return u ? u[1] : '';
}

const LABELS = { '∞': '∞', 百: '100', 千: '1000', 十万: '10万', 百万: '100万', 千万: '1000万' };
export const unitLabel = (u) => LABELS[u] || `1${u}`;
