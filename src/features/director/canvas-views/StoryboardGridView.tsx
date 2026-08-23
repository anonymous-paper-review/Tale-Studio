'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, MapPin, Clock, Pause, Play } from 'lucide-react'

import { cn } from '@/lib/utils'
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
import {
  useActiveGenerationJobs,
  activeShotIds,
  activeStartedAt,
  type ActiveJob,
} from '@/lib/generation-queue'
import { useRoughStoryboard, useShotActionDescription } from '@/features/director/hooks/use-rough-storyboard'
import { RegenerateConfirmDialog } from '@/features/director/regenerate-confirm-dialog'
import { ShotDetailDialog } from '@/features/writer/shot-detail-dialog'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import {
  isMentionModifierClick,
  mentionLabelForModifierClick,
  sceneShotMentionRef,
  sceneShotMentions,
  type CardMention,
  type SceneShotMentionTarget,
} from '@/lib/card-mention'
import {
  isSceneData,
  isShotData,
  isVideoData,
  type DirectorNode,
  type DirectorVideoStatus,
  type ShotNodeData,
} from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'
import { useT } from '@/lib/i18n'

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
  queuedImageShots,
  queuedVideoShots,
  activeJobs,
  descriptionFontSize,
  shotMention,
}: {
  node: DirectorNode
  roster: SlugEntry[]
  mediaMode: StoryboardMediaMode
  /** 카드 제목 앞에 붙는 씬 표기(#e5 2026-08-12) — 예: "Scene 4". 미배정 그룹은 null. */
  sceneLabel: string | null
  /** 지금 큐에 떠 있는 잡의 대상 샷들(#queue-restore) — 탭을 떠났다 와도 진행 표시를 되살린다. */
  queuedImageShots: ReadonlySet<string>
  queuedVideoShots: ReadonlySet<string>
  /** 큐 원본 — 경과시간 durable 기준점(activeStartedAt) 계산용. */
  activeJobs: readonly ActiveJob[]
  descriptionFontSize: string
  shotMention?: CardMention
}) {
  const t = useT()
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  const requestMentionToggle = useChatUiStore((s) => s.requestMentionToggle)
  // 실사 이미지가 없을 때 러프 스토리보드 폴백 표시(#e11) — writer-store 스코프 구독
  const writerShotId = isShotData(node.data) ? node.data.writerShotId : null
  const rough = useRoughStoryboard(writerShotId)
  // 카드 설명문(#e5 2026-08-12) — EN 렌더 프롬프트가 아니라 writer 의 유저 언어 산출
  //   (shots.action_description_native → writer-store actionDescription)을 그대로 쓴다.
  const nativeDescription = useShotActionDescription(writerShotId)
  // 영상 생성(이미지→영상 체인 포함) 진행 플래그 — 버튼 잠금 + 오버레이(#e12)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  // 재생성 확인 팝업(#regen-confirm) / Previz 편집 팝업(#e6)
  const [confirm, setConfirm] = useState<null | 'image' | 'video'>(null)
  const [previzOpen, setPrevizOpen] = useState(false)
  // Grid always projects the newest successful take; Final is an editor/export decision.
  const directorNodes = useDirectorCanvasStore((s) => s.nodes)
  // #real-grid-auto: 일괄 시트 생성 중엔 개별 생성/재생성 잠금 (스토어 가드와 이중 방어).
  //   아래 isShotData early return 보다 위에 있어야 한다 — 훅의 조건부 호출은 렌더 간 훅 순서를
  //   무너뜨린다(rules-of-hooks).
  const realBatchBusy = useDirectorCanvasStore((s) => s.realBatchBusy)
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
          node: n,
        }
        return [record]
      }),
    [directorNodes, node.id],
  )
  // Grid always projects the newest successful take; Final is an editor/export decision.
  const newestSuccessful = selectNewestSuccessfulTake(takeRecords)
  const completedVideoUrl = newestSuccessful?.url ?? null
  const { generating: childVideoGenerating, failure: childVideoFailure } =
    selectGridVideoAttemptState(takeRecords, t)

  if (!isShotData(node.data)) return null
  const data: ShotNodeData = node.data
  const img = data.storyboardImage
  const status = img?.status ?? null
  const hasImage = status === 'completed' && !!img?.url
  const roughUrl = rough?.status === 'completed' ? rough.url : null
  const roughStartUrl = rough?.frames?.start ?? roughUrl
  const prompt = effectivePrompt(data)

  // 파이프라인 단계 배지(#e2 2026-07-18) — 이 샷이 어느 단계인지 한눈에: 영상 / 이미지 / Previz.
  //   색으로도 구분: 영상=빨강(primary), 이미지=하늘, 미생성=경고.
  //   2026-08-11: 라벨에서 "단계"를 걷어내고(중복어) 호버 없이 처음부터 문구까지 보이게 했다 —
  //   한눈에 읽으라고 만든 배지가 호버해야 읽히면 배지가 아니라 툴팁이다.
  const stageBadge =
    mediaMode === 'previz'
      ? roughStartUrl
        ? { label: 'Previz', cls: 'border-sky-400/50 text-sky-300', video: false }
        : { label: t('Rough needed'), cls: 'border-warning/50 text-warning', video: false }
      : completedVideoUrl
        ? { label: t('Video'), cls: 'border-primary/50 text-primary', video: true }
        : hasImage
          ? { label: t('Image'), cls: 'border-sky-400/50 text-sky-300', video: false }
          : { label: t('Image needed'), cls: 'border-warning/50 text-warning', video: false }

  const runImage = async () => {
    if (realBatchBusy) {
      setVideoError(t('Batch live-action generation is running — try again after it finishes.'))
      return
    }
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
      setVideoError(t('Batch live-action generation is running — try again after it finishes.'))
      return
    }
    setVideoBusy(true)
    setVideoError(null)
    try {
      if (!hasImage) {
        await generateStoryboardImage(node.id)
        const fresh = useDirectorCanvasStore
          .getState()
          .nodes.find((n) => n.id === node.id)
        const ok =
          fresh &&
          isShotData(fresh.data) &&
          fresh.data.storyboardImage?.status === 'completed'
        if (!ok) return
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
  // 진입 자동 채움 대기(#e6 2026-08-11) — 일괄 러너가 돌기 시작했는데 아직 이 샷의 잡이 큐에
  //   안 앉은 구간. "생성이 필요합니다"를 보여주면 뭔가 해야 할 것 같은 잘못된 신호가 되므로
  //   (곧 자동으로 생성된다) 이 구간도 생성 중으로 취급해 스피너를 돌린다.
  const autoFillPending =
    mediaMode === 'real' && realBatchBusy && !hasImage && status !== 'failed' && !!roughUrl
  const imageGenerating = status === 'generating' || queuedImage || autoFillPending
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
          {
            key: 'previz',
            label: t('Regenerate previz'),
            title: writerShotId
              ? t('Directing arrow editor — the same popup as the writer tab card')
              : t("This node isn't linked to a writer shot"),
            primary: true,
            disabled: !writerShotId,
            onClick: () => setPrevizOpen(true),
          },
        ]
      : [
          {
            key: 'image',
            label: hasImage ? t('Regenerate image') : t('Generate image'),
            title:
              status === 'failed' && img?.errorMessage
                ? img.errorMessage
                : hasImage
                  ? t('Create a new shooting image (replaces the existing one)')
                  : t('Only generates the shooting image'),
            primary: false,
            onClick: () => {
              if (hasImage) setConfirm('image')
              else void runImage()
            },
          },
          {
            key: 'video',
            label: completedVideoUrl ? t('Regenerate video') : t('Generate video'),
            title: t('Generate video — creates the shooting image first if missing, then the video'),
            primary: true,
            onClick: () => {
              if (completedVideoUrl) setConfirm('video')
              else void runVideo()
            },
          },
        ]

  // 3프레임 세트(previz/실사 스트립)는 상자가 그림 비율을 따라간다(#fit-tight) — 띠도 크롭도
  //   없다. 그 외(영상·단일 이미지·플레이스홀더)는 16:9 고정. 배지·오버레이·액션은 이 상자에 앵커.
  //   real 뷰에서 완성 영상이 있으면 영상이 우선(#e3 2026-08-12 회귀 수정 — 지난 개편이 3프레임을
  //   영상 위로 올려, 영상 단계 카드가 스트립 순환으로 보였다). 호버 재생·클릭 일시정지는 HoverPlayVideo.
  const framePanel =
    mediaMode === 'previz' && rough?.frames
      ? rough
      : mediaMode === 'real' && !completedVideoUrl && hasImage && img!.frames
        ? img!
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
    <div
      className="group flex cursor-pointer flex-col rounded-xl border border-border bg-card p-2.5 transition-colors duration-100 hover:bg-accent/40 hover-red-beam"
      onClickCapture={(event) => {
        if (mentionCardOnModifierClick(event)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onDoubleClick={(event) => {
        if (isMentionModifierClick(event)) return
        openPopup(node.id)
      }}
    >
      {/* 그림은 카드에 '담긴' 사각형(#card-inset 2026-08-11). writer 러프 카드와 동일 규칙
          (#card-unify 2026-08-20 오너 지시, #fit-tight): 3프레임 순환은 sizeToImage — 상자가
          그림 비율을 따라가 세로/스퀘어 포맷도 띠·크롭 없이 전부 보인다(같은 프로젝트는 프레임
          비율이 균일해 행 정렬도 유지). 영상·단일 이미지·플레이스홀더·생성 중은 16:9 고정. */}
      <div
        className={cn(
          'relative overflow-hidden',
          !(framePanel && !generating) && 'aspect-video',
        )}
      >
        {framePanel && !generating ? (
          <RoughFrameCycle
            panel={framePanel}
            alt={mediaMode === 'previz' ? `${data.label} (previz)` : data.label}
            introPlay
            sizeToImage
          />
        ) : mediaMode === 'previz' && roughStartUrl ? (
          // 구형 단일 패널 러프(3프레임 이전 데이터) → 대표 프레임 표시
          <GeneratedImage
            src={roughStartUrl}
            alt={`${data.label} (previz)`}
            className="size-full object-cover"
          />
        ) : completedVideoUrl ? (
          // 영상까지 완성된 샷(#e13) — 호버 시에만 재생, 클릭 = 일시정지(#e1).
          <HoverPlayVideo src={completedVideoUrl} label={prettyNodeLabel(data.label)} />
        ) : hasImage ? (
          img!.frames ? (
            // 실사 3프레임(#real-strip) — 러프 보드와 동일한 hover 순환(START→DIRECTING→END).
            <RoughFrameCycle panel={img!} alt={data.label} />
          ) : (
            <GeneratedImage
              src={img!.url}
              alt={data.label}
              className="size-full object-cover"
            />
          )
        ) : status === 'failed' ? (
          // 실패 시 이미지 자리에 로그 표시 (사용자 요청)
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-destructive/10 p-2 text-center">
            <span className="text-[11px] font-medium text-destructive">
              {t('Generation failed')}
            </span>
            {img?.errorMessage && (
              <span className="line-clamp-3 break-all font-mono text-[10px] leading-tight text-destructive/80">
                {img.errorMessage}
              </span>
            )}
          </div>
        ) : mediaMode === 'real' ? (
          // 실사 미생성(#e3 2026-08-12) — previz 를 깔면(흐려도) "뭔가 나왔다/해야 한다"로
          //   읽힌다. 진입 자동 생성이 곧 채울 자리이므로 검은 바탕 + 회전 링으로 "준비 중"만 말한다.
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <span
              aria-hidden
              className="size-8 animate-spin rounded-full border-2 border-white/15 border-t-white/70 motion-reduce:animate-none"
            />
          </div>
        ) : (
          <div className="flex size-full items-center justify-center bg-muted">
            <ImageIcon className="size-8 text-muted-foreground opacity-50" />
          </div>
        )}

        {/* 단계 배지(#e2) — 좌상단 상시 표시(아이콘+문구). 배지를 호버하면 그 아래로 액션 목록이
            펼쳐진다(#e4 2026-08-11) — 우하단 스택에서 이사. 글자만, 폭 통일(w-28).
            생성 중엔 오버레이가 덮으므로 숨긴다. */}
        {!generating && stageBadge && (
          <div className="group/badge absolute left-2 top-2 z-10">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-md border bg-background/85 px-1.5 py-1 text-[10px] font-medium',
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
            {/* 액션 목록(#e1 2026-08-12) — absolute 라 자리를 차지하지 않는다: 리스트가 투명한
                동안(pointer-events-none) 그 영역 호버는 통과되므로 **배지 위에서만** 열린다.
                열린 뒤에는 pt-1 브리지가 배지→리스트 이동 중 호버 이탈을 막는다. w-24 로 축소. */}
            <div className="pointer-events-none absolute left-0 top-full flex w-24 flex-col gap-1 pt-1 opacity-0 transition-opacity duration-150 focus-within:pointer-events-auto focus-within:opacity-100 group-hover/badge:pointer-events-auto group-hover/badge:opacity-100">
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
                    'h-6 w-full rounded-md px-2 text-left text-[11px] font-medium shadow-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-50',
                    a.primary
                      ? 'bg-primary text-primary-foreground hover:bg-primary/85'
                      : 'bg-background/90 text-foreground backdrop-blur hover:bg-accent',
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 생성 중 — border beam + 경과시간 오버레이. 색 구분(#e13): 이미지=초록, 영상=빨강.
            동시 진행이면 라벨·빔 모두 이미지(선행 단계) 우선 — 표기 불일치 방지.
            startedAt: 큐의 submitted_at(#elapsed-durable 2026-08-11) — 탭 왕복에도 타이머가
            리셋되지 않는다(없으면 mount 시점 폴백). */}
        <GeneratingOverlay
          active={generating}
          label={
            imageWaitingOnly ? t('Waiting to generate image') : imageGenerating ? t('Generating image') : t('Generating video')
          }
          showElapsed={!imageWaitingOnly}
          beamColor={imageGenerating ? 'success' : 'primary'}
          startedAt={
            writerShotId
              ? activeStartedAt(
                  activeJobs,
                  imageGenerating
                    ? ['shot_storyboard', 'storyboard_real_grid']
                    : ['shot_video'],
                  writerShotId,
                )
              : undefined
          }
        />
        {childVideoFailure && (
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

        {/* 액션 스택은 좌상단 배지 아래로 이사(#e4 2026-08-11) — 우하단 스택 제거. */}
      </div>

      {/* 재생성 확인(#regen-confirm) — 최초 생성은 바로, **교체**만 팝업을 거친다. */}
      <RegenerateConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null)
        }}
        title={confirm === 'video' ? t('Regenerate the video?') : t('Regenerate the image?')}
        description={
          confirm === 'video'
            ? t('Creates a new take based on the current shooting image.')
            : t('Generates a new shooting image for this shot.')
        }
        impact={
          confirm === 'video'
            ? [t('Costs money to generate the video.'), t('Adds a new take — the card shows the latest successful one.')]
            : [t('Costs money to generate the image.'), t('Replaces the existing shooting image with the new result.')]
        }
        confirmLabel={t('Regenerate')}
        onConfirm={() => {
          const which = confirm
          setConfirm(null)
          if (which === 'video') void runVideo()
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

      <div className="flex flex-col gap-1 px-1 pb-0.5 pt-2.5">
        <span className="truncate text-sm font-medium text-foreground">
          {sceneLabel ? `${sceneLabel} · ` : ''}
          {prettyNodeLabel(data.label)}
        </span>
        {(nativeDescription || prompt) && (
          <p
            className="line-clamp-2 text-muted-foreground"
            style={{ fontSize: descriptionFontSize }}
          >
            {/* writer 유저 언어 설명 우선(#e5) — 폴백은 프롬프트(슬러그 → @이름 치환, #e6) */}
            {nativeDescription || replaceSlugs(prompt, roster)}
          </p>
        )}
      </div>
    </div>
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
  const sceneShotMentionItems = useMemo(() => {
    const targets = nodes.flatMap((node): SceneShotMentionTarget[] => {
      if (isSceneData(node.data)) {
        return [{ kind: 'scene', id: node.id, label: prettyNodeLabel(node.data.label) }]
      }
      if (isShotData(node.data)) {
        return [{ kind: 'shot', id: node.id, label: prettyNodeLabel(node.data.label) }]
      }
      return []
    })
    return [
      ...sceneShotMentions(targets, 'previz'),
      ...sceneShotMentions(targets, 'real'),
    ]
  }, [nodes])

  // 진행 중 잡 (#queue-restore) — 셀마다 훅을 걸면 폴링은 공유돼도 리렌더가 카드 수만큼 늘어난다.
  //   여기서 한 번 읽어 집합으로 내려보낸다.
  const activeJobs = useActiveGenerationJobs(projectId)
  const queuedImageShots = useMemo(
    () => activeShotIds(activeJobs, ['shot_storyboard', 'storyboard_real_grid']),
    [activeJobs],
  )
  const queuedVideoShots = useMemo(
    () => activeShotIds(activeJobs, ['shot_video']),
    [activeJobs],
  )

  // 진행 중인 산출물이 있으면 해당 Storyboard 화면을 우선 보여준다.
  // 큐가 사라질 때 사용자가 고른 마지막 미디어 모드로 되돌리지 않는다(마지막 탭 기억은 store가 담당).
  const hasQueuedRealWork = activeJobs.some(
    (job) =>
      job.kind === 'storyboard_real_grid' ||
      job.kind === 'shot_storyboard' ||
      job.kind === 'shot_video',
  )
  const hasQueuedPrevizWork = activeJobs.some(
    (job) => job.kind === 'shot_rough_storyboard',
  )
  useEffect(() => {
    if (hasQueuedRealWork && mediaMode !== 'real') setStoryboardMediaMode('real')
    else if (!hasQueuedRealWork && hasQueuedPrevizWork && mediaMode !== 'previz') {
      setStoryboardMediaMode('previz')
    }
  }, [hasQueuedPrevizWork, hasQueuedRealWork, mediaMode, setStoryboardMediaMode])

  // 완료 즉시 반영(#live-refresh) — 페이지 레벨 훅(use-queue-rehydrate)으로 승격돼 Node 뷰와
  //   공유한다(2026-08-12). 여기서 중복 구독하지 않는다.

  const scenes = nodes.filter((n) => isSceneData(n.data))
  const orphanShots = nodes.filter(
    (n) => isShotData(n.data) && !n.data.parentSceneNodeId,
  )

  const groups: SceneGroup[] = scenes
    .filter((scene) => isSceneData(scene.data))
    .map((scene) => {
      const data = scene.data
      return {
        key: scene.id,
        label: isSceneData(data) ? data.label : scene.id,
        location: isSceneData(data) ? data.location : '',
        timeOfDay: isSceneData(data) ? data.timeOfDay : '',
        shots: getChildShots({ nodes }, scene.id),
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
          <ImageIcon className="size-12 text-muted-foreground opacity-50" />
          <p className="text-base font-medium text-foreground">
            {t('No Shots yet')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('Create a Scene and Shot first in the Node view.')}
          </p>
        </div>
      </div>
    )
  }

  const columns = storyboardColumns(zoomLevel)
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
    <div className="flex size-full min-h-0 flex-col bg-background">
      <ScrollArea className="min-h-0 flex-1">
      {/* key=mediaMode: Previz↔Real 전환 시 remount 로 슬라이드 재생(#e2 2026-08-03).
          방향은 토글 순서(Previz 왼쪽·Real 오른쪽) — real 로 갈 땐 오른쪽에서, 되돌아오면 왼쪽에서. */}
      <div
        key={mediaMode}
        tabIndex={0}
        aria-label={t('Storyboard board')}
        onKeyDown={handleBoardKeyDown}
        className={cn(
          'flex flex-col gap-6 p-6',
          'animate-in fade-in-25 duration-500 ease-out motion-reduce:animate-none',
          mediaMode === 'real' ? 'slide-in-from-right-6' : 'slide-in-from-left-6',
        )}
      >
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-3">
              <h2
                className={cn(
                  'text-lg font-medium text-foreground',
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
                {prettyNodeLabel(group.label)}
              </h2>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
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
                className="grid gap-4 p-0.5"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {group.shots.map((shot) => (
                  <ShotCell
                    key={shot.id}
                    node={shot}
                    roster={roster}
                    mediaMode={mediaMode}
                    sceneLabel={group.key === '__orphan__' ? null : prettyNodeLabel(group.label)}
                    queuedImageShots={queuedImageShots}
                    queuedVideoShots={queuedVideoShots}
                    activeJobs={activeJobs}
                    descriptionFontSize={descriptionFontSize}
                    shotMention={mentionFor('shot', shot.id, mediaMode)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
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
