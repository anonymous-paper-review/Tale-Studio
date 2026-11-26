'use client'

// Storyboard 가 열려 있는 동안 빠진 콘티 그림(목각 러프)을 이어 그린다(리드 2026-11-26 m1126) — 예전 Storyboard 보드의 진입 자동 그리기와 같은 러프 펌프 규칙:
//   같은 서버 길(/api/writer/rough-storyboard)에 프로젝트만 실어 보내면 서버가 빠진 샷을 고른다(이미 있음 · 그리는 중 · 반복 실패 · 스토리 없음은 건너뜀).
//   한 번에 시트 두 장까지 — 보낸 묶음이 끝나야 다음 묶음, 남은 샷이 없으면 끝(lib/writer/rough-pump-client runRoughPump).
//   자리 부족(429) · 내용 규칙 거절은 다시 시도하지 않고 멈추고 공용 안내가 알린다(2026-09-11 오너). 화면을 떠나면 다음 묶음을 보내지 않는다.
//   보드 · 채팅은 잠그지 않는다 — 그 카드에만 기다림(S5 · O7과 같은 결). 그린 뒤 샷을 다시 읽으면 카드가 콘티 그림을 보이고 다음 [시작]이 그 샷도 넣는다.
//   언제 시작하는지는 아래 roughFillStart, 화면 쪽 효과는 features/storyboard/use-rough-fill. 약속: tests/writer/real-rough-fill.test.ts
import { toast } from 'sonner'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { refreshGenerationQueue } from '@/lib/generation-queue'
import { isContentPolicyBlocked, isModerationUnavailable, notifyIfQuotaExceeded } from '@/lib/generation-quota-toast'
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { invalidateShots } from '@/lib/shots-cache'
import { useRoughFillStore } from '@/lib/storyboard/rough-fill-store'
import { boardMissingRoughIds, type AddedDrawView } from '@/lib/writer/added-shot-draws'
import { runRoughPump, type RoughPumpOutcome, type RoughPumpRound } from '@/lib/writer/rough-pump-client'
import { useWriterStore } from '@/stores/writer-store'
import type { Shot } from '@/types'

const NO_ADDED_DRAWS: ReadonlyMap<string, AddedDrawView> = new Map()

/** 이어 그릴 빠진 샷(보드 순서) — 콘티 그림(러프)이 아예 없고 그릴 스토리가 있고 그리는 중이 아닌 샷. 예전 Storyboard 보드와 같은 판정(boardMissingRoughIds). */
export function missingContiShotIds(
  shots: ReadonlyArray<Pick<Shot, 'shotId' | 'roughStoryboard' | 'actionDescription'>>,
  roughDrawing: ReadonlySet<string>,
): string[] {
  return boardMissingRoughIds(shots, { hasPanel: (shot) => !!shot.roughStoryboard, hasJob: (shotId) => roughDrawing.has(shotId) }, NO_ADDED_DRAWS)
}

/** 이어 그리기를 시작할 빠진 샷 — 이 화면에서 아직 맡기지 않은 샷. 비면 시작하지 않는다.
 *  글 파이프라인이 씬 · 샷을 다시 나누는 동안 · 이어 그리기가 도는 동안은 시작하지 않는다(도는 이어 그리기가 남은 샷까지 맡는다). */
export function roughFillStart(input: {
  missing: readonly string[]
  tried: ReadonlySet<string>
  running: boolean
  writerRunning: boolean
}): string[] {
  if (input.running || input.writerRunning) return []
  return input.missing.filter((shotId) => !input.tried.has(shotId))
}

function markPending(projectId: string, shotIds: readonly string[]): void {
  useRoughFillStore.setState((state) => {
    const pending = state.projectId === projectId ? { ...state.pending } : {}
    for (const id of shotIds) pending[id] = true
    return { projectId, pending }
  })
}

function clearPending(projectId: string, shotIds: readonly string[]): void {
  useRoughFillStore.setState((state) => {
    if (state.projectId !== projectId) return state
    const pending = { ...state.pending }
    for (const id of shotIds) delete pending[id]
    return { pending }
  })
}

/** 그린 콘티 그림을 카드에 — 30초 사물함을 낡음으로 표시하고 샷을 다시 읽는다(예전 보드와 같다). */
async function reloadShots(projectId: string): Promise<void> {
  await invalidateShots(projectId).catch(() => {})
  await useWriterStore.getState().loadProject().catch(() => {})
}

/** 한 묶음 — 예전 Storyboard 보드의 자동 그리기와 같은 요청 · 같은 멈춤. 실패 안내를 이미 했으면 null(펌프가 멈춘다). */
async function fillRoughRound(projectId: string, locale: AppLocale): Promise<RoughPumpRound | null> {
  try {
    const res = await fetch('/api/writer/rough-storyboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean
      error?: { message?: string }
      data?: { submitted?: Array<{ shotId: string; jobId: string; confirmationPending?: boolean }>; remaining?: number; confirmationPending?: boolean }
    } | null
    // 자리 부족(429) · 내용 규칙 거절(400) · 검사 장애(503)는 멈춤 — 공용 안내가 한 번 알린다(고정 id 라 여러 번 와도 하나).
    if (res.status === 429 || isContentPolicyBlocked(res.status, body) || isModerationUnavailable(res.status, body)) {
      notifyIfQuotaExceeded(res.status, body)
      return { submitted: 0, remaining: 0, quota: true, done: Promise.resolve() }
    }
    if (!res.ok || !body?.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
    const submitted = Array.isArray(body.data?.submitted) ? body.data.submitted : []
    const confirmationPending = body.data?.confirmationPending === true || submitted.some((item) => item.confirmationPending)
    if (confirmationPending) toast.info(translate(locale, 'Confirming the previous rough request. It will not be submitted again.'))
    const shotIds = submitted.map((item) => item.shotId)
    if (shotIds.length > 0) {
      markPending(projectId, shotIds)
      // 채팅 진행 알약 · 다른 화면도 다음 조회(4초)를 기다리지 않고 바로 켜지게.
      refreshGenerationQueue()
    }
    // 묶음의 끝(펌프의 라운드 배리어) — 작업이 끝나면(성공 · 실패 모두) 샷을 다시 읽고, 다 읽은 뒤에 그리는 중에서 뺀다.
    const jobIds = [...new Set(submitted.map((item) => item.jobId))]
    const done = Promise.allSettled(jobIds.map((jobId) => pollGenerationJob(jobId)))
      .then(() => (shotIds.length > 0 ? reloadShots(projectId) : undefined))
      .finally(() => clearPending(projectId, shotIds))
    return { submitted: shotIds.length, remaining: Number(body.data?.remaining) || 0, quota: false, confirmationPending, done }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : translate(locale, 'Rough storyboard generation request failed'))
    return null
  }
}

/** 빠진 콘티 그림 이어 그리기 — 한 번에 하나(도는 중이면 'busy', 새 요청 없음). isAborted = 화면을 떠났나. */
export async function fillMissingRoughs(
  projectId: string,
  opts: { locale: AppLocale; isAborted: () => boolean },
): Promise<RoughPumpOutcome | 'busy'> {
  if (useRoughFillStore.getState().running) return 'busy'
  useRoughFillStore.setState((state) => ({ running: true, projectId, pending: state.projectId === projectId ? state.pending : {} }))
  try {
    return await runRoughPump({ generate: () => fillRoughRound(projectId, opts.locale), isAborted: opts.isAborted })
  } finally {
    useRoughFillStore.setState({ running: false })
  }
}
