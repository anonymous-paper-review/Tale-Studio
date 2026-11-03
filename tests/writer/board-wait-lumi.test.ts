// Storyboard 잠금 화면 가운데 어느 것이 단계를 넘어가며 기다리는 화면(큰 Lumi 자리)인지 검사한다
import { describe, expect, it } from 'vitest'
import { INITIAL_BOARD_LOCK, advanceBoardLock, storyboardBusyView, type BoardLockFacts } from '@/lib/writer/board-busy'
import type { RoughProgress } from '@/lib/writer/rough-progress'
import type { WriterStatus } from '@/lib/writer/use-writer-status'

const running: Partial<WriterStatus> = { started: true, engine: 'v1', pipeline_completed: false, pipeline_failed: false, current_status: 'running', current_stage: 'decoupage' }
const completed: Partial<WriterStatus> = { started: true, engine: 'v1', pipeline_completed: true, pipeline_failed: false, current_status: 'completed', current_stage: 'persistShots' }
const facts = (patch: Partial<BoardLockFacts> = {}): BoardLockFacts => ({ runActive: false, reloading: false, hasShots: true, generating: 0, failed: 0, pumpActive: false, autoDrawPending: false, ...patch })
const rough = (patch: Partial<RoughProgress> = {}): RoughProgress => ({ total: 8, completed: 0, generating: 0, waiting: 8, failed: 0, ...patch })
const walk = (...moments: BoardLockFacts[]) => moments.reduce(advanceBoardLock, INITIAL_BOARD_LOCK)
const splitting = facts({ runActive: true, hasShots: false })

describe('단계를 넘어가며 기다리는 화면', () => {
  // 왜: 오너 결정 8(11/3) — 큰 Lumi 는 단계 넘어갈 때 기다리는 화면에 둔다. Artist [완료하기] 뒤 씬 · 샷을 나누고 첫 러프를 그리는 동안이 Storyboard 로 넘어가는 기다림이다(오너가 짚은 자리).
  it('씬 · 샷을 나누는 동안과 Storyboard 에 들어와 첫 러프를 그리는 동안의 잠금 화면은 단계 넘김 화면이라 큰 Lumi 를 둔다', () => {
    const split = storyboardBusyView({ status: running, facts: splitting, lock: walk(splitting), rough: rough({ total: 0, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(split.stageEntry).toBe(true)
    const drawing = facts({ generating: 5, pumpActive: true })
    const firstDraw = storyboardBusyView({ status: completed, facts: drawing, lock: walk(splitting, drawing), rough: rough({ completed: 3, generating: 5, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(firstDraw.phase).toBe('draw')
    expect(firstDraw.stageEntry).toBe(true)
    const pending = facts({ autoDrawPending: true })
    expect(storyboardBusyView({ status: completed, facts: pending, lock: INITIAL_BOARD_LOCK, rough: rough(), sceneCount: 2 }, 'ko').stageEntry).toBe(true)
  })

  // 왜: 보드에서 컷을 다시 그리는 잠금은 단계를 넘어가는 것이 아니다 — Lumi 의 로딩은 "이전 단계 → 이 단계" 연기라 다시 그리기에 틀면 틀린 말을 한다.
  //   실패 안내 · 오류 안내에는 넣지 않는다(공통 지시서). 이 화면에서 도는 산문 초안 실행도 Storyboard 로 넘어가는 기다림이 아니다.
  it('보드에서 컷을 다시 그리는 잠금 · 실패 안내 · 산문 초안을 쓰는 실행의 잠금에는 큰 Lumi 를 두지 않는다', () => {
    const idle = facts()
    const redraw = facts({ generating: 1 })
    const during = storyboardBusyView({ status: completed, facts: redraw, lock: walk(idle, redraw), rough: rough({ completed: 7, generating: 1, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(during.open).toBe(true)
    expect(during.stageEntry).toBe(false)
    const ended = facts({ failed: 2 })
    const failed = storyboardBusyView({ status: completed, facts: ended, lock: walk(splitting, facts({ pumpActive: true, generating: 8 }), ended), rough: rough({ completed: 6, waiting: 0, failed: 2 }), sceneCount: 3 }, 'ko')
    expect(failed.phase).toBe('failed')
    expect(failed.stageEntry).toBe(false)
    const prose = storyboardBusyView({ status: { ...running, current_stage: 'sceneStory' }, facts: splitting, lock: walk(splitting), rough: rough({ total: 0, waiting: 0 }), sceneCount: 0 }, 'ko')
    expect(prose.open).toBe(true)
    expect(prose.stageEntry).toBe(false)
    expect(storyboardBusyView({ status: completed, facts: idle, lock: walk(idle), rough: rough({ completed: 8, waiting: 0 }), sceneCount: 3 }, 'ko').stageEntry).toBe(false)
  })
})
