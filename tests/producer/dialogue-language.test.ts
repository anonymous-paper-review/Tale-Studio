// 대사 언어는 사용자에게 물어 확정하고, 대화 언어나 배경으로 추측해 채우지 않는다.
import { describe, expect, it } from 'vitest'
import { resolveProducerDialogueLanguage } from '@/lib/producer-dialogue-language'

describe('Producer 대사 언어', () => {
  it('일본풍을 요청해도 대사 언어를 일본어로 임의 확정하지 않는다', () => {
    // 왜: 첫 한국어 요청의 일본 배경과 일본풍은 등장인물이 일본어로 말하라는 지시가 아니다.
    expect(resolveProducerDialogueLanguage({ message: '일본 학교에서 일본풍 일상물을 만들고 싶어' })).toBeNull()
  })

  it('영어로 일본 배경을 요청해도 대사 언어를 임의 확정하지 않는다', () => {
    // 왜: 사용자 언어로 빈칸을 채우는 것 역시 사용자가 선택한 대사 언어가 아니다.
    expect(resolveProducerDialogueLanguage({ message: 'A Japanese school romance with a Japanese movie look.' })).toBeNull()
  })

  it('언어를 고르지 않은 첫 답변은 대사 언어를 비워 둔다', () => {
    // 왜: 이미지나 숫자만 보낸 사용자는 대사 언어를 선택하지 않았다.
    expect(resolveProducerDialogueLanguage({ message: '👍' })).toBeNull()
    expect(resolveProducerDialogueLanguage({ message: '30' })).toBeNull()
  })

  it('이미 정한 대사 언어는 다른 언어로 기획해도 유지한다', () => {
    // 왜: 채팅 언어와 등장인물의 발화 언어는 각각 선택할 수 있다.
    expect(resolveProducerDialogueLanguage({ message: '한국 학교로 배경을 바꿔줘', currentLanguage: 'ja' })).toBe('ja')
  })

  it.each([
    ['대사는 일본어로 해줘', 'ja'],
    ['일본어 대사로 해줘', 'ja'],
    ['대사 언어는 일본어', 'ja'],
    ['등장인물들은 일본어로 말하게 해줘', 'ja'],
    ['대사 언어를 한국어로 바꿔줘', 'ko'],
    ['내레이션은 중국어로 부탁해', 'zh'],
    ['Use English for the dialogue', 'en'],
    ['Make the dialogue Japanese', 'ja'],
  ])('대사 언어를 명시한 요청 “%s”이면 그 언어를 적용한다', (message, language) => {
    // 왜: 정상 경로 고정 — 대사 언어를 직접 요청한 변경은 막지 않는다.
    expect(resolveProducerDialogueLanguage({ message, currentLanguage: 'ko' })).toBe(language)
  })

  it('대사 언어를 묻는 직전 질문에는 짧게 언어만 답해도 적용한다', () => {
    // 왜: 선택지나 짧은 답으로 정한 대사 언어도 명시적 선택이다.
    expect(resolveProducerDialogueLanguage({
      message: '일본어', currentLanguage: 'ko',
      history: [{ role: 'model', content: '대사 언어는 어떤 언어로 할까요?' }],
    })).toBe('ja')
  })

  it.each(['한국어로 해줘', '일본어로 부탁해'])('대사 언어 질문에 “%s”라고 답하면 사용자의 언어 선택을 적용한다', (message) => {
    // 왜: 언어 이름에 자연스럽게 붙이는 부탁도 직전 질문에 대한 명시적 답변이다.
    expect(resolveProducerDialogueLanguage({
      message,
      history: [{ role: 'model', content: '대사 언어는 어떤 언어로 할까요?' }],
    })).toBe(message.startsWith('한국어') ? 'ko' : 'ja')
  })

  it.each([
    '일본어 간판이 보이는 학교에서 대화하는 장면',
    '대사에 일본어 표현이 있으면 좋겠어',
    '대사는 일본어로 하지 마',
    '대사는 일본어로는 하지 말아줘',
    '대사는 일본어로 하면 안 돼',
    '대사는 일본어로 할 필요 없어',
    '일본어 대사는 쓰지 마',
    '대사는 없고 학교 간판만 일본어로 해줘',
    '일본어 대사가 어울릴까?',
    'Would Japanese dialogue fit the setting?',
    'The reference film has Japanese dialogue',
    'Should I use Japanese dialogue?',
    'I want the visual style of a movie that has Japanese dialogue',
    '채팅은 영어로 말해줘',
    'Use Japanese subtitles with Korean dialogue',
  ])('대사 언어 변경 요청이 아닌 “%s”이면 기존 선택을 지킨다', (message) => {
    // 왜: 배경의 글자·일부 표현·금지·질문·자막은 전체 대사의 언어 변경이 아니다.
    expect(resolveProducerDialogueLanguage({ message, currentLanguage: 'ko' })).toBe('ko')
  })

  it('일본어 대신 한국어 대사를 요청하면 거절한 언어를 적용하지 않는다', () => {
    // 왜: 언어 이름을 먼저 찾는 것만으로는 사용자가 부정한 일본어가 선택된다.
    expect(resolveProducerDialogueLanguage({ message: '대사는 일본어 말고 한국어로 해줘', currentLanguage: 'ja' })).toBe('ko')
  })

  it('마지막 질문이 간판 언어를 물었으면 짧은 언어 답변으로 대사 언어를 바꾸지 않는다', () => {
    // 왜: 앞 문장의 대사 언급 때문에 뒤의 다른 질문에 한 답변을 대사 선택으로 오해할 수 있다.
    expect(resolveProducerDialogueLanguage({
      message: '일본어', currentLanguage: 'ko',
      history: [{ role: 'model', content: '대사는 한국어로 유지할게요. 간판에 쓸 언어는 무엇인가요?' }],
    })).toBe('ko')
  })

  it.each([
    ['대사는 한국어로 할까요?', '응', 'ko'],
    ['대사는 일본어로 할까요?', '네', 'ja'],
    ['Should we use English for the dialogue?', 'yes', 'en'],
  ])('대사 언어 제안 “%s”에 “%s”라고 동의하면 그 언어를 확정한다', (question, message, language) => {
    // 왜: 사용자가 언어 이름을 반복하지 않아도 방금 받은 단일 제안에 동의할 수 있다.
    expect(resolveProducerDialogueLanguage({ message, history: [{ role: 'model', content: question }] })).toBe(language)
  })

  it.each([
    '대사는 한국어로 할까요, 일본어로 할까요?',
    '대사는 아직 미정이에요. 장르는 로맨스로 할까요?',
  ])('“%s”에 동의만 했으면 대사 언어를 임의 확정하지 않는다', (question) => {
    // 왜: 여러 언어 중 하나를 고르거나 다른 질문에 답한 말은 대사 언어 승인이 아니다.
    expect(resolveProducerDialogueLanguage({ message: '응', history: [{ role: 'model', content: question }] })).toBeNull()
  })
})
