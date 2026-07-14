'use client'

import { useMemo, useState } from 'react'
import { ImageIcon, MapPin, Clock, Play } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import {
  getChildShots,
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
  // 완료된 자식 테이크 영상(#e13): final 우선, 없으면 최근 완료분 — 있으면 썸네일을 영상으로.
  //   selector는 문자열/불리언만 반환(참조 안정성).
  const completedVideoUrl = useDirectorCanvasStore((s) => {
    let fallback: string | null = null
    for (const n of s.nodes) {
      if (!isVideoData(n.data) || n.data.parentShotNodeId !== node.id) continue
      if (n.data.status !== 'completed' || !n.data.videoUrl) continue
      if (n.data.final) return n.data.videoUrl
      fallback = n.data.videoUrl
    }
    return fallback
  })
  // 자식 테이크가 생성 중(#e13) — Node 탭/리테이크에서 시작된 영상 생성도 그리드에 반영.
  const childVideoGenerating = useDirectorCanvasStore((s) =>
    s.nodes.some(
      (n) =>
        isVideoData(n.data) &&
        n.data.parentShotNodeId === node.id &&
        n.data.status === 'generating',
    ),
  )

  if (!isShotData(node.data)) return null
  const data: ShotNodeData = node.data
  const img = data.storyboardImage
  const status = img?.status ?? null
  const hasImage = status === 'completed' && !!img?.url
  const roughUrl = rough?.status === 'completed' ? rough.url : null

  const runImage = async () => {
    await generateStoryboardImage(node.id)
  }
  // 영상 생성(#e12): 이미지가 없으면 먼저 생성하고, 성공했을 때만 영상으로 이어간다.
  const runVideo = async () => {
    if (videoBusy) return
    setVideoBusy(true)
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
        if (!ok) return // 이미지 실패 — 카드에 실패 표시, 영상은 진행하지 않음
      }
      await generateVideoForShot(node.id)
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
          // 영상까지 완성된 샷 — 썸네일 자리를 영상으로(#e13). 음소거 루프 재생.
          <video
            src={completedVideoUrl}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
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

        {/* 생성 중 — border beam + 경과시간 오버레이. 색 구분(#e13): 이미지=초록, 영상=빨강.
            동시 진행이면 라벨·빔 모두 이미지(선행 단계) 우선 — 표기 불일치 방지. */}
        <GeneratingOverlay
          active={generating}
          label={imageGenerating ? '이미지 생성 중' : '영상 생성 중'}
          beamColor={imageGenerating ? 'success' : 'primary'}
        />

        {/* 우하단 생성 스택(#e12) — 기본 버튼 = 영상 생성(이미지 없으면 이미지→영상 체인).
            호버 시 위로 '이미지 생성' 항목이 펼쳐진다. 생성 중엔 숨김. */}
        {!generating && (
          <div className="group/gen absolute bottom-2 right-2 flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => void runImage()}
              title={
                status === 'failed' && img?.errorMessage
                  ? img.errorMessage
                  : hasImage
                    ? '이미지 리터칭 (재생성)'
                    : '이미지만 생성'
              }
              className={cn(
                'pointer-events-none flex h-7 translate-y-1 items-center gap-1 rounded-md border border-border bg-card/95 px-2 text-[11px] font-medium text-foreground opacity-0 shadow-sm backdrop-blur transition-all duration-150',
                'group-hover/gen:pointer-events-auto group-hover/gen:translate-y-0 group-hover/gen:opacity-100',
                'hover:bg-accent',
                status === 'failed' && 'border-destructive text-destructive',
              )}
            >
              <ImageIcon className="size-3.5" />
              {hasImage ? '이미지 리터칭' : '이미지 생성'}
            </button>
            <button
              type="button"
              onClick={() => void runVideo()}
              title="영상 생성 — 촬영 이미지가 없으면 먼저 생성한 뒤 영상을 만들어요"
              className={cn(
                'flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground shadow-sm',
                'transition-colors duration-100 hover:bg-primary/80',
              )}
            >
              <Play className="size-3.5 fill-current" />
              영상 생성
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium text-foreground">
          {prettyNodeLabel(data.label)}
        </span>
        {data.prompt && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {/* 프롬프트 속 char_2·location_2 등 슬러그 → @실제 이름 (표시 전용, #e6) */}
            {replaceSlugs(data.prompt, roster)}
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
