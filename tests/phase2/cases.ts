// 줄바꿈 비교에 쓰는 고정 문장. 글자 사이·단어 안·문장부호 앞·이모지 묶음에서 줄이 나뉘게 한다.
export const sentences: Record<string, string> = {
  longKorean: '옛날옛날아주먼옛날에호랑이와토끼가사이좋게살았어요그런데어느날갑자기큰비가내렸어요',
  eojeol: '우리 가족은 주말마다 함께 공원에 가서 자전거를 타고 맛있는 도시락을 나누어 먹어요.',
  mixed: '내가 좋아하는 English 단어는 Wonderful 이고, 숫자는 1234567890 이에요!',
  punctuation: '정말요? 네, 맞아요! "안녕하세요"라고 (크게) 말했어요. 그래요… 좋아요.',
  emoji: '오늘의 기분은 🌈 좋아요! 우리 가족 👨‍👩‍👧‍👦 모두 함께 사진을 찍었어요 😀',
  explicit: '첫째 줄\n\n셋째 줄은 아주 길게 이어지는 문장이라서 다시 나뉘어요',
  spaces: '띄어쓰기    여러 칸   있는    문장과 줄 끝 공백이 어떻게 되는지   확인합니다   ',
  longLatin: 'Supercalifragilisticexpialidocious_word_without_spaces 입니다',
};

export const styles = [
  { name: 'w260-36', width: 260, fontSize: 36, bold: false },
  { name: 'w420-36', width: 420, fontSize: 36, bold: false },
  { name: 'w700-36', width: 700, fontSize: 36, bold: false },
  { name: 'w420-24', width: 420, fontSize: 24, bold: false },
  { name: 'w900-64b', width: 900, fontSize: 64, bold: true },
];

export const textItem = (text: string, style: typeof styles[number], x = 80, y = 100) => ({
  id: 'case', type: 'text' as const, x, y, width: style.width, text, fontSize: style.fontSize, color: '#000000', bold: style.bold,
});
