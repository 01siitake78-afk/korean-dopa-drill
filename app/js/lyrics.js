// Add songs here; each JSON contains title, artist and paired lines with tokens.
export const SONGS = [{ id: 'wonderland', file: 'wonderland.json' }];
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
