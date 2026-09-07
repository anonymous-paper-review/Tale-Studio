// 화면에는 내부 번호 대신 사람이 읽는 장면 이름과 카드 이름만 보여준다
import { describe, it, expect } from 'vitest'
import {
  shotIdDisplayName,
  sceneIdDisplayName,
  scrubInternalIdsInProse,
  stripLegacyStageMarkers,
} from '@/lib/display-names'
import { renderInlineMarkdown } from '@/lib/inline-markdown'
import { sceneShotMentions } from '@/lib/card-mention'

// #internal-id-scrub + #no-hr (2026-08-26, 오너 그룹 E) — 내부 id·구분선이 사용자 화면에
//   보이지 않는다는 계약. 정책: 샷 규칙 생성명은 로케일 무관 "Scene 2 · Shot 7" 단일형
//   (오너 확정 — 한국어 UI 도 동일), 내부 id 는 UI 전면 금지(디버그 예외 없음).

describe('샷과 씬을 사람이 읽는 이름으로 보여준다 (#internal-id-scrub)', () => {
  it('장면과 샷 번호를 보여주면 읽기 쉬운 이름으로 바꾼다', () => {
    expect(shotIdDisplayName('sh_02_07')).toBe('Scene 2 · Shot 7')
    expect(shotIdDisplayName('sh_4_31')).toBe('Scene 4 · Shot 31')
  })

  it('장면 번호가 아닌 값은 이름으로 바꾸지 않는다', () => {
    expect(sceneIdDisplayName('sc_04')).toBe('Scene 4')
    expect(shotIdDisplayName('char_2')).toBeNull()
    expect(sceneIdDisplayName('scene-x')).toBeNull()
  })
})

describe('대화 내용에서 내부 번호와 옛 표식을 숨긴다', () => {
  it('대화에 내부 장면 번호가 나오면 사람이 읽는 이름으로 보여준다', () => {
    expect(scrubInternalIdsInProse('sh_02_07 의 구도를 sc_04 톤에 맞췄어요.')).toBe(
      'Scene 2 · Shot 7 의 구도를 Scene 4 톤에 맞췄어요.',
    )
  })

  it('옛 단계 표시는 숨기되 [L3] 대사 줄 참조는 남겨둔다', () => {
    expect(scrubInternalIdsInProse('[p3] 문단과 [L3] 라인을 참고했어요.')).toBe(
      '문단과 [L3] 라인을 참고했어요.',
    )
  })

  it('새 대화에서도 옛 단계 표시는 숨긴다', () => {
    expect(stripLegacyStageMarkers('[P1] 이전 답변\n[p3] 다음 답변')).toBe(
      '이전 답변\n다음 답변',
    )
  })

  it('인물과 장소 이름을 알면 대화 속 번호 대신 그 이름을 보여준다', () => {
    const names = new Map([
      ['char_new_5l6sj', '체장수'],
      ['loc_riverside', '강가'],
    ])
    expect(
      scrubInternalIdsInProse('char_new_5l6sj 를 loc_riverside 에 배치했어요.', names),
    ).toBe('체장수 를 강가 에 배치했어요.')
  })
})

describe('화면에서 구분선만 숨긴다 (#no-hr)', () => {
  it('구분 기호만 있는 줄은 화면에서 숨긴다', () => {
    const out = renderInlineMarkdown('위 문단\n---\n아래 문단\nㅡㅡㅡㅡ\n끝')
    expect(out).not.toContain('---')
    expect(out).not.toContain('ㅡㅡ')
    expect(out).toContain('위 문단')
    expect(out).toContain('아래 문단')
  })

  it('문장 안의 하이픈과 "- " 목록 표시는 그대로 보여준다', () => {
    const out = renderInlineMarkdown('- 항목 하나\nA - B 관계\nScene 2 · Shot 7')
    expect(out).toContain('- 항목 하나')
    expect(out).toContain('A - B 관계')
    expect(out).toContain('Scene 2 · Shot 7')
  })
})

describe('멘션에는 사람이 읽는 이름만 보여준다 (#internal-id-scrub)', () => {
  it('멘션에는 사람이 읽는 이름만 보이고 내부 번호는 숨긴다', () => {
    const [m] = sceneShotMentions(
      [{ kind: 'shot', id: 'sh_02_07', label: 'Shot 2.7' }],
      'real',
    )
    expect(m.label).toBe('Real Shot 2.7')
    expect(m.label).not.toContain('sh_02_07')
    expect(m.ref).toBe('real:shot:sh_02_07')
  })
})
