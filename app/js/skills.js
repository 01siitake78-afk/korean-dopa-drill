export const LANES = ['読み方', '単語', 'ATEEZ歌詞'];

export const MASTERY = { window: 6, need: 5 };

export const SKILLS = [
  {
    id: 'read-consonants',
    name: 'ハングル → 読み',
    grade: 1,
    lane: 0,
    req: [],
    gen: ['koreanConsonants', {}]
  },
  {
    id: 'sound-to-hangul',
    name: '読み → ハングル',
    grade: 1,
    lane: 0,
    req: [],
    gen: ['koreanSoundToHangul', {}]
  }
];

export const SKILL = Object.fromEntries(
  [...SKILLS.map((s) => [s.id, s]),
    ['read-vowels', { ...SKILLS[0], id: 'read-vowels' }]]
);

export const DEPTH = {
  'read-vowels': 0,
  'read-consonants': 0,
  'sound-to-hangul': 0
};

export const skillsOfGrade = (g) =>
  SKILLS.filter((s) => s.grade === g);