'use client'

import { useState } from 'react'
import { Film, GitBranch, Loader2, Trash2, Upload, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-canvas-store'
import {
  newDirectorId,
  type DirectorVideoProvider,
  type ShotNodeData,
} from '@/types/director-canvas'

import { AngleControl } from '@/features/director/angle-control'
import { KeyLight } from '@/features/director/key-light'
import { CameraPresetControl } from '@/features/director/camera-preset-control'

type Props = {
  nodeId: string
  data: ShotNodeData
}

const PROVIDER_LABEL: Record<DirectorVideoProvider, string> = {
  kling: 'Kling (API)',
  veo: 'Veo (API)',
  local: 'Self-hosted',
}

export function ShotNodePopup({ nodeId, data }: Props) {
  const closePopup = useDirectorCanvasStore((s) => s.closePopup)
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const addVideoTake = useDirectorCanvasStore((s) => s.addVideoTake)
  const openDeleteConfirm = useDirectorCanvasStore(
    (s) => s.openDeleteConfirm,
  )
  const isGenerating = useDirectorCanvasStore(
    (s) => !!s.generatingNodeIds[nodeId],
  )
  const generationError = useDirectorCanvasStore(
    (s) => s.generationErrors[nodeId],
  )

  const [label, setLabel] = useState(data.label)
  const [prompt, setPrompt] = useState(data.prompt)

  // external data 변경 시 derived state 리셋 (effect 없이 render 중)
  const [prevNodeId, setPrevNodeId] = useState(nodeId)
  if (nodeId !== prevNodeId) {
    setPrevNodeId(nodeId)
    setLabel(data.label)
    setPrompt(data.prompt)
  }

  const commit = () => {
    updateNodeData<'shot'>(nodeId, { label, prompt })
  }

  const handleAddTake = () => {
    commit()
    const newId = addVideoTake(nodeId)
    if (newId) {
      // 새 Video 노드로 popup 전환
      useDirectorCanvasStore.getState().openPopup(newId)
    }
  }

  const handleDelete = () => {
    closePopup()
    openDeleteConfirm(nodeId)
  }

  const handleAddReferenceImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      updateNodeData<'shot'>(nodeId, {
        referenceImages: [
          ...data.referenceImages,
          { id: newDirectorId('dr'), url, uploadedAt: Date.now() },
        ],
      })
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveRef = (id: string) => {
    updateNodeData<'shot'>(nodeId, {
      referenceImages: data.referenceImages.filter((r) => r.id !== id),
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && closePopup()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-chart-4" />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commit}
              className={cn(
                'border-b border-transparent bg-transparent text-sm font-medium outline-none',
                'focus:border-border',
              )}
              placeholder="Shot 라벨"
            />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prompt */}
          <Field label="프롬프트 (영상 생성용)">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={commit}
              rows={3}
              placeholder="이 샷에서 일어나는 액션, 분위기, 카메라 의도 등"
            />
          </Field>

          {/* Reference images */}
          <Field label={`참고 이미지 (${data.referenceImages.length}장)`}>
            <div className="flex flex-wrap items-center gap-2">
              {data.referenceImages.map((img) => (
                <div
                  key={img.id}
                  className="group relative h-16 w-16 overflow-hidden rounded-md border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt="ref"
                    className="h-full w-full object-cover"
                  />
                  <button
                    onClick={() => handleRemoveRef(img.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <X className="size-3 text-white" />
                  </button>
                </div>
              ))}
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent">
                <Upload className="size-4" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleAddReferenceImage(file)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
          </Field>

          <Separator />

          {/* Camera preset (브랜드/렌즈/조리개/색온도) */}
          <CameraPresetControl
            preset={data.cameraPreset}
            onUpdate={(changes) =>
              updateNodeData<'shot'>(nodeId, {
                cameraPreset: { ...data.cameraPreset, ...changes },
              })
            }
          />

          <Separator />

          {/* Camera 6축 */}
          <AngleControl
            camera={data.camera}
            onUpdate={(changes) =>
              updateNodeData<'shot'>(nodeId, {
                camera: { ...data.camera, ...changes },
              })
            }
          />

          <Separator />

          {/* Key Light */}
          <KeyLight
            lighting={data.lighting}
            onUpdate={(changes) =>
              updateNodeData<'shot'>(nodeId, {
                lighting: { ...data.lighting, ...changes },
              })
            }
          />

          <Separator />

          {/* Provider */}
          <Field label="영상 생성 모델">
            <div className="flex gap-2">
              {(['kling', 'veo', 'local'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => updateNodeData<'shot'>(nodeId, { provider: p })}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                    data.provider === p
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

        {generationError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {generationError}
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handleAddTake}
            className="gap-1.5"
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Film className="size-3.5" />
                새 Video 테이크 생성
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddTake}
            className="gap-1.5"
            title="현재 설정으로 빈 Video 노드만 만들기 (실제 생성은 별도)"
          >
            <GitBranch className="size-3.5" />
            Branch (빈 테이크)
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
  label: string
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
