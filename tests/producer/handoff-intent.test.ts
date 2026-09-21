// 다음 작업자에게 넘겨 달라는 말을 알아듣고 바로 옆 단계로 정확히 전달한다
import { describe, expect, it } from 'vitest'
import { HANDOFFS, handoffFrom, matchHandoffIntent } from '@/lib/handoff-intent'

describe('matchHandoffIntent', () => {
  it('제안 버튼의 문장을 그대로 입력해도 같은 다음 단계로 알아듣는다', () => {
    for (const spec of HANDOFFS) {
      expect(matchHandoffIntent(spec.utterance, spec.from)).toEqual(spec)
    }
  })

  it('사용자가 자기 말로 부탁해도 알맞은 다음 단계로 넘긴다', () => {
    expect(matchHandoffIntent('이제 writer로 넘겨줘', 'producer')?.to).toBe('writer')
    expect(matchHandoffIntent('감독한테 넘기자', 'artist')?.to).toBe('director')
    expect(matchHandoffIntent('editor로 보내줘', 'director')?.to).toBe('editor')
    expect(matchHandoffIntent('다음 단계로 넘어가자', 'producer')?.to).toBe('writer')
    expect(matchHandoffIntent('Hand over to Director', 'artist')?.to).toBe('director')
  })

  it('넘겨 달라는 말이 없으면 일반적인 부탁으로 남긴다', () => {
    // 대상 이름만 언급 — 스타일 지시일 뿐 핸드오프가 아니다.
    expect(matchHandoffIntent('감독 스타일로 그려줘', 'artist')).toBeNull()
    expect(matchHandoffIntent('writer가 쓴 대사 보여줘', 'producer')).toBeNull()
  })

  it('넘길 상대를 말하지 않으면 일반적인 부탁으로 남긴다', () => {
    expect(matchHandoffIntent('다음 씬으로 넘어가줘', 'producer')).toBeNull()
    expect(matchHandoffIntent('이 샷 옆으로 이동해줘', 'director')).toBeNull()
  })

  it('진행이나 시작만 말하면 다음 단계로 넘기지 않는다', () => {
    // director 에서 "편집"은 editor 를 가리키는 말이라, '진행'을 이동 동사로 넣으면
    //   평범한 편집 요청이 핸드오프로 오인된다.
    expect(matchHandoffIntent('편집 진행해줘', 'director')).toBeNull()
    expect(matchHandoffIntent('대사 생성 시작해줘', 'writer')).toBeNull()
  })

  it('바로 다음 단계가 아닌 상대에게 넘겨 달라고 하면 받아들이지 않는다', () => {
    expect(matchHandoffIntent('editor로 넘겨줘', 'producer')).toBeNull()
    expect(matchHandoffIntent('writer로 넘겨줘', 'director')).toBeNull()
  })

  it('마지막 단계인 Editor에서는 넘길 곳이 없다고 알린다', () => {
    expect(handoffFrom('editor')).toBeNull()
    expect(matchHandoffIntent('다음 단계로 넘어가자', 'editor')).toBeNull()
  })

  it('Writer에서 Artist로도 넘겨 달라는 말을 알아듣는다', () => {
    expect(matchHandoffIntent('artist로 넘겨줘', 'writer')?.to).toBe('artist')
  })

  it('대소문자와 불필요한 공백이 달라도 같은 뜻으로 알아듣는다', () => {
    expect(matchHandoffIntent('  WRITER 로   넘겨 주세요 ', 'producer')?.to).toBe('writer')
  })

  it('다음 단계로 이동하지 말라고 하면 이동 요청으로 처리하지 않는다', () => {
    const cases = [
      ['다음 단계로 이동하지 말아줘', 'producer'],
      ['writer한테 넘기지 말자', 'producer'],
      ['Writer로 넘겨주지 마세요', 'producer'],
      ['아직 Writer로 넘기면 안 돼', 'producer'],
      ['Writer로 이동 안 할래', 'producer'],
      ['다음 단계로 안 넘어가', 'producer'],
      ['아티스트로는 넘어가지 마', 'writer'],
      ['Artist로 넘기지 말고 이 씬을 수정해줘', 'writer'],
      ['감독으로 넘기는 건 하지 마', 'artist'],
      ['editor로 보내지 마', 'director'],
      ['다음 단계 이동은 보류해줘', 'director'],
      ['Please do not hand over to Writer', 'producer'],
      ["Please don't hand over to Writer", 'producer'],
      ['Don’t hand over to Writer', 'producer'],
      ['Never proceed to Artist', 'writer'],
      ['Director handoff is not approved', 'artist'],
      ['Cancel the handoff to Editor', 'director'],
    ] as const
    for (const [text, stage] of cases) {
      expect(matchHandoffIntent(text, stage), text).toBeNull()
    }
  })

  it('이동 방법을 묻거나 이동 요청을 인용하면 바로 이동하지 않는다', () => {
    const cases = [
      ['Writer로 이동하면 뭐가 바뀌어?', 'producer'],
      ['다음 단계로 넘어가도 돼', 'writer'],
      ['Artist로 이동하는 방법 알려줘', 'writer'],
      ['How do I hand over to Writer?', 'producer'],
      ['What happens if I proceed to Artist', 'writer'],
      ['Explain the handoff to Director', 'artist'],
      ['"Writer로 넘겨줘"라는 문구를 설명해줘', 'producer'],
      ['‘Artist로 이동해줘’라는 예시를 보여줘', 'writer'],
      ["'Director로 넘겨줘' 문장을 바꿔줘", 'artist'],
      ['`Editor로 넘겨줘` 버튼 문구를 바꿔줘', 'director'],
    ] as const
    for (const [text, stage] of cases) {
      expect(matchHandoffIntent(text, stage), text).toBeNull()
    }
  })

  it('다른 말을 함께 적어도 분명한 긍정 이동 요청은 유지한다', () => {
    expect(matchHandoffIntent('안녕하세요. 이제 Writer로 넘겨줘', 'producer')?.to).toBe('writer')
    expect(matchHandoffIntent('Artist로 이동해줘!', 'writer')?.to).toBe('artist')
    expect(matchHandoffIntent('이제 "Director"로 넘겨줘', 'artist')?.to).toBe('director')
    expect(matchHandoffIntent("Let's proceed to the next stage", 'director')?.to).toBe('editor')
  })
})
