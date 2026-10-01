// Editorial learning order, not a statistical frequency ranking.
// Meanings and distractors are always taken from the attributed dictionary.
export const LEARNING_WORDS = `좋다 있다 없다 하다 가다 오다 보다 듣다 먹다 알다 모르다 좋아하다 재미있다 곧 가끔 자주 항상 아직 벌써 정말
싫다 마시다 자다 사랑하다 괜찮다 고맙다 미안하다 바로 이미
오늘 내일 어제 지금 나중 아침 밤 여기 거기 어디 언제 같이 다시 많이 정말 너무 잘 조금 빨리 천천히
사람 친구 가족 엄마 아빠 언니 오빠 누나 형 동생 우리 나 너 여러분 이름 만나다 이야기 말하다 웃다 울다
기쁘다 슬프다 행복하다 즐겁다 힘들다 피곤하다 아프다 배고프다 맛있다 춥다 덥다 예쁘다 멋있다 귀엽다 보고 싶다 기다리다 원하다 생각하다 느끼다 놀라다
노래 음악 가수 춤 공연 무대 연습 팬 콘서트 부르다 춤추다 연습하다 시작하다 끝나다 준비하다 응원하다 박수 사진 영상 방송
시간 날 주말 이번 다음 처음 마지막 매일 곧 벌써 아직 항상 자주 가끔 먼저 함께 집 학교 회사 방 밖
물 밥 음식 커피 먹다 식사 아침 점심 저녁 과자 고기 과일 배 잘하다 못하다 배우다 읽다 쓰다 공부하다 쉬다
앉다 서다 걷다 뛰다 일어나다 들어가다 나오다 주다 받다 사다 만들다 찾다 부탁하다 도와주다 보내다 전화하다 이야기하다 대답하다 질문하다 이해하다
생일 선물 약속 여행 휴가 취미 운동 영화 게임 텔레비전 인터넷 휴대 전화 메시지 댓글 표 티켓 예약 옷 머리 얼굴 손 눈
바쁘다 쉽다 어렵다 재미없다 중요하다 필요하다 비슷하다 다르다 맞다 틀리다 크다 작다 많다 적다 새롭다 오래 기다리다 기억하다 잊다 축하하다
같다 좋다 행복 기분 마음 사랑 웃음 눈물 걱정 기대 관심 꿈 노력 성공 건강 조심 열심히 진짜 꼭 좋아요`.split(/\s+/);

export function recordVocabularyAnswer(history, word, correct, now = Date.now()) {
  const old = history[word] || {};
  // Repeated answers in a single sitting cannot establish mastery.
  const spaced = !old.lastCredit || now - old.lastCredit >= 6 * 60 * 60 * 1000;
  history[word] = {
    attempts: (old.attempts || 0) + 1,
    streak: correct ? (old.streak || 0) + (spaced ? 1 : 0) : 0,
    lastCredit: correct && spaced ? now : (old.lastCredit || 0),
    lastSeen: now,
    due: correct ? now + ((old.streak || 0) >= 2 ? 7 : 1) * 86400000 : now
  };
}
export function learningPool(entries, history = {}) {
  const byWord = new Map(entries.map(e => [e.word, e]));
  const ordered = [...new Set(LEARNING_WORDS)].map(w => byWord.get(w)).filter(Boolean);
  let size = Math.min(20, ordered.length);
  while (size < ordered.length && ordered.slice(0, size).filter(e => (history[e.word]?.streak || 0) >= 3).length >= Math.ceil(size * .8)) {
    size = Math.min(size + 10, ordered.length);
  }
  return ordered.slice(0, size);
}
