'use client'

import { useState } from 'react'
import { Loader2, Play, RefreshCw, Star, Trash2 } from 'lucide-react'
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
import {
  isShotData,
  type VideoNodeData,
  type DirectorVideoProvider,
} from '@/types/director-canvas'

import { AngleControl } from '@/features/director/angle-control'
import { KeyLight } from '@/features/director/key-light'
import { CameraPresetControl } from '@/features/director/camera-preset-control'

type Props = {
  nodeId: string
  data: VideoNodeData
}

const PROVIDER_LABEL: Record<DirectorVideoProvider, string> = {
  kling: 'Kling',
  veo: 'Veo',
  local: 'Self-hosted',
}

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
  const effective = useDirectorCanvasStore((s) =>
    getEffectiveShotConfig(s, nodeId),
  )
  const motherNode = useDirectorCanvasStore((s) =>
    s.nodes.find((n) => n.id === data.parentShotNodeId),
  )
  const isGenerating = useDirectorCanvasStore(
    (s) => !!s.generatingNodeIds[nodeId],
  )

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
    // D-5에서 실제 영상 생성 API wire-up. 지금은 placeholder.
    useDirectorCanvasStore
      .getState()
      .setVideoStatus(nodeId, 'generating')
    setTimeout(() => {
      useDirectorCanvasStore.getState().setVideoStatus(nodeId, 'completed', {
        url: data.videoUrl ?? '',
      })
    }, 1200)
  }

  const handleDelete = () => {
    closePopup()
    openDeleteConfirm(nodeId)
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
                    ? 'fill-amber-400 text-amber-400'
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
                    className="border-amber-400/50 bg-amber-400/10 text-[9px] uppercase text-amber-500"
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
            <div className="flex gap-2">
              {(['kling', 'veo', 'local'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => applyVideoOverride(nodeId, { provider: p })}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                    effective.provider === p
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  {PROVIDER_LABEL[p]}
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
                재생성 (placeholder — D-5에서 wire-up)
              </>
            )}
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
