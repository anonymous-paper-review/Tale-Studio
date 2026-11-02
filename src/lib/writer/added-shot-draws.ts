// Storyboard 에서 샷을 더하면 그 샷 러프를 바로 그린다(2026-11-02 오너 "더할 때마다 자동").
//   [+ 샷 추가]와 채팅 둘 다 writer-store addShot 을 거친다 — 더한 순간(화면에 넣은 때) 알림을 받아 그 샷만 맡는다.
//   보드 · 채팅은 잠그지 않는다. 그 카드만 그리는 중(또는 자리를 기다리는 중)으로 보이고, 그리기는 카드의 그리기와 같은 요청 길이다.
//   2026-09-11 규칙: 실패는 저절로 다시 그리지 않는다 · 내 한도에 막히면 자리가 날 때 이어 그린다(Artist 이어 그리기와 같은 1분 · 30분)
//   · 모두의 자리 · 검사 장애로 거절되면 멈추고 까닭을 보인다. 내 한도 기다림은 카드("자리가 나면 바로 그려요")만 알린다 —
//   공용 안내 "다시 시도해 주세요"는 띄우지 않는다(2026-11-02 리드, 보드의 그리기가 quietUserLimit 으로 부른다).
//   한 번에 한 요청씩 맡긴다 — 한꺼번에 보내면 자리 검사가 엇갈려 한도를 넘길 수 있다(2026-09-11 감사). 그리기는 함께 돈다.
//   보드가 열려 있는 프로젝트만 그린다 — 보드를 떠나면 아직 보내지 않은 샷은 보내지 않고, 같은 프로젝트 보드로 돌아오면 이어 간다.
//   화면(브라우저)과 테스트가 함께 쓴다 — 서버 전용 모듈을 들이지 않는다. 약속: tests/writer/added-shot-draw.test.ts
import { USER_LIMIT_RECHECK_MS, USER_LIMIT_WAIT_MAX_MS } from '@/lib/artist/draw-continue'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'

export type AddedShotOrigin = 'board' | 'chat'

/** writer-store addShot 이 화면에 샷을 넣은 순간의 알림 — saved 는 저장이 끝나면 성공 여부로 풀린다. */
export interface AddedShotEvent {
  projectId: string
  shotId: string
  origin: AddedShotOrigin
  saved: Promise<boolean>
}

export type AddedDrawPhase =
  /** 화면에는 넣었고 저장을 기다린다. */
  | 'adding'
  /** 보낼 차례를 기다린다. */
  | 'pending'
  /** 요청을 보내는 중. */
  | 'requesting'
  /** 내 동시 생성 자리가 차 있다 — 자리가 나면 다시 본다. */
  | 'waiting'
  /** 접수됐다 — 그리는 중(그림 · 실패는 카드의 그리기 상태가 보인다). */
  | 'drawing'
  /** 스토리가 비어 그릴 것이 없다 — 스토리가 생기면 그린다. */
  | 'no_story'
  /** 멈췄다 — 까닭과 [다시 시도]가 카드에 남는다. 저절로 다시 보내지 않는다. */
  | 'stopped'
  /** 끝났다(그렸거나, 이미 그림이 있거나, 다른 곳에서 그리는 중). */
  | 'done'

export interface AddedDrawView {
  phase: AddedDrawPhase
  /** 멈춘 까닭(번역된 글). */
  reason?: string
  /** 30분을 기다려도 자리가 나지 않아 멈췄다. */
  noSlot?: boolean
}

export type AddedDrawOutcome =
  | { kind: 'submitted'; done: Promise<unknown> }
  | { kind: 'skipped' }
  | { kind: 'no_story'; story: string }
  | { kind: 'user_limit' }
  | { kind: 'stop_all'; reason: string }
  | { kind: 'failed'; reason?: string }

export type DrawAddedShot = (shotId: string) => Promise<AddedDrawOutcome>

/** 보드의 러프 요청(rough-storyboard-view generate) 한 번의 결과 — 더한 샷 그리기가 읽는 칸만. */
export interface RoughDrawRound {
  submitted: number
  confirmationPending?: boolean
  done: Promise<unknown>
  /** 접수 전에 거절된 까닭 — 내 한도 · 모두의 자리 · 내용 규칙 · 검사 장애. */
  refusal?: 'user' | 'global' | 'content' | 'moderation'
  submittedShotIds?: readonly string[]
  skipped?: ReadonlyArray<{ shotId: string; reason: string }>
}

/** 요청 결과 → 더한 샷 그리기가 할 일. 거절 까닭은 공용 안내와 같은 글이다. */
export function addedDrawOutcome(round: RoughDrawRound | null, shotId: string, story: string, locale: AppLocale): AddedDrawOutcome {
  if (!round) return { kind: 'failed', reason: translate(locale, 'Rough storyboard generation request failed') }
  switch (round.refusal) {
    case 'user':
      return { kind: 'user_limit' }
    case 'global':
      return { kind: 'stop_all', reason: translate(locale, 'All generation slots are busy right now. Please try again in a moment.') }
    case 'moderation':
      return { kind: 'stop_all', reason: translate(locale, 'The content check is unavailable right now, so nothing was generated. Please try again in a moment.') }
    case 'content':
      return { kind: 'failed', reason: translate(locale, 'This request breaks the content rules, so nothing was generated. Edit the description and try again.') }
  }
  if (round.confirmationPending || round.submittedShotIds?.includes(shotId)) return { kind: 'submitted', done: round.done }
  if (round.skipped?.some((item) => item.shotId === shotId && item.reason === 'no_info')) return { kind: 'no_story', story }
  return { kind: 'skipped' }
}

/** 카드에 보일 상태 — 보낼 차례 · 보내는 중은 그리는 중, 자리 기다림은 기다림, 멈춤은 실패(까닭). 그 밖은 보드의 그리기 상태를 따른다. */
export function addedDrawJob(
  view: AddedDrawView | undefined,
  locale: AppLocale,
): { status: 'generating' | 'waiting' | 'failed'; error?: string } | undefined {
  switch (view?.phase) {
    case 'adding':
    case 'pending':
    case 'requesting':
      return { status: 'generating' }
    case 'waiting':
      return { status: 'waiting' }
    case 'stopped':
      return {
        status: 'failed',
        error: view.noSlot ? translate(locale, 'No slot freed up within 30 minutes, so this rough was not drawn.') : view.reason,
      }
    default:
      return undefined
  }
}

/** 보드의 카드 상태에 얹을 더한 샷 상태 — 그림이 이미 있는 샷은 얹지 않는다(다른 길로 그려졌으면 그 그림이 맞다). */
export function addedDrawJobs<S extends { shotId: string }>(
  shots: readonly S[],
  views: ReadonlyMap<string, AddedDrawView>,
  isDrawn: (shot: S) => boolean,
  locale: AppLocale,
): Record<string, { status: 'generating' | 'waiting' | 'failed'; error?: string }> {
  const out: Record<string, { status: 'generating' | 'waiting' | 'failed'; error?: string }> = {}
  for (const shot of shots) {
    const job = addedDrawJob(views.get(shot.shotId), locale)
    if (job && !isDrawn(shot)) out[shot.shotId] = job
  }
  return out
}

// 더한 샷 그리기가 맡고 있는 동안의 단계 — 멈춤 · 끝남이 아니면 보드의 다른 그리기(진입 자동 그리기 · 누락 패널)가 건드리지 않는다.
const ADDED_DRAW_BUSY: ReadonlySet<AddedDrawPhase> = new Set(['adding', 'pending', 'requesting', 'waiting', 'drawing', 'no_story'])

/** 진입 자동 그리기 · [누락 패널 생성]이 세는 빠진 러프 — 그림도 그리기도 없고 스토리가 있는 샷. 더한 샷 그리기가 맡고 있는 샷은 세지 않는다:
 *  세면 진입 자동 그리기가 깨어 보드 · 채팅을 잠근다(스토리 없이 더한 샷에 스토리를 쓴 때, 2026-11-02 리뷰 R2). */
export function boardMissingRoughIds<S extends { shotId: string; actionDescription?: string | null }>(
  shots: readonly S[],
  probe: { hasPanel: (shot: S) => boolean; hasJob: (shotId: string) => boolean },
  views: ReadonlyMap<string, AddedDrawView>,
): string[] {
  return shots
    .filter((shot) => {
      const phase = views.get(shot.shotId)?.phase
      if (phase && ADDED_DRAW_BUSY.has(phase)) return false
      return !probe.hasPanel(shot) && !probe.hasJob(shot.shotId) && !!shot.actionDescription?.trim()
    })
    .map((shot) => shot.shotId)
}

/** 보드 잠금이 세는 샷 — 이 화면에서 더한 샷은 뺀다(더한 샷은 카드에서만 그리는 중으로 보인다, 다시 그려도). */
export function withoutAddedShots<S extends { shotId: string }>(shots: readonly S[], views: ReadonlyMap<string, AddedDrawView>): S[] {
  return views.size === 0 ? [...shots] : shots.filter((shot) => !views.has(shot.shotId))
}

/** 더한 샷이 아닌데 그리는 중인 샷 수 — 이 수가 있을 때만 보드 탭으로 옮긴다(더한 샷 그리기는 대사 탭을 빼앗지 않는다). */
export function boardDrawingCount(drawingShotIds: Iterable<string>, views: ReadonlyMap<string, AddedDrawView>): number {
  let count = 0
  for (const id of drawingShotIds) if (!views.has(id)) count++
  return count
}

interface Entry {
  shotId: string
  origin: AddedShotOrigin
  phase: AddedDrawPhase
  reason?: string
  noSlot?: boolean
  /** 스토리가 없어 멈췄을 때의 스토리 — 바뀌면 다시 본다. */
  story?: string
}

interface Queue {
  entries: Map<string, Entry>
  /** 내 한도에 처음 막힌 때(무엇이 접수되면 다시 잰다). null = 기다리지 않음. */
  userWaitSince: number | null
  /** 지난번에 본 이 프로젝트의 도는 작업 — 하나라도 끝나면 자리가 났을 수 있다. */
  lastJobIds: ReadonlySet<string> | null
}

export interface AddedShotDrawsDeps {
  now?: () => number
  setTimer?: (run: () => void, ms: number) => () => void
}

const EMPTY_VIEWS: ReadonlyMap<string, AddedDrawView> = new Map()

/** 더한 샷 그리기 장부 — 페이지에 하나(보드를 떠났다 돌아와도 이어 간다). 화면은 subscribe · version · view 로 다시 그린다. */
export function createAddedShotDraws(deps: AddedShotDrawsDeps = {}) {
  const now = deps.now ?? (() => Date.now())
  const setTimer =
    deps.setTimer ??
    ((run: () => void, ms: number) => {
      const id = setTimeout(run, ms)
      return () => clearTimeout(id)
    })
  const queues = new Map<string, Queue>()
  let board: { projectId: string; draw: DrawAddedShot; token: number } | null = null
  let tokens = 0
  let requesting = false
  let cancelRecheck: (() => void) | null = null
  let version = 0
  const views = new Map<string, { version: number; map: ReadonlyMap<string, AddedDrawView> }>()
  const listeners = new Set<() => void>()

  const changed = () => {
    version += 1
    for (const listener of listeners) listener()
  }
  const queueOf = (projectId: string): Queue => {
    let queue = queues.get(projectId)
    if (!queue) {
      queue = { entries: new Map(), userWaitSince: null, lastJobIds: null }
      queues.set(projectId, queue)
    }
    return queue
  }
  const hasWaiting = (queue: Queue) => [...queue.entries.values()].some((entry) => entry.phase === 'waiting')
  const stopRecheck = () => {
    cancelRecheck?.()
    cancelRecheck = null
  }
  const scheduleRecheck = (projectId: string) => {
    if (cancelRecheck || board?.projectId !== projectId) return
    cancelRecheck = setTimer(() => {
      cancelRecheck = null
      recheck(projectId)
    }, USER_LIMIT_RECHECK_MS)
  }

  /** 자리가 났을 수 있다 — 기다리던 샷을 다시 보낸다. 처음 막힌 뒤 30분이 지났으면 멈추고 [다시 시도]로 남긴다. */
  function recheck(projectId: string) {
    const queue = queues.get(projectId)
    if (!queue || !hasWaiting(queue) || board?.projectId !== projectId) return
    if (queue.userWaitSince !== null && now() - queue.userWaitSince >= USER_LIMIT_WAIT_MAX_MS) {
      for (const entry of queue.entries.values()) {
        if (entry.phase === 'waiting') {
          entry.phase = 'stopped'
          entry.noSlot = true
        }
      }
      queue.userWaitSince = null
      stopRecheck()
      changed()
      return
    }
    stopRecheck()
    for (const entry of queue.entries.values()) if (entry.phase === 'waiting') entry.phase = 'pending'
    changed()
    void pump()
  }

  function settle(projectId: string, queue: Queue, entry: Entry, outcome: AddedDrawOutcome) {
    if (queue.entries.get(entry.shotId) !== entry) return
    switch (outcome.kind) {
      case 'submitted': {
        entry.phase = 'drawing'
        // 자리를 얻었다 — 아직 기다리는 샷이 있으면 기다림을 지금부터 다시 잰다(Artist 이어 그리기와 같다).
        queue.userWaitSince = hasWaiting(queue) ? now() : null
        const finish = () => {
          if (entry.phase !== 'drawing') return
          entry.phase = 'done'
          changed()
        }
        outcome.done.then(finish, finish)
        break
      }
      case 'skipped':
        entry.phase = 'done'
        break
      case 'no_story':
        entry.phase = 'no_story'
        entry.story = outcome.story
        break
      case 'user_limit':
        // 같은 자리를 다투는 뒤 차례도 지금 보내 봐야 막힌다 — 함께 기다린다.
        entry.phase = 'waiting'
        for (const other of queue.entries.values()) if (other.phase === 'pending') other.phase = 'waiting'
        if (queue.userWaitSince === null) queue.userWaitSince = now()
        scheduleRecheck(projectId)
        break
      case 'stop_all':
        for (const other of queue.entries.values()) {
          if (other === entry || other.phase === 'pending' || other.phase === 'waiting') {
            other.phase = 'stopped'
            other.reason = outcome.reason
          }
        }
        queue.userWaitSince = null
        stopRecheck()
        break
      case 'failed':
        entry.phase = 'stopped'
        entry.reason = outcome.reason
        break
    }
    changed()
  }

  async function pump(): Promise<void> {
    if (requesting || !board) return
    const { projectId, draw } = board
    const queue = queues.get(projectId)
    const entry = queue ? [...queue.entries.values()].find((item) => item.phase === 'pending') : undefined
    if (!queue || !entry) return
    requesting = true
    entry.phase = 'requesting'
    changed()
    let outcome: AddedDrawOutcome
    try {
      outcome = await draw(entry.shotId)
    } catch {
      outcome = { kind: 'failed' }
    } finally {
      requesting = false
    }
    settle(projectId, queue, entry, outcome)
    void pump()
  }

  return {
    /** 보드가 열렸다 — 이 프로젝트의 더한 샷을 이 그리기로 맡긴다. 돌려준 함수로 떠난다(아직 보내지 않은 샷은 보내지 않는다). */
    attach(projectId: string, draw: DrawAddedShot): () => void {
      const token = ++tokens
      board = { projectId, draw, token }
      stopRecheck()
      const queue = queues.get(projectId)
      if (queue && hasWaiting(queue)) {
        // 떠나 있는 동안의 기다림은 세지 않는다 — 돌아오면 기다리던 샷부터 다시 본다.
        for (const entry of queue.entries.values()) if (entry.phase === 'waiting') entry.phase = 'pending'
        queue.userWaitSince = null
        changed()
      }
      if (queue) queue.lastJobIds = null
      void pump()
      return () => {
        if (board?.token !== token) return
        board = null
        stopRecheck()
      }
    },
    /** 샷을 더했다 — 그 프로젝트 보드가 열려 있을 때만 맡는다. 저장에 실패하면 내려놓는다. */
    add(event: AddedShotEvent): void {
      if (board?.projectId !== event.projectId) return
      const queue = queueOf(event.projectId)
      const existing = queue.entries.get(event.shotId)
      if (existing && (existing.phase === 'adding' || existing.phase === 'requesting' || existing.phase === 'drawing')) return
      const entry: Entry = { shotId: event.shotId, origin: event.origin, phase: 'adding' }
      queue.entries.delete(event.shotId)
      queue.entries.set(event.shotId, entry)
      changed()
      const afterSave = (saved: boolean) => {
        if (queue.entries.get(event.shotId) !== entry || entry.phase !== 'adding') return
        if (!saved) {
          queue.entries.delete(event.shotId)
          changed()
          return
        }
        entry.phase = queue.userWaitSince !== null ? 'waiting' : 'pending'
        changed()
        void pump()
      }
      event.saved.then(afterSave, () => afterSave(false))
    },
    /** 샷을 지웠다 — 장부에서 내려놓는다(그리는 중이었어도). 같은 번호가 다시 오면 새 샷으로 맡는다(리뷰 R1). */
    remove(projectId: string, shotIds: readonly string[]): void {
      const queue = queues.get(projectId)
      if (!queue) return
      let removed = false
      for (const id of shotIds) removed = queue.entries.delete(id) || removed
      if (removed) changed()
    },
    /** 이 프로젝트의 도는 작업 목록이 바뀌었다 — 하나라도 끝났으면 자리가 났을 수 있어 기다리던 샷을 다시 본다. */
    jobsChanged(projectId: string, jobIds: readonly string[]): void {
      // 샷을 더하기 전부터 지켜본다 — 처음 막힌 뒤 끝나는 작업을 놓치지 않게.
      const queue = queueOf(projectId)
      const before = queue.lastJobIds
      const after = new Set(jobIds)
      queue.lastJobIds = after
      if (before && [...before].some((id) => !after.has(id))) recheck(projectId)
    },
    /** 스토리가 없어 멈춘 더한 샷에 스토리가 생겼다 — 그린다. */
    storyChanged(projectId: string, shotId: string, story: string): void {
      const queue = queues.get(projectId)
      const entry = queue?.entries.get(shotId)
      if (!queue || !entry || entry.phase !== 'no_story' || !story.trim() || story === entry.story) return
      entry.phase = queue.userWaitSince !== null ? 'waiting' : 'pending'
      changed()
      void pump()
    },
    /** 이 프로젝트에서 더한 샷과 그 상태 — 바뀌지 않으면 같은 값을 돌려준다(화면 구독용). */
    view(projectId: string | null): ReadonlyMap<string, AddedDrawView> {
      if (!projectId) return EMPTY_VIEWS
      const cached = views.get(projectId)
      if (cached && cached.version === version) return cached.map
      const queue = queues.get(projectId)
      const map: ReadonlyMap<string, AddedDrawView> = queue?.entries.size
        ? new Map(
            [...queue.entries.values()].map((entry) => [
              entry.shotId,
              { phase: entry.phase, ...(entry.reason ? { reason: entry.reason } : {}), ...(entry.noSlot ? { noSlot: true } : {}) },
            ]),
          )
        : EMPTY_VIEWS
      views.set(projectId, { version, map })
      return map
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    version(): number {
      return version
    },
  }
}

export type AddedShotDraws = ReturnType<typeof createAddedShotDraws>
