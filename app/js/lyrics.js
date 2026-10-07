// Add songs here; each JSON contains title, artist and paired lines with tokens.
export const SONGS = [
  { id: 'wonderland', file: 'wonderland.json' },
  { id: 'halazia', file: 'halazia.json' },
  { id: 'bad', file: 'bad.json' },
  { id: 'enough', file: 'enough.json' },
  { id: 'on-the-road', file: 'on-the-road.json' },
  { id: 'choose', file: 'choose.json' },
  { id: 'lemon-drop', file: 'lemon-drop.json' },
];
export function shuffleTokens(tokens, rng = Math.random) {
  const cards = tokens.map((text, id) => ({ text, id }));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  if (cards.map(c => c.text).join(' ') === tokens.join(' ') && new Set(tokens).size > 1) {
    const j = cards.findIndex(c => c.text !== cards[0].text);
    [cards[0], cards[j]] = [cards[j], cards[0]];
  }
  return cards;
}
export async function loadLyrics() {
  const songs = await Promise.all(SONGS.map(async song => {
    const response = await fetch(new URL('../data/lyrics/' + song.file, import.meta.url));
    if (!response.ok) throw new Error('歌詞データを読み込めませんでした。');
    return response.json();
  }));
  return songs.flatMap(song => song.lines.map(line => {
    if (!line.japanese || !line.korean || !Array.isArray(line.tokens) || line.tokens.length < 2 || line.tokens.join(' ') !== line.korean) throw new Error('歌詞データの形式が正しくありません。');
    return { ...line, song: song.title };
  }));
}
export function lyricsProblem(line) {
  return { ...line, lyrics: true, kind: 'lyrics', title: 'ATEEZ 歌詞並べ替え', text: line.japanese,
    answer: line.korean, cols: 1, rows: 1, cells: [], lines: [],
    steps: [{ cell: 'lyrics-answer', digit: line.korean, label: 'カードをタップして並べ、答え合わせ' }] };
}

// Release one additional card after every three successful completions.
export function lyricScaffold(tokens, successes = 0) {
  const movableCount = Math.min(tokens.length, (tokens.length <= 4 ? 2 : 3) + Math.floor(Math.max(0, successes) / 3));
  const movable = new Set(Array.from({ length: movableCount }, (_, i) => Math.floor((i + .5) * tokens.length / movableCount)));
  return tokens.map((text, id) => ({ text, id, fixed: !movable.has(id) }));
}
export function fillLyricHint(parts, slots) {
  const target = parts.findIndex((part, i) => !part.fixed && slots[i]?.text !== part.text);
  if (target < 0) return false;
  const usedAt = slots.findIndex(card => card?.id === parts[target].id);
  if (usedAt >= 0) slots[usedAt] = null;
  slots[target] = parts[target];
  return true;
}

