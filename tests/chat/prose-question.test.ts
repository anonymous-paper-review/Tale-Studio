// Writer 채팅에서 "물음"과 "고쳐 달라는 부탁"을 가른다 — 문단을 붙인 채 보낸 물음은 AI 가 답하고 부탁 꼴은 계속 고친다 (오너 2026-11-14 답 B ①)
import { describe, expect, it } from 'vitest'
import { isProseQuestion } from '@/lib/prose/question'

// 아래 말은 모두 이 시험을 위해 새로 지은 것이다 — 실제 사용자의 글이 아니다.
describe('물음 가르기', () => {
  // 왜: 문단을 붙인 채 보낸 물음이 수정 요청이 되어 답을 못 받았다(바우처 사용자 채팅 B). 물음만 AI 답으로 보낸다.
  it.each([
    '이 문단의 주인공은 누구야?',
    '인물 설정이 어떻게 되어 있어?',
    '여기서 왜 비가 오는 거야?',
    '이 이야기 장르가 뭐예요?',
    '지금 몇 장면이야?',
    '서윤이는 언제 등장해?',
    '인물 설정 알려줘',
    '이 문단이 무슨 뜻인지 설명해 줄래?',
    '결말은 어떻게 끝나?',
    '이 장면은 몇 초쯤 돼?',
    '등장인물이 모두 몇 명이야',
    '이 부분은 누가 말하는 거야?',
    '주인공 이름이 뭐였지',
    'Who is the main character in this paragraph?',
    'How many scenes are there?',
    'What happens after this scene?',
    'Is the ending sad?',
    'Why does she leave the room?',
    'Can you explain what this paragraph means?',
    'Could you tell me who the narrator is?',
    'how long is this story',
    'Does the robot talk?',
    'Tell me about the characters.',
    'Which scene takes place at night?',
    'Do you think the pacing works?',
    'What does this paragraph mean?',
    'Please explain the ending.',
    '主角是谁？',
    '这个故事一共有几个场景？',
    '这段是什么意思？',
  ])('물음으로 읽는다: %s', (text) => {
    expect(isProseQuestion(text)).toBe(true)
  })

  // 왜: 잘못 걸리면 고쳐 달라는 말이 답변으로 바뀐다 — 부탁 꼴 물음은 물음표가 있어도 계속 고치기로 간다.
  it.each([
    '더 짧게 해 줄래?',
    '여기 좀 더 웃기게 바꿔 줄 수 있어?',
    '결말을 슬프게 고쳐 주세요',
    '이 문단 줄여줘',
    '대사를 더 자연스럽게 해줄래요?',
    '동생을 한 명 더 넣을 수 있어?',
    '이 장면을 밤으로 바꿀 수 있을까요?',
    '이 문단 지워도 돼?',
    '왜 이렇게 길어? 줄여줘',
    '좀 더 길게?',
    '더 무섭게?',
    '이 부분 너무 길지 않아?',
    '계속해',
    '다시 써줘',
    'Can you make it shorter?',
    'Could you add a joke here?',
    'Would you change the ending to a sad one?',
    'Please rewrite this paragraph.',
    'Make her older.',
    'Can you give her a sister?',
    'Why is it so long? Shorten it.',
    'Can I change the name to Mina?',
    'Is it possible to make her a doctor?',
    'Rewrite it with a happier ending.',
    'Can you write it again?',
    '这段能改短一点吗？',
    '能把结尾改成悲伤的吗？',
  ])('고쳐 달라는 부탁으로 읽는다: %s', (text) => {
    expect(isProseQuestion(text)).toBe(false)
  })

  // 왜: "어때 · what if"는 물음표가 있어도 바꿔 보자는 제안이다 — 수정 요청으로 간다.
  it.each([
    '비 오는 밤으로 바꾸면 어때?',
    '여기에 반전을 넣으면 어떨까?',
    '주인공을 여자로 하면 안 돼?',
    '주인공을 의사로 해도 돼?',
    '만약 고양이가 말을 할 수 있다면?',
    'What if the robot could talk?',
    'How about a rainy night?',
    'Why not cut the second half?',
    'Should she be older?',
    'Could the scene be at night?',
    'Can the robot talk?',
  ])('바꿔 보자는 제안으로 읽는다: %s', (text) => {
    expect(isProseQuestion(text)).toBe(false)
  })

  // 왜: 물음이 아닌 말은 지금처럼 수정 요청이다 — 물음표가 없고 묻는 꼴도 아니면 건드리지 않는다.
  it.each(['고마워', '그냥 이대로 두자', 'thanks', 'keep going', 'ok', '응', '', '   '])('물음이 아닌 말은 물음으로 읽지 않는다: %j', (text) => {
    expect(isProseQuestion(text)).toBe(false)
  })
})
