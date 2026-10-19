// 리뉴얼 1차: 예전 방식으로 Writer 에 넘겨 씬 스토리 확정을 기다리던 프로젝트는 새 Writer 화면에서도 확정해 이어 갈 수 있다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { legacyGateWaiting } from '@/lib/prose/busy'

describe('예전 방식 씬 스토리 확정', () => {
  // 왜: 새 Writer 화면에는 예전 [이대로 확정] 단추가 없어, 리뉴얼 전에 넘긴 프로젝트가 멈춘 채 갈 곳이 없었다.
  it('예전 방식으로 넘겨 씬 스토리 확정을 기다리는 프로젝트는 확정 줄을 보인다', () => {
    expect(legacyGateWaiting({ locked: true, phase: 'gate', draftRun: false })).toBe(true)
  })

  // 왜: 새 흐름의 확정한 산문(초안 실행)은 Artist [만들기]로 이어 간다 — 예전 확정을 보이면 Artist 를 건너뛴다.
  it('새 흐름으로 확정한 산문은 예전 확정 줄을 보이지 않는다', () => {
    expect(legacyGateWaiting({ locked: true, phase: 'gate', draftRun: true })).toBe(false)
  })

  // 왜: 정상 경로 고정 — 확정 전 산문 · 이미 확정해 뒤 단계가 도는 프로젝트는 해당 없다.
  it('확정 전 산문이나 이미 이어 간 프로젝트는 예전 확정 줄을 보이지 않는다', () => {
    expect(legacyGateWaiting({ locked: false, phase: 'gate', draftRun: true })).toBe(false)
    expect(legacyGateWaiting({ locked: true, phase: 'continuing', draftRun: false })).toBe(false)
    expect(legacyGateWaiting({ locked: true, phase: 'done', draftRun: false })).toBe(false)
  })
})
