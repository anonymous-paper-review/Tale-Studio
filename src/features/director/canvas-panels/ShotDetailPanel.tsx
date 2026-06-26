'use client'

import { useMemo, useState } from 'react'
import { Bookmark, Images, Loader2, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { usePresetStorageStore } from '@/stores/preset-storage-store'
import { newDirectorId, type ShotNodeData } from '@/types/director'
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

export function ShotDetailPanel({ nodeId, data }: Props) {
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const openDeleteConfirm = useDirectorCanvasStore(
    (s) => s.openDeleteConfirm,
  )
  const projectId = useDirectorCanvasStore((s) => s.projectId)
  const characterRecords = useAssetStorageStore((s) => s.characters)
  const worldRecords = useAssetStorageStore((s) => s.worlds)
  const [inventoryPickerOpen, setInventoryPickerOpen] = useState(false)

  const projectCharacters = useMemo(
    () => Object.values(characterRecords).filter((c) => c.projectId === projectId),
    [characterRecords, projectId],
  )
  const projectWorlds = useMemo(
    () => Object.values(worldRecords).filter((w) => w.projectId === projectId),
    [worldRecords, projectId],
  )

  const isGenerating = data.storyboardImage?.status === 'generating'
  const generationError =
    data.storyboardImage?.status === 'failed'
      ? data.storyboardImage.errorMessage
      : null

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
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2 rounded-full bg-chart-4" />
          <Input
            value={data.label}
            onChange={(e) =>
              updateNodeData<'shot'>(nodeId, { label: e.target.value })
            }
            className="h-8 border-transparent bg-transparent px-0 text-sm font-medium shadow-none focus-visible:border-border focus-visible:ring-0"
            placeholder="Shot 라벨"
          />
        </div>
      </header>

      <Section title="Prompt">
        <Field label="프롬프트 (영상 생성용)">
          <Textarea
            value={data.prompt}
            onChange={(e) =>
              updateNodeData<'shot'>(nodeId, { prompt: e.target.value })
            }
            rows={4}
            placeholder="이 샷에서 일어나는 액션, 분위기, 카메라 의도 등"
          />
        </Field>
      </Section>

      <Section title="Model">
        <Field label="영상 생성 모델">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODEL_ORDER.map((p) => {
              const spec = VIDEO_MODELS[p]
              const durHint =
                spec.duration.mode === 'fixed'
                  ? '8s 고정'
                  : `${spec.duration.min}–${spec.duration.max}s`
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateNodeData<'shot'>(nodeId, { provider: p })}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left text-xs transition-colors',
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
        <div className="grid grid-cols-3 gap-2">
          <Field label="Aspect Ratio">
            {/* 추후 영속 필요 */}
            <Input value="16:9" disabled readOnly />
          </Field>
          <Field label="Resolution">
            {/* 추후 영속 필요 */}
            <Input placeholder="default" disabled />
          </Field>
          <Field label="Batch Size">
            {/* 추후 영속 필요 */}
            <Input placeholder="1" disabled />
          </Field>
        </div>
      </Section>

      <Section title="References">
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
                  type="button"
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
      </Section>

      <Section title="Cast">
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
                    type="button"
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
      </Section>

      <Section title="World">
        <Field label={`월드 / 장소 (${data.worldAssetIds.length}/${projectWorlds.length})`}>
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
                    type="button"
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
      </Section>

      <Section title="Camera / Lens">
        <CameraPresetControl
          preset={data.cameraPreset}
          onUpdate={(changes) =>
            updateNodeData<'shot'>(nodeId, {
              cameraPreset: { ...data.cameraPreset, ...changes },
            })
          }
        />
        <Separator />
        <AngleControl
          camera={data.camera}
          onUpdate={(changes) =>
            updateNodeData<'shot'>(nodeId, {
              camera: { ...data.camera, ...changes },
            })
          }
        />
      </Section>

      <Section title="Lighting">
        <KeyLight
          lighting={data.lighting}
          onUpdate={(changes) =>
            updateNodeData<'shot'>(nodeId, {
              lighting: { ...data.lighting, ...changes },
            })
          }
        />
      </Section>

      {generationError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {generationError}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          onClick={() => void generateStoryboardImage(nodeId)}
          disabled={isGenerating}
          className="w-full gap-1.5"
        >
          {isGenerating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <RefreshCw className="size-3.5" />
              REGENERATE
            </>
          )}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSavePreset}
            className="gap-1.5"
            title="현재 카메라/조명/렌즈 셋업을 프리셋으로 저장"
          >
            <Bookmark className="size-3.5" />
            프리셋 저장
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => openDeleteConfirm(nodeId)}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            삭제
          </Button>
        </div>
      </div>

      <InventoryPickerDialog
        open={inventoryPickerOpen}
        onOpenChange={setInventoryPickerOpen}
        onPick={handlePickInventoryItem}
      />
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
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
    <div className="space-y-1.5">
      <label className="block text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
