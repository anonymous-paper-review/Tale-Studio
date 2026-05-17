'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  useCanvasStore,
  countImagesInSubtree,
  canRegister,
  REGISTRATION_IMAGE_THRESHOLD,
  type OutputMode,
  type ModelId,
} from '@/stores/canvas-store'
import { useAssetStorageStore } from '@/stores/asset-storage-store'
import { cn } from '@/lib/utils'
import { GitBranch, Sparkles, Trash2, Star, Loader2 } from 'lucide-react'

const MODE_COST: Record<OutputMode, number> = {
  single: 1,
  'five-view': 5,
  'sixteen-angle': 16,
}

const MODE_LABEL: Record<OutputMode, string> = {
  single: 'Single',
  'five-view': '5-View',
  'sixteen-angle': '16-Angle',
}

const MODEL_LABEL: Record<ModelId, string> = {
  imagen: 'Gemini Imagen',
  'h100-self': 'H100 (self-hosted)',
}

export function NodePopup() {
  const popupNodeId = useCanvasStore((s) => s.popupNodeId)
  const closePopup = useCanvasStore((s) => s.closePopup)

  if (!popupNodeId) return null
  return <NodePopupInner nodeId={popupNodeId} onClose={closePopup} />
}

function NodePopupInner({
  nodeId,
  onClose,
}: {
  nodeId: string
  onClose: () => void
}) {
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === nodeId))
  const updateNodeData = useCanvasStore((s) => s.updateNodeData)
  const setOutputMode = useCanvasStore((s) => s.setOutputMode)
  const generateImages = useCanvasStore((s) => s.generateImages)
  const openBranchModal = useCanvasStore((s) => s.openBranchModal)
  const openDeleteConfirm = useCanvasStore((s) => s.openDeleteConfirm)
  const registerCharacter = useCanvasStore((s) => s.registerCharacter)
  const assetRegister = useAssetStorageStore((s) => s.registerCharacter)
  const projectId = useCanvasStore((s) => s.projectId)
  const isGenerating = useCanvasStore(
    (s) => !!s.generatingNodeIds[nodeId],
  )
  const generationError = useCanvasStore(
    (s) => s.generationErrors[nodeId],
  )

  // Local form state — synced from node.data
  const [label, setLabel] = useState(node?.data.label ?? '')
  const [prompt, setPrompt] = useState(node?.data.prompt ?? '')
  const [registerOpen, setRegisterOpen] = useState(false)

  useEffect(() => {
    setLabel(node?.data.label ?? '')
    setPrompt(node?.data.prompt ?? '')
  }, [node?.data.label, node?.data.prompt])

  if (!node) return null

  const totalImages = countImagesInSubtree(useCanvasStore.getState(), nodeId)
  const registerAvailable = canRegister(useCanvasStore.getState(), nodeId)
  const isRegistered = node.data.registered !== null

  const commit = () => {
    updateNodeData(nodeId, { label, prompt })
  }

  const handleGenerate = () => {
    commit()
    void generateImages(nodeId)
  }

  const handleBranch = () => {
    commit()
    onClose()
    openBranchModal(nodeId)
  }

  const handleDelete = () => {
    onClose()
    openDeleteConfirm(nodeId)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block h-2 w-2 rounded-full',
                node.data.kind === 'actor'
                  ? 'bg-chart-1'
                  : node.data.kind === 'world'
                    ? 'bg-chart-2'
                    : 'bg-muted-foreground',
              )}
            />
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={commit}
              className="border-b border-transparent bg-transparent text-sm font-medium outline-none focus:border-border"
              placeholder="노드 라벨"
            />
            {isRegistered && (
              <Badge variant="secondary" className="ml-auto gap-1 text-chart-4">
                <Star className="size-3" /> registered
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Output mode */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              출력 모드
            </label>
            <div className="flex gap-2">
              {(['single', 'five-view', 'sixteen-angle'] as const).map((m) => {
                const active = node.data.outputMode === m
                return (
                  <button
                    key={m}
                    onClick={() => setOutputMode(nodeId, m as OutputMode)}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {MODE_LABEL[m]}
                    <span
                      className={cn(
                        'ml-1 font-mono text-[10px]',
                        active ? 'text-primary' : 'text-muted-foreground/70',
                      )}
                    >
                      {MODE_COST[m]}c
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              프롬프트
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onBlur={commit}
              rows={4}
              placeholder={
                node.data.kind === 'status'
                  ? '마더와 다른 디테일 (예: 왼쪽 눈에 흉터)'
                  : node.data.kind === 'actor'
                    ? '캐릭터 외모, 의상, 표정 등'
                    : '장소, 시간대, 분위기 등'
              }
            />
          </div>

          {/* Model select */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              생성 모델
            </label>
            <div className="flex gap-2">
              {(['imagen', 'h100-self'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => updateNodeData(nodeId, { modelId: m })}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                    node.data.modelId === m
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  {MODEL_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Generated images grid */}
          {node.data.generatedImages.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>생성된 이미지</span>
                <span className="font-mono">
                  {node.data.generatedImages.length}장 / 누적 서브트리 {totalImages}장
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {node.data.generatedImages.slice(-16).map((img) => (
                  <div
                    key={img.id}
                    className="aspect-square overflow-hidden rounded-sm border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.view ?? `${img.angle ?? ''}°`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Register character form */}
          {registerOpen && (
            <RegisterForm
              defaultName={node.data.label}
              onCancel={() => setRegisterOpen(false)}
              onSubmit={(form) => {
                const registeredId = registerCharacter(nodeId, form)
                if (!registeredId) return
                assetRegister(registeredId, {
                  projectId,
                  sourceCanvasNodeId: nodeId,
                  name: form.name,
                  alias: form.alias,
                  background: form.background,
                  description: form.description,
                  prompt: node.data.prompt,
                  referenceImages: node.data.referenceImages.map(
                    (r) => r.url,
                  ),
                  views: {
                    single: node.data.generatedImages.filter(
                      (i) => !i.view && i.angle === undefined,
                    ),
                    fiveView: node.data.generatedImages.filter(
                      (i) => i.view !== undefined,
                    ),
                    sixteenAngle: node.data.generatedImages.filter(
                      (i) => i.angle !== undefined,
                    ),
                  },
                  statusVariants: [],
                })
                setRegisterOpen(false)
              }}
            />
          )}
        </div>

        <Separator />

        {generationError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {generationError}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleGenerate}
            size="sm"
            className="gap-1.5"
            disabled={!prompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                Generate ({MODE_COST[node.data.outputMode]} credits)
              </>
            )}
          </Button>
          <Button
            onClick={handleBranch}
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={node.data.kind === 'status'}
          >
            <GitBranch className="size-3.5" />
            Branch
          </Button>
          {!isRegistered && node.data.kind !== 'status' && (
            <Button
              onClick={() => setRegisterOpen((v) => !v)}
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!registerAvailable}
              title={
                registerAvailable
                  ? '등록 가능'
                  : `누적 이미지 ${totalImages}/${REGISTRATION_IMAGE_THRESHOLD}장`
              }
            >
              <Star className="size-3.5" />
              등록 ({totalImages}/{REGISTRATION_IMAGE_THRESHOLD})
            </Button>
          )}
          <div className="ml-auto" />
          <Button
            onClick={handleDelete}
            size="sm"
            variant="ghost"
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

function RegisterForm({
  defaultName,
  onCancel,
  onSubmit,
}: {
  defaultName: string
  onCancel: () => void
  onSubmit: (data: {
    name: string
    alias: string
    background: string
    description: string
  }) => void
}) {
  const [name, setName] = useState(defaultName)
  const [alias, setAlias] = useState('')
  const [background, setBackground] = useState('')
  const [description, setDescription] = useState('')

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2">
      <div className="text-xs font-medium">캐릭터 등록</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="이름"
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
      />
      <input
        value={alias}
        onChange={(e) => setAlias(e.target.value)}
        placeholder="ID (alias)"
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
      />
      <Textarea
        value={background}
        onChange={(e) => setBackground(e.target.value)}
        rows={2}
        placeholder="배경"
        className="text-xs"
      />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="설명"
        className="text-xs"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit({ name, alias, background, description })}
          disabled={!name.trim() || !alias.trim()}
        >
          등록
        </Button>
      </div>
    </div>
  )
}
