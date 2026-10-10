// 그림체 분석기 답의 "피할 것" 여섯 칸은 태그가 없어도 받는다 (오너 결정 2026-10-10 "느슨하게")
import { describe, expect, it } from 'vitest'
import { checkLiteFill } from '@/lib/style-facets/lite'

const AVOID = { 아티팩트: 'moiré, sensor noise', '충돌 기본값': 'black outlines, flat cel shading', '인접 계열': 'cinematic 3D render', '장면 종속': 'specific desk arrangement', 정교화: 'extra clutter', '텍스트·로고': 'readable text, logos' }
/** 96칸 답 — 90칸은 태그가 붙어 있고 "피할 것" 6칸은 그대로 받는다. */
function fill(over: { untaggedStyleLeaf?: boolean; avoid?: Record<string, string> } = {}): string {
  const style = Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`k${i}`, i === 0 && over.untaggedStyleLeaf ? '굵은 선' : '[실측] 값']))
  const data = { 그림체: style, '생성 규칙': { '부정 절': over.avoid ?? AVOID } }
  return '```json\n' + JSON.stringify(data, null, 2) + '\n```\n```md\n교실 풍경\n```'
}

describe('그림체 분석 결과 확인 — 태그', () => {
  it('그림체 분석기 답에서 "피할 것" 여섯 칸만 태그가 빠졌으면 그 답을 받는다', () => {
    // 왜: 10/10 실측 — 교실 그림 5번 중 4번이 이 여섯 칸(피할 것 목록) 때문에 통째로 실패해 Artist 가 그림만 보고 그렸다. 피할 목록은 관찰값이 아니라 태그가 뜻이 없다.
    expect(checkLiteFill(fill()).ok).toBe(true)
    expect(checkLiteFill(fill({ avoid: { ...AVOID, '텍스트·로고': '' } })).ok).toBe(true)
  })

  it('"피할 것" 밖의 칸에 태그가 빠졌으면 지금처럼 받지 않는다', () => {
    // 정상 경로 고정 — 관찰값은 실측 · 추정 · 외삽 · 해당 없음 중 무엇인지 알아야 컴파일이 세기를 정한다.
    expect(checkLiteFill(fill({ untaggedStyleLeaf: true }))).toMatchObject({ ok: false, reason: 'tags' })
  })
})
