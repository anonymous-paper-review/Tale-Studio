'use client'

import { ImageIcon, MapPin, Clock } from 'lucide-react'

import { cn } from '@/lib/utils'
import { GeneratedImage, GeneratingOverlay } from '@/components/generating-frame'
import {
  getChildShots,
  useDirectorCanvasStore,
} from '@/stores/director-canvas-store'
import {
  isSceneData,
  isShotData,
  type DirectorNode,
  type ShotNodeData,
} from '@/types/director-canvas'

type SceneGroup = {
  key: string
  label: string
  location: string
  timeOfDay: string
  shots: DirectorNode[]
}

function ShotCell({ node }: { node: DirectorNode }) {
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const generateVideoForShot = useDirectorCanvasStore(
    (s) => s.generateVideoForShot,
  )
  const openPopup = useDirectorCanvasStore((s) => s.openPopup)

  if (!isShotData(node.data)) return null
  const data: ShotNodeData = node.data
  const img = data.storyboardImage
  const status = img?.status ?? null
  const hasImage = status === 'completed' && !!img?.url

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-card"
      onDoubleClick={() => openPopup(node.id)}
    >
      <div className="relative aspect-video bg-muted">
        {hasImage ? (
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
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground opacity-50" />
          </div>
        )}

        {/* 생성 중 — border beam + 경과시간 오버레이 */}
        <GeneratingOverlay
          active={status === 'generating'}
          label="이미지 생성 중"
        />

        {/* 우하단 액션 버튼 (생성 중엔 숨김) */}
        <div className="absolute bottom-2 right-2">
          {status === 'generating' ? null : hasImage ? (
            <button
              type="button"
              aria-label="영상 생성"
              title="영상 생성"
              onClick={() => {
                void generateVideoForShot(node.id)
              }}
              className={cn(
                'flex size-8 items-center justify-center rounded-md',
                'bg-primary text-primary-foreground',
                'transition-colors duration-100 hover:bg-primary/80',
              )}
            >
              <span className="text-xs font-medium">{'▶▶'}</span>
            </button>
          ) : (
            <button
              type="button"
              aria-label="이미지 생성"
              title={
                status === 'failed' && img?.errorMessage
                  ? img.errorMessage
                  : '이미지 생성'
              }
              onClick={() => {
                void generateStoryboardImage(node.id)
              }}
              className={cn(
                'flex size-8 items-center justify-center rounded-md',
                'border border-border bg-card',
                'transition-colors duration-100 hover:bg-accent',
                status === 'failed' && 'border-destructive',
              )}
            >
              <ImageIcon
                className={cn(
                  'size-4',
                  status === 'failed'
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 p-3">
        <span className="truncate text-sm font-medium text-foreground">
          {data.label}
        </span>
        {data.prompt && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {data.prompt}
          </p>
        )}
      </div>
    </div>
  )
}

export function StoryboardGridView() {
  const nodes = useDirectorCanvasStore((s) => s.nodes)

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
    <div className="size-full overflow-auto bg-background">
      <div className="flex flex-col gap-6 p-6">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-medium text-foreground">
                {group.label}
              </h2>
              <span className="flex items-center gap-3 text-xs text-muted-foreground">
                {group.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {group.location}
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
                  <ShotCell key={shot.id} node={shot} />
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
    </div>
  )
}
