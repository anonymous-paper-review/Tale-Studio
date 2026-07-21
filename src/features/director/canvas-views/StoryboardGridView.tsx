'use client'

import { useMemo, useRef, useState } from 'react'
import { ImageIcon, MapPin, Clock, Pause, Play } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
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
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { useRoughStoryboard } from '@/features/director/hooks/use-rough-storyboard'
import { replaceSlugs, type SlugEntry } from '@/lib/script-lines'
import {
  isSceneData,
  isShotData,
  isVideoData,
  type DirectorNode,
  type DirectorVideoStatus,
  type ShotNodeData,
} from '@/types/director'
import { prettyNodeLabel } from '@/features/director/node-label'

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
export function selectGridVideoAttemptState(takes: GridAttemptRecord[]) {
  const latestAttempt = selectLatestAttempt(takes)
  return {
    latestAttempt,
    generating: latestAttempt?.last_attempt_status === 'generating',
    failure:
      latestAttempt?.last_attempt_status === 'failed'
        ? latestAttempt.last_attempt_error ?? '영상 생성 실패'
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
  const videoRef = useRef<HTMLVideoElement>(null)
  const [pausedLock, setPausedLock] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const play = () =>
    void videoRef.current?.play().then(
      () => setPlaybackError(null),
      (error: unknown) => {
        if (!isExpectedMediaPlayInterruption(error)) {
          setPlaybackError(error instanceof Error ? error.message : '영상 재생에 실패했습니다.')
        }
      },
    )
  const pause = () => videoRef.current?.pause()
  return (
    <button
      type="button"
      aria-label={pausedLock ? `${label} 재생 재개` : `${label} 일시정지`}
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

function ShotCell({ node, roster }: { node: DirectorNode; roster: SlugEntry[] }) {
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)
  // 실사 이미지가 없을 때 러프 스토리보드 폴백 표시(#e11) — writer-store 스코프 구독
  const writerShotId = isShotData(node.data) ? node.data.writerShotId : null
  const rough = useRoughStoryboard(writerShotId)
  // 영상 생성(이미지→영상 체인 포함) 진행 플래그 — 버튼 잠금 + 오버레이(#e12)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  // Grid always projects the newest successful take; Final is an editor/export decision.
  const directorNodes = useDirectorCanvasStore((s) => s.nodes)
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
    selectGridVideoAttemptState(takeRecords)

  if (!isShotData(node.data)) return null
  const data: ShotNodeData = node.data
  const img = data.storyboardImage
  const status = img?.status ?? null
  const hasImage = status === 'completed' && !!img?.url
  const roughUrl = rough?.status === 'completed' ? rough.url : null
  const prompt = effectivePrompt(data)

  const runImage = async () => {
    try {
      await generateStoryboardImage(node.id)
    } catch (error) {
      setVideoError(error instanceof Error ? error.message : '이미지 생성에 실패했습니다.')
    }
  }
  // 영상 생성(#e12): 이미지가 없으면 먼저 생성하고, 성공했을 때만 영상으로 이어간다.
  const runVideo = async () => {
    if (videoBusy) return
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
      setVideoError(error instanceof Error ? error.message : '영상 생성에 실패했습니다.')
    } finally {
      setVideoBusy(false)
    }
  }

  const imageGenerating = status === 'generating'
  const generating = imageGenerating || videoBusy || childVideoGenerating

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card"
      onDoubleClick={() => openPopup(node.id)}
    >
      <div className="relative aspect-video bg-muted">
        {completedVideoUrl ? (
          // 영상까지 완성된 샷(#e13) — 호버 시에만 재생, 클릭 = 일시정지(#e1).
          <HoverPlayVideo src={completedVideoUrl} label={prettyNodeLabel(data.label)} />
        ) : hasImage ? (
          <GeneratedImage
            src={img!.url}
            alt={data.label}
            className="size-full object-cover"
          />
        ) : status === 'failed' ? (
          // 실패 시 이미지 자리에 로그 표시 (사용자 요청)
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-destructive/10 p-2 text-center">
            <span className="text-[11px] font-medium text-destructive">
              생성 실패
            </span>
            {img?.errorMessage && (
              <span className="line-clamp-3 break-all font-mono text-[10px] leading-tight text-destructive/80">
                {img.errorMessage}
              </span>
            )}
          </div>
        ) : roughUrl ? (
          // 실사 이미지 미생성 → 러프 스토리보드 표시 + 좌상단 안내 배지(#e11)
          <>
            <GeneratedImage
              src={roughUrl}
              alt={`${data.label} (rough)`}
              className="size-full object-cover"
            />
            <span className="absolute left-2 top-2 rounded-md border border-warning/50 bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-warning">
              이미지 생성 필요
            </span>
          </>
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground opacity-50" />
          </div>
        )}

        <GeneratingOverlay
          active={generating}
          label={imageGenerating ? '이미지 생성 중' : '영상 생성 중'}
          beamColor={imageGenerating ? 'success' : 'primary'}
        />
        {childVideoFailure && (
          <span
            title={childVideoFailure}
            className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded bg-destructive/90 px-1.5 py-0.5 text-[10px] text-destructive-foreground"
          >
            최신 영상 시도 실패
          </span>
        )}
        {videoError && (
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-destructive/90 px-1.5 py-0.5 text-xs text-destructive-foreground">
            {videoError}
          </span>
        )}

        {/* 우하단 생성 스택(#e12→#e6 2026-07-15) — 기본 버튼 = 영상 생성(이미지 없으면
            이미지→영상 체인). 호버 시 같은 너비의 슬라이딩 카드(살짝 밝은 빨강)가
            버튼 위로 올라온다. 생성 중엔 숨김. */}
        {!generating && (
          <div className="group/gen absolute bottom-2 right-2">
            <div className="relative flex w-28 flex-col items-stretch">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void runImage()
                }}
                title={
                  status === 'failed' && img?.errorMessage
                    ? img.errorMessage
                    : hasImage
                      ? '이미지 리터칭 (재생성)'
                      : '이미지만 생성'
                }
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-full mb-1 flex h-7 translate-y-2 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-medium text-primary-foreground opacity-0 shadow-sm transition-all duration-200',
                  // 살짝 밝은 빨강 — primary에 흰색 18% 혼합(토큰 파생 셰이드)
                  'bg-[color-mix(in_srgb,var(--primary)_82%,white)]',
                  'group-hover/gen:pointer-events-auto group-hover/gen:translate-y-0 group-hover/gen:opacity-100',
                  'hover:bg-[color-mix(in_srgb,var(--primary)_70%,white)]',
                )}
              >
                <ImageIcon className="size-3.5" />
                {hasImage ? '이미지 리터칭' : '이미지 생성'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void runVideo()
                }}
                title="영상 생성 — 촬영 이미지가 없으면 먼저 생성한 뒤 영상을 만들어요"
                className={cn(
                  'flex h-7 w-full items-center justify-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground shadow-sm',
                  'transition-colors duration-100 hover:bg-primary/85',
                )}
              >
                <Play className="size-3.5 fill-current" />
                영상 생성
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium text-foreground">
          {prettyNodeLabel(data.label)}
        </span>
        {prompt && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {/* 프롬프트 속 char_2·location_2 등 슬러그 → @실제 이름 (표시 전용, #e6) */}
            {replaceSlugs(prompt, roster)}
          </p>
        )}
      </div>
    </div>
  )
}

export function StoryboardGridView() {
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const projectId = useDirectorCanvasStore((s) => s.projectId)

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
      label: '(미배정)',
      location: '',
      timeOfDay: '',
      shots: orphanShots,
    })
  }

  const totalShots = nodes.filter((n) => isShotData(n.data)).length

  if (totalShots === 0) {
    return (
      <div className="flex size-full items-center justify-center overflow-auto">
        <div className="flex flex-col items-center gap-2 text-center">
          <ImageIcon className="size-12 text-muted-foreground opacity-50" />
          <p className="text-base font-medium text-foreground">
            아직 Shot이 없어요
          </p>
          <p className="text-sm text-muted-foreground">
            Node 뷰에서 Scene과 Shot을 먼저 만들어 보세요.
          </p>
        </div>
      </div>
    )
  }

  return (
    // Artist/Editor와 동일한 디자인 룰 — shadcn ScrollArea(스타일된 스크롤바).
    // 기존 raw overflow-auto(네이티브 스크롤바)를 교체. 부모 `min-h-0 flex-1`가 높이를 가둔다.
    <ScrollArea className="size-full bg-background">
      <div className="flex flex-col gap-6 p-6">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-medium text-foreground">
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
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {group.shots.map((shot) => (
                  <ShotCell key={shot.id} node={shot} roster={roster} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                이 Scene에는 Shot이 없어요.
              </p>
            )}
          </section>
        ))}
      </div>
    </ScrollArea>
  )
}
