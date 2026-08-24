'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, Play, RefreshCw, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HoverBeam } from '@/components/hover-beam'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  getEffectiveShotConfig,
  effectivePrompt,
  useDirectorCanvasStore,
} from '@/stores/director-store'
import {
  isShotData,
  type VideoNodeData,
} from '@/types/director'
import { VIDEO_MODELS, type VideoModelKey } from '@/lib/video-models'

import { AngleControl } from '@/features/director/angle-control'
import { KeyLight } from '@/features/director/key-light'
import { CameraPresetControl } from '@/features/director/camera-preset-control'
import { useT } from '@/lib/i18n'

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
  const t = useT()
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
  const isGenerating = nodes.some(
    (node) =>
      node.data.kind === 'video' &&
      node.data.parentShotNodeId === data.parentShotNodeId &&
      node.data.lastAttemptStatus === 'generating',
  )
  const projectId = useDirectorCanvasStore((s) => s.projectId)
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
  const canMarkFinal = !!data.videoUrl && data.status === 'completed'
  const finalBusy = finalState?.nodeId === nodeId ? finalState.busy : false
  const finalError =
    finalState?.nodeId === nodeId && finalState.intent !== data.final
      ? finalState.error
      : null
  const regenerationError =
    regenerationState?.nodeId === nodeId ? regenerationState.error : null
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
    labelDraft.nodeId === nodeId && labelDraft.dirty ? labelDraft.value : data.label
  const overridePrompt =
    promptDraft.nodeId === nodeId && promptDraft.dirty
      ? promptDraft.value
      : data.override.prompt ?? ''

  useEffect(() => {
    activeNodeIdRef.current = nodeId
    nodeSessionRef.current += 1
  }, [nodeId])

  if (!effective || !motherNode || !isShotData(motherNode.data)) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
        <PanelSection title="Video">
          <p className="text-sm text-muted-foreground">
            {t('Could not find the mother Shot.')}
          </p>
        </PanelSection>
      </div>
    )
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
          error: error instanceof Error ? error.message : t('Failed to set Final.'),
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
          error: error instanceof Error ? error.message : t('Failed to generate video.'),
        })
      }
    }
  }

  const handleDelete = () => {
    openDeleteConfirm(nodeId)
  }

  // effective(상속+override) 셋업을 프리셋으로 저장 (D-6, 결정 #46)
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <section className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-chart-5" />
          <HoverBeam className="min-w-0 flex-1">
            <input
              value={label}
              onChange={(e) =>
                setLabelDraft({ nodeId, value: e.target.value, dirty: true })
              }
              onBlur={commitLabel}
              className={cn(
                'w-full border-b border-transparent bg-transparent text-sm font-medium outline-none',
                'focus:border-border',
              )}
              placeholder={t('Video label')}
            />
          </HoverBeam>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            from {mother.label}
          </Badge>
          <button
            type="button"
            onClick={() => void handleFinalToggle()}
            disabled={!canMarkFinal || finalBusy}
            className={cn(
              'ml-auto inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent',
              data.final
                ? 'text-warning'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label={data.final ? 'Unmark Final' : 'Mark Final'}
            title={
              data.final
                ? t('★ Unmark Final')
                : t('Mark as the Editor handoff target (only one per Shot)')
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
            <span>{t('Video preview')}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {data.status}
            </Badge>
          </span>
        }
      >
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
              {data.lastAttemptError ?? data.errorMessage ?? t('Generation failed')}
            </span>
          ) : (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <Play className="size-5" />
              <span className="text-xs">{t('Not generated yet')}</span>
            </div>
          )}
        </div>
      </PanelSection>
      {isGenerating && (
        <p className="text-xs text-muted-foreground">
          {t('A new generation attempt is in progress. You can keep playing the existing video.')}
        </p>
      )}
      {(data.lastAttemptStatus === 'failed' && data.lastAttemptError) || regenerationError ? (
        <p className="text-xs text-destructive">
          {regenerationError ?? data.lastAttemptError}
        </p>
      ) : null}
      {finalError && <p className="text-xs text-destructive">{finalError}</p>}

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
        <HoverBeam>
          <Textarea
            value={overridePrompt}
            onChange={(e) =>
              setPromptDraft({ nodeId, value: e.target.value, dirty: true })
            }
            onBlur={commitPromptOverride}
            rows={3}
            placeholder={motherPrompt || t("Mother Shot's prompt is empty")}
          />
        </HoverBeam>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {t("Leave blank to use the mother Shot's prompt as-is.")}
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
              {data.videoUrl ? t('Regenerate') : t('Generate')}
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
