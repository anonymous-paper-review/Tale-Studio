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
})
