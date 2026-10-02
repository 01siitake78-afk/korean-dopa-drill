import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shuffleTokens, lyricsProblem } from '../app/js/lyrics.js';
test('song lines reconstruct faithfully and shuffled duplicate cards stay distinct', async () => {
 const song = JSON.parse(await readFile(new URL('../app/data/lyrics/wonderland.json', import.meta.url)));
 assert.equal(song.lines.length, 30);
 for (const line of song.lines) {
  assert.equal(line.tokens.join(' '), line.korean);
  const cards = shuffleTokens(line.tokens, () => .999);
  assert.equal(new Set(cards.map(c => c.id)).size, line.tokens.length);
  assert.deepEqual(cards.map(c => c.text).sort(), [...line.tokens].sort());
  if(new Set(line.tokens).size > 1) assert.notEqual(cards.map(c=>c.text).join(' '), line.korean);
  assert.equal(lyricsProblem({...line,song:song.title}).steps[0].digit,line.korean);
 }
});
