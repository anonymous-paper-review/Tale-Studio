'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, MapPin, Clock, Maximize2, Pause, Play } from 'lucide-react'

import { cn } from '@/lib/utils'
import { mediaFrameStyle } from '@/lib/project-aspect'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { toast } from 'sonner'
import { refreshGenerationQueue } from '@/lib/generation-queue'
import { notifyIfQuotaExceeded } from '@/lib/generation-quota-toast'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  GeneratedImage,
  GeneratingOverlay,
  applyStoryboardZoomShortcut,
  storyboardColumns,
  storyboardDescriptionFontSize,
} from '@/components/generating-frame'
import { RoughFrameCycle } from '@/components/rough-frame-cycle'
import {
  selectLatestAttempt,
  selectNewestSuccessfulTake,
  type VideoTakeSelectionRecord,
} from '@/lib/director-video-take-selection'
import {
  getChildShots,
  effectivePrompt,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { useActiveGenerationJobs, activeShotIds, useGenerationQueueStatus, type GenerationQueueStatus } from '@/lib/generation-queue'
import { checkStoryboardImageStatus, storyboardImageGenerationState } from '@/features/director/hooks/use-storyboard-image-generation'
import { useRoughStoryboard, useShotActionDescription } from '@/features/director/hooks/use-rough-storyboard'
import { ShotDetailDialog } from '@/features/writer/shot-detail-dialog'
import { classifyRoughChanged } from '@/lib/image-provenance'
import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import {
  isMentionModifierClick,
  mentionLabelForModifierClick,
  sceneShotMentionRef,
  sceneShotMentions,
  type CardMention,
} from '@/lib/card-mention'
import {
  isSceneData,
  isShotData,
  isVideoData,
  type DirectorNode,
  type DirectorVideoStatus,
  type ShotNodeData,
} from '@/types/director'
import { directorMentionTargets, directorNodeLabel, sortByBoard } from '@/features/director/node-label'
import { useBoardNodeNames } from '@/features/director/hooks/use-board-node-names'
import { useT } from '@/lib/i18n'
import { Lumi } from '@/components/lumi/lumi'
import { STAGE_PERSONA } from '@/lib/lumi'
import { useWriterStore } from '@/stores/writer-store'
import { filterShotsByStatus, imageRemakeFailed, shotStateTone, type DirectorShotState } from '@/lib/director/shot-state'
import { RemakeRetryButton } from '@/features/director/remake-retry-button'
import { useDirectorShotStates } from '@/features/director/hooks/use-shot-states'
import { ImageFailedPanel, ImageNeededTag, PickBox, ShotPipelineRow, ShotStateTail } from '@/features/director/shot-status'

type SceneGroup = {
  key: string
  label: string
  location: string
  timeOfDay: string
  shots: DirectorNode[]
}
export type GridAttemptRecord = VideoTakeSelectionRecord & {
  last_attempt_status: DirectorVideoStatus | null
  last_attempt_error: string | null
}
type GridVideoTakeRecord = GridAttemptRecord & {
  last_attempt_status: DirectorVideoStatus | null
  /** 화면에서 멈춘 때(오너 2026-11-14 7번) — 멈춘 Take 는 ★ 가 아니면 만드는 중도 카드 영상도 아니다. */
  cancelled_at: string | null
  node: DirectorNode
  url: string | null
  status: DirectorVideoStatus
  is_final: boolean
  take_number: number
  created_at: string | null
  last_attempt_at: string | null
  last_attempt_error: string | null
}
// t 는 선택적(항등 폴백) — 기존 테스트의 1-인자 호출을 보존하고, 폴백 경로는 last_attempt_error
//   가 이미 채워진 케이스라 실행상 t 를 타지 않는다 (#i18n-s5).
export function selectGridVideoAttemptState(
  takes: GridAttemptRecord[],
  t: ReturnType<typeof useT> = (text) => text,
) {
  const latestAttempt = selectLatestAttempt(takes)
  return {
    latestAttempt,
    generating: latestAttempt?.last_attempt_status === 'generating',
    failure:
      latestAttempt?.last_attempt_status === 'failed'
        ? latestAttempt.last_attempt_error ?? t('Video generation failed')
        : null,
  }
}

/** 카드가 트는 영상 · 만드는 중 · 실패 글 — 화면에서 멈춘 Take 는 만드는 중이 아니고, ★ 가 아니면 카드 영상도 아니다
 *  (샷 상태 shot-state.ts 와 같은 규칙, 오너 2026-11-14 7번 · 리드 S4-2 1). 약속: tests/director/stopped-take.test.ts */
export function gridVideoView<T extends GridVideoTakeRecord>(
  records: readonly T[],
  t: ReturnType<typeof useT> = (text) => text,
): { cardTake: T | null; generating: boolean; failure: string | null } {
  // ★ 로 고른 멈춘 Take 는 영상이다 — 카드 영상 고르기에서만 멈춤을 지운다.
  const cardTake = selectNewestSuccessfulTake(records.map((r) => (r.is_final ? { ...r, cancelled_at: null } : r)))
  const { generating, failure } = selectGridVideoAttemptState(records.filter((r) => r.cancelled_at == null), t)
  return { cardTake, generating, failure }
}

function isExpectedMediaPlayInterruption(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    error.name === 'AbortError'
  ) || (
    error instanceof Error &&
    /play\(\) request was interrupted/i.test(error.message)
  )
}

/** 완료 영상 썸네일(#e1 2026-07-15) — 호버 시에만 재생, 클릭 = 일시정지 잠금(중앙 ⏸ 표시).
 *  다시 클릭하면 잠금 해제 + 재생 재개. 카드 더블클릭(팝업)은 dblclick 이벤트라 그대로 동작. */
function HoverPlayVideo({ src, label }: { src: string; label: string }) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pausedLock, setPausedLock] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const play = () =>
    void videoRef.current?.play().then(
      () => setPlaybackError(null),
      (error: unknown) => {
        if (!isExpectedMediaPlayInterruption(error)) {
          setPlaybackError(error instanceof Error ? error.message : t('Failed to play the video.'))
        }
      },
    )
  const pause = () => videoRef.current?.pause()
  return (
    <button
      type="button"
      aria-label={pausedLock ? t('Resume playing {label}', { label }) : t('Pause {label}', { label })}
      onMouseEnter={() => {
        if (!pausedLock) play()
      }}
      onMouseLeave={() => {
        if (!pausedLock) pause()
      }}
      onClick={(e) => {
        e.stopPropagation()
        setPausedLock((prev) => {
          const next = !prev
          if (next) pause()
          else play()
          return next
        })
      }}
      className="relative block size-full cursor-pointer"
    >
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        className="size-full object-cover"
      />
      {pausedLock && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <Pause className="size-8 fill-white text-white drop-shadow" />
        </span>
      )}
      {playbackError && (
        <span
          role="alert"
          className="pointer-events-none absolute inset-x-1 bottom-1 truncate rounded bg-destructive/90 px-1 py-0.5 text-[10px] text-destructive-foreground"
        >
          {playbackError}
        </span>
      )}
    </button>
  )
}

type StoryboardMediaMode = 'previz' | 'real'

function ShotCell({
  node,
  roster,
  mediaMode,
  sceneLabel,
  shotLabel,
  queuedImageShots,
  queuedVideoShots,
  queueStatus,
  descriptionFontSize,
  shotMention,
  shotState,
  picked,
  pickMode,
}: {
  node: DirectorNode
  roster: SlugEntry[]
  mediaMode: StoryboardMediaMode
  /** 카드 제목 앞에 붙는 씬 표기(#e5 2026-08-12) — 예: "Scene 4". 미배정 그룹은 null. */
  sceneLabel: string | null
  /** 카드 제목의 샷 이름 — 보드와 같은 전체 번호("Shot 8", 오너 2026-11-02 "전체 번호로 통일"). */
  shotLabel: string
  /** 지금 큐에 떠 있는 잡의 대상 샷들(#queue-restore) — 탭을 떠났다 와도 진행 표시를 되살린다. */
  queuedImageShots: ReadonlySet<string>
  queuedVideoShots: ReadonlySet<string>
  queueStatus: GenerationQueueStatus
  /** 큐 원본 — 경과시간 durable 기준점(activeStartedAt) 계산용. */
  descriptionFontSize: string
  shotMention?: CardMention
  /** 샷 상태(시안 R 416:4941) — 실사 보기의 테두리 · 꼬리 · 이미지 → 영상 줄. */
  shotState: DirectorShotState
  /** 고른 샷(시안 D2) — 흰 테두리 · 체크. */
  picked: boolean
  /** 고른 샷이 하나라도 있으면 모든 카드에 고름 상자를 보인다. */
  pickMode: boolean
}) {
  const t = useT()
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  // 카드 몸통 = 고르기(시안 D2 · R). 훅이라 조기 반환보다 앞에 둔다.
  const togglePickedShot = useDirectorCanvasStore((s) => s.togglePickedShot)
  const requestMentionToggle = useChatUiStore((s) => s.requestMentionToggle)
  // 실사 이미지가 없을 때 러프 스토리보드 폴백 표시(#e11) — writer-store 스코프 구독
  const writerShotId = isShotData(node.data) ? node.data.writerShotId : null
  // 그림 대체 글은 카드 제목과 같은 이름("Scene 2 · Shot 8") — 내부 id 를 보이지 않는다(오너 2026-11-02).
  const cardName = sceneLabel ? `${sceneLabel} · ${shotLabel}` : shotLabel
  const rough = useRoughStoryboard(writerShotId)
  // 카드 설명문(#e5 2026-08-12) — EN 렌더 프롬프트가 아니라 writer 의 유저 언어 산출
  //   (shots.action_description_native → writer-store actionDescription)을 그대로 쓴다.
  const nativeDescription = useShotActionDescription(writerShotId)
  // 카드 제목 "씬 1 · 샷 1 · CU · 3초"(시안 D1) — 샷 크기는 Writer 샷 기록에서.
  const shotType = useWriterStore((s) => (writerShotId ? s.shots.find((x) => x.shotId === writerShotId)?.shotType ?? null : null))
  // 영상 생성(이미지→영상 체인 포함) 진행 플래그 — 버튼 잠금 + 오버레이(#e12)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  // 재생성 확인 팝업(#regen-confirm) / Previz 편집 팝업(#e6)
  const [confirm, setConfirm] = useState<null | 'image' | 'video' | 'previz' | 'manual-retry'>(null)
  // #f10(2026-08-26 오너): previz 호버에 '진짜 재생성'이 없었다(연출 화살표 팝업뿐) — 카드에서
  //   writer 러프 재생성을 직접 쏜다. 완료 반영은 writer finalize → 재수화 경로 그대로.
  const cardProjectId = useDirectorCanvasStore((s) => s.projectId)
  const [previzRegenBusy, setPrevizRegenBusy] = useState(false)
  const runPrevizRegen = async () => {
    if (!writerShotId || !cardProjectId || previzRegenBusy) return
    setPrevizRegenBusy(true)
    try {
      const res = await fetch('/api/writer/rough-storyboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: cardProjectId, shotIds: [writerShotId], force: true }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (notifyIfQuotaExceeded(res.status, body)) return
        throw new Error(`HTTP ${res.status}`)
      }
      refreshGenerationQueue() // 다음 폴링 틱을 기다리지 않고 카드 오버레이를 켠다(#f10)
      toast.success(t('Previz regeneration started. This card updates when the new frames land.'))
    } catch (e) {
      toast.error(
        t('Failed to start previz regeneration: {message}', {
          message: e instanceof Error ? e.message : '',
        }),
      )
    } finally {
      setPrevizRegenBusy(false)
    }
  }
  const [previzOpen, setPrevizOpen] = useState(false)
  // Grid always projects the newest successful take; Final is an editor/export decision.
  const directorNodes = useDirectorCanvasStore((s) => s.nodes)
  // #real-grid-auto: 일괄 시트 생성 중엔 개별 생성/재생성 잠금 (스토어 가드와 이중 방어).
  //   아래 isShotData early return 보다 위에 있어야 한다 — 훅의 조건부 호출은 렌더 간 훅 순서를
  //   무너뜨린다(rules-of-hooks).
  const realBatchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)
  const realBatchShotIds = useDirectorCanvasStore((s) => s.realBatchShotIds ?? null)
  // [모두 멈추기] 뒤에는 일괄이 남은 샷을 그리지 않는다 — 기다림 표시도 바로 푼다(리드 검토 c ④d).
  const realBatchCancelled = useDirectorCanvasStore((s) => s.realBatchCancelled ?? false)
  const takeRecords = useMemo(
    () =>
      directorNodes.flatMap((n) => {
        if (!isVideoData(n.data) || n.data.parentShotNodeId !== node.id) {
          return []
        }
        const record: GridVideoTakeRecord = {
          id: n.id,
          take_number: n.data.takeNumber,
          created_at: n.data.createdAt ?? null,
          status: n.data.status,
          url: n.data.videoUrl,
          is_final: n.data.final,
          last_attempt_status: n.data.lastAttemptStatus,
          last_attempt_at: n.data.lastAttemptAt,
          last_attempt_error: n.data.lastAttemptError,
          cancelled_at: n.data.cancelledAt ?? null,
          node: n,
        }
        return [record]
      }),
    [directorNodes, node.id],
  )
  // Grid always projects the newest successful take; Final is an editor/export decision.
  //   화면에서 멈춘 Take 는 ★ 가 아니면 카드 영상도 만드는 중도 아니다(오너 7번 — 멈춘 채 도는 Take 가 [영상 만들기]를 잠그지 않게).
  const { cardTake: newestSuccessful, generating: childVideoGenerating, failure: childVideoFailure } =
    gridVideoView(takeRecords, t)
  const completedVideoUrl = newestSuccessful?.url ?? null

  // 화면 포맷(2026-09-30) — 훅은 조기 반환보다 앞에 둔다(React 훅 순서 규칙).
  const projectFormat = useProjectFormatStore((s) => s.format)
  const gridFrame = mediaFrameStyle(projectFormat)
  if (!isShotData(node.data)) return null
  const data: ShotNodeData = node.data
  const img = data.storyboardImage
  const status = img?.status ?? null
  const hasImage = !!img?.url
  // 다시 만들기가 실패해도 옛 그림이 남는다 — 그림은 그대로 보이고 꼬리가 "다시 만들기 실패" + [다시 만들기](리드 검토 c ①).
  const remakeFailed = imageRemakeFailed(img)
  const roughUrl = rough?.status === 'completed' ? rough.url : null
  const roughStartUrl = rough?.frames?.start ?? roughUrl
  // 약속 I4(2026-09-04): 러프 3장 중 하나라도 바뀌면 실사 카드에 "러프 바뀜" — 자동 재생성은 하지 않는다(오너 I5).
  const roughChanged = mediaMode === 'real' && classifyRoughChanged(rough, img)
  // 약속 I(오너 확정): 그리드에서 이미지를 눌러도 글자를 눌러도 같은 연출 편집 팝업(Writer 것) — writer 샷일 때.
  //   #e6 의 Previz 편집 팝업(previzOpen)이 이미 그 팝업이다 — 같은 상태를 연다.
  // ⤢ 상세(시안 R "⤢ = 상세 열기", 오너 2026-11-14): 실사 보기는 샷 상세 팝업, 러프 보기는 지금 연출(화살표) 편집 창(결정 페이지 추천).
  const openDetail = () => {
    if (mediaMode === 'real') {
      openPopup(node.id)
      return
    }
    if (writerShotId) setPrevizOpen(true)
    else openPopup(node.id)
  }
  const prompt = effectivePrompt(data)

  // 파이프라인 단계 배지(#e2 2026-07-18) — 이 샷이 어느 단계인지 한눈에: 영상 / 이미지 / Previz.
  //   색으로도 구분: 영상=빨강(primary), 이미지=하늘, 미생성=경고.
  //   2026-08-11: 라벨에서 "단계"를 걷어내고(중복어) 호버 없이 처음부터 문구까지 보이게 했다 —
  //   한눈에 읽으라고 만든 배지가 호버해야 읽히면 배지가 아니라 툴팁이다.
  //   v3(2026-11-03): 그림 위 어두운 꼬리표(검정 45%) — 영상은 지금 단계 색 글자, 아직 필요한 것은 경고 색 글자.
  //   실사 보기는 1110 확정(시안 R)부터 주황 "이미지 필요" 태그 · 상태 꼬리가 맡는다 — 배지는 러프 보기에만(리드 검토 c ③).
  const stageBadge =
    mediaMode === 'previz'
      ? roughStartUrl
        ? { label: 'Previz', cls: 'text-foreground', video: false }
        : { label: t('Rough needed'), cls: 'text-warning', video: false }
      : null

  const runImage = async () => {
    if (imageGeneration.disabled) return
    try {
      await generateStoryboardImage(node.id)
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : t('Failed to generate the image.'))
    }
  }
  // 영상 생성(#e12): 이미지가 없으면 먼저 생성하고, 성공했을 때만 영상으로 이어간다.
  const runVideo = async () => {
    if (videoBusy) return
    if (realBatchBusy) {
      setVideoError(t('Batch live-action generation is running. Try again after it finishes.'))
      return
    }
    setVideoBusy(true)
    setVideoError(null)
    try {
      if (!hasImage) {
        await useDirectorCanvasStore.getState().hydrateFreshFromDb().catch(() => {})
        // Director 배선 5: 로컬이 낡았을 수 있다 — DB 를 먼저 다시 읽고, 그래도 없을 때만 이미지를 새로 만든다(승인한 그림 보호).
        const completedNow = () => {
          const fresh = useDirectorCanvasStore.getState().nodes.find((n) => n.id === node.id)
          return !!fresh && isShotData(fresh.data) && fresh.data.storyboardImage?.status === 'completed'
        }
        if (!completedNow()) {
          await generateStoryboardImage(node.id)
          if (!completedNow()) return
        }
      }
      await generateVideoForShot(node.id)
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : t('Failed to generate video.'))
    } finally {
      setVideoBusy(false)
    }
  }

  // 큐가 진행 판정의 바닥이다(#queue-restore 2026-08-11) — 노드의 storyboardImage.status 는
  //   탭 재진입 시 DB 재수화로 덮이므로, 잡이 떠 있으면 그쪽이 맞다.
  const queuedImage = !!writerShotId && queuedImageShots.has(writerShotId)
  const queuedVideo = !!writerShotId && queuedVideoShots.has(writerShotId)
  const imageGeneration = storyboardImageGenerationState({
    image: img,
    queued: queuedImage,
    batchBusy: realBatchBusy,
    queueStatus,
  })
  const manualUncertain = imageGeneration.phase === 'uncertain' && !writerShotId
  // 진입 자동 채움 대기(#e6 2026-08-11) — 일괄 러너가 돌기 시작했는데 아직 이 샷의 잡이 큐에
  //   안 앉은 구간. "생성이 필요합니다"를 보여주면 뭔가 해야 할 것 같은 잘못된 신호가 되므로
  //   (곧 자동으로 생성된다) 이 구간도 생성 중으로 취급해 스피너를 돌린다.
  //   고른 샷만 만드는 일괄(시안 D2)이면 그 샷만 기다림으로 본다.
  const autoFillPending =
    mediaMode === 'real' && realBatchBusy && !realBatchCancelled && !hasImage && status !== 'failed' && !!roughUrl &&
    (realBatchShotIds === null || (!!writerShotId && realBatchShotIds.includes(writerShotId)))
  const imageGenerating = imageGeneration.generating || autoFillPending
  const generating = imageGenerating || videoBusy || childVideoGenerating || queuedVideo
  // 대기 vs 실작업(#e4 2026-08-12) — DB 큐(generation_jobs queued)에 앉았으면 fal 이 실제로
  //   돌리는 중이라 타이머가 의미 있고, 아직 큐에 없으면(일괄 러너가 순번 대기) 시간은
  //   거짓말이다 — 문구만 '대기 중'으로 바꾸고 초는 지운다.
  const imageWaitingOnly = autoFillPending && !queuedImage && status !== 'generating'

  /**
   * 카드 액션 목록 — 단계에 따라 **문구만** 바뀌고 항목 수는 고정이다(#e4 2026-08-11).
   *   이미지 단계 → [이미지 재생성, 영상 생성] · 영상 단계 → [이미지 재생성, 영상 재생성].
   *   이미 있는 것을 갈아치우는 항목만 확인 팝업을 거친다 — 빈칸 채우기는 바로 실행.
   */
  const actions: Array<{
    key: string
    label: string
    title: string
    primary: boolean
    disabled?: boolean
    onClick: () => void
  }> =
    mediaMode === 'previz'
      ? [
          // #f10: 옛 단일 액션은 라벨('재생성')과 실제 동작(화살표 편집 팝업)이 어긋났다 — 분리한다.
          {
            key: 'previz-arrows',
            label: t('Edit directing'),
            title: writerShotId
              ? t('Directing arrow editor, the same popup as the Writer tab card')
              : t("This node isn't linked to a Writer shot"),
            primary: false,
            disabled: !writerShotId,
            onClick: () => setPrevizOpen(true),
          },
          {
            key: 'previz-regen',
            label: t('Regenerate previz'),
            title: writerShotId
              ? t('Redraws this shot\'s rough 3-frame set with the Writer pipeline')
              : t("This node isn't linked to a Writer shot"),
            primary: true,
            disabled: !writerShotId || previzRegenBusy,
            onClick: () => {
              if (rough?.frames) setConfirm('previz')
              else void runPrevizRegen()
            },
          },
        ]
      : [
          {
            key: 'image',
            label: imageGeneration.phase === 'error' ? t('Retry')
              : imageGeneration.label ? t(imageGeneration.label)
                : hasImage ? t('Regenerate image') : t('Generate image'),
            title:
              imageGeneration.phase === 'error'
                ? t('Could not check image generation.')
                : status === 'failed' && img?.errorMessage
                ? img.errorMessage
                : hasImage
                  ? t('Create a new shooting image (the current one stays in the versions)')
                  : t('Only generates the shooting image'),
            primary: false,
            disabled: imageGeneration.disabled && imageGeneration.phase !== 'error',
            onClick: () => {
              if (imageGeneration.phase === 'error') { refreshGenerationQueue(); return }
              if (imageGeneration.disabled) return
              if (hasImage) setConfirm('image')
              else void runImage()
            },
          },
          {
            key: 'video',
            label: completedVideoUrl ? t('Regenerate video') : t('Generate video'),
            title: t('Generate video: creates the shooting image first if missing, then the video'),
            primary: true,
            disabled: generating || realBatchBusy || queueStatus !== 'ready',
            onClick: () => {
              if (completedVideoUrl) setConfirm('video')
              else void runVideo()
            },
          },
        ]

  // 그 밖(영상·단일 이미지·자리표시·생성 중)의 상자는 Producer 포맷의 비율(2026-09-30) — 가로 프로젝트만 종전 16:9.
  // 3프레임 세트(previz/실사 스트립)는 상자가 그림 비율을 따라간다(#fit-tight) — 띠도 크롭도
  //   없다. 배지·오버레이·액션은 이 상자에 앵커.
  //   real 뷰에서 완성 영상이 있으면 영상이 우선(#e3 2026-08-12 회귀 수정 — 지난 개편이 3프레임을
  //   영상 위로 올려, 영상 단계 카드가 스트립 순환으로 보였다). 호버 재생·클릭 일시정지는 HoverPlayVideo.
  const framePanel =
    mediaMode === 'previz' && rough?.frames
      ? rough
      : mediaMode === 'real' && !completedVideoUrl && hasImage && img!.frames
        ? img!
        : null

  // 실사 보기 카드 테두리 = 샷 상태 색(시안 R 416:4941, 오너 2026-11-14 "Director 생성 상태"). 러프 보기는 지금 그대로.
  const realTone = mediaMode === 'real' ? shotStateTone(shotState) : null
  const durationLabel =
    typeof data.durationSeconds === 'number' && data.durationSeconds > 0
      ? t('{seconds}s', { seconds: Math.round(data.durationSeconds) })
      : null

  const mentionCardOnModifierClick = (
    event: Pick<MouseEvent, 'ctrlKey' | 'metaKey'>,
  ): boolean => {
    const label = mentionLabelForModifierClick(event, shotMention)
    if (!label) return false
    requestMentionToggle(label)
    return true
  }

  return (
    <>
    <div
      // v3(2026-11-03): 노드 캔버스와 같은 판(작업 바탕색 · 모서리 16 · 그림자 하나 · 안쪽 12) — 캔버스 판(--canvas-bg) 위에 뜬다.
      className={cn(
        'group flex cursor-pointer flex-col rounded-2xl border-[1.5px] bg-background p-3 shadow-node transition-colors duration-100 hover:bg-card',
        picked ? 'border-foreground' : realTone?.frame ?? 'border-transparent',
      )}
      data-shot-state={mediaMode === 'real' ? shotState : undefined}
      aria-selected={picked}
      // 카드 몸통 = 고르기(시안 D2 · R) — 다시 누르면 푼다. ⤢ 상세 · 고름 상자 · 단추는 저마다 눌림을 멈춘다.
      onClick={(event) => {
        if (isMentionModifierClick(event)) return
        togglePickedShot(node.id)
      }}
      onClickCapture={(event) => {
        if (mentionCardOnModifierClick(event)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onDoubleClick={(event) => {
        if (isMentionModifierClick(event)) return
        openDetail()
      }}
    >
      {/* 그림은 카드에 '담긴' 사각형(#card-inset 2026-08-11). writer 러프 카드와 동일 규칙
          (#card-unify 2026-08-20 오너 지시, #fit-tight): 3프레임 순환은 sizeToImage — 상자가
          그림 비율을 따라가 세로/스퀘어 포맷도 띠·크롭 없이 전부 보인다(같은 프로젝트는 프레임
          비율이 균일해 행 정렬도 유지). 영상·단일 이미지·플레이스홀더·생성 중은 16:9 고정. */}
      <div
        className={cn(
          // v3 S1 그림 칸: 모서리 14, 그림이 없으면 그림 자리 그라데이션.
          'relative overflow-hidden rounded-[14px] bg-art-placeholder',
          // 영상·단일 이미지·자리표시·생성 중 상자는 Producer 포맷의 비율(2026-09-30) — 가로 프로젝트만 종전 16:9.
          !(framePanel && !generating) && !gridFrame && 'aspect-video',
        )}
        style={!(framePanel && !generating) && gridFrame ? gridFrame : undefined}
      >
        {framePanel && !generating ? (
          <RoughFrameCycle
            panel={framePanel}
            alt={mediaMode === 'previz' ? t('{label} (previz)', { label: cardName }) : cardName}
            introPlay
            sizeToImage
          />
        ) : mediaMode === 'previz' && roughStartUrl ? (
          // 구형 단일 패널 러프(3프레임 이전 데이터) → 대표 프레임 표시
          <GeneratedImage
            src={roughStartUrl}
            alt={t('{label} (previz)', { label: cardName })}
            className="size-full object-cover"
          />
        ) : completedVideoUrl ? (
          // 영상까지 완성된 샷(#e13) — 호버 시에만 재생, 클릭 = 일시정지(#e1).
          <HoverPlayVideo src={completedVideoUrl} label={shotLabel} />
        ) : hasImage ? (
          img!.frames ? (
            // 실사 3프레임(#real-strip) — 러프 보드와 동일한 hover 순환(START→DIRECTING→END).
            <RoughFrameCycle panel={img!} alt={cardName} />
          ) : (
            <GeneratedImage
              src={img!.url}
              alt={cardName}
              className="size-full object-cover"
            />
          )
        ) : status === 'failed' ? (
          // 이미지 실패(시안 없음 — 결정 페이지 추천): "이미지를 못 만들었어요" + [다시 만들기]. 원인은 마우스 올림 글로.
          <ImageFailedPanel
            onRetry={() => void runImage()}
            detail={img?.errorMessage}
            disabled={imageGeneration.disabled && imageGeneration.phase !== 'error'}
          />
        ) : mediaMode === 'real' ? (
          generating ? (
            // 카드 안 만드는 중(시안 D3 · R "카드 안 Lumi 로딩") — 도는 원 대신 Lumi(그림) · 할 일 글. 남은 시간 · % 는 쓰지 않는다(오너 8/26).
            //   차례를 기다리는 샷은 "이미지 생성 대기 중", 접수 · 확인 중이면 그 글.
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-side p-3 text-center">
              <Lumi persona={STAGE_PERSONA.director} state="loading" size="s" still />
              <span className="text-[13px] font-semibold text-foreground">
                {imageWaitingOnly
                  ? t('Waiting to generate image')
                  : imageGenerating
                    ? imageGeneration.phase === 'submitting' || imageGeneration.phase === 'uncertain'
                      ? t(imageGeneration.label!)
                      : t('Drawing the image')
                    : t('Making the video')}
              </span>
            </div>
          ) : (
            // 실사 미생성(#real-empty-guidance 2026-08-27 오너): 진입 자동 생성이 꺼진 뒤로
            //   스피너는 "곧 채워진다"는 거짓말이 됐다 — 사용자가 눌러야 생기니 안내 문구로.
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center">
              <ImageIcon className="size-6 text-subtle-foreground" />
              <span className="text-[11.5px] font-medium text-muted-foreground">
                {t('Make a real image.')}
              </span>
            </div>
          )
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-8 text-subtle-foreground" />
          </div>
        )}

        {/* 단계 배지(#e2) — 좌상단 상시 표시(아이콘+문구). 배지를 호버하면 그 아래로 액션 목록이
            펼쳐진다(#e4 2026-08-11) — 우하단 스택에서 이사. 글자만, 폭 통일(w-28).
            생성 중엔 오버레이가 덮으므로 숨긴다. */}
        {/* 고름 상자(시안 D2) — 고른 샷이 있거나 마우스를 올리면 보인다. */}
        <PickBox
          picked={picked}
          onToggle={() => togglePickedShot(node.id)}
          className={cn('absolute left-2 top-2 z-20', !picked && !pickMode && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        />
        {/* ⤢ 상세(시안 R "⤢ = 상세 열기") */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            openDetail()
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label={t('Open details')}
          className="absolute right-2 top-2 z-20 inline-flex items-center gap-1 rounded-[6px] bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-black/65"
        >
          <Maximize2 className="size-3" />
          {t('Details')}
        </button>

        {/* 실사 보기: 이미지가 필요한 샷만 주황 태그(시안 R). 만드는 일은 위쪽 단추 · 상세가 맡는다(카드 위 숨은 단추 없앰). */}
        {mediaMode === 'real' && !generating && (shotState === 'image_needed' || roughChanged) && (
          <div className="absolute left-10 top-2 z-10 flex items-center gap-1">
            {shotState === 'image_needed' && <ImageNeededTag />}
            {roughChanged && (
              <span className="inline-flex items-center rounded-[6px] bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                {t('Rough changed')}
              </span>
            )}
          </div>
        )}
        {mediaMode === 'previz' && !generating && stageBadge && (
          <div className="group/badge absolute left-10 top-2 z-10">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-[6px] bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold',
                stageBadge.cls,
              )}
            >
              {stageBadge.video ? (
                <Play className="size-3 shrink-0 fill-current" />
              ) : (
                <ImageIcon className="size-3 shrink-0" />
              )}
              <span className="whitespace-nowrap">{stageBadge.label}</span>
            </span>
            {roughChanged && (
              <span className="ml-1 inline-flex items-center rounded-[6px] bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                {t('Rough changed')}
              </span>
            )}
            {/* 액션 목록(#e1 2026-08-12) — absolute 라 자리를 차지하지 않는다: 리스트가 투명한
                동안(pointer-events-none) 그 영역 호버는 통과되므로 **배지 위에서만** 열린다.
                열린 뒤에는 pt-1 브리지가 배지→리스트 이동 중 호버 이탈을 막는다. w-24 로 축소. */}
            <div className="pointer-events-none absolute left-0 top-full flex w-28 flex-col gap-1 pt-1 opacity-0 transition-opacity duration-150 focus-within:pointer-events-auto focus-within:opacity-100 group-hover/badge:pointer-events-auto group-hover/badge:opacity-100">
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  disabled={a.disabled}
                  title={a.title}
                  onClick={(e) => {
                    e.stopPropagation()
                    a.onClick()
                  }}
                  className={cn(
                    'h-7 w-full rounded-full px-3 text-left text-[11.5px] font-semibold shadow-node transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50',
                    a.primary
                      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
                      : 'bg-card text-foreground hover:bg-accent',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 생성 중 — border beam 오버레이. 색 구분(#e13): 이미지=초록, 영상=빨강.
            동시 진행이면 라벨·빔 모두 이미지(선행 단계) 우선 — 표기 불일치 방지.
            경과 초는 표시하지 않는다(오너 결정 2026-08-26) — 스피너와 라벨만. */}
        <GeneratingOverlay
          active={generating && mediaMode !== 'real'}
          label={
            imageWaitingOnly
              ? t('Waiting to generate image')
              : imageGenerating
                ? imageGeneration.phase === 'submitting' || imageGeneration.phase === 'uncertain'
                  ? t(imageGeneration.label!)
                  : mediaMode === 'previz'
                    ? t('Regenerating previz')
                    : t('Generating image')
                : t('Generating video')
          }
          beamColor={imageGenerating ? 'success' : 'primary'}
        />
        {imageGeneration.phase === 'uncertain' && (
          <button
            type="button"
            className="absolute right-2 top-2 z-20 rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground shadow-node hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={manualUncertain && realBatchBusy}
            onClick={(event) => {
              event.stopPropagation()
              if (manualUncertain) setConfirm('manual-retry')
              else checkStoryboardImageStatus()
            }}
          >
            {manualUncertain ? t('Generate again') : t('Check image status')}
          </button>
        )}
        {mediaMode === 'previz' && childVideoFailure && (
          <span
            title={childVideoFailure}
            className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] text-destructive-foreground"
          >
            {t('Latest video attempt failed')}
          </span>
        )}
        {videoError && (
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-destructive/90 px-1.5 py-0.5 text-xs text-destructive-foreground">
            {videoError}
          </span>
        )}

        {/* 꼬리(시안 D1 "● 대기" · D3 "● 이미지 만드는 중") — 실사 보기. 일괄이 맡아 차례를 기다리면 "대기 중",
            다시 만들기가 실패했으면 "다시 만들기 실패" + [다시 만들기](리드 검토 c ① · ④d). */}
        {mediaMode === 'real' && !videoError && (
          <ShotStateTail
            state={shotState}
            waiting={imageWaitingOnly}
            remakeFailed={remakeFailed}
            retry={<RemakeRetryButton nodeId={node.id} data={data} />}
            className="absolute bottom-2 left-2 z-10"
          />
        )}

        {/* 액션 스택은 좌상단 배지 아래로 이사(#e4 2026-08-11) — 우하단 스택 제거. */}
      </div>

      {/* "● 이미지 → ● 영상" 줄(시안 D1 · D3) — 실사 보기 */}
      {mediaMode === 'real' && <ShotPipelineRow state={shotState} className="mt-2.5" />}

      {/* 재생성 확인(#regen-confirm) — 최초 생성은 바로, **교체**만 팝업을 거친다. */}
      <RegenerateConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null)
        }}
        title={
          confirm === 'video'
            ? t('Regenerate the video?')
            : confirm === 'previz'
              ? t('Regenerate the previz?')
              : t('Regenerate the image?')
        }
        description={
          confirm === 'manual-retry'
            ? t('The previous request may still be running. Generating again sends a new request.')
            : confirm === 'video'
            ? t('Creates a new take based on the current shooting image.')
            : confirm === 'previz'
              ? t('Redraws this shot\'s rough 3-frame set (start/directing/end).')
              : t('Generates a new shooting image for this shot.')
        }
        impact={
          confirm === 'manual-retry' ? [] : confirm === 'video'
            ? [t('Costs money to generate the video.'), t('Adds a new take. The card shows the latest successful one.')]
            : confirm === 'previz'
              ? [t('Costs money to generate the previz.'), t('Replaces the existing rough frames with the new result.')]
              // 다시 만들어도 지금 이미지는 버전으로 남는다(오너 답 5번 · prose 상세 단추와 같은 말).
              : [t('The new image becomes the current one. The current image stays in the versions.')]
        }
        confirmLabel={confirm === 'manual-retry' ? t('Generate again') : t('Regenerate')}
        busy={confirm === 'manual-retry' ? !manualUncertain || realBatchBusy : confirm === 'image' && imageGeneration.disabled}
        onConfirm={() => {
          const which = confirm
          setConfirm(null)
          if (which === 'manual-retry') void useDirectorCanvasStore.getState().retryUnconfirmedManualStoryboardImage(node.id)
          else if (which === 'video') void runVideo()
          else if (which === 'previz') void runPrevizRegen()
          else void runImage()
        }}
      />

      {/* Previz 재생성(#e6) — writer 탭 카드와 **같은 팝업**(연출 화살표 편집기)을 띄운다.
          같은 대상(러프 3프레임)을 두 탭에서 다른 도구로 고치게 두면 결과가 갈린다. */}
      <ShotDetailDialog
        shotId={previzOpen ? writerShotId : null}
        panel={rough}
        onOpenChange={setPrevizOpen}
      />

      {/* #f9(2026-08-26 오너): 글자(캡션) 원클릭 = 편집 팝업 — 더블클릭을 몰라도 수정 진입. */}
      <div className="flex flex-col gap-1 rounded-lg px-1 pb-0.5 pt-2.5">
        <span className="truncate text-label font-semibold text-foreground">
          {sceneLabel ? `${sceneLabel} · ` : ''}
          {shotLabel}
          {shotType ? ` · ${shotType}` : ''}
          {durationLabel ? ` · ${durationLabel}` : ''}
        </span>
        {(nativeDescription || prompt) && (
          <p
            className="line-clamp-2 text-muted-foreground"
            style={{ fontSize: descriptionFontSize }}
          >
            {/* writer 유저 언어 설명 우선(#e5) — 폴백은 프롬프트(슬러그 → @이름 치환, #e6) */}
            {nativeDescription ? replaceSlugs(nativeDescription, roster, '') : replaceSlugs(prompt, roster)}
          </p>
        )}
      </div>
    </div>
    </>
  )
}

// #real-grid 일괄 생성 UI 는 별도 바 대신 상단 팔레트의 기존 "스토리보드 생성" 버튼으로 통합
//   (2026-08-06 피드백) — 그 버튼이 runRealBatch(4샷 시트 일괄)를 호출한다.

export function StoryboardGridView({
  zoomLevel,
  onZoomLevelChange,
}: {
  zoomLevel: number
  onZoomLevelChange: React.Dispatch<React.SetStateAction<number>>
}) {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const requestMentionToggle = useChatUiStore((s) => s.requestMentionToggle)
  // 미디어 모드: Previz(러프 3프레임 보드, 기본) | Real(실사) — 상단바(PaletteBar) 토글이 제어(2026-07-22).
  const mediaMode: StoryboardMediaMode = useDirectorCanvasStore((s) => s.storyboardMediaMode)
  const setStoryboardMediaMode = useDirectorCanvasStore((s) => s.setStoryboardMediaMode)

  // 슬러그 → 실제 이름 로스터(#e6) — asset-storage(진입 시 DB hydrate)에서 인물·장소 이름.
  //   표시 전용: 노드 데이터·프롬프트 원문(구동)은 그대로 둔다.
  const registeredCharacters = useAssetStorageStore((s) => s.characters)
  const registeredWorlds = useAssetStorageStore((s) => s.worlds)
  const roster = useMemo<SlugEntry[]>(
    () => [
      ...Object.values(registeredCharacters)
        .filter((c) => c.projectId === projectId)
        .map((c) => ({ slug: c.id, name: c.name })),
      ...Object.values(registeredWorlds)
        .filter((w) => w.projectId === projectId)
        .map((w) => ({ slug: w.id, name: w.name })),
    ],
    [registeredCharacters, registeredWorlds, projectId],
  )
  // 씬 · 샷 이름과 늘어놓는 순서는 보드와 같다(오너 2026-11-02 "전체 번호로 통일") — 끼워 넣은 샷도 보드 자리에 선다.
  const boardNames = useBoardNodeNames()
  const sceneShotMentionItems = useMemo(() => {
    const targets = directorMentionTargets(nodes, boardNames)
    return [
      ...sceneShotMentions(targets, 'previz'),
      ...sceneShotMentions(targets, 'real'),
    ]
  }, [nodes, boardNames])

  // 진행 중 잡 (#queue-restore) — 셀마다 훅을 걸면 폴링은 공유돼도 리렌더가 카드 수만큼 늘어난다.
  //   여기서 한 번 읽어 집합으로 내려보낸다.
  const activeJobs = useActiveGenerationJobs(projectId)
  const queueStatus = useGenerationQueueStatus(projectId)
  // #f10: 러프 재생성 잡이 활성 목록에서 빠지는 순간(=완료/실패) 캔버스를 재수화해 새 프레임을
  //   바로 반영한다 — 종전엔 탭을 떠났다 와야 보였다. 마운트 첫 렌더(prev 빈 집합)는 발화 없음.
  const activeRoughShots = useMemo(
    () => activeShotIds(activeJobs, ['shot_rough_storyboard']),
    [activeJobs],
  )
  const prevRoughRef = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const prev = prevRoughRef.current
    prevRoughRef.current = activeRoughShots
    let finished = false
    for (const id of prev) {
      if (!activeRoughShots.has(id)) {
        finished = true
        break
      }
    }
    if (finished && projectId) {
      void useDirectorCanvasStore.getState().hydrateFromDb(projectId).catch(() => {})
    }
  }, [activeRoughShots, projectId])
  const queuedImageShots = useMemo(
    // #f10(2026-08-27 오너): previz 모드에선 러프 재생성 잡도 "생성 중"의 근거다 — 큐 진실이라
    //   탭을 떠났다 와도 오버레이가 복원되고, 문구가 없어 재생성을 또 누르던 문제가 사라진다.
    () =>
      activeShotIds(
        activeJobs,
        mediaMode === 'previz'
          ? ['shot_storyboard', 'storyboard_real_grid', 'shot_rough_storyboard']
          : ['shot_storyboard', 'storyboard_real_grid'],
      ),
    [activeJobs, mediaMode],
  )
  const queuedVideoShots = useMemo(
    () => activeShotIds(activeJobs, ['shot_video']),
    [activeJobs],
  )
  const shotStates = useDirectorShotStates()
  const statusFilter = useDirectorCanvasStore((s) => s.statusFilter)
  const pickedShotIds = useDirectorCanvasStore((s) => s.pickedShotIds)

  // 진행 중인 작업을 보고 Previz/Real 을 대신 바꾸던 effect 를 제거했다
  //   (#view-not-forced 2026-09-08 오너 판정). 진입 시 한 번이 아니라 작업이 도는 내내
  //   되돌려서, 사용자가 Previz 를 눌러도 다음 렌더에 Real 로 다시 튕겼다.
  //   같은 판정으로 store 의 restoreActiveGenerationView 도 함께 없앴다 —
  //   탭·미디어 모드는 사용자가 고르고, 진행 표시는 카드 스피너·배지가 담당한다.

  // 완료 즉시 반영(#live-refresh) — 페이지 레벨 훅(use-queue-rehydrate)으로 승격돼 Node 뷰와
  //   공유한다(2026-08-12). 여기서 중복 구독하지 않는다.

  const scenes = nodes.filter((n) => isSceneData(n.data))
  const orphanShots = nodes.filter(
    (n) => isShotData(n.data) && !n.data.parentSceneNodeId,
  )

  const groups: SceneGroup[] = sortByBoard(scenes, boardNames)
    .filter((scene) => isSceneData(scene.data))
    .map((scene) => {
      const data = scene.data
      return {
        key: scene.id,
        label: isSceneData(data) ? directorNodeLabel(data, boardNames) : scene.id,
        location: isSceneData(data) ? data.location : '',
        timeOfDay: isSceneData(data) ? data.timeOfDay : '',
        shots: sortByBoard(getChildShots({ nodes }, scene.id), boardNames),
      }
    })

  if (orphanShots.length > 0) {
    groups.push({
      key: '__orphan__',
      label: t('(Unassigned)'),
      location: '',
      timeOfDay: '',
      shots: orphanShots,
    })
  }

  const mentionFor = (kind: 'scene' | 'shot', id: string, mode: StoryboardMediaMode) =>
    sceneShotMentionItems.find(
      (item) => item.ref === sceneShotMentionRef(mode, kind, id),
    )

  const totalShots = nodes.filter((n) => isShotData(n.data)).length

  if (totalShots === 0) {
    return (
      <div className="flex size-full items-center justify-center overflow-auto">
        <div className="flex flex-col items-center gap-2 text-center">
          <ImageIcon className="size-12 text-subtle-foreground" />
          <p className="text-body font-semibold text-foreground">
            {t('No Shots yet')}
          </p>
          <p className="text-label text-muted-foreground">
            {t('Create a Scene and Shot first in the Node view.')}
          </p>
        </div>
      </div>
    )
  }

  const columns = storyboardColumns(zoomLevel)
  // 상태 고르기(시안 D1, 오너 2026-11-14): 고른 상태 샷만 보이고 빈 씬 묶음은 숨긴다.
  const visibleGroups =
    statusFilter === 'all'
      ? groups
      : groups
          .map((group) => ({ ...group, shots: filterShotsByStatus(group.shots, shotStates, statusFilter) }))
          .filter((group) => group.shots.length > 0)
  const descriptionFontSize = storyboardDescriptionFontSize(columns)
  const handleBoardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target
    if (
      target instanceof Element &&
      target.closest('input, textarea, select, [contenteditable="true"]')
    ) {
      return
    }
    const next = applyStoryboardZoomShortcut(zoomLevel, event)
    if (next === null) return
    event.preventDefault()
    onZoomLevelChange((current) => applyStoryboardZoomShortcut(current, event) ?? current)
  }

  return (
    // Artist/Editor와 동일한 디자인 룰 — shadcn ScrollArea(스타일된 스크롤바).
    // 기존 raw overflow-auto(네이티브 스크롤바)를 교체. 부모 `min-h-0 flex-1`가 높이를 가둔다.
    <div className="flex size-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
      {/* key=mediaMode: Previz↔Real 전환 시 remount 로 슬라이드 재생(#e2 2026-08-03).
          방향은 토글 순서(Previz 왼쪽·Real 오른쪽) — real 로 갈 땐 오른쪽에서, 되돌아오면 왼쪽에서. */}
      <div
        key={mediaMode}
        tabIndex={0}
        aria-label={t('Storyboard board')}
        onKeyDown={handleBoardKeyDown}
        className={cn(
          'flex flex-col gap-7 px-4 pb-6 pt-3',
          'animate-in fade-in-25 duration-500 ease-out motion-reduce:animate-none',
          mediaMode === 'real' ? 'slide-in-from-right-6' : 'slide-in-from-left-6',
        )}
      >
        {/* 상태를 골랐는데 그 상태 샷이 없으면(시안 없음, 리드 검토 c ④c) — 빈 판만 보이면 고장으로 보인다. */}
        {visibleGroups.length === 0 && statusFilter !== 'all' && (
          <p className="py-16 text-center text-label text-muted-foreground">{t('No shots in this status')}</p>
        )}
        {visibleGroups.map((group) => (
          <section key={group.key} className="flex flex-col gap-3">
            {/* v3 S1 씬 머리: 씬 이름(15px 600) · 흐린 장소 · 시간 */}
            <div className="flex items-baseline gap-2.5">
              <h2
                className={cn(
                  'text-[15px] font-semibold text-foreground',
                  group.key !== '__orphan__' && 'cursor-pointer',
                )}
                onClick={(event) => {
                  if (group.key === '__orphan__' || !isMentionModifierClick(event)) return
                  const label = mentionLabelForModifierClick(
                    event,
                    mentionFor('scene', group.key, mediaMode),
                  )
                  if (!label) return
                  event.preventDefault()
                  event.stopPropagation()
                  requestMentionToggle(label)
                }}
              >
                {group.label}
              </h2>
              <span className="flex items-center gap-3 text-[12.5px] text-subtle-foreground">
                {group.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {/* location_2 등 슬러그 → 실제 장소명 (구조 필드라 플레인, #e6) */}
                    {replaceSlugs(group.location, roster, '')}
                  </span>
                )}
                {group.timeOfDay && (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {group.timeOfDay}
                  </span>
                )}
              </span>
            </div>

            {group.shots.length > 0 ? (
              <div
                className="grid gap-3 p-0.5"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {group.shots.map((shot) => (
                  <ShotCell
                    key={shot.id}
                    node={shot}
                    roster={roster}
                    mediaMode={mediaMode}
                    sceneLabel={group.key === '__orphan__' ? null : group.label}
                    shotLabel={directorNodeLabel(shot.data, boardNames)}
                    queuedImageShots={queuedImageShots}
                    queuedVideoShots={queuedVideoShots}
                    queueStatus={queueStatus}
                    descriptionFontSize={descriptionFontSize}
                    shotMention={mentionFor('shot', shot.id, mediaMode)}
                    shotState={shotStates.get(shot.id) ?? 'image_needed'}
                    picked={pickedShotIds.includes(shot.id)}
                    pickMode={pickedShotIds.length > 0}
                  />
                ))}
              </div>
            ) : (
              <p className="text-meta text-subtle-foreground">
                {t('This Scene has no Shots.')}
              </p>
            )}
          </section>
        ))}
      </div>
      </ScrollArea>
    </div>
  )
}
