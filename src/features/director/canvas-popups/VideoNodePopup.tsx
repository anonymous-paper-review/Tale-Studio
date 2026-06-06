'use client'

import { useMemo, useState } from 'react'
import { Bookmark, Loader2, Play, RefreshCw, Star, Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getEffectiveShotConfig,
  useDirectorCanvasStore,
} from '@/stores/director-canvas-store'
import { usePresetStorageStore } from '@/stores/preset-storage-store'
import {
  isShotData,
  type VideoNodeData,
} from '@/types/director-canvas'
import { VIDEO_MODELS, type VideoModelKey } from '@/lib/video-models'

import { AngleControl } from '@/features/director/angle-control'
import { KeyLight } from '@/features/director/key-light'
import { CameraPresetControl } from '@/features/director/camera-preset-control'

type Props = {
  nodeId: string
  data: VideoNodeData
}

const MODEL_ORDER: VideoModelKey[] = [
  'happy-horse',
  'seedance',
  'kling-o3',
  'veo',
  'local',
]

export function VideoNodePopup({ nodeId, data }: Props) {
  const closePopup = useDirectorCanvasStore((s) => s.closePopup)
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const applyVideoOverride = useDirectorCanvasStore(
    (s) => s.applyVideoOverride,
  )
  const setVideoFinal = useDirectorCanvasStore((s) => s.setVideoFinal)
  const openDeleteConfirm = useDirectorCanvasStore(
    (s) => s.openDeleteConfirm,
  )
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
    return null
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
    void useDirectorCanvasStore.getState().regenerateVideo(nodeId)
  }

  const handleDelete = () => {
    closePopup()
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
    <Dialog open onOpenChange={(o) => !o && closePopup()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-chart-5" />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commitLabel}
              className={cn(
                'border-b border-transparent bg-transparent text-sm font-medium outline-none',
                'focus:border-border',
              )}
              placeholder="Video 라벨"
            />
            <Badge variant="secondary" className="ml-2 text-[10px]">
              from {mother.label}
            </Badge>
            <button
              onClick={handleFinalToggle}
              className="ml-auto rounded p-1 hover:bg-accent"
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
                  data.final
                    ? 'fill-warning text-warning'
                    : 'text-muted-foreground',
                )}
              />
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video preview */}
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

          {/* Override prompt */}
          <Field
            label={
              <span className="flex items-center gap-1.5">
                Prompt
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
          </Field>

          <Separator />

          <CameraPresetControl
            preset={effective.cameraPreset}
            onUpdate={(changes) =>
              applyVideoOverride(nodeId, {
                cameraPreset: { ...effective.cameraPreset, ...changes },
              })
            }
          />

          <Separator />

          <AngleControl
            camera={effective.camera}
            onUpdate={(changes) =>
              applyVideoOverride(nodeId, {
                camera: { ...effective.camera, ...changes },
              })
            }
          />

          <Separator />

          <KeyLight
            lighting={effective.lighting}
            onUpdate={(changes) =>
              applyVideoOverride(nodeId, {
                lighting: { ...effective.lighting, ...changes },
              })
            }
          />

          <Separator />

          <Field label="Provider">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODEL_ORDER.map((p) => (
                <button
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
          </Field>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
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
            이 셋업 프리셋으로 저장
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
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
