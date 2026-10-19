// Storyboard 가 씬 · 샷을 나누고 러프를 그리는 동안 화면을 잠그는 표시(단계 · 진행률 · 실패 안내)와 잠금이 풀리는 때를 검사한다
import { describe, expect, it } from 'vitest'
import {
  INITIAL_BOARD_LOCK,
  advanceBoardLock,
  dismissBoardFailure,
  isBoardRunActive,
  storyboardBusyView,
  type BoardLockFacts,
  type BoardLockState,
} from '@/lib/writer/board-busy'
import type { RoughProgress } from '@/lib/writer/rough-progress'
import type { WriterStatus } from '@/lib/writer/use-writer-status'

function status(patch: Partial<WriterStatus> = {}): Partial<WriterStatus> {
  return {
    started: true,
    engine: 'v1',
    pipeline_completed: false,
    pipeline_failed: false,
    current_status: 'running',
    current_stage: 'decoupage',
    completed_units: 8,
    total_units: 15,
    ...patch,
  }
}
const completedStatus = status({ pipeline_completed: true, current_status: 'completed', current_stage: 'persistShots' })

function facts(patch: Partial<BoardLockFacts> = {}): BoardLockFacts {
  return { runActive: false, reloading: false, hasShots: true, generating: 0, failed: 0, pumpActive: false, autoDrawPending: false, ...patch }
}
function rough(patch: Partial<RoughProgress> = {}): RoughProgress {
  return { total: 8, completed: 0, generating: 0, waiting: 8, failed: 0, ...patch }
}
/** 여러 순간을 차례로 지난 잠금 상태. */
function walk(...moments: BoardLockFacts[]): BoardLockState {
  return moments.reduce(advanceBoardLock, INITIAL_BOARD_LOCK)
}
const splitting = facts({ runActive: true, hasShots: false })

describe('씬 · 샷을 나누는 동안의 잠금', () => {
  // 왜: 씬 · 샷 나누기는 몇 분 걸린다(프로토타입 S0) — 끝날 때까지 화면과 채팅을 잠그고, 어디까지 했고 무엇이 남았는지 보여 준다. 정상 경로 고정.
  it('씬 · 샷을 나누는 중이면 잠금 표시에 다섯 단계와 진행률을 보여 준다', () => {
    const view = storyboardBusyView({ status: status({ current_stage: 'decoupage' }), facts: splitting, lock: walk(splitting), rough: rough({ total: 0, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(view.open).toBe(true)
    expect(view.phase).toBe('split')
    expect(view.title).toBe('Storyboard로 넘어가는 중이에요')
    expect(view.steps).toEqual([
      { label: '산문 읽기', state: 'done' },
      { label: '씬 3개로 나누기', state: 'done' },
      { label: '카메라 자리 · 샷', state: 'current' },
      { label: '샷 크기 · 앵글 · 무브먼트', state: 'todo' },
      { label: '러프 그리기', state: 'todo' },
    ])
    expect(view.progress).toBe(50)
    expect(view.progressLabel).toBe('3/4 단계 · 50%')
  })

  // 왜: 실행이 다음 단계로 넘어갈 때마다 "지금 하는 줄"이 한 줄씩 내려가야 남은 일이 보인다.
  it('씬 · 샷 나누기 단계가 바뀌면 지금 하는 줄이 차례로 내려간다', () => {
    const current = (stage: string) =>
      storyboardBusyView({ status: status({ current_stage: stage }), facts: splitting, lock: walk(splitting), rough: rough(), sceneCount: 0 }, 'ko')
        .steps?.findIndex((step) => step.state === 'current')
    expect(current('sceneCinematography')).toBe(1)
    expect(current('decoupage')).toBe(2)
    expect(current('sceneStage')).toBe(2)
    expect(current('shotsAndDialogue')).toBe(3)
    expect(current('persistShots')).toBe(3)
  })

  // 왜: Artist [완료하기] 직후에는 실행이 다시 돌기 시작했지만 단계 이름이 아직 인물 · 배경 디자인(v2Design)에 머물러 있다 — 그 틈에 빈 보드가 보이면 안 된다.
  it('Artist [완료하기] 직후 씬 · 샷 나누기가 시작되기 전에도 잠금 표시를 띄운다', () => {
    const view = storyboardBusyView({ status: status({ current_stage: 'v2Design' }), facts: splitting, lock: walk(splitting), rough: rough(), sceneCount: 0 }, 'ko')
    expect(view.open).toBe(true)
    expect(view.steps?.[0]).toEqual({ label: '산문 읽기', state: 'current' })
    expect(view.steps?.[1]).toEqual({ label: '씬 나누기', state: 'todo' })
    expect(view.progressLabel).toBe('1/4 단계 · 0%')
  })

  // 왜: [완료하기]를 기다리는 정지는 AI 가 일하는 시간이 아니다 — 잠그면 사용자가 할 수 있는 일이 없어진다.
  it('실행이 Artist [완료하기]를 기다리는 중이면 잠그지 않는다', () => {
    const waiting = status({ current_status: 'awaiting_artist', current_stage: 'v2Design' })
    expect(isBoardRunActive(waiting)).toBe(false)
    expect(isBoardRunActive(status({ current_status: 'awaiting_confirmation', current_stage: 'storyCheck' }))).toBe(false)
    expect(isBoardRunActive(status({ current_stage: 'decoupage' }))).toBe(true)
    const idle = facts({ hasShots: false })
    expect(storyboardBusyView({ status: waiting, facts: idle, lock: walk(idle), rough: rough(), sceneCount: 0 }, 'ko').open).toBe(false)
  })

  // 왜(혼자 정한 것): 예전 흐름의 다시 하기처럼 산문 초안을 쓰는 실행이 이 화면에서 돌 수도 있다 — 곧 바뀔 옛 샷을 고치지 못하게 잠그고 Writer 진행 문구를 그대로 보여 준다.
  it('산문 초안을 쓰는 실행이 이 화면에서 돌면 Writer 진행 문구로 잠근다', () => {
    const draft = status({ current_stage: 'scenes', completed_units: 2 })
    const view = storyboardBusyView({ status: draft, facts: splitting, lock: walk(splitting), rough: rough(), sceneCount: 0 }, 'ko')
    expect(view.open).toBe(true)
    expect(view.title).toBe('씬 초안 준비')
    expect(view.steps).toBeUndefined()
  })

  // 왜: 실행이 멈추면 AI 가 일하지 않는다 — 잠금을 풀어야 보드의 "이어서 다시 하기"를 누를 수 있다.
  it('씬 · 샷 나누기가 실패하면 잠금을 푼다', () => {
    const stopped = facts({ hasShots: false })
    const lock = walk(splitting, stopped)
    const view = storyboardBusyView({ status: status({ pipeline_failed: true, current_status: 'failed' }), facts: stopped, lock, rough: rough(), sceneCount: 0 }, 'ko')
    expect(view.open).toBe(false)
  })
})

describe('러프를 그리는 동안의 잠금', () => {
  // 왜: 샷이 저장된 뒤 러프를 그리는 것도 오래 걸린다 — 같은 잠금 표시에 몇 컷을 그렸는지 보여 주고, 다 그린 샷은 뒤 보드에 먼저 보인다. 정상 경로 고정.
  it('샷이 저장된 뒤 러프를 그리는 중이면 잠금 표시에 "러프 k/N"과 진행률을 보여 준다', () => {
    const drawing = facts({ hasShots: true, generating: 5, pumpActive: true })
    const view = storyboardBusyView({ status: completedStatus, facts: drawing, lock: walk(splitting, drawing), rough: rough({ completed: 3, generating: 5, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(view.open).toBe(true)
    expect(view.phase).toBe('draw')
    expect(view.title).toBe('러프를 그리고 있어요')
    expect(view.progress).toBe(38)
    expect(view.progressLabel).toBe('러프 3/8 · 38%')
    expect(view.steps?.slice(0, 4).every((step) => step.state === 'done')).toBe(true)
    expect(view.steps?.[4]).toEqual({ label: '러프 그리는 중 3/8', state: 'current' })
  })

  // 왜: 실행이 끝난 순간과 샷을 다시 읽어 그리기 시작하는 순간 사이에 빈 보드가 번쩍 보이면 안 된다.
  it('실행이 끝나고 샷을 다시 읽는 동안에도 잠금을 유지한다', () => {
    const reloading = facts({ reloading: true, hasShots: false })
    const view = storyboardBusyView({ status: completedStatus, facts: reloading, lock: walk(splitting, reloading), rough: rough({ total: 0, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(view.open).toBe(true)
    expect(view.phase).toBe('draw')
  })

  // 왜: 다시 읽기는 빈 보드가 번쩍이지 않게 하려는 기다림일 뿐이다 — 샷이 이미 왔는데 다시 읽기가 늦게 끝난다고(네트워크 멈춤 등) 화면을 계속 잠그면 안 된다.
  it('실행이 끝나고 샷이 도착했는데 그릴 것이 없으면 다시 읽기가 끝나지 않아도 잠금을 푼다', () => {
    const arrived = facts({ reloading: true, hasShots: true })
    const lock = walk(splitting, arrived)
    const view = storyboardBusyView({ status: completedStatus, facts: arrived, lock, rough: rough({ completed: 8, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(view.open).toBe(false)
    expect(lock.awaitingFirstDraw).toBe(false)
  })

  // 왜: 화면을 새로 열었을 때 진입 자동 그리기가 막 시작되는 순간에도 같은 첫 그리기 표시를 보여 준다.
  it('화면에 들어오자마자 빠진 러프를 자동으로 그리기 시작하면 같은 잠금 표시를 띄운다', () => {
    const pending = facts({ hasShots: true, autoDrawPending: true })
    const view = storyboardBusyView({ status: completedStatus, facts: pending, lock: INITIAL_BOARD_LOCK, rough: rough(), sceneCount: 2 }, 'ko')
    expect(view.open).toBe(true)
    expect(view.steps?.[4]).toEqual({ label: '러프 그리는 중 0/8', state: 'current' })
  })

  // 왜: 다 그리면 사용자가 고칠 차례다 — 잠금을 바로 푼다. 정상 경로 고정.
  it('러프가 다 그려지면 잠금을 푼다', () => {
    const lock = walk(splitting, facts({ hasShots: true, pumpActive: true, generating: 8 }), facts({ hasShots: true }))
    const view = storyboardBusyView({ status: completedStatus, facts: facts({ hasShots: true }), lock, rough: rough({ completed: 8, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(view.open).toBe(false)
    expect(lock.awaitingFirstDraw).toBe(false)
  })

  // 왜: 그리지 못한 컷이 있으면 잠금 표시에서 바로 다시 그리거나, 닫고 보드에서 고를 수 있어야 한다(프로토타입 원칙: 끝나야 고칠 수 있다).
  it('실패한 컷이 남은 채로 다 그리면 잠금 표시에 실패 수와 [남은 컷 다시 그리기] · [닫기]를 둔다', () => {
    const ended = facts({ hasShots: true, failed: 2 })
    const lock = walk(splitting, facts({ hasShots: true, pumpActive: true, generating: 8 }), ended)
    const view = storyboardBusyView({ status: completedStatus, facts: ended, lock, rough: rough({ completed: 6, waiting: 0, failed: 2 }), sceneCount: 3 }, 'ko')
    expect(view.open).toBe(true)
    expect(view.phase).toBe('failed')
    expect(view.title).toBe('러프 2컷을 그리지 못했어요')
    expect(view.failed).toBe(2)
    expect(view.actions).toEqual({ redraw: '남은 컷 다시 그리기', close: '닫기' })
  })

  // 왜: [닫기]는 잠금만 푼다 — 실패한 카드는 보드에 남아 카드의 다시 시도로 그릴 수 있다.
  it('실패 안내에서 [닫기]를 누르면 잠금을 푼다', () => {
    const ended = facts({ hasShots: true, failed: 2 })
    const lock = dismissBoardFailure(walk(splitting, facts({ hasShots: true, pumpActive: true, generating: 8 }), ended))
    const view = storyboardBusyView({ status: completedStatus, facts: ended, lock, rough: rough({ completed: 6, waiting: 0, failed: 2 }), sceneCount: 3 }, 'ko')
    expect(view.open).toBe(false)
  })

  // 왜(혼자 정한 것): 실패 안내는 방금 끝난 그리기의 결과다 — 예전 실패만 남은 보드를 열 때마다 화면을 잠그면 아무것도 못 한다.
  it('예전 실패만 남은 보드를 열면 실패 안내로 잠그지 않는다', () => {
    const opened = facts({ hasShots: true, failed: 2 })
    const view = storyboardBusyView({ status: completedStatus, facts: opened, lock: walk(opened), rough: rough({ completed: 6, waiting: 0, failed: 2 }), sceneCount: 3 }, 'ko')
    expect(view.open).toBe(false)
  })

  // 왜(혼자 정한 것): 보드에서 컷을 다시 그리는 것도 AI 가 일하는 시간이다(프로토타입 S3) — 같은 잠금 표시를 띄우되 씬 · 샷 나누기 단계 목록은 다시 보여 주지 않는다.
  it('보드에서 컷을 다시 그리면 같은 잠금 표시를 띄우고 다 그리면 푼다', () => {
    const idle = facts({ hasShots: true })
    const redraw = facts({ hasShots: true, generating: 1 })
    const during = storyboardBusyView({ status: completedStatus, facts: redraw, lock: walk(idle, redraw), rough: rough({ completed: 7, generating: 1, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(during.open).toBe(true)
    expect(during.phase).toBe('draw')
    expect(during.steps).toBeUndefined()
    expect(during.progressLabel).toBe('러프 7/8 · 88%')
    const after = storyboardBusyView({ status: completedStatus, facts: idle, lock: walk(idle, redraw, idle), rough: rough({ completed: 8, waiting: 0 }), sceneCount: 3 }, 'ko')
    expect(after.open).toBe(false)
  })
})
