import { describe, expect, it } from 'vitest'
import { HANDOFFS, handoffFrom, matchHandoffIntent } from '@/lib/handoff-intent'

describe('matchHandoffIntent', () => {
  it('제안 버튼이 보내는 문장은 반드시 인식된다 (버튼 = 타이핑 동치)', () => {
    for (const spec of HANDOFFS) {
      expect(matchHandoffIntent(spec.utterance, spec.from)).toEqual(spec)
    }
  })

  it('사용자가 자기 말로 요청해도 같은 판정을 탄다', () => {
    expect(matchHandoffIntent('이제 writer로 넘겨줘', 'producer')?.to).toBe('writer')
    expect(matchHandoffIntent('감독한테 넘기자', 'artist')?.to).toBe('director')
    expect(matchHandoffIntent('editor로 보내줘', 'director')?.to).toBe('editor')
    expect(matchHandoffIntent('다음 단계로 넘어가자', 'producer')?.to).toBe('writer')
    expect(matchHandoffIntent('Hand over to Director', 'artist')?.to).toBe('director')
  })

  it('이동 동사가 없으면 평범한 요청이다', () => {
    // 대상 이름만 언급 — 스타일 지시일 뿐 핸드오프가 아니다.
    expect(matchHandoffIntent('감독 스타일로 그려줘', 'artist')).toBeNull()
    expect(matchHandoffIntent('writer가 쓴 대사 보여줘', 'producer')).toBeNull()
  })

  it('대상 언급이 없으면 평범한 요청이다', () => {
    expect(matchHandoffIntent('다음 씬으로 넘어가줘', 'producer')).toBeNull()
    expect(matchHandoffIntent('이 샷 옆으로 이동해줘', 'director')).toBeNull()
  })

  it('범용 동사(진행·시작)는 이동으로 치지 않는다', () => {
    // director 에서 "편집"은 editor 를 가리키는 말이라, '진행'을 이동 동사로 넣으면
    //   평범한 편집 요청이 핸드오프로 오인된다.
    expect(matchHandoffIntent('편집 진행해줘', 'director')).toBeNull()
    expect(matchHandoffIntent('대사 생성 시작해줘', 'writer')).toBeNull()
  })

  it('한 칸 앞으로만 — 건너뛰는 대상은 인식하지 않는다', () => {
    expect(matchHandoffIntent('editor로 넘겨줘', 'producer')).toBeNull()
    expect(matchHandoffIntent('writer로 넘겨줘', 'director')).toBeNull()
  })

  it('핸드오프가 정의되지 않은 stage 는 항상 null — editor 가 마지막이다', () => {
    expect(handoffFrom('editor')).toBeNull()
    expect(matchHandoffIntent('다음 단계로 넘어가자', 'editor')).toBeNull()
  })

  it('writer → artist 도 커버한다', () => {
    expect(matchHandoffIntent('artist로 넘겨줘', 'writer')?.to).toBe('artist')
  })

  it('대소문자·공백에 흔들리지 않는다', () => {
    expect(matchHandoffIntent('  WRITER 로   넘겨 주세요 ', 'producer')?.to).toBe('writer')
  })
})
