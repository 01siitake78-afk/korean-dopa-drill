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

import { lyricScaffold, fillLyricHint } from '../app/js/lyrics.js';
test('beginner scaffold releases cards progressively and hints repair wrong placements', () => {
 const tokens = ['A','B','A','D','E','F','G','H','I'];
 assert.equal(lyricScaffold(tokens).filter(p=>!p.fixed).length, 3);
 assert.equal(lyricScaffold(tokens, 3).filter(p=>!p.fixed).length, 4);
 assert.equal(lyricScaffold(tokens, 99).filter(p=>!p.fixed).length, tokens.length);
 const parts = lyricScaffold(tokens); const slots = parts.map(p=>p.fixed ? p : null);
 const loose = parts.filter(p=>!p.fixed); const indexes=parts.flatMap((p,i)=>p.fixed?[]:[i]);
 indexes.forEach((i,k)=>slots[i]=loose[(k+1)%loose.length]);
 for(let i=0;i<tokens.length;i++) fillLyricHint(parts,slots);
 assert.deepEqual(slots.map(c=>c.text),tokens);
 assert.equal(fillLyricHint(parts,slots),false);
 assert.equal(new Set(slots.map(c=>c.id)).size,tokens.length);
});
