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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, ImageIcon, Loader2, Plus, RefreshCw } from 'lucide-react'
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
import { ShotDetailDialog } from '@/features/writer/shot-detail-dialog'
import { AddItemDialog, type AddMode } from '@/features/writer/add-item-dialog'
import { SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'
import { WriterHeader } from '@/features/writer/writer-header'
import { useProjectStore } from '@/stores/project-store'
import { useArtistStore } from '@/stores/artist-store'
import { useWriterStore } from '@/stores/writer-store'
import { useWriterUiStore } from '@/stores/writer-ui-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { WriterResumeButton } from '@/components/layout/writer-resume-button'
import { friendlyStageLabel, formatRemaining } from '@/lib/writer/stage-labels'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
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
  storyboardDescriptionFontSize,
  useStoryboardZoom,
} from '@/components/generating-frame'
import type { RoughStoryboardImage, Shot } from '@/types'
import { translate, useT } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import {
  mentionLabelForModifierClick,
  sceneShotMentionRef,
} from '@/lib/card-mention'
import { writerSceneShotMentions } from '@/lib/script-lines'
import { invalidateShots } from '@/lib/shots-cache'
import { computeSettledJobs, reportUiReflected } from '@/lib/generation-ui-reflected'
import { recordWriterObservabilityEventClient } from '@/lib/writer/debug-events-client'

type PanelJob = { status: 'generating' | 'failed'; error?: string }

// artist 백필(#writer-to-artist-backfill) 프로젝트당 1회 가드 — 탭 왕복 remount 에도 유지.
const artistBackfillTriggered = new Set<string>()

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
  const requestMentionToggle = useChatUiStore((s) => s.requestMentionToggle)
  const sceneShotMentionItems = useMemo(
    () => writerSceneShotMentions(sceneManifest, shots),
    [sceneManifest, shots],
  )
  const { status, restart } = useWriterStatus(projectId)
  // 진행 중 판정의 바닥 (#queue-restore 2026-08-11) — 아래 panelJobs 는 컴포넌트 로컬이라 탭을
  //   떠나면 증발하는데 잡은 fal 에서 계속 돈다. 돌아왔을 때 스피너를 되살리는 유일한 근거가 큐다.
  const activeJobs = useActiveGenerationJobs(projectId)
  const queuedRoughIds = activeShotIds(activeJobs, ['shot_rough_storyboard'])
  const setActiveTab = useWriterUiStore((s) => s.setActiveTab)
  const offerSuggestion = useGlobalChatStore((s) => s.offerSuggestion)
  const chatMessages = useGlobalChatStore((s) => s.messages)
  const briefedRef = useRef(false)

  // 러프 생성이 진행 중이면 마지막 탭보다 진행 화면을 우선한다.
  // WriterWorkspace가 각 탭 화면을 동시에 마운트하므로 백그라운드 잡도 놓치지 않는다.
  useEffect(() => {
    if (queuedRoughIds.size > 0) setActiveTab('storyboard')
  }, [queuedRoughIds.size, setActiveTab])

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
  const [detailShotId, setDetailShotId] = useState<string | null>(null)
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
  // 진행 중 단계 경과시간 라이브 표시(긴 단계에서 "멈춤" 오인 방지) — 1s 틱.
  const [nowMs, setNowMs] = useState(0)
  // Director Storyboard와 같은 축척 단계·저장 규칙을 사용한다.
  const [zoomLevel, setZoomLevel] = useStoryboardZoom('writer:zoomLevel')
  const boardRef = useRef<HTMLDivElement>(null)
  const autoTriggeredRef = useRef(false)
  const autoCheckLoggedRef = useRef<string | null>(null)
  const reloadedAfterCompleteRef = useRef(false)
  // drag-to-scroll 직후의 click 이 카드 팝업을 여는 오발 방지
  const draggedRef = useRef(false)

  useEffect(() => {
    if (projectId) void loadProject()
  }, [projectId, loadProject])

  // 첫 진입 브리핑 — 씬/샷이 준비됐고 writer 채팅 기록이 없으면 Writer가 먼저 "이렇게 나눴어요"라고 알린다.
  //   Producer 웰컴과 같은 방식: dismissible:false(넘김 버튼 없음), 유저가 말을 걸면 자동으로 사라짐.
  useEffect(() => {
    if (!projectId || briefedRef.current) return
    const sceneCount = sceneManifest?.scenes.length ?? 0
    if (sceneCount === 0) return
    if (chatMessages.some((m) => m.stage === 'writer')) return
    briefedRef.current = true
    offerSuggestion({
      id: `writer-brief:${projectId}`,
      stage: 'writer',
      dismissible: false,
      action: null,
      // #feedback 2026-08-07: "작업 완료"로 시작 + @멘션·Ctrl+클릭 조작법을 온보딩에 명시
      //   (진행도 핀이 풀린 직후 이 브리핑이 들어오는 흐름).
      content: translate(
        locale,
        'Scene and shot work is done.\n\n' +
          '· Split into {sceneCount} scenes, {shotCount} shots\n' +
          '· Each shot is pre-drawn as a rough storyboard (pencil sketch)\n\n' +
          "Let me know which scene or shot you'd like to revise or add.\n" +
          'Press "@" to pick a scene or shot (Ctrl+click a card does the same).',
        { sceneCount, shotCount: shots.length },
      ),
    })
  }, [projectId, sceneManifest, shots.length, chatMessages, offerSuggestion, locale])

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
      await useArtistStore.getState().autoGenerateBaseImages().catch(() => {})
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
      void loadProject()
    }
  }, [status?.pipeline_completed, loadProject, projectId])

  const generate = useCallback(
    async (
      shotIds?: string[],
      force?: boolean,
      auto?: boolean,
      styleHints?: string[],
    ): Promise<{ submitted: number; remaining: number; quota: boolean; done: Promise<unknown> } | null> => {
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
        // 쿼터 초과(429)는 실패가 아니라 "큐가 빌 때까지 대기" 신호 — 펌프가 재시도한다(#c1).
        if (res.status === 429) {
          if (auto) {
            recordWriterObservabilityEventClient(projectId, 'auto_submit_response', {
              auto: true,
              httpStatus: 429,
              submittedCount: 0,
              remaining: 0,
              quota: true,
              queued: typeof j?.queued === 'number' ? j.queued : null,
              limit: typeof j?.limit === 'number' ? j.limit : null,
              code: typeof j?.code === 'string' ? j.code : null,
            })
          }
          if (shotIds?.length) {
            setPanelJobs((prev) => {
              const next = { ...prev }
              for (const id of shotIds) delete next[id]
              return next
            })
          }
          return { submitted: 0, remaining: 0, quota: true, done: Promise.resolve() }
        }
        if (!res.ok || !j?.ok) {
          throw new Error(j?.error?.message ?? `HTTP ${res.status}`)
        }
        const submitted = (j.data?.submitted ?? []) as Array<{
          shotId: string
          jobId: string
        }>
        if (auto) {
          const skipped = (j.data?.skipped ?? []) as Array<{ reason?: unknown }>
          const skippedByReason = skipped.reduce<Record<string, number>>((counts, item) => {
            const reason = typeof item.reason === 'string' ? item.reason : 'unknown'
            counts[reason] = (counts[reason] ?? 0) + 1
            return counts
          }, {})
          recordWriterObservabilityEventClient(projectId, 'auto_submit_response', {
            auto: true,
            httpStatus: res.status,
            submittedCount: submitted.length,
            remaining: j.data?.remaining ?? 0,
            skippedByReason,
          })
        }
        // give-up 게이트로 건너뛴 샷 안내 — 진입 자동 생성(auto)에는 매번 뜨지 않도록 억제.
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
        const convergeJob = async (jobId: string, jobShotIds: string[]) => {
          const pollOk = await pollGenerationJob(jobId)
            .then(() => true)
            .catch(() => false)
          // 폴링이 던졌으면(pollOk=false) 실패인지 일시 오류인지 잡 상태를 한 번 권위 있게 확인한다.
          //   진짜 실패면 펌프 배리어(r.done)를 오래 붙잡지 않고 즉시 실패 표기 후 종료.
          let jobFailed = false
          if (!pollOk) {
            jobFailed = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((b) => b?.data?.status === 'failed')
              .catch(() => false)
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
              return
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
              return
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
        }
        const polls = [...shotIdsByJob.entries()].map(([jobId, jobShotIds]) =>
          convergeJob(jobId, jobShotIds),
        )
        return {
          submitted: submitted.length,
          remaining: (j.data?.remaining as number | undefined) ?? 0,
          quota: false,
          // 이번 라운드 잡들의 종결(성공/실패 모두 위에서 상태 반영) — 펌프의 라운드 배리어.
          done: Promise.allSettled(polls),
        }
      } catch (e) {
        if (auto) {
          recordWriterObservabilityEventClient(projectId, 'auto_submit_response', {
            auto: true,
            error: e instanceof Error ? e.message : String(e),
          })
        }
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

  // 누락 패널 전체 생성 펌프(#c1·#c2·#c3 2026-07-15) — 서버가 호출당 6샷으로 캡하므로(504·쿼터
  //   독점 방지) remaining 이 0이 될 때까지 라운드를 이어간다. 라운드 배리어(이전 잡 완료 대기)로
  //   쿼터를 넘지 않고, 429(다른 생성이 큐 점유)는 8초 대기 후 재시도. 실패 샷은 다음 라운드가
  //   자연 재제출하고 반복 실패는 서버 give-up 게이트가 멈춘다 → 수렴 보장.
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
      let quotaToasted = false
      try {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
        const MAX_ROUNDS = 40 // 76샷=13라운드 + 429 대기 여유. 폭주 방지 상한.
        for (let round = 0; round < MAX_ROUNDS; round++) {
          if (pumpAbortRef.current) return
          // give-up 안내 토스트는 수동 1라운드에서만 (라운드마다 반복 방지)
          const r = await generate(undefined, false, auto || round > 0)
          if (!r) return // 요청 실패 — generate 가 이미 토스트
          if (r.quota) {
            // #silent-pump(2026-08-25 실사고): 진입 자동 모드가 429(다른 생성이 큐 점유 — 예:
            //   러프 완주 직후의 artist 백필)를 무음으로 삼키며 재시도하다 무음으로 포기해,
            //   사용자에겐 "러프 생성이 그냥 안 됨"으로 보였다. 자동 모드도 3라운드째(≈16s
            //   점유 지속)면 한 번은 말한다 — 수동 모드는 종전대로 즉시 1회.
            if (!quotaToasted && (!auto || round >= 2)) {
              quotaToasted = true
              toast.info(
                translate(
                  locale,
                  "The server is busy, so this is taking longer than usual. We'll continue automatically as soon as a slot opens.",
                ),
              )
            }
            await sleep(8000)
            continue
          }
          if (r.submitted === 0) return // 전부 완료/제외 — 수렴
          await r.done
          // remaining<=0 이어도 바로 끝내지 않는다 — 다음 라운드가 이번 라운드 실패분을
          //   재제출할 기회(그 라운드 submitted 0 이면 그때 종료). give-up 게이트가 무한 재시도를 막는다.
        }
      } finally {
        pumpRunningRef.current = false
      }
    },
    [generate, locale],
  )

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
  const jobOf = (shotId: string): PanelJob | undefined =>
    queuedRoughIds.has(shotId) ? { status: 'generating' } : panelJobs[shotId]
  // #5: 정보(액션)가 없는 샷은 자동 생성 대상에서 제외 — 근거 없는 빈 패널 생성 방지.
  const missingIds = shots
    .filter((s) => !panelOf(s) && !jobOf(s.shotId) && shotHasInfo(s.actionDescription))
    .map((s) => s.shotId)
  const generatingCount = shots.filter(
    (s) => jobOf(s.shotId)?.status === 'generating',
  ).length
  // 제목 아래 설명문은 제거(#c2 2026-07-14) — 카드 사용법은 첫 진입 브리핑 채팅이 안내한다.
  // 트리트먼트·대사 탭과 같은 자리의 도움말(#c4 2026-08-03) — 헤더 아래 한 줄.
  const headerDescription = t(
    'Rough storyboard — click a card to review, edit, or regenerate; click a scene name to collapse it',
  )
  const storyboardActions = hasShots ? (
    <>
      {/* 축척 — 가로 열 수 조절 (Ctrl+wheel 로도 가능) */}
      <StoryboardZoomControls
        zoomLevel={zoomLevel}
        onZoomLevelChange={setZoomLevel}
      />
      {generatingCount > 0 && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t('{count} panels generating', { count: generatingCount })}
        </span>
      )}
      {missingIds.length > 0 && generatingCount === 0 && (
        <Button
          size="sm"
          variant="secondary"
          className="hover-red-beam"
          onClick={() => void generateAllMissing(false)}
        >
          <RefreshCw className="size-3.5" />
          {t('Generate {count} missing panels', { count: missingIds.length })}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="hover-red-beam"
        onClick={() => setAddDialog({ mode: 'scene', contextSceneId: null })}
      >
        <Plus className="size-3.5" />
        {t('Add scene')}
      </Button>
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

  // 진행 중일 때만 1초마다 현재 시각 갱신 → 현재 단계 경과시간 라이브 표시(shotCheck 등 100s+ 단계가 "멈춘" 듯 보이는 오인 방지).
  useEffect(() => {
    if (hasShots || !running) return
    setNowMs(Date.now())
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [hasShots, running])

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

  const mentionCardOnModifierClick = (
    event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>,
    kind: 'scene' | 'shot',
    id: string,
  ): boolean => {
    const target = sceneShotMentionItems.find(
      (item) => item.ref === sceneShotMentionRef('writer', kind, id),
    )
    const label = mentionLabelForModifierClick(event, target)
    if (!label) return false
    requestMentionToggle(label)
    return true
  }

  // ── 파이프라인 진행 중 (샷이 아직 없음) ─────────────────────────────────
  if (!hasShots && running) {
    const pct = Math.max(0, Math.min(100, status?.progress_percent ?? 0))
    // 진행(경과) 시간은 계산만 하고 표시하지 않는다(#c4) — 남은 예상 시간 산출에만 사용.
    //   실측 자체는 writer_runs(created_at/updated_at + state._timings)에 이미 영속된다.
    const startedAtMs = status?.timings?.pipeline_started_at
      ? Date.parse(status.timings.pipeline_started_at)
      : null
    const elapsedMs = startedAtMs != null ? Math.max(0, nowMs - startedAtMs) : null
    const etaTotalMs = status?.eta_total_ms ?? null
    const remainingMs =
      etaTotalMs != null && elapsedMs != null ? etaTotalMs - elapsedMs : null
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WriterHeader description={headerDescription} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-busy="true" />
          <p className="text-base font-medium">{friendlyStageLabel(status?.current_stage, locale)}</p>

          {/* 진행률 바(#c3) — 우측에 % 병기 */}
          <div className="flex w-full max-w-md items-center gap-3">
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>

          {/* 남은 예상 시간 — 과거 실행 실측이 있을 때만(#c4, 기록 없으면 비움) */}
          {remainingMs != null ? (
            <p className="text-sm text-muted-foreground">{formatRemaining(remainingMs, locale)}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t('Complex stages like shot design and validation can take 1-2 minutes.')}
          </p>
        </div>
      </div>
    )
  }

  // ── 빈 상태 (파이프라인 미실행 + 산출물 없음) ───────────────────────────
  if (!hasShots) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WriterHeader description={headerDescription} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <ImageIcon className="size-12 text-muted-foreground" />
          <p className="text-base font-medium">{t('No scenes or shots generated yet')}</p>
          {status?.pipeline_failed ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t('Generation stopped')}
                {status.error ? ` — ${status.error}` : ''}
              </p>
              <WriterResumeButton projectId={projectId} onResumed={restart} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('Scenes and shots are generated once the story is handed off from Producer.')}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── 보드 ────────────────────────────────────────────────────────────────
  const detailShot = detailShotId ? shots.find((s) => s.shotId === detailShotId) : undefined
  const detailPanel = detailShot ? panelOf(detailShot) : null
  const cols = storyboardColumns(zoomLevel)
  // 전역 샷 번호(#shot-global-no 2026-08-12) — 씬별 1부터 리셋하지 않고 씬 순서대로 이어 센다.
  //   샷 각각의 고유 호출 번호가 목적(오너). 위치 기준(불변 id 아님)은 기존 결정 유지.
  const globalShotNo = new Map<string, number>()
  {
    let n = 0
    for (const scene of sceneManifest?.scenes ?? []) {
      for (const s of shots.filter((x) => x.sceneId === scene.sceneId)) {
        globalShotNo.set(s.shotId, ++n)
      }
    }
  }
  // 설명문 폰트(#zoom-desc) — 열이 늘수록(축소) 글자도 줄여 전문이 들어가게. 클램프는 제거.
  const descFontSize = storyboardDescriptionFontSize(cols)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WriterHeader description={headerDescription} actions={storyboardActions} />

      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={boardRef}
          className="cursor-grab space-y-8 p-6"
          tabIndex={0}
          aria-label={t('Rough storyboard board')}
          onKeyDown={handleBoardKeyDown}
          onPointerDown={handleBoardPointerDown}
        >
          {(sceneManifest?.scenes ?? []).map((scene, sceneIdx) => {
            const sceneShots = shots.filter((s) => s.sceneId === scene.sceneId)
            const sceneCollapsed = collapsedScenes.has(scene.sceneId)
            return (
              <section key={scene.sceneId} className="space-y-3">
                {/* 씬 구분선 — id 만 노출(사용자 결정 2026-06-12). 장소·분위기는 편집 팝업에서.
                    씬 이름 클릭 = 접기/펼치기 토글(#c2 2026-08-03, chevron 회전으로 상태 표시). */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      if (
                        mentionCardOnModifierClick(event, 'scene', scene.sceneId)
                      ) {
                        event.preventDefault()
                        event.stopPropagation()
                        return
                      }
                      toggleSceneCollapsed(scene.sceneId)
                    }}
                    aria-expanded={!sceneCollapsed}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn('size-3.5 transition-transform', sceneCollapsed && '-rotate-90')}
                    />
                    Scene {sceneIdx + 1}
                    {sceneCollapsed ? (
                      <span className="font-normal text-muted-foreground/70">
                        · {t('{count} shots', { count: sceneShots.length })}
                      </span>
                    ) : null}
                  </button>
                  <div className="h-px flex-1 bg-border" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover-red-beam"
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
                  className="grid gap-4 p-0.5"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {sceneShots.length === 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAddDialog({ mode: 'shot', contextSceneId: scene.sceneId })
                      }
                      className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:bg-accent/40 hover-red-beam"
                    >
                      <Plus className="size-6" />
                      <span className="text-sm">{t('Add shot')}</span>
                    </button>
                  )}
                  {sceneShots.map((shot, shotIdx) => {
                    const panel = panelOf(shot)
                    const job = jobOf(shot.shotId)
                    return (
                      <article
                        key={shot.shotId}
                        role="button"
                        tabIndex={0}
                        onClickCapture={(event) => {
                          if (
                            mentionCardOnModifierClick(event, 'shot', shot.shotId)
                          ) {
                            event.preventDefault()
                            event.stopPropagation()
                          }
                        }}
                        onClick={(event) => {
                          if (event.ctrlKey || event.metaKey) return
                          openDetail(shot.shotId)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openDetail(shot.shotId)
                          }
                        }}
                        className="group cursor-pointer rounded-xl border bg-card p-2.5 transition-colors duration-100 hover:bg-accent/40 hover-red-beam focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50"
                      >
                        {/* 그림은 카드에 '담긴' 사각형이다(#card-inset 2026-08-11) — 카드 모서리에
                            물려 깎이지 않게 여백을 두르고, 그림 자체엔 라운드를 주지 않는다.
                            sizeToImage(#fit-tight): 상자가 그림 비율을 따라가 좌우 띠 없이 전부 보인다. */}
                        {panel?.url && job?.status !== 'generating' ? (
                          // #p1-quickwin W3: 첫 진입 시 전 카드 1회 순환 후 hover 전용.
                          //   W4: 카드 위 재생성 칩 제거 — 재생성은 카드 팝업·채팅으로 일원화.
                          <RoughFrameCycle
                            panel={panel}
                            alt={`${shot.shotId} rough storyboard`}
                            introPlay
                            sizeToImage
                          />
                        ) : (
                        <div className="relative aspect-video overflow-hidden bg-muted">
                          {job?.status === 'generating' ? (
                            <div className="absolute inset-0" aria-busy="true">
                              <div className="size-full animate-pulse bg-muted-foreground/10" />
                              <Loader2 className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                            </div>
                          ) : job?.status === 'failed' ? (
                            <div className="flex size-full flex-col items-center justify-center gap-2 p-4">
                              <AlertCircle className="size-5 text-destructive" />
                              <p className="line-clamp-2 text-center text-xs text-destructive">
                                {job.error ?? t('Generation failed')}
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
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
                              <ImageIcon className="size-8 text-muted-foreground" />
                              {/* #5: 정보(액션) 없으면 생성 불가 — 카드 클릭해 스토리부터 입력하게 유도. */}
                              {shotHasInfo(shot.actionDescription) ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="hover-red-beam"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    // 사람의 명시적 클릭 → force(give-up 게이트 통과).
                                    void generate([shot.shotId], true)
                                  }}
                                >
                                  {t('Generate panel')}
                                </Button>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  {t('Enter a story (action) to enable generation')}
                                </p>
                              )}
                            </div>
                          )}
                          <GeneratingOverlay
                            active={job?.status === 'generating'}
                            label={t('Generating rough storyboard')}
                            beamColor="success"
                          />
                        </div>
                        )}

                        <div className="space-y-2 px-1 pb-0.5 pt-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              Scene {sceneIdx + 1} · Shot {globalShotNo.get(shot.shotId) ?? shotIdx + 1}
                            </span>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="cursor-help text-xs">
                                    {shot.shotType}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t(SHOT_TYPE_DESCRIPTIONS[shot.shotType] ?? shot.shotType)}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                              {shot.durationSeconds}s
                            </span>
                          </div>
                          {/* 전문 표시(#zoom-desc) — 잘라내지 않는다. 축소 시 폰트가 함께 줄어든다. */}
                          <p className="leading-relaxed" style={{ fontSize: descFontSize }}>
                            {resolveEntityNames(shot.actionDescription, entityNames)}
                          </p>
                          {/* #8: 대사 표시 제거 — 파이프라인이 대사 슬롯에 상황 요약을 채워 실제 대사가 아님(2026-07-09). */}
                          {/* #adherence P2: START↔설명 불일치 배지 — 팝업의 "저장 후 재생성"으로 유도. */}
                          {shot.roughStoryboard?.adherence?.status === 'mismatch' ? (
                            <p
                              className="flex items-center gap-1 text-xs text-warning"
                              title={shot.roughStoryboard.adherence.reason ?? undefined}
                            >
                              <AlertCircle className="size-3.5 shrink-0" />
                              {t('The image may not match the description — click the card to try regenerating')}
                            </p>
                          ) : null}
                        </div>
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
    </div>
  )
}
