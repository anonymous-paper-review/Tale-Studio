'use client'

// Writer 탭 — 러프 스토리보드 보드 (2026-06-12 탭 부활).
//
// writer 파이프라인(스토리·연출 설계) 완료 후, 컨셉 아트 이전 단계에서
// 샷별 연출을 목각 인형/스틱 피겨 패널(흑백 연필 스케치)로 확인하고
// 패널 아래 스토리를 읽는 검토 화면. 카드 클릭 → 상세 팝업(수정·재생성).
//
// 생성 흐름: 진입 시 누락 패널만 자동 1회 생성 (서버가 완료본·진행중 잡을 멱등 skip —
// director 재생성 폭주 버그의 교훈: 판단은 DB 진실 fetch 후 + 서버 이중 가드).
// 완료는 webhook → shots.rough_storyboard. 클라는 jobId 폴링으로 카드만 갱신.
//
// 리뉴얼 1차(2026-10-19, 프로토타입 S0 · S1 · S7): 이 화면은 Storyboard 단계다(Artist 뒤).
//   씬 · 샷을 나누는 동안과 러프를 그리는 동안 보드 위에 잠금 표시(AiBusyOverlay)를 얹고 화면 · 채팅을 잠근다 —
//   언제 잠그고 무엇을 보일지는 lib/writer/board-busy. 보드는 뒤에 그대로 그려져 다 그린 샷부터 보인다.
//   Director 넘김 확인 창(머리의 [다음: Director로 →])도 여기서 그린다 — [남은 컷 그리기]가 이 보드의 그리기 상태를 쓴다.
//   샷을 더하면(보드 [+ 샷 추가] · 채팅) 그 샷 러프를 바로 그린다(2026-11-02 오너 "더할 때마다 자동") — 잠금 없이 그 카드만
//   그리는 중으로 보인다. 규칙은 lib/writer/added-shot-draws, 연결은 use-added-shot-draws.

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, AlertTriangle, ChevronDown, Clock, ImageIcon, Loader2, MoreHorizontal, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchDebugPrompts } from '@/lib/use-debug-prompts'
import { ADHERENCE_START_ENABLED } from '@/lib/adherence/core'
import { handoffFrom } from '@/lib/handoff-intent'
import { shouldOfferHandoffNudge } from '@/lib/handoff-nudge'
import { AiBusyOverlay } from '@/components/ai-busy-overlay'
import { NodeWaitCard } from '@/components/feedback/node-wait'
import { ShotDetailDialog } from '@/features/writer/shot-detail-dialog'
import { AddItemDialog, type AddMode } from '@/features/writer/add-item-dialog'
import { AddedRedrawStatus } from '@/features/writer/added-redraw-status'
import { useBoardUiStore } from '@/features/writer/board-ui-store'
import { SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'
import { handOverToDirector } from '@/features/writer/storyboard-director'
import { StoryboardDirectorDialog } from '@/features/writer/storyboard-director-dialog'
import { useAddedShotDraws } from '@/features/writer/use-added-shot-draws'
import { WriterHeader } from '@/features/writer/writer-header'
import { useProjectStore } from '@/stores/project-store'
import { useArtistStore } from '@/stores/artist-store'
import { flushShotSave, onShotAdded, useWriterStore } from '@/stores/writer-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { WriterResumeButton } from '@/components/layout/writer-resume-button'
import { writerProgressView } from '@/lib/writer/progress-view'
import { isRoughDrawn, roughRedrawBatches, summarizeRoughProgress, undrawnRoughShotIds } from '@/lib/writer/rough-progress'
import {
  addedDrawJobs,
  addedDrawOutcome,
  autoSubmitEventPayload,
  boardDrawingCount,
  boardMissingRoughIds,
  roughContentSignature,
  withoutAddedShots,
  type DrawAddedShot,
  type RoughDrawRound,
  type RoughRequestFrom,
} from '@/lib/writer/added-shot-draws'
import {
  INITIAL_BOARD_LOCK,
  advanceBoardLock,
  dismissBoardFailure,
  isBoardRunActive,
  storyboardBusyView,
  type BoardLockFacts,
  type BoardLockState,
} from '@/lib/writer/board-busy'
import { boardShots, boardTotalText, directorConfirmView, directorHandoffSummary, sceneStats, sceneStatsLabel, storyboardBriefing } from '@/lib/writer/board-summary'
import { pipelineLocationName, sceneName, sceneShotName } from '@/lib/board-names'
import {
  announcedWaitShot,
  boardStoryFontSize,
  cardDialogue,
  cardWaitLook,
  coversCard,
  mentionSegments,
  sceneHeadTitle,
  shotCardChips,
} from '@/lib/writer/board-card'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import {
  isContentPolicyBlocked,
  isModerationUnavailable,
  notifyIfQuotaExceeded,
  notifyQuotaRefusal,
} from '@/lib/generation-quota-toast'
import { runRoughPump } from '@/lib/writer/rough-pump-client'
import { announceRoughModerationFailures, isModerationFailureText } from '@/lib/writer/rough-moderation-notice'
import { resolveEntityNames, manifestEntities } from '@/lib/writer/resolve-entity-names'
import {
  useActiveGenerationJobs,
  activeShotIds,
  refreshGenerationQueue,
  type ActiveJob,
} from '@/lib/generation-queue'
import { createWheelNotchStepper } from '@/lib/wheel-notch'
import { cn } from '@/lib/utils'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import {
  GeneratingOverlay,
  StoryboardZoomControls,
  applyStoryboardZoomShortcut,
  storyboardColumns,
  useStoryboardZoom,
} from '@/components/generating-frame'
import type { RoughStoryboardImage, Shot } from '@/types'
import { translate, useT } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { invalidateShots, loadShots } from '@/lib/shots-cache'
import { takeCostForVideo, takeValuesShown } from '@/lib/billing/take-cost'
import { useTakeBalance } from '@/lib/billing/use-take-balance'
import { DEFAULT_VIDEO_MODEL } from '@/lib/video-models'
import { computeSettledJobs, reportUiReflected } from '@/lib/generation-ui-reflected'
import { recordWriterObservabilityEventClient } from '@/lib/writer/debug-events-client'

// waiting = 더한 샷이 내 동시 생성 자리를 기다린다(자리가 나면 그린다).
type PanelJob = { status: 'generating' | 'waiting' | 'failed'; error?: string }

// artist 백필(#writer-to-artist-backfill) 프로젝트당 1회 가드 — 탭 왕복 remount 에도 유지.
const artistBackfillTriggered = new Set<string>()

// 잠금 표시는 document.body 로 띄운다 — 단계 화면([data-stage-content])이 잠기는(inert) 동안에도 실패 안내 버튼은 눌려야 한다.
//   서버 렌더에는 document 가 없으니 브라우저에서만 띄운다(구독할 것이 없는 외부 상태 = 브라우저 여부).
const subscribeNothing = () => () => {}

// 진실 리로드 수렴 상한(#rough-refresh 2026-07-24) — previz(5분) 대응. 정상 경로는 폴링 성공 후
//   첫 리로드(2s 간격)에 끝나고, 이 상한은 어떤 실패 경로에서도 UI 가 스피너에 갇히지 않게 하는 백스톱.
const ROUGH_CONVERGE_MAX_RELOADS = 40

// 표시 번호는 "순서(위치)" 기준으로 렌더 지점에서 계산 — 불변 id 접미사가 아니라(중간 삽입 시 번호
//   뒤죽박죽 방지, #5). 샷 타입 설명(SHOT_TYPE_DESCRIPTIONS)은 shot-type-info 로 공용화(#2).

// 샷에 생성할 "정보"가 있는가 — 액션(스토리)이 비면 러프 패널을 만들 근거가 없음. (#5)
function shotHasInfo(actionDescription?: string | null): boolean {
  return !!actionDescription?.trim()
}

type RoughStoryboardZoomShortcutEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey'
>

// 키보드 축척 단위 조절 — 보드 밖에서는 이벤트 자체가 이 함수에 도달하지 않으며,
//   입력 요소에서는 호출을 건너뛴다. null은 이 화면의 축척 단축키가 아님을 뜻한다.
export function applyRoughStoryboardZoomShortcut(
  zoomLevel: number,
  event: RoughStoryboardZoomShortcutEvent,
): number | null {
  return applyStoryboardZoomShortcut(zoomLevel, event)
}

export function RoughStoryboardView() {
  const t = useT()
  // useCallback/useEffect 본문 안에서는 t() 대신 translate()+locale 을 쓴다(#i18n-s5-batch3) —
  //   useT() 의 반환 함수는 매 렌더 새 참조라 deps 에 넣으면 메모이제이션이 무너진다. locale 은
  //   원시값이라 실제로 로케일이 바뀔 때만 재계산을 트리거한다.
  const locale = useLocaleStore((s) => s.locale)
  const projectId = useProjectStore((s) => s.projectId)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const shots = useWriterStore((s) => s.shots)
  const loadProject = useWriterStore((s) => s.loadProject)
  const { status, restart } = useWriterStatus(projectId)
  // 진행 중 판정의 바닥 (#queue-restore 2026-08-11) — 아래 panelJobs 는 컴포넌트 로컬이라 탭을
  //   떠나면 증발하는데 잡은 fal 에서 계속 돈다. 돌아왔을 때 스피너를 되살리는 유일한 근거가 큐다.
  const activeJobs = useActiveGenerationJobs(projectId)
  const queuedRoughIds = activeShotIds(activeJobs, ['shot_rough_storyboard'])
  const setActiveTab = useWriterUiStore((s) => s.setActiveTab)
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  const chatMessages = useGlobalChatStore((s) => s.messages)
  // 채팅 기록을 다 읽은 뒤에만 첫 안내를 한다 — 기록이 비어 있는 동안 "writer 단계 말이 없다"로 보고 같은 안내를 또 남겼다(2026-11-14 오너; Artist 첫 안내 · Prose 와 같은 규칙).
  const chatHistoryLoaded = useGlobalChatStore((s) => s.messagesLoadedProjectId === projectId)
  const briefedRef = useRef(false)

  // Coordinate (4) ui_reflected for Writer rough panels (#a2-observability 2026-08-26).
  // Director canvas got this first; without the same wiring here every Writer job looks
  // "completed but never shown" in the autopsy, which would drown the real signal.
  // A job leaving the queue means the webhook settled it - reload, then report that the
  // result actually landed in visible state.
  // deps 는 원시값(잡 id 서명)만 쓴다 — 배열 참조를 deps 에 넣으면 매 렌더 재실행 위험이 있고
  // 훅 deps 가드(tests/unstable-hook-deps.test.ts)가 이를 실패로 잡는다. 실제 잡 객체는 ref 로 나른다.
  const roughJobs = activeJobs.filter((j) => j.kind === 'shot_rough_storyboard')
  const roughSignature = roughJobs.map((j) => j.id).sort().join(',')
  const roughJobsRef = useRef<readonly ActiveJob[]>([])
  roughJobsRef.current = roughJobs
  const prevRoughJobsRef = useRef<readonly ActiveJob[]>([])
  useEffect(() => {
    const prev = prevRoughJobsRef.current
    const current = roughJobsRef.current
    prevRoughJobsRef.current = current
    if (!projectId) return
    const settled = computeSettledJobs(prev, current)
    if (settled.length === 0) return
    void invalidateShots(projectId)
    void loadProject()
      .then(() => reportUiReflected(projectId, settled, 'writer-rough'))
      .catch(() => {})
  }, [roughSignature, projectId, loadProject])

  // 패널 단위 생성 상태(jobId 폴링) + 완료 즉시 반영용 로컬 오버라이드.
  // DB 진실은 shots.rough_storyboard — 오버라이드는 다음 loadProject 전까지의 캐시.
  const [panelJobs, setPanelJobs] = useState<Record<string, PanelJob>>({})
  const [overrides, setOverrides] = useState<Record<string, RoughStoryboardImage>>({})
  // 샷 고치기 팝업에 연 샷 — 대사 탭에서 샷을 눌러도 같은 팝업이 열려서(2026-10-31 QA) 보드 밖과 나눈다.
  const detailShotId = useBoardUiStore((s) => s.shotEditId)
  const setDetailShotId = useBoardUiStore((s) => s.setShotEditId)
  // 씬 접기(#c2 2026-08-03) — 씬 이름 클릭으로 토글. 세션 로컬(새로고침 시 전부 펼침).
  const [collapsedScenes, setCollapsedScenes] = useState<ReadonlySet<string>>(new Set())
  const toggleSceneCollapsed = (sceneId: string) =>
    setCollapsedScenes((prev) => {
      const next = new Set(prev)
      if (next.has(sceneId)) next.delete(sceneId)
      else next.add(sceneId)
      return next
    })
  // 추가 팝업(#3) — 어느 버튼으로 열렸는지(mode) + 맥락 씬. null=닫힘.
  const [addDialog, setAddDialog] = useState<{
    mode: AddMode
    contextSceneId: string | null
  } | null>(null)
  // Director Storyboard와 같은 축척 단계·저장 규칙을 사용한다.
  const [zoomLevel, setZoomLevel] = useStoryboardZoom('writer:zoomLevel')
  const boardRef = useRef<HTMLDivElement>(null)
  const autoTriggeredRef = useRef(false)
  const autoCheckLoggedRef = useRef<string | null>(null)
  const reloadedAfterCompleteRef = useRef(false)
  // drag-to-scroll 직후의 click 이 카드 팝업을 여는 오발 방지
  const draggedRef = useRef(false)
  // 잠금 표시(리뉴얼 1차) — 화면의 그리기가 도는 중인가 · 끝난 횟수 · 실행이 끝난 뒤 샷을 다시 읽었는가 · 순간 사이에 이어지는 잠금 상태.
  const [pumpActive, setPumpActive] = useState(false)
  const [pumpRuns, setPumpRuns] = useState(0)
  const [reloadSettled, setReloadSettled] = useState(false)
  const [lock, setLock] = useState<BoardLockState>(INITIAL_BOARD_LOCK)
  const [lockKey, setLockKey] = useState<string | null>(null)
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false)
  // Director 넘김 확인 창 — 머리의 [다음: Director로 →](모든 탭)가 열고, 이 보드가 그린다.
  const directorConfirmOpen = useBoardUiStore((s) => s.directorConfirmOpen)
  const setDirectorConfirmOpen = useBoardUiStore((s) => s.setDirectorConfirmOpen)
  // 보드가 떨어지면(관리자 V2 미리보기 탭 등) 창 · 샷 고치기 팝업도 닫는다 — 다시 붙을 때 저절로 열리지 않게.
  useEffect(() => () => {
    useBoardUiStore.getState().setDirectorConfirmOpen(false)
    useBoardUiStore.getState().setShotEditId(null)
  }, [])

  useEffect(() => {
    if (projectId) void loadProject()
  }, [projectId, loadProject])

  // Artist 핸드오프(#handoff-to-chat 2026-07-31) — 탭 하단 'Hand over to Concept Artist' 버튼을
  //   걷어내고 채팅 제안으로 옮겼다. 옛 버튼은 게이트 없이 항상 활성이었으므로 여기서도 막지 않고,
  //   러프 보드가 다 그려졌을 때(= 검토할 게 생겼을 때) 버튼을 띄운다. 채팅에 직접 말하면 언제든 된다.
  const artistNudgeRef = useRef<string | null>(null)
  const roughAllReady =
    shots.length > 0 && shots.every((s) => s.roughStoryboard?.status === 'completed')
  // 이미 수락된 핸드오프는 다시 권하지 않는다(#handoff-once 2026-08-12) — 진실은 DB 의
  //   reachedStage(projects.current_stage). 탭 왕복·새로고침마다 "다음 단계" 문구가 반복되던 문제.
  const reachedStage = useProjectStore((s) => s.reachedStage)

  // 러프보드 완주 → artist 빈 인물(오픈캐스트)·배경 이미지를 백그라운드로 채운다
  //   (#writer-to-artist-backfill 2026-08-12). 유저가 artist 탭에 도착했을 때 이미 그림이
  //   있도록. autoGenerateBaseImages 는 원래 artist 진입 시 도는 것과 같은 함수 —
  //   동시성 1(ARTIST_GENERATION_CONCURRENCY)이라 큐를 1슬롯만 점유하고, 나머지 슬롯은
  //   유저가 writer 에서 수정·재생성할 때를 위해 비워 둔다. 멱등: 채워진 칸 skip + 서버 dedupe.
  useEffect(() => {
    if (!projectId || !roughAllReady) return
    if (artistBackfillTriggered.has(projectId)) return
    artistBackfillTriggered.add(projectId)
    void (async () => {
      const artist = useArtistStore.getState()
      // artist store 가 아직 비어 있으면(다른 탭 미방문) 먼저 하이드레이트.
      //   loadData 선언 타입이 void 라 완료를 기다릴 수 없다 — 폴링으로 도착을 확인한다
      //   (layout 워밍이 이미 불렀을 수도 있어 두 경로 모두 이 대기에 수렴).
      if (artist.characterAssets.length === 0 && artist.worldAssets.length === 0) {
        artist.loadData()
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 500))
          const s = useArtistStore.getState()
          if (s.characterAssets.length > 0 || s.worldAssets.length > 0) break
        }
      }
      // #B(2026-09-02 observability-audit): 실패는 여전히 삼킨다(store 자체가 429 토스트·중단 안내를 이미 하므로 별도 토스트는 불필요).
      //   대신 이 실패가 무흔적으로 사라지지 않게 클라 관측 이벤트 기록 + console.warn 만 담당한다.
      await useArtistStore.getState().autoGenerateBaseImages().catch((e) => {
        console.warn('[rough-storyboard-view] autoGenerateBaseImages failed:', e instanceof Error ? e.message : e)
        recordWriterObservabilityEventClient(projectId, 'route_failed', {
          source: 'writer_to_artist_backfill',
          error: e instanceof Error ? e.message : String(e),
        })
      })
    })()
  }, [projectId, roughAllReady])
  useEffect(() => {
    if (!projectId || !roughAllReady) return
    if (!shouldOfferHandoffNudge('writer', reachedStage)) return
    if (artistNudgeRef.current === projectId) return
    artistNudgeRef.current = projectId
    const spec = handoffFrom('writer')
    if (!spec) return
    offerSuggestion({
      id: `handoff:writer:${projectId}`,
      stage: 'writer',
      content: translate(
        locale,
        'The rough storyboard is all ready. Ready to move to Artist and work out character and background concepts?',
      ),
      action: { kind: 'handoff', utterance: translate(locale, spec.utterance), label: translate(locale, spec.label) },
    })
  }, [projectId, roughAllReady, offerSuggestion, reachedStage, locale])

  // 파이프라인이 이 화면을 보는 중에 완료되면 씬/샷을 1회 재로드.
  useEffect(() => {
    if (status?.pipeline_completed && !reloadedAfterCompleteRef.current) {
      reloadedAfterCompleteRef.current = true
      // 파이프라인이 방금 shots 를 채웠다 — 사물함(30초 신선)을 낡음으로 표시해야
      //   loadProject 가 캐시가 아니라 새 행을 받는다.
      if (projectId) void invalidateShots(projectId)
      // 다 읽을 때까지 잠금을 이어 간다(빈 보드가 번쩍이지 않게) — 실패해도 기다림은 끝낸다.
      void loadProject()
        .catch(() => {})
        .then(() => setReloadSettled(true))
    }
  }, [status?.pipeline_completed, loadProject, projectId])
  // 다시 읽기가 끝나지 않아도(네트워크 멈춤 등) 잠금이 영영 남지 않게 — 15초 뒤에는 기다림을 끝낸다.
  useEffect(() => {
    if (!status?.pipeline_completed || reloadSettled) return
    const timer = setTimeout(() => setReloadSettled(true), 15_000)
    return () => clearTimeout(timer)
  }, [status?.pipeline_completed, reloadSettled])

  // opts.quietUserLimit: 내 한도 안내("다시 시도해 주세요")를 띄우지 않는다 — 더한 샷 바로 그리기만 쓴다(카드가 "자리가 나면 바로 그려요"로 알린다, 2026-11-02 리드).
  //   opts.source: 자동으로 보낸 요청의 출처 — 더한 샷 바로 그리기('added_shot')는 진입 자동 그리기(auto)와 따로 기록한다(리뷰 R7).
  //   돌려주는 refusal · submittedShotIds · skipped 는 더한 샷 바로 그리기가 읽는다(lib/writer/added-shot-draws RoughDrawRound).
  const generate = useCallback(
    async (
      shotIds?: string[],
      force?: boolean,
      auto?: boolean,
      styleHints?: string[],
      opts?: { quietUserLimit?: boolean; source?: RoughRequestFrom['source'] },
    ): Promise<(RoughDrawRound & { remaining: number; quota: boolean }) | null> => {
      if (!projectId) return null
      if (shotIds?.length) {
        // 클릭 즉시 피드백 — 서버가 in_flight skip 으로 응답하면 아래에서 정리됨
        setPanelJobs((prev) => ({
          ...prev,
          ...Object.fromEntries(shotIds.map((id) => [id, { status: 'generating' } as PanelJob])),
        }))
      }
      try {
        const res = await fetch('/api/writer/rough-storyboard', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId, shotIds, force, styleHints }),
        })
        const j = await res.json().catch(() => null)
        // #creem-moderation(2026-10-11): 내용 규칙 차단(400)·검사 장애(503)도 자리 부족과 같은 모양의 멈춤이다 —
        //   안내 문구는 공용 토스트가 진다. 이 분기가 없으면 아래 throw 로 가 "HTTP 400" 만 보인다
        //   (이 라우트의 오류 봉투는 j.error.message 이라 공용 거절 봉투와 모양이 다르다).
        if (isContentPolicyBlocked(res.status, j) || isModerationUnavailable(res.status, j)) {
          notifyIfQuotaExceeded(res.status, j)
          if (shotIds?.length) {
            setPanelJobs((prev) => {
              const next = { ...prev }
              for (const id of shotIds) delete next[id]
              return next
            })
          }
          return {
            submitted: 0,
            remaining: 0,
            quota: true,
            refusal: isContentPolicyBlocked(res.status, j) ? 'content' : 'moderation',
            done: Promise.resolve(),
          }
        }
        // 자리 부족(429)은 멈춤이다 — 자동 재시도 없음(2026-09-11 오너 결정). 어느 경로든(전체 펌프·자동 진입·
        //   개별 패널 버튼) 공용 토스트로 한 번 알린다. 예전에는 펌프가 "큐가 빌 때까지 대기" 신호로 재시도했고
        //   개별 버튼은 무음으로 끝났다(2026-09-11 동시성 감사). 토스트 id 가 고정이라 여러 장이 동시에 429 를 받아도 하나만 보인다.
        if (res.status === 429) {
          // 내 한도인가 · 모두의 자리인가 — 더한 샷 그리기(quietUserLimit)만 내 한도 안내를 빼고, 다른 길은 지금처럼 안내한다.
          const scope = notifyQuotaRefusal(res.status, j, opts)
          const event = autoSubmitEventPayload({ auto, source: opts?.source }, {
            httpStatus: 429,
            submittedCount: 0,
            remaining: 0,
            quota: true,
            queued: typeof j?.queued === 'number' ? j.queued : null,
            limit: typeof j?.limit === 'number' ? j.limit : null,
            code: typeof j?.code === 'string' ? j.code : null,
          })
          if (event) recordWriterObservabilityEventClient(projectId, 'auto_submit_response', event)
          if (shotIds?.length) {
            setPanelJobs((prev) => {
              const next = { ...prev }
              for (const id of shotIds) delete next[id]
              return next
            })
          }
          return { submitted: 0, remaining: 0, quota: true, refusal: scope, done: Promise.resolve() }
        }
        if (!res.ok || !j?.ok) {
          throw new Error(j?.error?.message ?? `HTTP ${res.status}`)
        }
        const submitted = (j.data?.submitted ?? []) as Array<{
          shotId: string
          jobId: string
          confirmationPending?: boolean
        }>
        const confirmationPending = j.data?.confirmationPending === true || submitted.some((item) => item.confirmationPending)
        if (confirmationPending) {
          toast.info(translate(locale, 'Confirming the previous rough request. It will not be submitted again.'))
        }
        const skippedByReason = ((j.data?.skipped ?? []) as Array<{ reason?: unknown }>).reduce<Record<string, number>>((counts, item) => {
          const reason = typeof item.reason === 'string' ? item.reason : 'unknown'
          counts[reason] = (counts[reason] ?? 0) + 1
          return counts
        }, {})
        const event = autoSubmitEventPayload({ auto, source: opts?.source }, {
          httpStatus: res.status,
          submittedCount: submitted.length,
          remaining: j.data?.remaining ?? 0,
          skippedByReason,
        })
        if (event) recordWriterObservabilityEventClient(projectId, 'auto_submit_response', event)
        // give-up 게이트로 건너뛴 샷 안내 — 진입 자동 생성(auto)에는 매번 뜨지 않도록 억제. 더한 샷 그리기는 띄운다(카드에도 까닭이 남는다, 리뷰 R7).
        if (!auto) {
          const gaveUp = (
            (j.data?.skipped ?? []) as Array<{ reason: string }>
          ).filter((x) => x.reason === 'gave_up')
          if (gaveUp.length) {
            toast.info(
              translate(
                locale,
                '{count} panels stopped auto-generating after repeated failures. Use "Retry" on the card to regenerate them.',
                { count: gaveUp.length },
              ),
            )
          }
        }
        setPanelJobs((prev) => ({
          ...prev,
          ...Object.fromEntries(
            submitted.map((s) => [s.shotId, { status: 'generating' } as PanelJob]),
          ),
        }))
        // 채팅 진행 알림바 등 다른 구독자도 즉시 켜지게 — 다음 폴링 틱(4s)을 기다리지 않는다.
        if (submitted.length) refreshGenerationQueue()
        // 서버가 정보 없음(no_info)으로 건너뛴 샷은 낙관적 'generating' 을 지운다 — 안 지우면 제출 안 된
        //   샷의 스피너가 영구히 돈다(in_flight 등 '실제 생성 중' 사유는 그대로 두어야 하므로 no_info 만).
        const noInfoSkipped = (
          (j.data?.skipped ?? []) as Array<{ shotId: string; reason: string }>
        )
          .filter((x) => x.reason === 'no_info')
          .map((x) => x.shotId)
        if (noInfoSkipped.length) {
          setPanelJobs((prev) => {
            const next = { ...prev }
            for (const id of noInfoSkipped) delete next[id]
            return next
          })
        }
        // #a1-inflight-block (2026-08-27 재현): 사람이 누른 재생성이 in_flight 로 전부 막히면
        //   서버는 ok:true·제출 0 을 준다. 예전엔 낙관적 스피너만 남고 아무 말이 없어 "눌러도
        //   반응 없음 = 재생성 불가"로 보였다. 클릭 유래(force)일 때만 스피너를 풀고 이유를 말한다.
        //   자동 경로(auto)는 원래 조용해야 하므로 제외 — 진짜 생성 중인 샷의 표시를 지우지 않는다.
        //   더한 샷의 한 번 더 그리기(source)도 사람이 누른 것이 아니라 조용하다 — 그 샷을 그리는 다른 그리기가 고친 내용을 그린다(리뷰 R7).
        if (force && !auto && submitted.length === 0) {
          const blocked = (
            (j.data?.skipped ?? []) as Array<{ shotId: string; reason: string }>
          )
            .filter((x) => x.reason === 'in_flight')
            .map((x) => x.shotId)
          if (blocked.length && !confirmationPending && !opts?.source) {
            setPanelJobs((prev) => {
              const next = { ...prev }
              for (const id of blocked) delete next[id]
              return next
            })
            toast.info(
              translate(
                locale,
                'Still finishing the previous generation for {count} panels. Try again in a moment.',
                { count: blocked.length },
              ),
            )
          }
        }
        // 잡 단위 dedupe(#rough-grid): 그리드 잡 1개가 샷 최대 4개를 커버 — 같은 jobId 를 샷 수만큼
        //   중복 폴링하지 않는다. 완료 시 result_url 은 대표 1장(#no-originals 이후 첫 샷 start,
        //   이전엔 그리드 원본)이라 4샷 카드에 그대로 쓸 수 없다 → URL 대신 크롭이 끝난 DB 진실
        //   (shots.rough_storyboard.frames)을 리로드하고, stale override 를 지워 그 진실이 보이게 한다.
        const shotIdsByJob = new Map<string, string[]>()
        for (const { shotId, jobId } of submitted) {
          shotIdsByJob.set(jobId, [...(shotIdsByJob.get(jobId) ?? []), shotId])
        }
        // 진실 리로드 수렴(#rough-refresh 2026-07-24) — previz(f392cbb)와 동일 패턴.
        //   잡 폴링을 best-effort 로 두고(일시 오류로 던져도 무시), shots.rough_storyboard.status 가
        //   'completed' 로 보일 때까지 loadProject 를 리로드한다. 폴링이 일시 오류(웹훅과 경쟁 등)로
        //   던지거나 완료가 loadProject 한 번에 안 잡히던 어떤 경로에서도 UI 가 수렴한다
        //   (카드가 새로고침 전까지 안 갱신되던 문제 해소). finalize 는 rough_storyboard 를 먼저 쓰고
        //   completeGenerationJob 을 하므로 폴링 성공 후 첫 리로드가 곧 완료 프레임을 본다(정상=리로드 1회).
        //   폴링 실패는 실패로 단정하지 않는다 — 일시 오류(정상 잡)를 거짓 실패로 만들던 게 원래 버그.
        //   상한 도달 시엔 아직 미완인 샷의 스피너만 걷어 사용자가 재시도할 수 있게 한다(실패 확정 X).
        const isDone = (id: string) =>
          useWriterStore.getState().shots.find((s) => s.shotId === id)?.roughStoryboard?.status ===
          'completed'
        const clearShots = (ids: string[]) => {
          if (!ids.length) return
          setOverrides((prev) => {
            const next = { ...prev }
            for (const id of ids) delete next[id]
            return next
          })
          setPanelJobs((prev) => {
            const next = { ...prev }
            for (const id of ids) delete next[id]
            return next
          })
        }
        // START 정합 검사(#adherence P2) — 잡의 샷들이 전부 안착하면 best-effort 로 판정 요청 후
        //   결과(배지)를 리로드로 회수. 실패는 조용히 무시(검사가 생성 UX 를 막지 않는다).
        //   관리자 소유 프로젝트 한정(2026-08-07) — 서버 게이트와 별개로 헛호출 방지.
        const runAdherence = async (ids: string[]) => {
          if (!ADHERENCE_START_ENABLED) return // #adherence 킬 스위치(2026-08-10)
          try {
            if (!(await fetchDebugPrompts(projectId))) return
            const res = await fetch('/api/writer/rough-adherence', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ projectId, shotIds: ids }),
            })
            const body = (await res.json().catch(() => null)) as { checked?: number } | null
            if (res.ok && (body?.checked ?? 0) > 0) await loadProject()
          } catch {
            /* best-effort */
          }
        }
        // 끝을 돌려준다 — 'drawn'(그 샷들이 그려짐) · 'failed'(작업 실패 확정) · 'unknown'(상한까지 모름). 더한 샷의 한 번 더 그리기가 읽는다.
        // 이 묶음에서 내용 검사(moderation)로 실패한 잡이 맡은 샷 — 묶음이 끝난 뒤 채팅에 한 줄로 모아 알린다(2026-11-14 오너).
        const moderationShots: string[] = []
        const convergeJob = async (jobId: string, jobShotIds: string[]): Promise<'drawn' | 'failed' | 'unknown'> => {
          const pollOk = await pollGenerationJob(jobId)
            .then(() => true)
            .catch(() => false)
          // 폴링이 던졌으면(pollOk=false) 실패인지 일시 오류인지 잡 상태를 한 번 권위 있게 확인한다.
          //   진짜 실패면 펌프 배리어(r.done)를 오래 붙잡지 않고 즉시 실패 표기 후 종료.
          let jobFailed = false
          if (!pollOk) {
            const checked = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((b) => ({ failed: b?.data?.status === 'failed', error: typeof b?.data?.error === 'string' ? (b.data.error as string) : null }))
              .catch(() => ({ failed: false, error: null }))
            jobFailed = checked.failed
            // 내용 검사로 실패한 잡이 맡은 샷은 이 묶음 알림에 모은다 — 옛 그림이 남은 다시 그리기도 이번에 못 그린 것이다(시간 초과 · 일반 실패는 대상이 아니다).
            if (jobFailed && isModerationFailureText(checked.error)) moderationShots.push(...jobShotIds)
          }
          for (let i = 0; i < ROUGH_CONVERGE_MAX_RELOADS; i++) {
            // #shots-cache-invalidate: 잡 완료를 안 순간의 리로드는 30초 신선 사물함을 그대로
            //   믿으면 안 된다 — 무효화 없이 돌면 "리로드 1회 수렴" 설계가 캐시 도입 후 최대
            //   30초 스피너로 늘어진다(오너 rerender 검증 요청에서 발견). 재시도마다 뚫는다.
            if (projectId) await invalidateShots(projectId)
            await loadProject()
            const settled = jobShotIds.filter(isDone)
            clearShots(settled)
            if (settled.length === jobShotIds.length) {
              void runAdherence(jobShotIds) // 완료 배치 정합 검사 (fire-and-forget, 클라 생존 중)
              return 'drawn'
            }
            if (jobFailed) {
              // 잡 실패 확정 — 미완 샷을 실패 표기(재시도 버튼 노출)하고 종료.
              setPanelJobs((prev) => {
                const next = { ...prev }
                for (const id of jobShotIds) {
                  if (!isDone(id)) next[id] = { status: 'failed', error: translate(locale, 'Generation failed') }
                }
                return next
              })
              return 'failed'
            }
            // 폴링 성공(완료 확정)이면 짧게, 미확정이면 웹훅 지연을 감안해 길게 재확인.
            await new Promise((r) => setTimeout(r, pollOk ? 2000 : 10_000))
          }
          // 상한 초과 — 미완 샷 스피너 해제(missing 으로 되돌려 펌프/재시도가 이어받게).
          setPanelJobs((prev) => {
            const next = { ...prev }
            for (const id of jobShotIds) if (!isDone(id)) delete next[id]
            return next
          })
          return 'unknown'
        }
        const polls = [...shotIdsByJob.entries()].map(([jobId, jobShotIds]) =>
          convergeJob(jobId, jobShotIds),
        )
        return {
          submitted: submitted.length,
          remaining: (j.data?.remaining as number | undefined) ?? 0,
          quota: false,
          confirmationPending,
          submittedShotIds: submitted.map((item) => item.shotId),
          skipped: (j.data?.skipped ?? []) as Array<{ shotId: string; reason: string }>,
          // 이번 라운드 잡들의 종결(성공/실패 모두 위에서 상태 반영) — 펌프의 라운드 배리어.
          //   묶음이 끝나면 내용 검사로 걸린 샷을 채팅에 한 줄로 알린다(걸린 샷이 없으면 아무것도 안 한다).
          done: Promise.allSettled(polls).then((results) => {
            announceRoughModerationFailures('writer', moderationShots)
            return results
          }),
        }
      } catch (e) {
        const event = autoSubmitEventPayload({ auto, source: opts?.source }, { error: e instanceof Error ? e.message : String(e) })
        if (event) recordWriterObservabilityEventClient(projectId, 'auto_submit_response', event)
        if (shotIds?.length) {
          setPanelJobs((prev) => {
            const next = { ...prev }
            for (const id of shotIds) delete next[id]
            return next
          })
        }
        toast.error(
          e instanceof Error ? e.message : translate(locale, 'Rough storyboard generation request failed'),
        )
        return null
      }
    },
    [projectId, loadProject, locale],
  )

  // ── 더한 샷 바로 그리기(2026-11-02 오너 "더할 때마다 자동") ── 카드의 그리기와 같은 요청 길로 그 샷 하나를 보낸다.
  //   빈칸만 채운다(force 없이): 그새 그림이 생겼거나 다른 곳에서 그리는 중이면 서버가 건너뛰어 같은 샷을 두 번 그리지 않는다.
  //   스토리를 막 고쳤으면 저장을 먼저 끝낸다(서버가 빈 스토리로 보지 않게). 무엇을 할지는 lib/writer/added-shot-draws 가 정한다.
  //   redraw(그리는 동안 고친 샷의 한 번 더 그리기)는 그린 그림을 덮어 그린다(force). 보낼 때의 내용 지문을 장부에 넘긴다(리뷰 R3).
  //   진입 자동 그리기(auto)가 아니다 — 출처 added_shot 으로 기록하고, 반복 실패로 멈추면 안내한다(리뷰 R7).
  //   그려 둔 샷을 다시 그릴 때는 옛 그림도 "다 그림"이라 보드의 그리기 끝이 실패한 작업도 그려짐으로 읽는다 —
  //   대표 그림 주소가 정말 바뀌었을 때만 그려짐으로 넘긴다(최종 리뷰 L2).
  const drawAdded = useCallback<DrawAddedShot>(
    async (shotId, { redraw }) => {
      const shotNow = () => useWriterStore.getState().shots.find((s) => s.shotId === shotId)
      const storyOf = () => shotNow()?.actionDescription ?? ''
      const pictureOf = () => shotNow()?.roughStoryboard?.url ?? ''
      if (!shotHasInfo(storyOf())) return { kind: 'no_story', story: storyOf() }
      await flushShotSave(shotId).catch(() => {})
      const sent = shotNow()
      const signature = sent ? roughContentSignature(sent) : undefined
      const pictureBefore = pictureOf()
      const round = await generate([shotId], redraw, false, undefined, { quietUserLimit: true, source: 'added_shot' })
      const drawn = addedDrawOutcome(round, shotId, storyOf(), locale)
      const outcome = drawn.kind === 'submitted'
        ? { ...drawn, signature, done: drawn.done.then((result) => (result === 'drawn' && pictureOf() === pictureBefore ? 'failed' : result)) }
        : drawn
      if (outcome.kind !== 'submitted') {
        // 접수되지 않았다 — 걸어 둔 그리는 중 표시를 거둔다(멈춘 까닭은 장부가 카드에 보인다).
        setPanelJobs((prev) => {
          if (!(shotId in prev)) return prev
          const next = { ...prev }
          delete next[shotId]
          return next
        })
        // 서버가 건너뛰었다 — 다른 곳에서 그리는 중이면 생성 큐가 그 표시를 맡는다.
        if (outcome.kind === 'no_story' || outcome.kind === 'skipped') refreshGenerationQueue()
      }
      return outcome
    },
    [generate, locale],
  )
  const activeJobsKey = activeJobs.map((job) => job.id).sort().join(',')
  const addedViews = useAddedShotDraws({ projectId, draw: drawAdded, activeJobsKey, shots })
  // 지운 샷 번호를 다시 쓴 새 샷에 옛 그림 · 옛 실패가 남지 않게 — 더한 순간 그 번호의 화면 기록을 비운다.
  useEffect(
    () =>
      onShotAdded((event) => {
        if (event.projectId !== projectId) return
        const drop = <T,>(prev: Record<string, T>): Record<string, T> => {
          if (!(event.shotId in prev)) return prev
          const next = { ...prev }
          delete next[event.shotId]
          return next
        }
        setPanelJobs(drop)
        setOverrides(drop)
      }),
    [projectId],
  )
  // 러프 생성이 진행 중이면 마지막 탭보다 진행 화면을 우선한다.
  // WriterWorkspace가 각 탭 화면을 동시에 마운트하므로 백그라운드 잡도 놓치지 않는다.
  //   더한 샷 그리기는 세지 않는다 — 대사 탭에서 고치는 중에 채팅으로 더한 샷이 그려져도 탭을 빼앗지 않는다(그 카드만 그리는 중).
  const boardDrawing = boardDrawingCount(queuedRoughIds, addedViews)
  useEffect(() => {
    if (boardDrawing > 0) setActiveTab('storyboard')
  }, [boardDrawing, setActiveTab])

  // 누락 패널 전체 생성 펌프 — 루프 규칙은 rough-pump-client.ts(자리 부족은 재시도 없이 멈춤, 내 묶음이
  //   끝나면 다음 묶음). 여기는 컴포넌트 상태(실행 중·이탈)만 잌는다.
  const pumpRunningRef = useRef(false)
  const pumpAbortRef = useRef(false)
  useEffect(() => {
    pumpAbortRef.current = false
    return () => {
      pumpAbortRef.current = true
    }
  }, [])
  const generateAllMissing = useCallback(
    async (auto: boolean) => {
      if (pumpRunningRef.current) return
      pumpRunningRef.current = true
      setPumpActive(true)
      try {
        await runRoughPump({
          // give-up 안내 토스트는 수동 1라운드에서만 (라운드마다 반복 방지). 429 안내는 generate 가 한다.
          generate: (round) => generate(undefined, false, auto || round > 0),
          isAborted: () => pumpAbortRef.current,
        })
      } finally {
        pumpRunningRef.current = false
        setPumpActive(false)
        setPumpRuns((n) => n + 1)
      }
    },
    [generate],
  )

  // [남은 컷 (다시) 그리기](리뉴얼 1차 — 잠금 표시의 실패 안내 · Director 넘김 창) — 사람이 누른 다시 그리기라 force 로 보낸다
  //   (카드의 다시 시도와 같다: 반복 실패로 자동 생성이 멈춘 컷도 다시 그린다). 서버 그리드 한 장 = 한 씬 넉 장이라
  //   그 크기로 나눠 차례로 보낸다(고른 컷이 요청에서 빠지지 않게). 같은 컷을 이 안에서 두 번 보내지 않는다.
  const drawShots = useCallback(
    async (shotIds: readonly string[]) => {
      if (pumpRunningRef.current || shotIds.length === 0) return
      pumpRunningRef.current = true
      setPumpActive(true)
      try {
        const sceneOf = new Map(useWriterStore.getState().shots.map((s) => [s.shotId, s.sceneId]))
        const batches = roughRedrawBatches(shotIds.map((shotId) => ({ shotId, sceneId: sceneOf.get(shotId) ?? '' })))
        for (const batch of batches) {
          if (pumpAbortRef.current) break
          const round = await generate(batch, true)
          if (!round || round.quota || round.confirmationPending) break
          await round.done
        }
      } finally {
        pumpRunningRef.current = false
        setPumpActive(false)
        setPumpRuns((n) => n + 1)
      }
    },
    [generate],
  )

  // 채팅 고치기 뒤 [러프 다시 그리기](2026-10-31 QA) — 고친 샷들만 위 [남은 컷 다시 그리기]와 같은 길로 다시 그린다.
  //   보드가 이미 그리는 중이면 끝난 뒤에 받는다. 요청은 프로젝트에 묶여 있다 — 이 보드의 프로젝트 것만 그리고, 다른 프로젝트 것은 버린다.
  //   이 보드가 열려 있는 동안만 채팅이 묻고, 보드가 내려가거나 프로젝트가 바뀌면 남은 요청을 지운다(2026-11-01 리뷰 B1).
  useEffect(() => {
    if (!projectId) return
    useBoardUiStore.getState().openBoard(projectId)
    return () => useBoardUiStore.getState().closeBoard(projectId)
  }, [projectId])
  const roughRedrawRequest = useBoardUiStore((s) => s.roughRedrawRequest)
  useEffect(() => {
    if (!roughRedrawRequest || pumpActive || !projectId) return
    const shotIds = useBoardUiStore.getState().takeRoughRedraw(projectId)
    if (!shotIds) return
    // 실제로 그리기 시작할 때 채팅 카드를 내린다(2026-11-02 리뷰 L7) — 그 전에 보드를 떠나면 카드는 남아 다시 누를 수 있다.
    useGlobalChatStore.getState().settleRoughRedraw(projectId, shotIds)
    void drawShots(shotIds)
  }, [roughRedrawRequest, pumpActive, projectId, drawShots])

  const running = !!(
    status?.started &&
    !status.pipeline_completed &&
    !status.pipeline_failed
  )
  const hasShots = shots.length > 0
  const panelOf = (shot: Shot): RoughStoryboardImage | null =>
    overrides[shot.shotId] ?? shot.roughStoryboard ?? null
  // 설명문에 새어 나온 char_3 / location_2 를 이름으로 (#id-leak) — 표시만 바꾼다(저장값 불변).
  const entityNames = manifestEntities(sceneManifest)
  // 큐가 로컬 상태를 이긴다(#queue-restore) — 잡이 실제로 떠 있으면 그게 진행 중의 진실이다.
  //   (탭 왕복으로 panelJobs 를 잃었거나, 옛 'failed' 표기가 남아 있어도 큐가 맞다.)
  //   더한 샷 바로 그리기의 보내기 전 상태(그리는 중 · 자리 기다림 · 멈춤)는 그 밑에 깐다 — 보낸 뒤로는 panelJobs · 큐가 이긴다.
  const localJobs = { ...addedDrawJobs(shots, addedViews, (shot) => isRoughDrawn(panelOf(shot)), locale), ...panelJobs }
  const jobOf = (shotId: string): PanelJob | undefined =>
    queuedRoughIds.has(shotId) ? { status: 'generating' } : localJobs[shotId]
  // #5: 정보(액션)가 없는 샷은 자동 생성 대상에서 제외 — 근거 없는 빈 패널 생성 방지.
  //   더한 샷 그리기가 맡고 있는 샷도 빠진 러프로 세지 않는다(리뷰 R2 — 세면 진입 자동 그리기가 보드 · 채팅을 잠근다).
  const missingIds = boardMissingRoughIds(shots, { hasPanel: (s) => !!panelOf(s), hasJob: (shotId) => !!jobOf(shotId) }, addedViews)
  const roughProgress = summarizeRoughProgress(shots, overrides, localJobs, queuedRoughIds)
  const generatingCount = roughProgress.generating
  // 잠금이 세는 그리기 — 이 화면에서 더한 샷은 뺀다(오너 "잠금 없이 카드에서 '그리는 중'으로").
  const lockProgress = summarizeRoughProgress(withoutAddedShots(shots, addedViews), overrides, localJobs, queuedRoughIds)

  // ── 잠금 표시(리뉴얼 1차, 프로토타입 S0) ── 이번 순간의 사실을 모아 잠금 상태를 한 걸음 옮기고, 보일 내용을 정한다(lib/writer/board-busy).
  //   진입 자동 그리기 직전(그리기가 아직 한 번도 안 돌았고 빠진 패널이 있다)도 그리기로 본다 — 잠금이 한 프레임 풀렸다 닫히지 않게.
  const autoDrawPending = hasShots && !running && missingIds.length > 0 && pumpRuns === 0 && !pumpActive
  const lockFacts: BoardLockFacts = {
    runActive: isBoardRunActive(status),
    reloading: !!status?.pipeline_completed && !reloadSettled,
    hasShots,
    generating: lockProgress.generating,
    failed: lockProgress.failed,
    pumpActive,
    autoDrawPending,
  }
  const nextLockKey = JSON.stringify(lockFacts)
  if (nextLockKey !== lockKey) {
    // 사실이 바뀐 순간에만 한 걸음 옮긴다 — 렌더 중 갱신이라 화면에 그리기 전에 바로 다시 그려 옛 잠금이 남지 않는다.
    setLockKey(nextLockKey)
    setLock((prev) => advanceBoardLock(prev, lockFacts))
  }
  const busy = storyboardBusyView(
    { status, facts: lockFacts, lock, rough: roughProgress, sceneCount: sceneManifest?.scenes.length ?? 0 },
    locale,
  )
  // 남은 컷([남은 컷 (다시) 그리기]) — 보드 순서(씬 → 샷)로 고른다. Director 넘김 창은 보드가 지금 보여 주는 그림으로 센다.
  const boardList = boardShots(sceneManifest, shots)
  const remainingIds = undrawnRoughShotIds(
    boardList.map((entry) => entry.shot),
    overrides,
    localJobs,
    queuedRoughIds,
  )
  // Director 넘기기 창(D0) — 실사가 이미 있는 샷은 넘어가며 다시 만들지 않으니 창을 열 때 저장된 샷 행에서 센다(사물함, 대개 바로 답).
  //   처음 읽는 중(null)이면 "세는 중", 읽기에 실패하면 많아야 몇 장인지만 보인다(검토 b 낮음 7 — 전엔 샷 전부를 만들 수로 보였다).
  const [realImageShotIds, setRealImageShotIds] = useState<ReadonlySet<string> | 'failed' | null>(null)
  useEffect(() => {
    if (!directorConfirmOpen || !projectId) return
    let cancelled = false
    void loadShots(projectId)
      .then((rows) => {
        if (cancelled) return
        const done = rows.filter((row) => (row.storyboard_image as { status?: string } | null)?.status === 'completed').map((row) => row.shot_id)
        setRealImageShotIds(new Set(done))
      })
      .catch(() => {
        if (!cancelled) setRealImageShotIds('failed')
      })
    return () => {
      cancelled = true
    }
  }, [directorConfirmOpen, projectId])
  const takeBalance = useTakeBalance()
  const artistCharacters = useArtistStore((s) => s.characterAssets.filter((c) => c.entityType !== 'object' && !!(c.portrait || c.views?.main || c.appearances?.some((a) => a.sheetUrl || a.portraitUrl))).length)
  const artistBackgrounds = useArtistStore((s) => s.worldAssets.filter((w) => !!w.wideShot).length)
  const directorSummary = directorHandoffSummary(sceneManifest, shots, panelOf)
  const directorView = directorConfirmView(directorSummary, locale, {
    characters: artistCharacters,
    backgrounds: artistBackgrounds,
    imagesToMake:
      realImageShotIds === null
        ? 'counting'
        : realImageShotIds === 'failed'
          ? { atMost: directorSummary.movingShotIds.length }
          : directorSummary.movingShotIds.filter((id) => !realImageShotIds.has(id)).length,
    // 오너 2026-11-14 답 11번 — 지금 Take 계산기 값. 넘어가는 샷의 첫 영상은 Director 기본 모델 · 720p 로 만든다.
    //   Take 과금이 꺼져 있으면 노드처럼 값을 숨긴다(#payments-phase-2, 검토 b 낮음 5). 잔액을 못 읽은 때는 숨기지 않는다(2차 낮음 1).
    takesPerShot: takeValuesShown(takeBalance) ? takeCostForVideo(DEFAULT_VIDEO_MODEL, '720p') : null,
  })

  // 첫 진입 브리핑 — 씬 · 샷이 준비됐고 Storyboard 채팅 기록이 없으면 먼저 "이렇게 나눴어요"라고 알린다.
  //   Producer 웰컴과 같은 방식: dismissible:false(넘김 버튼 없음), 유저가 말을 걸면 자동으로 사라짐.
  //   리뉴얼 1차: 씬은 인물 · 배경 디자인 때 먼저 저장되므로, 샷이 생기고 잠금이 풀린 뒤에 알린다.
  //   카드를 Ctrl/Cmd 로 눌러 붙이는 여러 샷 선택은 없앴으니 그 조작은 안내하지 않는다.
  const busyOpen = busy.open
  useEffect(() => {
    if (!projectId || !chatHistoryLoaded || briefedRef.current) return
    if (!hasShots || busyOpen) return
    const sceneCount = sceneManifest?.scenes.length ?? 0
    if (sceneCount === 0) return
    if (chatMessages.some((m) => m.stage === 'writer')) return
    briefedRef.current = true
    offerSuggestion({
      id: `writer-brief:${projectId}`,
      stage: 'writer',
      dismissible: false,
      action: null,
      content: storyboardBriefing(locale, { sceneCount, shotCount: shots.length }),
    })
  }, [projectId, sceneManifest, shots.length, hasShots, busyOpen, chatMessages, chatHistoryLoaded, offerSuggestion, locale])
  // 제목 아래 설명문은 제거(#c2 2026-07-14) — 카드 사용법은 첫 진입 브리핑 채팅이 안내한다.
  // 트리트먼트·대사 탭과 같은 자리의 도움말(#c4 2026-08-03) — 헤더 아래 한 줄.
  const headerDescription = t(
    'Rough storyboard: click a card to review, edit, or regenerate; click a scene name to collapse it',
  )
  // v3 도구 줄(시안 S1) — 탭 옆 [+ 씬 추가] · [+ 샷 추가] 알약. 샷 추가는 어디에 더할지 고르는 [+ 샷 추가] 창을 씬 없이 연다(씬 머리의 것은 그 씬으로 연다).
  const storyboardTools = hasShots ? (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="rounded-full px-3.5"
        onClick={() => setAddDialog({ mode: 'scene', contextSceneId: null })}
      >
        <Plus className="size-3.5" />
        {t('Add scene')}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="rounded-full px-3.5"
        onClick={() => setAddDialog({ mode: 'shot', contextSceneId: null })}
      >
        <Plus className="size-3.5" />
        {t('Add shot')}
      </Button>
    </>
  ) : null
  const storyboardActions = hasShots ? (
    <>
      {/* 축척 — 가로 열 수 조절 (Ctrl+wheel 로도 가능) */}
      <StoryboardZoomControls
        zoomLevel={zoomLevel}
        onZoomLevelChange={setZoomLevel}
      />
      {missingIds.length > 0 && generatingCount === 0 && (
        <Button
          size="sm"
          variant="secondary"
          className="rounded-full px-3.5"
          onClick={() => void generateAllMissing(false)}
        >
          <RefreshCw className="size-3.5" />
          {t('Generate {count} missing panels', { count: missingIds.length })}
        </Button>
      )}
    </>
  ) : null

  // 자동 생성 판정은 한 프로젝트 진입당 한 번 영속화한다. 첫 null 상태는 로딩 중일 수
  // 있으므로 status 가 도착한 뒤 기록해 "조건 미충족"과 "아직 데이터 없음"을 구분한다.
  useEffect(() => {
    if (!projectId || !status || autoCheckLoggedRef.current === projectId) return
    if (!hasShots && !status.pipeline_completed && !status.pipeline_failed) return
    autoCheckLoggedRef.current = projectId
    const reason = !hasShots
      ? 'no_shots'
      : running
        ? 'pipeline_running'
        : missingIds.length === 0
          ? 'no_missing_panels'
          : 'eligible'
    recordWriterObservabilityEventClient(projectId, 'auto_check', {
      hasShots,
      running,
      pipelineStatus: status.current_status,
      pipelineCompleted: status.pipeline_completed,
      pipelineFailed: status.pipeline_failed,
      shotCount: shots.length,
      missingCount: missingIds.length,
      queuedCount: queuedRoughIds.size,
      autoTriggered: autoTriggeredRef.current,
      reason,
    })
    if (reason !== 'eligible') {
      recordWriterObservabilityEventClient(projectId, 'auto_submit_blocked', {
        reason,
        hasShots,
        running,
        shotCount: shots.length,
        missingCount: missingIds.length,
        queuedCount: queuedRoughIds.size,
      })
    }
  }, [
    projectId,
    status,
    hasShots,
    running,
    missingIds.length,
    shots.length,
    queuedRoughIds.size,
  ])

  // 진입 자동 생성: 샷이 로드됐고 파이프라인이 돌고 있지 않을 때, 누락 패널 전체를 1회씩 —
  //   펌프가 6샷 라운드로 나눠 remaining 0 까지 이어간다(#c1). auto=true → give-up 토스트 억제.
  useEffect(() => {
    if (!projectId) return
    if (autoTriggeredRef.current) return
    if (!hasShots || running) return
    if (missingIds.length === 0) return
    autoTriggeredRef.current = true
    recordWriterObservabilityEventClient(projectId, 'auto_submit_started', {
      shotCount: shots.length,
      missingCount: missingIds.length,
      queuedCount: queuedRoughIds.size,
      source: 'writer_entry',
    })
    void generateAllMissing(true)
  }, [projectId, hasShots, running, missingIds.length, queuedRoughIds.size, shots.length, generateAllMissing])

  // Ctrl + wheel → 보드 축척(zoom). 브라우저 페이지 줌을 막아야 하므로 native wheel 리스너(passive:false)로
  //   붙인다(React onWheel 은 passive 라 preventDefault 가 안 먹을 수 있음). up=확대(열↓), down=축소(열↑).
  //   (#a1 2026-07-15) 굴림 판정은 공용 스텝퍼(wheel-notch) — 스무스 스크롤 드라이버가 노치
  //   1칸을 여러 이벤트로 쪼개도 burst = 1단계로 정규화(옛 이벤트당 쿨다운은 2단계+ 튐).
  //   board div 는 hasShots 일 때만 렌더되므로 deps 에 hasShots 를 넣어 마운트 후 재바인딩한다.
  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const step = createWheelNotchStepper((dir) =>
      setZoomLevel((z) => Math.max(1, Math.min(6, z + dir))),
    )
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      step(e)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasShots, setZoomLevel])

  // 보드 drag-to-scroll (빈 영역을 잡고 끌면 패닝). 버튼/입력 위에서 시작한 드래그는 무시.
  const handleBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return
    const viewport = (e.currentTarget as HTMLElement).closest(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null
    if (!viewport) return
    const startX = e.clientX
    const startY = e.clientY
    const startLeft = viewport.scrollLeft
    const startTop = viewport.scrollTop
    draggedRef.current = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!draggedRef.current && Math.hypot(dx, dy) > 5) {
        draggedRef.current = true
        document.body.style.cursor = 'grabbing'
        document.body.style.userSelect = 'none'
      }
      if (draggedRef.current) {
        viewport.scrollTop = startTop - dy
        viewport.scrollLeft = startLeft - dx
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // 보드에 포커스가 있을 때만 Ctrl/⌘ +/− 를 가로챈다. 이벤트를 보드에 직접
  // 등록하므로 헤더·채팅 입력·다른 화면의 브라우저 페이지 축척은 건드리지 않는다.
  const handleBoardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target
    if (
      target instanceof Element &&
      target.closest('input, textarea, select, [contenteditable="true"]')
    ) {
      return
    }
    const nextZoom = applyRoughStoryboardZoomShortcut(zoomLevel, e)
    if (nextZoom === null) return
    e.preventDefault()
    // 빠르게 연속 입력해도 이전 렌더의 zoomLevel을 덮어쓰지 않도록 함수형 갱신.
    setZoomLevel((current) => applyRoughStoryboardZoomShortcut(current, e) ?? current)
  }

  const openDetail = (shotId: string) => {
    if (draggedRef.current) return
    setDetailShotId(shotId)
  }

  // ── 잠금 표시 · Director 넘김 창 ── 어느 화면(빈 보드 · 보드)이든 같이 단다.
  //   잠금 표시는 document.body 로 띄운다 — 단계 화면이 잠기는(inert) 동안에도 실패 안내의 버튼은 눌려야 한다.
  const busyFooter =
    busy.phase === 'failed' && busy.actions ? (
      <>
        <Button variant="outline" onClick={() => setLock((prev) => dismissBoardFailure(prev))}>
          {busy.actions.close}
        </Button>
        <Button disabled={remainingIds.length === 0} onClick={() => void drawShots(remainingIds)}>
          {busy.actions.redraw}
        </Button>
      </>
    ) : undefined
  const overlays = (
    <>
      {isClient
        ? createPortal(
            <AiBusyOverlay
              open={busy.open}
              busy={busy.phase !== 'failed'}
              title={busy.title}
              description={busy.description}
              steps={busy.steps}
              progress={busy.progress}
              progressLabel={busy.progressLabel}
              footer={busyFooter}
              // 큰 Lumi(Storyboard 옷, 오너 결정 8) — Artist → Storyboard 로 넘어가며 기다리는 동안 로딩, 실패 안내면 오류 모습(공용 덮개가 정한다).
              //   보드에서 다시 그리는 잠금에는 두지 않는다(lib/writer/board-busy lumi).
              lumi={busy.lumi ? 'storyboard' : undefined}
            />,
            document.body,
          )
        : null}
      <StoryboardDirectorDialog
        open={directorConfirmOpen}
        view={directorView}
        onClose={() => setDirectorConfirmOpen(false)}
        onDrawRemaining={() => {
          setDirectorConfirmOpen(false)
          void drawShots(remainingIds)
        }}
        onConfirm={(choice) => {
          setDirectorConfirmOpen(false)
          void handOverToDirector({ makeImages: choice === 'makeImages' })
        }}
      />
    </>
  )

  // ── 샷이 아직 없음 ── 씬 · 샷을 나누는 중이면 잠금 표시가 덮으니 뒤는 비워 두고, 아니면 왜 비었는지 알린다.
  //   예전 가운데 진행 막대는 잠금 표시가 대신한다(리뉴얼 1차).
  if (!hasShots) {
    const waiting = status?.current_status === 'awaiting_artist' || status?.current_status === 'awaiting_confirmation'
    const progress = writerProgressView(status, locale)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WriterHeader description={headerDescription} />
        {busy.open ? (
          <div className="flex-1" aria-hidden />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <ImageIcon className="size-10 text-subtle-foreground" />
            <p className="text-body font-semibold text-foreground">{waiting ? progress.label : t('No scenes or shots generated yet')}</p>
            {status?.pipeline_failed ? (
              <>
                <p className="text-caption text-muted-foreground">
                  {t('Generation stopped')}
                  {status.error ? `: ${status.error}` : ''}
                </p>
                <WriterResumeButton projectId={projectId} onResumed={restart} />
              </>
            ) : (
              <p className="text-caption text-muted-foreground">
                {waiting ? progress.detail : t('Scenes and shots are made when you press Complete in Artist.')}
              </p>
            )}
          </div>
        )}
        {overlays}
      </div>
    )
  }

  // ── 보드 ────────────────────────────────────────────────────────────────
  const detailShot = detailShotId ? shots.find((s) => s.shotId === detailShotId) : undefined
  const detailPanel = detailShot ? panelOf(detailShot) : null
  const cols = storyboardColumns(zoomLevel)
  // 전역 샷 번호(#shot-global-no 2026-08-12) — 씬별 1부터 리셋하지 않고 씬 순서대로 이어 센다.
  //   샷 각각의 고유 호출 번호가 목적(오너). 위치 기준(불변 id 아님)은 기존 결정 유지.
  //   셈은 Director 넘김 창 · 머리 숫자와 같은 boardShots(lib/writer/board-summary) 하나로 한다.
  const globalShotNo = new Map(boardList.map((entry) => [entry.shot.shotId, entry.shotNo]))
  // 설명문 폰트(#zoom-desc) — 열이 늘수록(축소) 글자도 줄여 전문이 들어가게. 기본 3열은 11/5 시안 S1 의 13.5px(보드 전용 크기표, lib/writer/board-card).
  const descFontSize = boardStoryFontSize(cols)
  // 그리는 카드의 기다림 모습(lib/writer/board-card cardWaitLook). 화면 읽기에 알리는 기다림 카드는 보드 순서(씬 → 샷)로 첫 장 하나다(검토 B 5c).
  const waitLookOf = (shotId: string) =>
    cardWaitLook({ drawing: jobOf(shotId)?.status === 'generating', boardLocked: busy.open, columns: cols })
  const announcedWaitShotId = announcedWaitShot(boardList.map((entry) => entry.shot), waitLookOf, collapsedScenes)

  // v3 씬 머리(시안 S1) — 이름(장소 · 때) · 요약 · 컷 수 · 초. 셈은 화면 머리와 같다(lib/writer/board-summary sceneStats).
  const statsByScene = sceneStats(sceneManifest, shots)
  // 카드 글 속 인물 이름(멘션 색)과 대사 한 줄의 화자 이름 — Artist 목록의 인물(lib/writer/board-card).
  const characterNames = new Map((sceneManifest?.characters ?? []).map((c) => [c.characterId, c.name]))
  const mentionNames = [...characterNames.values()]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriterHeader description={headerDescription} tools={storyboardTools} actions={storyboardActions} />
      <div role="status" aria-label={t('Rough storyboard progress')} className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-7 pt-3 font-num text-meta tabular-nums text-subtle-foreground">
        <span className="font-medium text-muted-foreground">{boardTotalText(t, roughProgress.total)}</span>
        <span>{t('Completed')} {roughProgress.completed}</span>
        <span className="inline-flex items-center gap-1">
          {generatingCount > 0 && <Loader2 className="size-3 animate-spin" />}
          {t('Generating')} {roughProgress.generating}
        </span>
        <span>{t('Waiting')} {roughProgress.waiting}</span>
        <span className={roughProgress.failed > 0 ? 'text-destructive' : undefined}>{t('Failed')} {roughProgress.failed}</span>
      </div>

      {/* #coverage-first(2026-09-02 오너): 연출 점검 — 영상으로 넘어가기 전에 커버리지 결함
          (반응 없는 다인 비트·리빌 없는 시선 비트·감정 연쇄 단절·급전환)을 보여준다.
          위치 표기는 파이프라인 샷 순번(오너의 "Shot2~3" 셈법과 동일). 메시지는 점검기 산출 데이터.
          관리자 계정에게만 보인다(서버가 관리자에게만 보낸다, 2026-11-03 오너). v3: 주의 색 판 + 아이콘. */}
      {status?.directing_issues && status.directing_issues.length > 0 && (
        <details className="group mx-7 mt-3 rounded-xl bg-warning/10 px-4 py-3 text-label">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
            {t('Directing check: {count} issues to review before video', { count: status.directing_issues.length })}
            <ChevronDown className="ml-auto size-4 shrink-0 text-subtle-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-2 space-y-1.5 pl-6 text-caption text-muted-foreground">
            {status.directing_issues.map((issue, i) => (
              <li key={`${issue.location}-${i}`} className="flex gap-2">
                <span className="shrink-0 font-num font-semibold text-foreground">
                  {pipelineLocationName(issue.location, locale)}
                </span>
                <span>
                  {issue.message}
                  {issue.suggestion ? ` · ${issue.suggestion}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={boardRef}
          className="cursor-grab space-y-[18px] px-7 pb-7 pt-4"
          tabIndex={0}
          aria-label={t('Rough storyboard board')}
          onKeyDown={handleBoardKeyDown}
          onPointerDown={handleBoardPointerDown}
        >
          {(sceneManifest?.scenes ?? []).map((scene, sceneIdx) => {
            const sceneShots = shots.filter((s) => s.sceneId === scene.sceneId)
            const sceneCollapsed = collapsedScenes.has(scene.sceneId)
            const sceneTitle = sceneHeadTitle(scene, entityNames, locale)
            const sceneSummary = resolveEntityNames(scene.narrativeSummary, entityNames).trim()
            const sceneStatsText = sceneStatsLabel(statsByScene.get(scene.sceneId) ?? { shots: sceneShots.length, seconds: 0 }, locale)
            return (
              <section key={scene.sceneId} className="space-y-3">
                {/* 씬 머리(v3 시안 S1) — 씬 번호(전체 번호 그대로, 씬 안 번호를 새로 만들지 않는다) · 이름(장소 · 때) · 요약 · 컷 수 · 초 · [+ 샷 추가].
                    예전에는 id 만 보였다(사용자 결정 2026-06-12) — v3 를 따른다(오너 2026-11-03 v3 대로 확인). 씬 머리를 누르면 접기/펼치기(#c2 2026-08-03, 갈매기 회전으로 상태 표시).
                    한 줄로 잘라 보이는(truncate) 이름 · 요약이 보드의 최소 폭이 되지 않게 가둔다(contain: inline-size) — 스크롤 칸 안쪽 틀(Radix table)이
                    그 폭만큼 넓어져, 채팅을 열어 보드가 좁아지면 오른쪽 카드가 잘렸다(2026-11-03 오너 QA 1번). Director storyboard 뷰처럼 카드 열은 폭에 맞춰 줄어든다. */}
                <div className="flex min-h-8 items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => toggleSceneCollapsed(scene.sceneId)}
                    aria-expanded={!sceneCollapsed}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left [contain:inline-size] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
                  >
                    <ChevronDown
                      className={cn('size-3.5 shrink-0 text-subtle-foreground transition-transform', sceneCollapsed && '-rotate-90')}
                      aria-hidden
                    />
                    <span className="shrink-0 font-num text-micro font-semibold text-foreground">{sceneName(locale, sceneIdx + 1)}</span>
                    {sceneTitle ? <span className="min-w-0 max-w-[45%] shrink-0 truncate text-body font-semibold text-foreground">{sceneTitle}</span> : null}
                    {/* 좁으면 요약만 말줄임 — 컷 수 · 초는 늘 보인다. */}
                    <span className="flex min-w-0 items-baseline gap-1 text-caption text-subtle-foreground">
                      {sceneSummary ? <span className="min-w-0 truncate" title={sceneSummary}>{sceneSummary}</span> : null}
                      <span className="shrink-0 tabular-nums">{sceneSummary ? `· ${sceneStatsText}` : sceneStatsText}</span>
                    </span>
                  </button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0 rounded-full px-3.5"
                    onClick={() =>
                      setAddDialog({ mode: 'shot', contextSceneId: scene.sceneId })
                    }
                  >
                    <Plus className="size-3.5" />
                    {t('Add shot')}
                  </Button>
                </div>

                {/* 접힘 애니메이션 — 항상 마운트 + grid-rows 0fr↔1fr (인물 상세와 동일 패턴) */}
                <div
                  className={cn(
                    'grid transition-[grid-template-rows] duration-300 ease-out',
                    sceneCollapsed
                      ? '[grid-template-rows:0fr]'
                      : '[grid-template-rows:1fr]',
                  )}
                  aria-hidden={sceneCollapsed}
                >
                <div className="min-h-0 overflow-hidden">
                <div
                  className="grid gap-3 p-0.5"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {sceneShots.length === 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAddDialog({ mode: 'shot', contextSceneId: scene.sceneId })
                      }
                      className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-subtle-foreground transition-colors hover:bg-accent/40 hover-red-beam"
                    >
                      <Plus className="size-6" />
                      <span className="text-label">{t('Add shot')}</span>
                    </button>
                  )}
                  {sceneShots.map((shot, shotIdx) => {
                    const panel = panelOf(shot)
                    const job = jobOf(shot.shotId)
                    // 카드 이름은 화면 언어("씬 1 · 샷 2" · "Scene 1 · Shot 2", 오너 2026-11-14 답 7).
                    const shotLabel = sceneShotName(locale, sceneIdx + 1, globalShotNo.get(shot.shotId) ?? shotIdx + 1)
                    const dialogue = cardDialogue(shot.dialogueLines, characterNames)
                    const dialogueText = dialogue ? resolveEntityNames(dialogue.text, entityNames) : ''
                    // 그리는 카드 위 기다림(11/5 SYS 노드 · 카드 위, 오너 2026-11-09) — "그리는 중" 판정 · 동시에 그리는 순서는 그대로, 모양만.
                    //   잠긴 보드는 예전 가벼운 표시, 잠금 없이 그리는 카드(더한 샷)만 카드 전체를 덮는다(고르는 규칙: lib/writer/board-card cardWaitLook).
                    const drawing = job?.status === 'generating'
                    const waitLook = waitLookOf(shot.shotId)
                    const waitOnCard = coversCard(waitLook)
                    return (
                      <article
                        key={shot.shotId}
                        role="button"
                        tabIndex={0}
                        // 카드를 Ctrl/Cmd 로 눌러 채팅에 붙이는 여러 샷 선택은 없앴다(리뉴얼 1차, 프로토타입 S1) — 누르면 언제나 상세.
                        onClick={() => openDetail(shot.shotId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openDetail(shot.shotId)
                          }
                        }}
                        className="group relative flex cursor-pointer flex-col gap-2.5 rounded-xl bg-panel p-3 transition-colors duration-100 hover-red-beam focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
                      >
                        {/* 카드 머리(v3 시안 S1) — 전체 번호 이름 그대로 · 길이 · ···(샷 고치기 팝업, 카드 누르기와 같다).
                            제품에 카드 메뉴로 둘 다른 일(지우기 · 다시 그리기)이 화면에 없어 메뉴 대신 팝업을 연다 — 결정 대기. */}
                        <div className="flex items-center gap-1.5">
                          <span className="font-num text-micro font-semibold text-foreground">{shotLabel}</span>
                          <span className="font-num text-meta font-medium tabular-nums text-subtle-foreground">
                            {t('{seconds}s', { seconds: shot.durationSeconds })}
                          </span>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="ml-auto text-subtle-foreground"
                            aria-label={t('{label} · edit', { label: shotLabel })}
                            title={t('{label} · edit', { label: shotLabel })}
                            onClick={(e) => {
                              e.stopPropagation()
                              openDetail(shot.shotId)
                            }}
                          >
                            <MoreHorizontal />
                          </Button>
                        </div>
                        {/* 그림 — 한 칸에서 시작 · 연출 · 끝 세 장을 돌려 본다(오너 결정 5, 시안의 두 장 나란히는 안 한다).
                            지금 보이는 장에 이름표(시안 "시작 · 연출")를 붙인다. sizeToImage(#fit-tight): 상자가 그림 비율을 따라가 좌우 띠 없이 전부 보인다.
                            v3 시안처럼 그림 모서리를 둥글린다(예전 #card-inset 2026-08-11 은 라운드 없이 여백만 둘렀다). */}
                        {panel?.url && job?.status !== 'generating' ? (
                          // #p1-quickwin W3: 첫 진입 시 전 카드 1회 순환 후 hover 전용.
                          //   W4: 카드 위 재생성 칩 제거 — 재생성은 카드 팝업·채팅으로 일원화.
                          //   그림을 눌러도 멈추지 않고 고치기 팝업이 열린다(pauseOnClick=false, 2026-10-31 QA) — 카드 대부분이 그림이다.
                          <>
                            <div className="overflow-hidden rounded-[14px]">
                              <RoughFrameCycle
                                panel={panel}
                                alt={`${shot.shotId} rough storyboard`}
                                introPlay
                                sizeToImage
                                pauseOnClick={false}
                                frameTag
                              />
                            </div>
                            {/* 그려 둔 그림을 고친 내용으로 다시 그리는 차례가 기다리거나 멈췄다 — 그림 아래에 알린다(최종 리뷰 L2). */}
                            {job?.status === 'waiting' || job?.status === 'failed' ? (
                              <AddedRedrawStatus
                                job={{ status: job.status, error: job.error }}
                                onRetry={() => void generate([shot.shotId], true)}
                              />
                            ) : null}
                          </>
                        ) : (
                        <div
                          className={cn(
                            'relative aspect-video overflow-hidden rounded-[14px] bg-art-placeholder',
                            job?.status === 'failed' && 'ring-1 ring-inset ring-destructive/50',
                          )}
                        >
                          {drawing ? (
                            // "그리는 중" 표시는 그림 자리에만 — 알림(그리는 중 띠 · 카드 위 기다림 카드)은 그 밖에 둔다.
                            //   알림을 감싸면 화면 읽기 프로그램이 다 그릴 때까지 알림을 미룰 수 있다(검토 C 2). 카드 위 기다림이면 그림 자리는 비워 둔다.
                            <div className="absolute inset-0" aria-busy="true">
                              {waitLook === 'light' ? (
                                <>
                                  <div className="size-full animate-pulse bg-foreground/5" />
                                  <Loader2 className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                                </>
                              ) : null}
                            </div>
                          ) : job?.status === 'waiting' ? (
                            // 더한 샷이 내 동시 생성 자리를 기다린다 — 자리가 나면 그린다(2026-09-11 오너 (가)). 도는 표시를 쓰지 않는다.
                            <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center" role="status">
                              <Clock className="size-5 text-muted-foreground" aria-hidden />
                              <p className="text-caption text-muted-foreground">{t('Draws as soon as a slot frees up')}</p>
                            </div>
                          ) : job?.status === 'failed' ? (
                            <div className="flex size-full flex-col items-center justify-center gap-2 p-4">
                              <AlertCircle className="size-5 text-destructive" />
                              <p className="line-clamp-2 text-center text-caption text-destructive">
                                {job.error ?? t('Generation failed')}
                              </p>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="rounded-full px-3.5"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void generate([shot.shotId], true)
                                }}
                              >
                                {t('Retry')}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
                              <ImageIcon className="size-7 text-muted-foreground" />
                              {/* #5: 정보(액션) 없으면 생성 불가 — 카드 클릭해 스토리부터 입력하게 유도. */}
                              {shotHasInfo(shot.actionDescription) ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="rounded-full px-3.5 hover-red-beam"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    // 사람의 명시적 클릭 → force(give-up 게이트 통과).
                                    void generate([shot.shotId], true)
                                  }}
                                >
                                  {t('Generate panel')}
                                </Button>
                              ) : (
                                <p className="text-caption text-muted-foreground">
                                  {t('Enter a story (action) to enable generation')}
                                </p>
                              )}
                            </div>
                          )}
                          <GeneratingOverlay
                            active={waitLook === 'light'}
                            label={t('Generating rough storyboard')}
                            beamColor="success"
                          />
                        </div>
                        )}

                        {/* 액션 글 — 전문 표시(#zoom-desc, 잘라내지 않는다 · 축소 시 폰트가 함께 줄어든다). 인물 이름은 멘션 색(시안 "@민호", 글은 그대로). */}
                        <p className="font-medium leading-[1.4] text-foreground" style={{ fontSize: descFontSize }}>
                          {mentionSegments(resolveEntityNames(shot.actionDescription, entityNames), mentionNames).map((part, i) =>
                            part.mention ? (
                              <span key={i} className="font-semibold text-mention">{part.text}</span>
                            ) : (
                              <Fragment key={i}>{part.text}</Fragment>
                            ),
                          )}
                        </p>
                        {/* 대사 한 줄(v3 시안 S1) — 첫 대사, 더 있으면 +N. 예전(#8 2026-07-09)에는 파이프라인이 대사 칸에 상황 요약을 채워 뺐다 —
                            지금 대사 칸은 대사 탭과 같은 진짜 대사다(#dialogue-v4 2026-07-23). 카드에 다시 두는 것은 오너 2026-11-03 v3 대로 확인. */}
                        {dialogue ? (
                          <p className="truncate text-caption text-muted-foreground" title={`${dialogue.speaker} “${dialogueText}”`}>
                            {dialogue.speaker} &ldquo;{dialogueText}&rdquo;
                            {dialogue.more > 0 ? <span className="ml-1.5 font-num text-subtle-foreground">+{dialogue.more}</span> : null}
                          </p>
                        ) : null}
                        {/* 칩(v3 시안 S1) — 샷 크기는 늘, 앵글 · 움직임 · 색온도는 러프가 따르는 무대 설계 값이 있을 때만(lib/writer/board-card).
                            연출 메모는 제품에 칸이 없어 두지 않는다(결정 대기). */}
                        <div className="flex flex-wrap gap-1">
                          {shotCardChips(shot, locale).map((chip) =>
                            chip.kind === 'size' ? (
                              <TooltipProvider key={chip.kind}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="tag" className="cursor-help">
                                      {chip.label}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t(SHOT_TYPE_DESCRIPTIONS[shot.shotType] ?? shot.shotType)}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Badge key={chip.kind} variant="tag">
                                {chip.label}
                              </Badge>
                            ),
                          )}
                        </div>
                        {/* #adherence P2: START↔설명 불일치 배지 — 팝업의 "저장 후 재생성"으로 유도. */}
                        {shot.roughStoryboard?.adherence?.status === 'mismatch' ? (
                          <p
                            className="flex items-center gap-1 text-caption text-warning"
                            title={shot.roughStoryboard.adherence.reason ?? undefined}
                          >
                            <AlertCircle className="size-3.5 shrink-0" />
                            {t('The image may not match the description. Click the card to try regenerating')}
                          </p>
                        ) : null}
                        {waitOnCard ? (
                          // 카드 전체를 덮는다(SYS "그 노드 크기에 맞춘다", 기다림 카드가 스스로 카드를 꽉 채운다) — 덮인 카드도 누르면 지금처럼 고치기 팝업이 열린다.
                          //   좁은 카드(축척 5 · 6열)는 여백 · 사이를 줄이고 설명(샷 이름 · 길이)을 뺀다. 화면 읽기에는 첫 장만 알린다(announce).
                          <NodeWaitCard
                            lumi="storyboard"
                            title={t('Drawing the rough')}
                            description={waitLook === 'card-compact' ? undefined : `${shotLabel} · ${t('{seconds}s', { seconds: shot.durationSeconds })}`}
                            announce={shot.shotId === announcedWaitShotId}
                            className={waitLook === 'card-compact' ? 'gap-2 p-2.5' : undefined}
                          />
                        ) : null}
                      </article>
                    )
                  })}
                </div>
                </div>
                </div>
              </section>
            )
          })}
        </div>
      </ScrollArea>

      {/* #arrow-layer 실험(2026-08-09): 팝업 = 화살표 레이어 편집기 — panel 객체를 통째로 넘긴다. */}
      <ShotDetailDialog
        variant="storyboard"
        shotId={detailShotId}
        panel={detailPanel}
        onOpenChange={(open) => {
          if (!open) setDetailShotId(null)
        }}
      />

      {addDialog && (
        <AddItemDialog
          open={!!addDialog}
          mode={addDialog.mode}
          contextSceneId={addDialog.contextSceneId}
          onOpenChange={(open) => {
            if (!open) setAddDialog(null)
          }}
        />
      )}

      {overlays}
    </div>
  )
}
