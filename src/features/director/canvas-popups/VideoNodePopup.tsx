'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, Loader2, Play, RefreshCw, Star, Trash2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getEffectiveShotConfig,
  effectivePrompt,
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
  const regenerateVideo = useDirectorCanvasStore((s) => s.regenerateVideo)
  const [regenerationState, setRegenerationState] = useState<{
    nodeId: string
    error: string | null
  } | null>(null)
  const [finalState, setFinalState] = useState<{
    nodeId: string
    intent: boolean
    busy: boolean
    error: string | null
  } | null>(null)
  const finalOperationRef = useRef(0)
  const regenerationOperationRef = useRef(0)
  const activeNodeIdRef = useRef(nodeId)
  const nodeSessionRef = useRef(0)
  const finalBusy = finalState?.nodeId === nodeId ? finalState.busy : false
  const finalError =
    finalState?.nodeId === nodeId && finalState.intent !== data.final
      ? finalState.error
      : null
  const regenerationError =
    regenerationState?.nodeId === nodeId ? regenerationState.error : null
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
  const parentShotNodeId = motherNode && isShotData(motherNode.data) ? motherNode.id : null
  const isGenerating = nodes.some(
    (node) =>
      node.data.kind === 'video' &&
      node.data.parentShotNodeId === parentShotNodeId &&
      node.data.lastAttemptStatus === 'generating',
  )
  const canMarkFinal = !!data.videoUrl && data.status === 'completed'
  const projectId = useDirectorCanvasStore((s) => s.projectId)

  const [labelDraft, setLabelDraft] = useState({
    nodeId,
    value: data.label,
    dirty: false,
  })
  const [promptDraft, setPromptDraft] = useState({
    nodeId,
    value: data.override.prompt ?? '',
    dirty: false,
  })
  const label =
    labelDraft.nodeId === nodeId && labelDraft.dirty
      ? labelDraft.value
      : data.label
  const overridePrompt =
    promptDraft.nodeId === nodeId && promptDraft.dirty
      ? promptDraft.value
      : data.override.prompt ?? ''

  useEffect(() => {
    activeNodeIdRef.current = nodeId
    nodeSessionRef.current += 1
  }, [nodeId])

  if (!effective || !motherNode || !isShotData(motherNode.data)) {
    return null
  }
  const mother = motherNode.data
  const motherPrompt = effectivePrompt(mother)

  const commitLabel = () => {
    setLabelDraft({ nodeId, value: label, dirty: false })
    updateNodeData<'video'>(nodeId, { label })
  }

  const commitPromptOverride = () => {
    setPromptDraft({ nodeId, value: overridePrompt, dirty: false })
    const trimmed = overridePrompt.trim()
    if (trimmed === '') {
      const next = { ...data.override }
      delete next.prompt
      updateNodeData<'video'>(nodeId, { override: next })
    } else {
      applyVideoOverride(nodeId, { prompt: trimmed })
    }
  }

  const overrideKeys = Object.keys(data.override) as (keyof typeof data.override)[]

  const handleFinalToggle = async () => {
    if (!canMarkFinal || finalBusy) return
    const operation = ++finalOperationRef.current
    const session = nodeSessionRef.current
    const intent = !data.final
    setFinalState({ nodeId, intent, busy: true, error: null })
    try {
      await setVideoFinal(nodeId, intent)
      if (
        operation === finalOperationRef.current &&
        activeNodeIdRef.current === nodeId &&
        nodeSessionRef.current === session
      ) {
        setFinalState(null)
      }
    } catch (error) {
      if (
        operation === finalOperationRef.current &&
        activeNodeIdRef.current === nodeId &&
        nodeSessionRef.current === session
      ) {
        setFinalState({
          nodeId,
          intent,
          busy: false,
          error: error instanceof Error ? error.message : 'Final 설정에 실패했습니다.',
        })
      }
    }
  }

  const handleRegenerate = async () => {
    if (isGenerating) return
    const operation = ++regenerationOperationRef.current
    const session = nodeSessionRef.current
    setRegenerationState({ nodeId, error: null })
    try {
      await regenerateVideo(nodeId)
      if (
        operation === regenerationOperationRef.current &&
        activeNodeIdRef.current === nodeId &&
        nodeSessionRef.current === session
      ) {
        setRegenerationState(null)
      }
    } catch (error) {
      if (
        operation === regenerationOperationRef.current &&
        activeNodeIdRef.current === nodeId &&
        nodeSessionRef.current === session
      ) {
        setRegenerationState({
          nodeId,
          error: error instanceof Error ? error.message : '영상 생성에 실패했습니다.',
        })
      }
    }
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
            <HoverBeam>
              <input
                value={label}
                onChange={(e) => {
                  setLabelDraft({ nodeId, value: e.target.value, dirty: true })
                }}
                onBlur={commitLabel}
                className={cn(
                  'border-b border-transparent bg-transparent text-sm font-medium outline-none',
                  'focus:border-border',
                )}
                placeholder="Video 라벨"
              />
            </HoverBeam>
            <Badge variant="secondary" className="ml-2 text-[10px]">
              from {mother.label}
            </Badge>
            <button
              type="button"
              onClick={() => void handleFinalToggle()}
              disabled={!canMarkFinal || finalBusy}
              className="ml-auto rounded p-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={data.final ? 'Unmark Final' : 'Mark Final'}
              title={
                canMarkFinal
                  ? data.final
                    ? '★ Final 해제'
                    : 'Editor 핸드오프 대상으로 마킹 (Shot당 1개 강제)'
                  : '완료된 재생 가능 영상만 Final로 지정할 수 있습니다'
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
            {data.videoUrl ? (
              <video
                src={data.videoUrl}
                controls
                className="h-full w-full"
                poster={data.thumbnailUrl ?? undefined}
              />
            ) : data.lastAttemptStatus === 'generating' ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : data.lastAttemptStatus === 'failed' || data.status === 'failed' ? (
              <span className="px-4 text-center text-xs text-destructive">
                {data.lastAttemptError ?? data.errorMessage ?? '생성 실패'}
              </span>
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <Play className="size-5" />
                <span className="text-xs">아직 생성되지 않음</span>
              </div>
            )}
          </div>
          {isGenerating && (
            <p className="text-xs text-muted-foreground">새 생성 시도를 진행 중입니다. 기존 영상은 계속 재생할 수 있습니다.</p>
          )}
          {(data.lastAttemptStatus === 'failed' && data.lastAttemptError) || regenerationError ? (
            <p className="text-xs text-destructive">
              {regenerationError ?? data.lastAttemptError}
            </p>
          ) : null}
          {finalError && <p className="text-xs text-destructive">{finalError}</p>}

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
            <HoverBeam className="w-full">
              <Textarea
                value={overridePrompt}
                onChange={(e) => {
                  setPromptDraft({ nodeId, value: e.target.value, dirty: true })
                }}
                onBlur={commitPromptOverride}
                rows={3}
                placeholder={motherPrompt || '마더 Shot의 prompt가 비어있음'}
              />
            </HoverBeam>
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
            onClick={() => void handleRegenerate()}
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
