'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Bookmark, Loader2, Play, RefreshCw, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getEffectiveShotConfig,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import { usePresetStorageStore } from '@/stores/preset-storage-store'
import {
  isShotData,
  type VideoNodeData,
} from '@/types/director'
import { VIDEO_MODELS, type VideoModelKey } from '@/lib/video-models'

import { AngleControl } from '@/features/director/angle-control'
import { KeyLight } from '@/features/director/key-light'
import { CameraPresetControl } from '@/features/director/camera-preset-control'

const MODEL_ORDER: VideoModelKey[] = [
  'happy-horse',
  'seedance',
  'kling-o3',
  'veo',
  'local',
]

export function VideoDetailPanel({
  nodeId,
  data,
}: {
  nodeId: string
  data: VideoNodeData
}) {
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const applyVideoOverride = useDirectorCanvasStore(
    (s) => s.applyVideoOverride,
  )
  const setVideoFinal = useDirectorCanvasStore((s) => s.setVideoFinal)
  const openDeleteConfirm = useDirectorCanvasStore(
    (s) => s.openDeleteConfirm,
  )
  const regenerateVideo = useDirectorCanvasStore((s) => s.regenerateVideo)
  // getEffectiveShotConfig는 매 호출마다 새 객체를 반환하므로 셀렉터에서 직접
  // 호출하면 useSyncExternalStore가 무한 변화로 인식("getSnapshot should be
  // cached" 에러). nodes만 구독하고 useMemo로 캐싱한다.
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const effective = useMemo(
    () => getEffectiveShotConfig({ nodes }, nodeId),
    [nodes, nodeId],
  )
  const motherNode = useMemo(
    () => nodes.find((n) => n.id === data.parentShotNodeId),
    [nodes, data.parentShotNodeId],
  )
  const isGenerating = useDirectorCanvasStore(
    (s) => !!s.generatingNodeIds[nodeId],
  )
  const projectId = useDirectorCanvasStore((s) => s.projectId)

  const [label, setLabel] = useState(data.label)
  const [overridePrompt, setOverridePrompt] = useState(
    data.override.prompt ?? '',
  )

  // external data 변경 시 derived state 리셋
  const [prevNodeId, setPrevNodeId] = useState(nodeId)
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId)
    setLabel(data.label)
    setOverridePrompt(data.override.prompt ?? '')
  }

  if (!effective || !motherNode || !isShotData(motherNode.data)) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
        <PanelSection title="Video">
          <p className="text-sm text-muted-foreground">
            마더 Shot을 찾을 수 없습니다.
          </p>
        </PanelSection>
      </div>
    )
  }

  const mother = motherNode.data

  const commitLabel = () => updateNodeData<'video'>(nodeId, { label })

  const commitPromptOverride = () => {
    const trimmed = overridePrompt.trim()
    if (trimmed === '' || trimmed === mother.prompt) {
      // override 제거 — 마더 값 그대로 사용
      const next = { ...data.override }
      delete next.prompt
      updateNodeData<'video'>(nodeId, { override: next })
    } else {
      applyVideoOverride(nodeId, { prompt: trimmed })
    }
  }

  const overrideKeys = Object.keys(data.override) as (keyof typeof data.override)[]

  const handleFinalToggle = () => {
    setVideoFinal(nodeId, !data.final)
  }

  const handleRegenerate = () => {
    // D-5: effective 설정으로 이 Video 노드를 실제 (재)생성. 마더 storyboardImage 있으면 I2V.
    void regenerateVideo(nodeId)
  }

  const handleDelete = () => {
    openDeleteConfirm(nodeId)
  }

  // effective(상속+override) 셋업을 프리셋으로 저장 (D-6, 결정 #46)
  const handleSavePreset = () => {
    const name = window.prompt('프리셋 이름')?.trim()
    if (!name) return
    void usePresetStorageStore.getState().savePreset({
      projectId,
      name,
      camera: effective.camera,
      lighting: effective.lighting,
      cameraPreset: effective.cameraPreset,
    })
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <section className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-chart-5" />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={commitLabel}
            className={cn(
              'min-w-0 flex-1 border-b border-transparent bg-transparent text-sm font-medium outline-none',
              'focus:border-border',
            )}
            placeholder="Video 라벨"
          />
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            from {mother.label}
          </Badge>
          <button
            type="button"
            onClick={handleFinalToggle}
            className={cn(
              'ml-auto inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent',
              data.final
                ? 'text-warning'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label={data.final ? 'Unmark Final' : 'Mark Final'}
            title={
              data.final
                ? '★ Final 해제'
                : 'Editor 핸드오프 대상으로 마킹 (Shot당 1개 강제)'
            }
          >
            <Star
              className={cn(
                'size-4',
                data.final ? 'fill-warning text-warning' : 'text-muted-foreground',
              )}
            />
            Final
          </button>
        </div>
      </section>

      <PanelSection
        title={
          <span className="flex items-center justify-between gap-2">
            <span>영상 미리보기</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {data.status}
            </Badge>
          </span>
        }
      >
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {data.status === 'generating' ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : data.status === 'failed' ? (
            <span className="px-4 text-center text-xs text-destructive">
              {data.errorMessage ?? '생성 실패'}
            </span>
          ) : data.videoUrl ? (
            <video
              src={data.videoUrl}
              controls
              className="h-full w-full"
              poster={data.thumbnailUrl ?? undefined}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Play className="size-5" />
              <span className="text-xs">아직 생성되지 않음</span>
            </div>
          )}
        </div>
      </PanelSection>

      <PanelSection
        title={
          <span className="flex items-center gap-1.5">
            Override Prompt
            {overrideKeys.includes('prompt') && (
              <Badge
                variant="outline"
                className="border-warning/50 bg-warning/10 text-[9px] uppercase text-warning"
              >
                overridden
              </Badge>
            )}
          </span>
        }
      >
        <Textarea
          value={overridePrompt || mother.prompt}
          onChange={(e) => setOverridePrompt(e.target.value)}
          onBlur={commitPromptOverride}
          rows={3}
          placeholder={mother.prompt || '마더 Shot의 prompt가 비어있음'}
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          비워두면 마더 Shot의 prompt가 그대로 사용됩니다.
        </p>
      </PanelSection>

      <PanelSection>
        <CameraPresetControl
          preset={effective.cameraPreset}
          onUpdate={(changes) =>
            applyVideoOverride(nodeId, {
              cameraPreset: { ...effective.cameraPreset, ...changes },
            })
          }
        />
      </PanelSection>

      <PanelSection>
        <AngleControl
          camera={effective.camera}
          onUpdate={(changes) =>
            applyVideoOverride(nodeId, {
              camera: { ...effective.camera, ...changes },
            })
          }
        />
      </PanelSection>

      <PanelSection>
        <KeyLight
          lighting={effective.lighting}
          onUpdate={(changes) =>
            applyVideoOverride(nodeId, {
              lighting: { ...effective.lighting, ...changes },
            })
          }
        />
      </PanelSection>

      <PanelSection title="Provider">
        <div className="grid grid-cols-2 gap-2">
          {MODEL_ORDER.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => applyVideoOverride(nodeId, { provider: p })}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs transition-colors',
                effective.provider === p
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent',
              )}
            >
              {VIDEO_MODELS[p].label}
            </button>
          ))}
        </div>
      </PanelSection>

      <footer className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          size="sm"
          onClick={handleRegenerate}
          disabled={isGenerating}
          className="gap-1.5"
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Regenerating…
            </>
          ) : (
            <>
              <RefreshCw className="size-3.5" />
              {data.videoUrl ? '재생성' : '생성'}
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSavePreset}
          className="gap-1.5"
          title="현재 카메라/조명/렌즈 셋업을 프리셋으로 저장"
        >
          <Bookmark className="size-3.5" />
          프리셋 저장
        </Button>
        <div className="ml-auto" />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDelete}
          className="gap-1.5 text-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          삭제
        </Button>
      </footer>
    </div>
  )
}

function PanelSection({
  title,
  children,
}: {
  title?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-3">
      {title && (
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}
      {children}
    </section>
  )
}
