// n−1 연속성 주입(#n-1 2026-08-05) 회귀 — PREVIZ#2 "shot이 자기 자신만 참조" 해소.
//
// 계약:
//   1. v4 청크 체인: 직전 확정 샷 꼬리(K=2)의 first_frame/motion 이 다음 청크 프롬프트 블록에 실린다.
//      씬 간에는 쓰지 않는다(씬 병렬 설계 #parallel-shotdesign 보존 — 호출부 계약).
//   2. 러프 셀 연속성 줄: 이전 샷 종료 상태를 "그리지 말라" 명시와 함께 계약 — 110자 클립.
import { describe, it, expect } from 'vitest'
import { buildV4ContinuityBlock } from '@/lib/writer/pipeline/stages/v4_shots'
import { buildCellContinuityLine } from '@/lib/writer/rough-storyboard-grid'
import type { ShotDesign } from '@/lib/writer/types/pipeline'

function design(id: string, ff: string, motion: string): ShotDesign {
  return {
    intent: { shot_id: id, scene_id: 'scene_1', duration_seconds: 4, dramatic_purpose: '' },
    static_spec: { shot_id: id, shot_type: 'MS', first_frame_prompt: ff },
    dynamic_spec: { shot_id: id, motion_prompt: motion },
  } as unknown as ShotDesign
}

describe('buildV4ContinuityBlock — 청크 경계 연속성 계약', () => {
  it('직전 K=2개의 first_frame/motion 만 실린다', () => {
    const block = buildV4ContinuityBlock([
      design('shot_1', 'ff-one', 'mo-one'),
      design('shot_2', 'ff-two', 'mo-two'),
      design('shot_3', 'ff-three', 'mo-three'),
    ])
    expect(block).toContain('연속성 계약')
    expect(block).toContain('shot_2')
    expect(block).toContain('ff-three')
    expect(block).toContain('mo-three')
    expect(block).not.toContain('ff-one')
  })

  it('직전 샷이 없으면 빈 문자열 — 첫 청크는 기존 프롬프트 그대로', () => {
    expect(buildV4ContinuityBlock([])).toBe('')
  })
})

describe('buildCellContinuityLine — 러프 셀 연속성 줄', () => {
  it('그리기 금지를 명시하고 110자에서 클립한다', () => {
    const line = buildCellContinuityLine('X'.repeat(200))
    // #grid-shift: 부정 지시("do NOT draw")는 칸 밀림 유발 실측 — 긍정 참조형이어야 한다.
    expect(line).not.toContain('do NOT')
    expect(line).toContain('carry over')
    expect(line).toContain('…')
    expect(line).toContain('X'.repeat(110))
    expect(line).not.toContain('X'.repeat(111))
    // FIX-A(#space-anchor): 배경도 계약 항목 — 공간 앵커 증발 실측(scene2 shot_6) 재발 방지.
    expect(line).toContain('surrounding environment')
  })

  it('이전 텍스트가 없으면 null — 셀은 그대로', () => {
    expect(buildCellContinuityLine(null)).toBeNull()
    expect(buildCellContinuityLine('  ')).toBeNull()
  })
})
