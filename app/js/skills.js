export const LANES = ['読み方', '単語', 'ATEEZ歌詞'];

export const MASTERY = { window: 6, need: 5 };

export const SKILLS = [
  {
    id: 'read-vowels',
    name: '基本母音',
    grade: 1,
    lane: 0,
    req: [],
    gen: ['koreanVowels', {}]
  },
  {
    id: 'read-consonants',
    name: '基本子音',
    grade: 1,
    lane: 0,
    req: [],
    gen: ['koreanConsonants', {}]
  },
  {
    id: 'sound-to-hangul',
    name: '読みからハングル',
    grade: 1,
    lane: 0,
    req: [],
    gen: ['koreanSoundToHangul', {}]
  }
];

export const SKILL = Object.fromEntries(
  SKILLS.map((s) => [s.id, s])
);

export const DEPTH = {
  'read-vowels': 0,
  'read-consonants': 0,
  'sound-to-hangul': 0
};

export const skillsOfGrade = (g) =>
  SKILLS.filter((s) => s.grade === g);