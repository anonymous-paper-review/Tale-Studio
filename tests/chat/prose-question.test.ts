// Writer 채팅에서 "물음"과 "고쳐 달라는 부탁"을 가른다 — 문단을 붙인 채 보낸 말은 묻는 낱말이 있고 부탁 · 제안 꼴이 없을 때만 AI 가 답하고 그 밖에는 계속 고친다 (오너 2026-11-14 답 B ① · 리드 검토 11/14)
import { describe, expect, it } from 'vitest'
import { isProseQuestion } from '@/lib/prose/question'

// 아래 말은 모두 이 시험을 위해 새로 지은 것이다 — 실제 사용자의 글이 아니다.
describe('물음 가르기', () => {
  // 왜: 문단을 붙인 채 보낸 물음이 수정 요청이 되어 답을 못 받았다(11/14 채팅 점검 B). 물음만 AI 답으로 보낸다.
  it.each([
    '이 문단의 주인공은 누구야?',
    '이 장면의 배경은 어디야?',
    '여기서 왜 비가 오는 거야?',
    '이 이야기 장르가 뭐예요?',
    '지금 몇 장면이야?',
    '서윤이는 언제 등장해?',
    '등장인물 이름들 알려줘',
    '이 문단이 무슨 뜻인지 설명해 줄래?',
    '결말은 어떻게 끝나?',
    '이 장면은 몇 초쯤 돼?',
    '등장인물이 모두 몇 명이야',
    '이 부분은 누가 말하는 거야?',
    '주인공 이름이 뭐였지',
    'Who is the main character in this paragraph?',
    'How many scenes are there?',
    'What happens after this scene?',
    'Why does she leave the room?',
    'Can you explain what this paragraph means?',
    'Could you tell me who the narrator is?',
    'how long is this story',
    'Tell me about the characters.',
    'Which scene takes place at night?',
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
    '이어서 써 줘',
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

  // 왜: 제안 꼴은 물음표가 있어도 "이렇게 바꿔 보자"는 말이다 — 물음으로 읽어 AI 답으로 보내면 고치려던 문단이 그대로 남는다(리드 검토 11/14: 예문 40여 개 중 19개가 AI 답으로 빠졌다).
  it.each([
    '민수가 우는 게 낫지 않을까?',
    '여기서 민수가 울어야 하지 않을까?',
    '여기에 비 소리가 있으면 좋을 것 같은데?',
    '민수가 먼저 사과하는 건 어떨지?',
    '해피엔딩으로 하면?',
    '대사를 반말로?',
    '민수가 우는 걸로?',
    '이 장면 비 오는 밤으로 가는 건?',
    '여기서 지수가 웃으면 더 자연스럽지 않을까?',
    // 묻는 낱말이 있어도 정도 말 · 고치는 낱말이 든 말은 지금처럼 고치기로 간다(헷갈리면 고치기).
    '누가 더 나이가 많아?',
    'Why is it so much longer than the first scene?',
    'What if she could fly?',
    'Why not let her cry here?',
    'How about she leaves first?',
    '누가 먼저 말하는 게 낫지 않을까?',
    '민수는 왜 여기서 안 우는 거지? 울면 좋을 것 같은데',
    '배경은 카페로?',
    '마지막은 비가 오는 걸로 하면 어떨까?',
    'Could Minsu be a girl?',
    'Can Jisu say this line instead?',
    "Shouldn't Minsu cry here?",
    'Is it possible for him to stay?',
    'Have her cry here?',
    'Would Minsu look better in a red coat?',
    'Could Jisu be the one who speaks first?',
  ])('제안 꼴로 읽는다: %s', (text) => {
    expect(isProseQuestion(text)).toBe(false)
  })

  // 왜: 물음표가 없어도 "정리해 줘 · 보여 줘 · describe"는 알려 달라는 말이 아니라 글을 바꾸거나 더하라는 부탁이다.
  it.each([
    '이 문단 좀 정리해 줘',
    '민수가 우는 모습을 보여줘',
    '창밖 풍경을 보여 주세요',
    '지수가 문을 여는 장면을 보여 줘',
    'Describe the room here.',
    'Show me the rain outside the window.',
    'Can you show me Minsu crying here?',
  ])('물음표 없는 부탁으로 읽는다: %s', (text) => {
    expect(isProseQuestion(text)).toBe(false)
  })

  // 왜: 묻는 낱말도 알려 달라는 말도 없으면 물음표가 있어도 물음인지 부탁인지 알 수 없다 — 헷갈리면 지금처럼 고치기로 간다(리드 검토 11/14).
  //   예전에는 이 가운데 일부를 AI 답으로 보냈다 — 예 · 아니오로 답하는 물음을 AI 답으로 받고 싶은지는 오너 결정으로 남는다.
  it.each([
    'Is the ending sad?',
    'Does the robot talk?',
    'Do you think the pacing works?',
    'Are there other characters in this scene?',
    '이 장면은 밤이야?',
    '주인공이 여자야?',
    '이 문단은 슬픈 내용이야?',
    '이 장면에 소리가 나와요?',
  ])('묻는 낱말이 없으면 물음표가 있어도 고치기로 간다: %s', (text) => {
    expect(isProseQuestion(text)).toBe(false)
  })

  // 왜: 정상 경로 고정 — 묻는 낱말이 있고 부탁 · 제안 꼴이 없는 말은 계속 AI 답으로 보낸다.
  it.each([
    '이 문단에서 민수는 왜 화를 내는 거야?',
    '이 장면은 어디에서 일어나는 일이야?',
    '민수가 몇 번 나와?',
    '지수는 언제 도착해?',
    '이 문단에서 누가 말하고 있어?',
    'Who is speaking in this paragraph?',
    'Why does Minsu stay in this scene?',
    'Where does this scene take place?',
    'Please summarize this paragraph.',
    '지금까지 이야기를 한 줄로 요약해 줘',
    // what · why · how · who · where · when 으로 시작하는 물음의 "조동사 + 대명사"는 제안이 아니라 물음이다(리드 검토 11/14 낮음 1).
    'Why would he lie?',
    'How could she forget?',
    'What can he see from the window?',
    "Why can't he sleep?",
    'Who should cry here, Minsu or Jisu?',
    'When can she see him again?',
  ])('묻는 낱말이 있고 부탁 · 제안 꼴이 없으면 물음으로 읽는다: %s', (text) => {
    expect(isProseQuestion(text)).toBe(true)
  })

  // 왜: 물음이 아닌 말은 지금처럼 수정 요청이다 — 물음표가 없고 묻는 꼴도 아니면 건드리지 않는다.
  it.each(['고마워', '그냥 이대로 두자', 'thanks', 'keep going', 'ok', '응', '', '   '])('물음이 아닌 말은 물음으로 읽지 않는다: %j', (text) => {
    expect(isProseQuestion(text)).toBe(false)
  })
})
