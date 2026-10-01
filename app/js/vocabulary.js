import { batchSize, validateBatch, recentWords } from './vocabulary-protocol.js';
import { _internal } from './problems.js';

const DATA_URL = new URL('../data/krdict-beginner.json', import.meta.url);
import { learningPool } from './vocabulary-curriculum.js';

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Keep dictionaries' other senses and synonyms out of the wrong answers.
const meaningTokens = entry => [...new Set([entry.meaning, ...entry.aliases]
  .flatMap(x => x.normalize('NFKC').split(/[／/。;；、・]/))
  .map(x => x.trim()).filter(Boolean))];
function overlaps(a, b) {
  return a.some(x => b.some(y => x === y ||
    (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x)))));
}

export function makeVocabularyBatch(data, { basicCount, extraMs, recent = [], history = {}, now = Date.now(), rng = Math.random }) {
  const expected = batchSize(basicCount, extraMs);
  if (!Array.isArray(data?.entries) || data.entries.length < expected) {
    throw new Error('辞書データが足りません。app/data フォルダーもコピーしてください。');
  }
  const seen = new Set();
  const entries = data.entries.map(entry => {
    if (typeof entry.word !== 'string' || typeof entry.meaning !== 'string' ||
        !Array.isArray(entry.aliases) || !entry.aliases.every(x => typeof x === 'string') ||
        typeof entry.topic !== 'string' || typeof entry.context !== 'string' || seen.has(entry.word)) {
      throw new Error('辞書データの形式が正しくありません。');
    }
    seen.add(entry.word);
    return { ...entry, tokens: meaningTokens(entry) };
  });
  const active = learningPool(entries, history);
  if (active.length < 4) throw new Error('学習用の辞書データが足りません。');
  const studied = active.filter(e => history[e.word]?.attempts > 0);
  const fresh = shuffle(active.filter(e => !history[e.word]?.attempts), rng);
  // Start with a small set; later sessions introduce at most two words.
  const introduced = fresh.slice(0, studied.length ? 2 : 6);
  const pool = [...studied, ...introduced];
  const due = shuffle(studied, rng).sort((a,b) =>
    Number((history[a.word].due || 0) > now) - Number((history[b.word].due || 0) > now) ||
    (history[a.word].streak || 0) - (history[b.word].streak || 0));
  const candidates = [];
  // Alternate review with a small number of new words in the normal part.
  const first = [...due];
  introduced.forEach((e,i) => first.splice(Math.min(1 + i * 4, first.length), 0, e));
  candidates.push(...first.slice(0, basicCount));
  while (candidates.length < expected) {
    const cycle = shuffle(pool, rng);
    for (const entry of cycle) {
      if (candidates.at(-1)?.word === entry.word) continue;
      candidates.push(entry);
      if (candidates.length === expected) break;
    }
  }
  const questions = [];
  for (const entry of candidates) {
    const chosen = [];
    // Different topics first to reduce broad-category / narrow-category ambiguity.
    const pool = shuffle(active, rng).sort((a, b) =>
      Number(a.topic === entry.topic && !!entry.topic) - Number(b.topic === entry.topic && !!entry.topic));
    for (const other of pool) {
      if (other.word === entry.word || overlaps(entry.tokens, other.tokens) ||
          chosen.some(x => overlaps(x.tokens, other.tokens))) continue;
      chosen.push(other);
      if (chosen.length === 3) break;
    }
    if (chosen.length !== 3) continue;
    questions.push({ word: entry.word, meaning: entry.meaning, context: entry.context,
      distractors: chosen.map(x => x.meaning) });
    if (questions.length === expected) break;
  }
  return validateBatch({ questions }, expected, { allowRepeats: true });
}

export async function loadVocabulary({ basicCount, extraMs, recent, history, signal, rng = Math.random, fetchImpl = fetch }) {
  // This is a same-origin static file, never an AI or dictionary API request.
  const response = await fetchImpl(DATA_URL.href, { signal });
  if (!response.ok) throw new Error('辞書データを読み込めませんでした。app/data フォルダーもコピーしてください。');
  const data = await response.json();
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  return makeVocabularyBatch(data, { basicCount, extraMs, recent, history, rng });
}
export function vocabularyProblem(q) {
  const p = _internal.buildH([{ ans: q.meaning }], {
    title: '単語帳', text: q.word, answer: q.meaning,
    choices: [q.meaning, ...q.distractors], vocabulary: true, word: q.word, context: q.context
  });
  const input = p.cells.find(c => c.kind === 'input');
  p.cols = 1;
  p.rows = 2;
  input.c = 0;
  input.r = 1;
  input.cs = 1;
  p.answerText = `${q.word} → ${q.meaning}`;
  return p;
}
