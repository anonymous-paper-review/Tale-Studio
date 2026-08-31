'use client'

import { useMemo } from 'react'
import { ImageIcon, Loader2, Trash2, Upload, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { Separator } from '@/components/ui/separator'
import { ThumbImage } from '@/components/thumb-image'
import { cn } from '@/lib/utils'
import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import { DebugPromptTrace } from '@/components/debug-prompt-trace'
import { useDebugPrompts } from '@/lib/use-debug-prompts'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import {
  newDirectorId,
  type ShotNodeData,
} from '@/types/director'
import {
  IMAGE_MODELS,
  IMAGE_MODEL_ORDER,
  normalizeImageModelKey,
} from '@/lib/image-models'
import { useT } from '@/lib/i18n'

type Props = {
  nodeId: string
  data: ShotNodeData
}

export function ShotNodePopup({ nodeId, data }: Props) {
  const t = useT()
  const closePopup = useDirectorCanvasStore((s) => s.closePopup)
  // #debug-prompts: 관리자 소유 프로젝트에서만 원본 생성 풀 프롬프트(shots.prompt) 노출.
  const debugProjectId = useDirectorCanvasStore((s) => s.projectId)
  const debugPrompts = useDebugPrompts(debugProjectId)
  const updateNodeData = useDirectorCanvasStore((s) => s.updateNodeData)
  const generateStoryboardImage = useDirectorCanvasStore(
    (s) => s.generateStoryboardImage,
  )
  const openDeleteConfirm = useDirectorCanvasStore(
    (s) => s.openDeleteConfirm,
  )
  const isGenerating = useDirectorCanvasStore(
    (s) => !!s.generatingNodeIds[nodeId],
  )
  const generationError = useDirectorCanvasStore(
    (s) => s.generationErrors[nodeId],
  )


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

  const currentPrompt = effectivePrompt(data)
  const hasImage = data.storyboardImage?.status === 'completed'

  // #ui-cleanup: 이미지 노드의 주 액션은 이미지 생성/재생성 — 영상 테이크 버튼은
  //   Video 노드(캔버스 Branch·우클릭)가 담당한다.
  const handleGenerateImage = () => {
    void generateStoryboardImage(nodeId)
  }

  const handleDelete = () => {
    closePopup()
    openDeleteConfirm(nodeId)
  }

  // 현재 카메라/조명/렌즈 셋업을 프리셋으로 저장 (D-6, 결정 #46)
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
            <HoverBeam>
              <input
                value={data.label}
                onChange={(e) =>
                  updateNodeData<'shot'>(nodeId, { label: e.target.value })
                }
                className={cn(
                  'border-b border-transparent bg-transparent text-sm font-medium outline-none',
                  'focus:border-border',
                )}
                placeholder={t('Shot label')}
              />
            </HoverBeam>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prompt */}
          <Field label={t('Prompt (for video generation)')}>
            <HoverBeam className="w-full">
              <Textarea
                value={currentPrompt}
                onChange={(e) =>
                  updateNodeData<'shot'>(nodeId, { promptOverride: e.target.value })
                }
                rows={3}
                placeholder={t('Action, mood, camera intent, etc. happening in this shot')}
              />
            </HoverBeam>
          </Field>

          {/* #debug-prompts — 관리자 프로젝트 한정: 이미지/영상 생성에 들어가는 원본 풀 프롬프트(읽기 전용).
              위의 편집용 프롬프트(override)와 달리 파이프라인이 저장한 rich 프롬프트 원문이다
              (derivedPrompt = writer sync v2 파생, prompt = legacy 폴백). */}
          {debugPrompts && (data.derivedPrompt || data.prompt) ? (
            <Field label={t('Original generation prompt (debug)')}>
              <pre className="max-h-48 w-full select-text overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted p-3 font-mono text-[11px] leading-relaxed text-muted-foreground scrollbar-thin">
                {data.derivedPrompt || data.prompt}
              </pre>
            </Field>
          ) : null}

          {/* #debug-prompts 확장: 실사 스토리보드 잡에 실제 전송된 최종 프롬프트(리페인트 지시·연속성 포함). */}
          <DebugPromptTrace
            projectId={debugProjectId}
            shotId={data.writerShotId}
            kinds={['shot_storyboard', 'storyboard_real_grid']}
          />

          {/* Reference images */}
          <Field label={t('Reference images ({count})', { count: data.referenceImages.length })}>
            <div className="flex flex-wrap items-center gap-2">
              {data.referenceImages.map((img) => (
                <div
                  key={img.id}
                  className="group relative h-16 w-16 overflow-hidden rounded-md border border-border"
                >
                  <ThumbImage src={img.url} alt="ref" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveRef(img.id)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                    aria-label={t('Remove reference image')}
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
                  className="sr-only"
                  aria-label={t('Upload reference image')}
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

          {/* 등장 캐릭터 / 월드 — Artist 등록 Asset에서 선택 (스펙 §5.3).
              선택된 에셋의 대표 이미지가 스토리보드/영상 생성의 레퍼런스로 들어간다. */}
          <Field
            label={t('Characters ({count}/{total})', {
              count: data.characterAssetIds.length,
              total: projectCharacters.length,
            })}
          >
            {projectCharacters.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('Characters you Register in Artist will appear here.')}
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
            label={t('World / locations ({count}/{total})', {
              count: data.worldAssetIds.length,
              total: projectWorlds.length,
            })}
          >
            {projectWorlds.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('Locations you Register in Artist will appear here.')}
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

          {/* 이미지 생성 모델(#image-model-select 2026-08-31) — 이름으로 실제 모델을 선택한다.
              이미지 노드에는 이미지 모델만 뜸다 — 영상 모델 선택은 Video 노드 소관. */}
          <Field label={t('Image generation model')}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {IMAGE_MODEL_ORDER.map((key) => {
                const spec = IMAGE_MODELS[key]
                const active = normalizeImageModelKey(data.imageModel) === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      updateNodeData<'shot'>(nodeId, { imageModel: key })
                    }
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-left text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-accent',
                    )}
                    aria-pressed={active}
                  >
                    <span className="block font-medium">{spec.label}</span>
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
            onClick={handleGenerateImage}
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
                <ImageIcon className="size-3.5" />
                {hasImage ? t('Regenerate image') : t('Generate image')}
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
            {t('Delete')}
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
