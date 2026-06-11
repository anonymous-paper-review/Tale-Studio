'use client'

import { useMemo, useState } from 'react'
import { Bookmark, Film, GitBranch, Images, Loader2, Trash2, Upload, X } from 'lucide-react'
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
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { usePresetStorageStore } from '@/stores/preset-storage-store'
import {
  newDirectorId,
  type ShotNodeData,
} from '@/types/director'
import { VIDEO_MODELS, type VideoModelKey } from '@/lib/video-models'
import type { InventoryItem } from '@/types/inventory'

import { AngleControl } from '@/features/director/angle-control'
import { KeyLight } from '@/features/director/key-light'
import { CameraPresetControl } from '@/features/director/camera-preset-control'
import { InventoryPickerDialog } from '@/features/director/canvas-popups/inventory-picker-dialog'

type Props = {
  nodeId: string
  data: ShotNodeData
}

const MODEL_ORDER: VideoModelKey[] = [
  'happy-horse',
  'seedance',
  'kling-o3',
  'veo',
  'local',
]

export function ShotNodePopup({ nodeId, data }: Props) {
  const closePopup = useDirectorCanvasStore((s) => s.closePopup)
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const addVideoTake = useDirectorCanvasStore((s) => s.addVideoTake)
  const regenerateVideo = useDirectorCanvasStore((s) => s.regenerateVideo)
  const openDeleteConfirm = useDirectorCanvasStore(
    (s) => s.openDeleteConfirm,
  )
  const isGenerating = useDirectorCanvasStore(
    (s) => !!s.generatingNodeIds[nodeId],
  )
  const generationError = useDirectorCanvasStore(
    (s) => s.generationErrors[nodeId],
  )

  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false)

  // 등장 캐릭터/월드 — Artist Asset Storage의 등록 에셋 (스펙 §5.3)
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const characterRecords = useAssetStorageStore((s) => s.characters)
  const worldRecords = useAssetStorageStore((s) => s.worlds)
  const projectCharacters = useMemo(
    () => Object.values(characterRecords).filter((c) => c.projectId === projectId),
    [characterRecords, projectId],
  )
  const projectWorlds = useMemo(
    () => Object.values(worldRecords).filter((w) => w.projectId === projectId),
    [worldRecords, projectId],
  )

  const toggleCharacter = (id: string) => {
    const next = data.characterAssetIds.includes(id)
      ? data.characterAssetIds.filter((x) => x !== id)
      : [...data.characterAssetIds, id]
    updateNodeData<'shot'>(nodeId, { characterAssetIds: next })
  }
  const toggleWorld = (id: string) => {
    const next = data.worldAssetIds.includes(id)
      ? data.worldAssetIds.filter((x) => x !== id)
      : [...data.worldAssetIds, id]
    updateNodeData<'shot'>(nodeId, { worldAssetIds: next })
  }

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

  // 새 Video 테이크 생성 + 실제 영상 생성 (D-5). storyboardImage 있으면 I2V.
  const handleGenerateTake = () => {
    commit()
    const newId = addVideoTake(nodeId)
    if (!newId) return
    // 새 Video 노드로 popup 전환 → 생성 진행/스피너는 VideoNodePopup에서 표시
    useDirectorCanvasStore.getState().openPopup(newId)
    void regenerateVideo(newId)
  }

  // Branch = 빈 Video 노드만 생성 (생성은 별도, 결정 #13)
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

  // 현재 카메라/조명/렌즈 셋업을 프리셋으로 저장 (D-6, 결정 #46)
  const handleSavePreset = () => {
    const name = window.prompt('프리셋 이름')?.trim()
    if (!name) return
    void usePresetStorageStore.getState().savePreset({
      projectId,
      name,
      camera: data.camera,
      lighting: data.lighting,
      cameraPreset: data.cameraPreset,
    })
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

  const handlePickInventoryItem = (item: InventoryItem) => {
    updateNodeData<'shot'>(nodeId, {
      referenceImages: [
        ...data.referenceImages,
        { id: newDirectorId('dr'), url: item.imageUrl, uploadedAt: Date.now() },
      ],
    })
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
              <button
                type="button"
                onClick={() => setInventoryPickerOpen(true)}
                className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent"
                title="인벤토리에서 선택"
              >
                <Images className="size-4" />
              </button>
            </div>
          </Field>

          <Separator />

          {/* 등장 캐릭터 / 월드 — Artist 등록 Asset에서 선택 (스펙 §5.3).
              선택된 에셋의 대표 이미지가 스토리보드/영상 생성의 레퍼런스로 들어간다. */}
          <Field
            label={`등장 캐릭터 (${data.characterAssetIds.length}/${projectCharacters.length})`}
          >
            {projectCharacters.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Artist에서 캐릭터를 Register하면 여기에 나타납니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {projectCharacters.map((c) => {
                  const active = data.characterAssetIds.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCharacter(c.id)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {c.name || c.alias || c.id}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>

          <Field
            label={`월드 / 장소 (${data.worldAssetIds.length}/${projectWorlds.length})`}
          >
            {projectWorlds.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Artist에서 장소를 Register하면 여기에 나타납니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {projectWorlds.map((w) => {
                  const active = data.worldAssetIds.includes(w.id)
                  return (
                    <button
                      key={w.id}
                      onClick={() => toggleWorld(w.id)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {w.name || w.alias || w.id}
                    </button>
                  )
                })}
              </div>
            )}
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

          {/* Provider (영상 생성 모델 — video-models 레지스트리) */}
          <Field label="영상 생성 모델">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODEL_ORDER.map((p) => {
                const spec = VIDEO_MODELS[p]
                const durHint =
                  spec.duration.mode === 'fixed'
                    ? '8s 고정'
                    : `${spec.duration.min}–${spec.duration.max}s`
                return (
                  <button
                    key={p}
                    onClick={() =>
                      updateNodeData<'shot'>(nodeId, { provider: p })
                    }
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-left text-xs transition-colors',
                      data.provider === p
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-accent',
                    )}
                  >
                    <span className="block font-medium">{spec.label}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">
                      {durHint}
                      {spec.pricePerSecNoAudio > 0
                        ? ` · $${spec.pricePerSecNoAudio}/s`
                        : ''}
                    </span>
                  </button>
                )
              })}
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
            onClick={handleGenerateTake}
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

      <InventoryPickerDialog
        open={inventoryPickerOpen}
        onOpenChange={setInventoryPickerOpen}
        onPick={handlePickInventoryItem}
      />
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
