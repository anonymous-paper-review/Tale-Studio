'use client'

// 실사 일괄 생성 클라 러너(#real-grid-auto 2026-08-06) — 수동 버튼(RealBatchBar)과 director
//   진입 자동 채움이 공유. 진행 상태는 director-store.realBatchBusy 단일 플래그 — 이 플래그가
//   개별 이미지 생성(generateStoryboardImage)과 UI 버튼을 함께 잠근다.
//   서버 라우트가 멱등(미생성만)이라 자동 호출은 architecture §5 "빈칸 자율 채움" 그대로.

import { toast } from 'sonner'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { activeJobsSnapshot, refreshGenerationQueue } from '@/lib/generation-queue'
import { invalidateShots } from '@/lib/shots-cache'
import { notifyIfQuotaExceeded, notifyQuotaExceeded } from '@/lib/generation-quota-toast'
import { prerequisiteWaitKey, waitForPrerequisite, type PrerequisiteBody, type PrerequisiteCode } from '@/lib/generation-prerequisite-toast'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import type { GenerationJobObserver } from '@/lib/generation-jobs-client'
import { notifyBatchSummary } from '@/lib/generation-notify'
import { useLumiNoticeStore } from '@/stores/lumi-notice-store'

export interface RealBatchResult {
  generated: number
  quotaBlocked: boolean
}

type BatchSkipped = {
  shotId: string
  reason: PrerequisiteCode
  missing?: Array<{ characterId: string; appearanceKey: string; name: string }>
}

// #ref-gate(오너 결정 1번): 건너뛴 샷의 선행 산출물(러프·시트)이 나타나면 배치를 다시 돌린다(멱등 — 빈칸만).
//   프로젝트당 재개 체인 1개, 최대 5회. 탭을 닫으면 끊긴다.
//   다시 도는 판은 처음 요청의 남은 샷(고른 샷이면 건너뛴 샷만)과 다시 만들기(force)를 그대로 싣는다(리드 검토 a 보통 2).
//   [모두 멈추기]를 누른 판은 예약하지 않고, 걸어 둔 재개도 cancelRealBatchResume 으로 거둔다(리드 검토 a 보통 5 · 오너 답 7).
const resumeDepthByProject = new Map<string, number>()
const resumeCancelByProject = new Map<string, () => void>()

/** 걸어 둔 재개를 거둔다 — [모두 멈추기] · 프로젝트를 떠날 때. */
export function cancelRealBatchResume(projectId: string): void {
  resumeCancelByProject.get(projectId)?.()
}

function scheduleRealBatchResume(
  projectId: string,
  skipped: BatchSkipped[],
  opts: { traceId?: string; onJob?: GenerationJobObserver; shotIds?: readonly string[]; force?: boolean },
) {
  const store = useDirectorCanvasStore
  const depth = resumeDepthByProject.get(projectId) ?? 0
  if (!skipped.length || depth >= 5) {
    store.setState({ realBatchResumeShotIds: [] })
    return
  }
  resumeDepthByProject.set(projectId, depth + 1)
  // 같은 자료(같은 인물 시트)를 기다리는 샷이 여럿이면 기다림 하나로 묶는다(2026-10-10). 같은 자료의 새 기다림은
  //   이전 것을 취소하므로, 샷마다 따로 걸면 먼저 취소된 기다림이 경주에서 이겨 판을 다시 시작하지 않았다.
  const bodies: Array<PrerequisiteBody & { code: PrerequisiteCode }> = [...new Map(
    skipped.map((s) => {
      const body: PrerequisiteBody & { code: PrerequisiteCode } = s.reason === 'missing_character_sheets'
        ? { code: s.reason, shotId: s.shotId, missing: s.missing ?? [] }
        : { code: s.reason, shotId: s.shotId }
      return [prerequisiteWaitKey(projectId, body), body] as const
    }),
  ).values()]
  let settled = false
  const cancel = () => {
    settled = true
    resumeDepthByProject.delete(projectId)
    if (resumeCancelByProject.get(projectId) === cancel) resumeCancelByProject.delete(projectId)
    if (store.getState().projectId === projectId) store.setState({ realBatchResumeShotIds: [] })
  }
  resumeCancelByProject.get(projectId)?.()
  resumeCancelByProject.set(projectId, cancel)
  const skippedShotIds = skipped.map((s) => s.shotId)
  store.setState({ realBatchResumeShotIds: skippedShotIds })
  const isCancelled = () => settled || store.getState().projectId !== projectId
  // 하나라도 준비되면 재실행 — 나머지 대기는 settled 로 함께 끝내고, 남은 샷은 재실행의 skipped 로 다시 예약된다.
  void Promise.race(bodies.map((b) => waitForPrerequisite(projectId, b, { isCancelled }))).then((outcome) => {
    if (settled) return
    const projectChanged = store.getState().projectId !== projectId
    settled = true
    if (resumeCancelByProject.get(projectId) === cancel) resumeCancelByProject.delete(projectId)
    if (outcome !== 'ready' || projectChanged) {
      resumeDepthByProject.delete(projectId)
      if (!projectChanged) store.setState({ realBatchResumeShotIds: [] })
      return
    }
    void runRealBatch(projectId, {
      silent: true,
      traceId: opts.traceId,
      onJob: opts.onJob,
      // 고른 샷이었으면 건너뛴(아직 못 그린) 샷만, 아니면 지금처럼 빈 샷 전부.
      ...(opts.shotIds ? { shotIds: skippedShotIds } : {}),
      ...(opts.force ? { force: true } : {}),
    })
  })
}

// 한 판(버튼 한 번)이 끝까지 가게(2026-10-10 오너 제보 "중간에 끊김"):
//   - 요청 하나가 시간 초과(504) · 서버 오류 · 통신 끊김으로 실패해도 이미 낸 그림은 그려지고 있다 — 잠시 뒤 다시 묻는다.
//     거절(4xx)은 다시 물어도 같아서 바로 멈춘다.
//   - 한 판의 요청에는 같은 판 표시(runId)를 붙인다 — 서버가 이 판의 작업이 맡은 샷을 다시 내지 않아, 같은 판에서
//     한 샷은 한 번만 그린다(앞 요청의 답을 잃어도). 실패한 샷은 버튼을 다시 누르면(새 판) 다시 그린다.
//     요청마다 새 샷만 나가므로 요청 수 상한은 안전장치일 뿐이다
//     (옛 10번 상한은 시트 20장 = 많아야 80샷이라 운영 7ad4d3a2 72샷도 마지막 시트에 못 닿았다).
const MAX_ROUNDS = 200
const MAX_ROUND_RETRIES = 2
const ROUND_RETRY_DELAY_MS = 5000

type RealBatchOptions = {
  silent?: boolean
  force?: boolean
  traceId?: string
  onJob?: GenerationJobObserver
  /** 고른 샷만(시안 D2, 오너 2026-11-14) — Writer 샷 id. 없으면 지금처럼 빈 샷 전부. */
  shotIds?: readonly string[]
}

/** 지금 도는 판 — 멈춘 판이 서버 답을 기다려 보낸 장을 멈추는 동안 새 판이 그 정리를 기다리게 한다. */
let currentRun: Promise<RealBatchResult> | null = null
/** [모두 멈추기]를 누른 차례 — 정리를 기다리던 누름은 그사이 이 수가 바뀌었으면 서지 않는다(사람이 마지막에 누른 것을 따른다, 검토 b S1b). */
let stopTurn = 0
/** 정리를 기다리는 누름의 수 — 거둘 알림이 있을 때만 거둔다. */
let waitingPresses = 0
const WAITING_TOAST_ID = 'real-batch-waiting'

/** [모두 멈추기] · 알림의 [취소] — 멈춘 판의 정리를 기다리던 누름을 거둔다(그 뒤에 누른 것은 선다). "끝나면 바로 시작해요" 알림도 거둔다. */
export function cancelWaitingRealBatch(): void {
  stopTurn += 1
  if (waitingPresses > 0) toast.dismiss(WAITING_TOAST_ID)
}

/** 라운드 반복 일괄 생성 — 완료 시 캔버스 rehydrate. 이미 진행 중이면 no-op.
 *  멈춘 판이 아직 정리 중이면(작업 행이 생기기 전에 [모두 멈추기]) 그 정리가 끝난 뒤 새 판을 연다 — 툴바는 멈추자마자 켜지므로
 *  누름이 말없이 무시되지 않게, 앞 판의 끝 정리가 새 판의 표시를 지우지 않게(영어 재점검 S1). */
export async function runRealBatch(projectId: string, opts?: RealBatchOptions): Promise<RealBatchResult> {
  const store = useDirectorCanvasStore
  const now = store.getState()
  if (now.realBatchBusy) {
    if (!now.realBatchCancelled || !currentRun) return { generated: 0, quotaBlocked: false }
    // 누름이 말없이 기다리지 않게 한 줄 알린다 — 여러 번 눌러도 한 줄(검토 b S1c). 저절로 도는 판은 말하지 않는다.
    //   새 판이 시작하거나 취소될 때까지 남고, [취소]로 기다리던 누름을 거둔다 — 다른 것이 안 돌면 [모두 멈추기]가 안 보인다(리드 11/14 결정 ③).
    if (!opts?.silent) {
      const locale = useLocaleStore.getState().locale
      toast.info(translate(locale, 'Wrapping up the previous work. It will start right after.'), {
        id: WAITING_TOAST_ID,
        duration: Infinity,
        action: { label: translate(locale, 'Cancel'), onClick: () => cancelWaitingRealBatch() },
      })
    }
    const turn = stopTurn
    waitingPresses += 1
    await currentRun.catch(() => undefined)
    waitingPresses -= 1
    // 기다림이 끝났다 — 새 판이 서든 거둬졌든 알림은 내린다.
    toast.dismiss(WAITING_TOAST_ID)
    // 기다리는 사이 [모두 멈추기]를 눌렀으면 서지 않는다(검토 b S1b).
    if (turn !== stopTurn || store.getState().realBatchBusy) return { generated: 0, quotaBlocked: false }
  }
  const run = runRealBatchOnce(projectId, opts)
  currentRun = run
  try {
    return await run
  } finally {
    if (currentRun === run) currentRun = null
  }
}

async function runRealBatchOnce(projectId: string, opts?: RealBatchOptions): Promise<RealBatchResult> {
  const store = useDirectorCanvasStore
  if (store.getState().realBatchBusy) return { generated: 0, quotaBlocked: false }
  store.setState({
    realBatchBusy: true,
    realBatchRemaining: null,
    realBatchShotIds: opts?.shotIds ? [...opts.shotIds] : null,
    realBatchCancelled: false,
    realBatchResumeShotIds: [],
  })
  let generated = 0
  /** 이 판이 낸 작업 중 끝난 샷 · 실패한 샷(작업 상태로 센다) — 끝날 때 채팅 한 줄 · Lumi 알림 카드에 쓴다. */
  let imagesDone = 0
  let imagesFailed = 0
  let quotaBlocked = false
  let lastSkipped: BatchSkipped[] = []
  const runId = crypto.randomUUID()
  /** 이번 판에서 끝나기를 기다린 작업 — 같은 작업은 한 번만 기다린다. */
  const waitedJobs = new Set<string>()
  let failedRounds = 0
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // [모두 멈추기](오너 답 7): 아직 보내지 않은 장은 보내지 않는다 — 이미 보낸 장은 서버에서 끝까지 만들어진다.
      if (store.getState().realBatchCancelled) break
      const requestBody: { projectId: string; force?: boolean; traceId?: string; runId?: string; shotIds?: string[] } =
        opts?.force ? { projectId, force: true } : { projectId }
      if (opts?.shotIds) requestBody.shotIds = [...opts.shotIds]
      if (opts?.traceId) requestBody.traceId = opts.traceId
      requestBody.runId = runId
      let res: Response | null = null
      let networkError: unknown = null
      try {
        res = await fetch('/api/director/generate-storyboard-batch', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
        })
      } catch (e) {
        networkError = e
      }
      // #creem-moderation(2026-10-11): 내용 규칙 차단(400)·검사 장애(503)는 다시 물어도 같은 답이다 —
      //   공용 안내를 띄우고 판을 멈춘다(자리 부족과 같은 모양). 503 을 5xx 재시도로 보내면 장애
      //   구간에서 같은 거절을 세 번 더 받는다.
      if (res && (res.status === 400 || res.status === 503)) {
        const rejected = (await res.json().catch(() => null)) as { error?: string } | null
        if (notifyIfQuotaExceeded(res.status, rejected)) {
          quotaBlocked = true
          break
        }
        if (res.status === 400) throw new Error(rejected?.error ?? `HTTP ${res.status}`)
      }
      if (res && !res.ok && res.status !== 429 && res.status < 500 && res.status !== 408) {
        const rejected = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(rejected?.error ?? `HTTP ${res.status}`)
      }
      if (!res || res.status >= 500 || res.status === 408) {
        if (failedRounds >= MAX_ROUND_RETRIES) {
          throw networkError ?? new Error(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${res?.status}`)
        }
        failedRounds += 1
        await new Promise((r) => setTimeout(r, ROUND_RETRY_DELAY_MS))
        continue
      }
      if (res.status === 429) {
        quotaBlocked = true
        // 한도 안내는 공용 헬퍼로 — 문구·중복억제·locale 을 7개 진입점이 공유한다(#quota-toast).
        // silent(auto-fill) included - owner policy 2026-08-26: swallowing 429 silently was the
        // prime suspect behind "everything died after a tab round-trip" (#a2-observability).
        // Duplicate toasts are suppressed by the shared toast id inside notifyQuotaExceeded.
        notifyQuotaExceeded(await res.json().catch(() => null))
        break
      }
      const j = (await res.json().catch(() => null)) as {
        data?: {
          submitted: Array<{ jobId: string; shotIds: string[] }>
          remaining: number
          skipped?: BatchSkipped[]
          inProgress?: Array<{ jobId: string; shotIds: string[]; sameRun?: boolean }>
        }
        error?: string
      } | null
      if (!j?.data) throw new Error(j?.error ?? `HTTP ${res.status}`)
      failedRounds = 0
      const { submitted, remaining } = j.data
      // 서버가 알려 준 그리는 중인 작업(다른 탭 · 앞서 끊긴 요청 · 오래 걸리는 그림) — 이번 판에서 한 번만 기다린다.
      //   sameRun = 이 판이 냈는데 답을 잃은 작업 — 이 판이 낸 것으로 센다(만든 수 · 채팅 기록).
      const inProgress = (j.data.inProgress ?? []).filter(
        (p) => !waitedJobs.has(p.jobId) && !submitted.some((s) => s.jobId === p.jobId),
      )
      const ourJobs = [...submitted, ...inProgress.filter((p) => p.sameRun)]
      lastSkipped = j.data.skipped ?? []
      // #batch-backlog: 아직 제출 안 된 잔량을 알림바 분모에 태운다 — "fal 큐 수만 보인다"(오너
      //   2026-08-25)의 수리. 라운드마다 갱신되고 러너 종료 시 finally 가 지운다.
      store.setState({ realBatchRemaining: remaining })
      if (!submitted.length && !inProgress.length) break
      generated += ourJobs.reduce((n, s) => n + s.shotIds.length, 0)
      // 멈춘 판이 서버 답을 받았다 — 받은 장을 "만드는 중"으로 띄우지 않고(목록을 다시 읽지 않음) 아래 끝에서 바로 멈춘다
      //   (영어 재점검 S1: 카드가 0.5초 "Making image · Stop making"으로 깜빡였다).
      if (store.getState().realBatchCancelled) {
        for (const s of [...submitted, ...inProgress]) waitedJobs.add(s.jobId)
        break
      }
      // 잡이 큐에 앉는 즉시 진행 표시(알림바·카드 스피너)가 켜지게 — 폴링 틱을 기다리지 않는다.
      refreshGenerationQueue()
      for (const s of [...submitted, ...inProgress]) {
        const ours = ourJobs.includes(s)
        waitedJobs.add(s.jobId)
        if (ours) opts?.onJob?.({ jobId: s.jobId, status: 'queued', httpStatus: res.status })
        for (let i = 0; i < 60; i++) {
          if (store.getState().realBatchCancelled) break
          // 카드 · 노드 [멈추기]로 화면에서 멈춘 장은 끝나기를 기다리지 않고 다음 장으로 간다(오너 7번) — fal 에서는 몇 분 더 돈다.
          if (activeJobsSnapshot(projectId).some((job) => job.id === s.jobId && job.cancelledAt)) break
          // 응답은 {ok, data:{status}} 봉투(#real-grid-fix 실측: 최상위 status 읽기로 8잡×300s 헛대기)
          //   조회가 한 번 끊겨도 판을 멈추지 않고 다음 틱에 다시 묻는다.
          const envelope = (await fetch(`/api/generation-jobs/${encodeURIComponent(s.jobId)}`)
            .then((r) => r.json())
            .catch(() => null)) as { data?: { status?: string } } | null
          const status = envelope?.data?.status
          if (status === 'completed' || status === 'failed') {
            const resultUrl =
              (envelope?.data as { resultUrl?: unknown } | undefined)?.resultUrl
            if (ours) {
              opts?.onJob?.({
                jobId: s.jobId,
                status,
                resultUrl: typeof resultUrl === 'string' ? resultUrl : null,
              })
              if (status === 'completed') imagesDone += s.shotIds.length
              else imagesFailed += s.shotIds.length
            }
            break
          }
          await new Promise((r) => setTimeout(r, 5000))
        }
        // 시트 하나가 끝날 때마다 즉시 반영(#live-refresh 2026-08-11) — 옛 코드는 전체 라운드가
        //   끝나야 1회 재수화라, 첫 시트가 완성돼도 화면은 새로고침 전까지 빈 카드였다.
        // Director 배선 3: 사물함(30초)을 먼저 낡음으로 표시해야 완료된 행을 받는다 — 안 하면 옛 행으로 헛돈다.
        await invalidateShots(projectId)
        await store.getState().hydrateFromDb(projectId).catch(() => {})
        refreshGenerationQueue()
      }
      if (remaining <= 0) break
    }
    const stoppedByUser = store.getState().realBatchCancelled
    if (stoppedByUser) {
      // [모두 멈추기]를 누른 판 — 다시 돌기를 예약하지 않고 걸어 둔 것도 거둔다(오너 답 7).
      cancelRealBatchResume(projectId)
      resumeDepthByProject.delete(projectId)
      // 이 판이 이미 보낸 장도 화면에서 멈춘다(오너 7번) — [모두 멈추기]를 누르는 사이 막 보낸 장도 놓치지 않는다. 이미 멈춘 · 끝난 장은 서버가 그대로 둔다.
      if (waitedJobs.size > 0) {
        await store.getState().cancelRunningJobs([...waitedJobs]).catch((error) => {
          console.error('[real-batch] stopping sent sheets failed:', error)
        })
      }
    } else if (lastSkipped.length > 0) {
      // #ref-gate: 이유별로 한 줄 안내 + 자동 재개 예약(과금 없음 — 준비될 때까지 폴링만).
      const sheetNames = [...new Set(lastSkipped.flatMap((s) => (s.missing ?? []).map((m) => m.name)))]
      const roughCount = lastSkipped.filter((s) => s.reason === 'missing_rough_storyboard').length
      const what = [
        sheetNames.length ? translate(useLocaleStore.getState().locale, 'character sheets for {names}', { names: sheetNames.join(', ') }) : null, // copy-ok: fragment
        roughCount ? translate(useLocaleStore.getState().locale, 'rough storyboards for {count} shots', { count: roughCount }) : null, // copy-ok: fragment
      ].filter(Boolean).join(' · ')
      toast.info(
        translate(useLocaleStore.getState().locale, '{count} shots skipped while waiting for {what}. The batch resumes automatically.', {
          count: lastSkipped.length,
          what,
        }),
        { id: 'generation-prerequisite' },
      )
      scheduleRealBatchResume(projectId, lastSkipped, {
        traceId: opts?.traceId,
        onJob: opts?.onJob,
        shotIds: opts?.shotIds,
        force: opts?.force,
      })
    } else {
      resumeDepthByProject.delete(projectId)
    }
    if (generated > 0) {
      await invalidateShots(projectId)
      await store.getState().hydrateFromDb(projectId)
      // 멈춘 판은 "만들었어요"라고 하지 않는다 — 보낸 장은 화면에서 멈췄다(오너 7번). 수는 끝난 장의 샷만 센다 —
      //   카드 · 노드 [멈추기]로 멈춘 장 · 끝나기를 기다리지 않은 장은 세지 않는다(검토 a cbb84e64 낮음 2).
      if (!stoppedByUser && imagesDone > 0) {
        toast.success(
          translate(useLocaleStore.getState().locale, 'Generated {count} live-action storyboard shots', {
            count: imagesDone,
          }),
        )
      }
    } else if (!stoppedByUser && !opts?.silent && !quotaBlocked && lastSkipped.length === 0 && waitedJobs.size === 0) {
      // 남이 그리던 그림만 기다렸으면 "낼 샷 없음"이 아니다 — 그 그림은 큐 알림이 알린다.
      toast.info(
        translate(
          useLocaleStore.getState().locale,
          'No shots to generate. Only shots with a rough panel and no image yet are eligible.',
        ),
      )
    }
    // 끝나면 채팅에 한 줄(약속 E4 — 영상 일괄과 같게), 채팅을 접어 둔 Director 면 오른쪽 아래 Lumi 알림 카드도(11/13 시안 D8).
    //   그새 다른 프로젝트로 갔으면 남기지 않는다(그 프로젝트 채팅에 엉뚱한 줄이 남는다).
    if (imagesDone + imagesFailed > 0 && store.getState().projectId === projectId) {
      const line = translate(useLocaleStore.getState().locale, '{done} images done, {failed} failed', { done: imagesDone, failed: imagesFailed })
      notifyBatchSummary('director', `${imagesDone > 0 ? '✓' : '⚠'} ${line}`)
      useLumiNoticeStore.getState().batchEnded({ projectId, kind: 'image', done: imagesDone, failed: imagesFailed })
    }
  } catch (e) {
    if (!opts?.silent) {
      toast.error(
        e instanceof Error
          ? e.message
          : translate(useLocaleStore.getState().locale, 'Batch generation failed'),
      )
    } else console.error('[real-batch] auto batch generation failed:', e)
  } finally {
    store.setState({ realBatchBusy: false, realBatchRemaining: null, realBatchShotIds: null, realBatchCancelled: false })
  }
  return { generated, quotaBlocked }
}

// 진입 자동 채움(triggerRealBatchAutofill)은 제거됐다 (#c5 2026-08-27 오너 지시).
//   Director 진입만으로 실사 i2i 가 발사돼 previz 를 손볼 틈 없이 과금이 먼저 났다.
//   실사 생성은 사람의 명시적 행동 셋 중 하나로만 시작한다 — 전체 버튼 / 개별 버튼 / 채팅.
//   셋 다 아래 runRealBatch(전체) 또는 generateStoryboardImage(개별)로 들어온다.
