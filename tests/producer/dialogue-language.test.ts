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

  it.each([
    ['한국어(ko)', 'ko'],
    ['한국어 (ko)로 해주세요', 'ko'],
    ['ko', 'ko'],
    ['English (en)', 'en'],
    ['일본어(ja)', 'ja'],
    ['中文(zh)', 'zh'],
  ])('대사 언어 질문에 “%s”라고 답하면 해당 언어를 확정한다', (message, language) => {
    // 왜: 선택지에 표시된 언어 이름과 코드를 함께 답하면 기존 판별이 놓쳐 다시 물었다.
    expect(resolveProducerDialogueLanguage({
      message,
      history: [{ role: 'model', content: '대사 언어는 어떤 언어로 할까요?' }],
    })).toBe(language)
  })

  it('대사 언어를 이름과 코드로 지정하면 그 언어를 확정한다', () => {
    // 왜: 질문에 대한 짧은 답변뿐 아니라 직접 지정하는 문장에도 같은 표기를 쓴다.
    expect(resolveProducerDialogueLanguage({ message: '대사 언어는 한국어(ko)로 해줘' })).toBe('ko')
  })

  it.each(['한국어(ja)', 'en', '한국어(ko)'])('대사 언어 질문이 아닌 곳에 “%s”라고 답하면 언어를 추측하지 않는다', (message) => {
    // 왜: 코드가 포함되어도 간판의 언어를 고른 답변은 대사 설정이 아니다.
    expect(resolveProducerDialogueLanguage({
      message,
      history: [{ role: 'model', content: '간판에 쓸 언어는 무엇인가요?' }],
    })).toBeNull()
  })

  it('대사 언어 이름과 코드가 서로 다르면 임의 확정하지 않는다', () => {
    // 왜: 상충하는 선택을 한쪽으로 해석해 저장하지 않는다.
    expect(resolveProducerDialogueLanguage({
      message: '한국어(ja)',
      history: [{ role: 'model', content: '대사 언어는 어떤 언어로 할까요?' }],
    })).toBeNull()
  })

  it('앞서 답한 대사 언어가 비어 있으면 확인된 사용자 답변에서 복구한다', () => {
    // 왜: 한국어(ko)라는 답을 놓친 다음 턴에도 미정으로 돌아가 같은 질문을 반복했다.
    expect(resolveProducerDialogueLanguage({
      message: '실사로 해줘',
      currentLanguage: '',
      history: [
        { role: 'model', content: '대사 언어는 어떤 언어로 할까요?' },
        { role: 'user', content: '한국어(ko)' },
        { role: 'model', content: '스타일은 실사로 할까요?' },
      ],
    })).toBe('ko')
  })

  it('과거에 대사 언어를 여러 번 지정했으면 가장 최근 선택에서 복구한다', () => {
    // 왜: 저장이 누락된 이력을 복구할 때도 사용자가 나중에 바꾼 언어가 우선이다.
    expect(resolveProducerDialogueLanguage({
      message: '이야기를 계속 정리해줘',
      history: [
        { role: 'user', content: '대사는 일본어로 해줘' },
        { role: 'model', content: '대사는 한국어로 바꿀까요?' },
        { role: 'user', content: '응' },
      ],
    })).toBe('ko')
  })

  it('저장된 대사 언어가 있으면 과거 답변으로 덮어쓰지 않는다', () => {
    // 왜: 사용자가 설정 화면에서 바꾼 최신 값은 예전 대화보다 우선한다.
    expect(resolveProducerDialogueLanguage({
      message: '이야기를 계속 정리해줘',
      currentLanguage: 'ja',
      history: [{ role: 'user', content: '대사는 한국어로 해줘' }],
    })).toBe('ja')
  })

  it('과거에 모델만 언어를 선언했으면 사용자 선택으로 복구하지 않는다', () => {
    // 왜: 사용자가 선택하지 않은 언어를 모델의 응답만 보고 확정하면 안 된다.
    expect(resolveProducerDialogueLanguage({
      message: '실사로 해줘',
      history: [
        { role: 'user', content: '일본 학교를 배경으로 할게' },
        { role: 'model', content: '대사는 일본어로 할게요. 실사로 만들까요?' },
        { role: 'user', content: '응' },
      ],
    })).toBeNull()
  })
})
