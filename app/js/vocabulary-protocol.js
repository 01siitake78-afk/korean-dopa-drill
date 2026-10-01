// Shared between the browser and Worker. No fixed vocabulary or credentials.
export const RECENT_WORD_LIMIT = 100;
export const EXTRA_QUESTION_GAP_MS = 520;
export function batchSize(basicCount, extraMs) {
  if (!Number.isInteger(basicCount) || basicCount < 1 || basicCount > 30 ||
      !Number.isFinite(extraMs) || extraMs < 0 || extraMs > 90000) throw new Error('問題数または制限時間が範囲外です。');
  // Existing game always waits >=520ms after an extra answer; +900ms is its intro allowance.
  return basicCount + Math.ceil((extraMs + 900) / EXTRA_QUESTION_GAP_MS) + 1;
}
export const normalizeWord = word => word.normalize('NFKC').trim().replace(/\s+/g, ' ');
function safeText(value, max, optional = false) {
  if (typeof value !== 'string') throw new Error('問題の形式が正しくありません。');
  const s = value.normalize('NFKC').trim();
  if ((!optional && !s) || s.length > max || /[<>\u0000-\u001f]/.test(s)) throw new Error('問題の文字が正しくありません。');
  return s;
}
export function validateBatch(data, expected, { allowRepeats = false } = {}) {
  if (!data || !Array.isArray(data.questions) || data.questions.length !== expected) throw new Error('必要な問題数が揃いませんでした。');
  const seen = new Set();
  return data.questions.map(q => {
    const word = normalizeWord(safeText(q.word, 24));
    if (!/^[가-힣]+(?: [가-힣]+)*$/.test(word) || (!allowRepeats && seen.has(word))) throw new Error('単語が重複しているか、形式が正しくありません。');
    seen.add(word);
    const meaning = safeText(q.meaning, 24);
    const context = safeText(q.context, 80, true);
    if (!Array.isArray(q.distractors) || q.distractors.length !== 3) throw new Error('誤答は3つ必要です。');
    const distractors = q.distractors.map(x => safeText(x, 24));
    if (new Set([meaning, ...distractors]).size !== 4) throw new Error('選択肢が重複しています。');
    return { word, meaning, distractors, context };
  });
}
export function recentWords(words) {
  return [...new Set((Array.isArray(words) ? words : []).filter(x => typeof x === 'string' && x.length <= 24).map(normalizeWord))].slice(-RECENT_WORD_LIMIT);
}
