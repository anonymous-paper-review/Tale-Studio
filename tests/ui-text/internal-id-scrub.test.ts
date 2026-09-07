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

describe('shot/scene 표시명 (#internal-id-scrub)', () => {
  it('sh_02_07 → Scene 2 · Shot 7 (로케일 무관 단일형, 0패딩 제거)', () => {
    expect(shotIdDisplayName('sh_02_07')).toBe('Scene 2 · Shot 7')
    expect(shotIdDisplayName('sh_4_31')).toBe('Scene 4 · Shot 31')
  })

  it('sc_04 → Scene 4, 패턴 밖은 null', () => {
    expect(sceneIdDisplayName('sc_04')).toBe('Scene 4')
    expect(shotIdDisplayName('char_2')).toBeNull()
    expect(sceneIdDisplayName('scene-x')).toBeNull()
  })
})

describe('산문 스크럽 — 챗 말풍선 최종 방어', () => {
  it('산문 속 샷·씬 id 를 표시명으로 치환한다', () => {
    expect(scrubInternalIdsInProse('sh_02_07 의 구도를 sc_04 톤에 맞췄어요.')).toBe(
      'Scene 2 · Shot 7 의 구도를 Scene 4 톤에 맞췄어요.',
    )
  })

  it('과거 스테이지 마커는 걷고 [L3] 스크립트 라인 참조는 보존한다', () => {
    expect(scrubInternalIdsInProse('[p3] 문단과 [L3] 라인을 참고했어요.')).toBe(
      '문단과 [L3] 라인을 참고했어요.',
    )
  })

  it('과거 스테이지 마커는 새 요청 이력에서도 제거한다', () => {
    expect(stripLegacyStageMarkers('[P1] 이전 답변\n[p3] 다음 답변')).toBe(
      '이전 답변\n다음 답변',
    )
  })

  it('이름 맵이 오면 char/loc id 도 이름으로 바꾼다', () => {
    const names = new Map([
      ['char_new_5l6sj', '체장수'],
      ['loc_riverside', '강가'],
    ])
    expect(
      scrubInternalIdsInProse('char_new_5l6sj 를 loc_riverside 에 배치했어요.', names),
    ).toBe('체장수 를 강가 에 배치했어요.')
  })
})

describe('구분선 줄 제거 (#no-hr)', () => {
  it('---·ㅡㅡㅡ·—— 만으로 된 줄은 걷힌다', () => {
    const out = renderInlineMarkdown('위 문단\n---\n아래 문단\nㅡㅡㅡㅡ\n끝')
    expect(out).not.toContain('---')
    expect(out).not.toContain('ㅡㅡ')
    expect(out).toContain('위 문단')
    expect(out).toContain('아래 문단')
  })

  it('본문 속 하이픈과 "- " 목록 항목은 보존한다', () => {
    const out = renderInlineMarkdown('- 항목 하나\nA - B 관계\nScene 2 · Shot 7')
    expect(out).toContain('- 항목 하나')
    expect(out).toContain('A - B 관계')
    expect(out).toContain('Scene 2 · Shot 7')
  })
})

describe('멘션 라벨 — 내부 id 미포함 (#internal-id-scrub)', () => {
  it('라벨에 id 가 붙지 않고, ref 가 식별을 전담한다', () => {
    const [m] = sceneShotMentions(
      [{ kind: 'shot', id: 'sh_02_07', label: 'Shot 2.7' }],
      'real',
    )
    expect(m.label).toBe('Real Shot 2.7')
    expect(m.label).not.toContain('sh_02_07')
    expect(m.ref).toBe('real:shot:sh_02_07')
  })
})
