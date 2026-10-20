'use client'

// Storyboard 샷 고치기 팝업(프로토타입 S2, 2026-10-20 오너 "HTML 확인해서 팝업 수정") — 카드를 누르면 열린다.
//   두 묶음: 시작 고치기(스토리 · 대사 · 샷 타입 — 적용하면 저장한 내용으로 그 샷의 러프를 새로 그린다) /
//   연출 고치기(왼쪽 연출 그림에 화살표 그리기 · 길이 · [연출만 다시 만들기]).
//   앵글 · 조명은 러프가 아직 따르지 않아(무대 설계 값을 쓴다) 2차 — 보이기만 하고 바뀌지 않는 칸은 두지 않는다(검토 지적).
//   약속 I(2026-09-04): 시작 · 연출 · 끝 세 장은 따로 다시 만들 수 있어 왼쪽 아래에 그대로 둔다(프로토타입은 끝을 뺐다 — 오너 결정 대기).
//   저장할 곳이 아직 없는 카메라 무브먼트 · 방향 · 액션 · 샷별 모습, 새 러프 비교(S3c)는 2차. 등장인물은 보기만(바꾸려면 모습 표까지 함께 — 2차).
//   Director 그리드는 예전 연출 편집 팝업을 그대로 쓴다(ShotDetailDialog 기본).
import { useState } from 'react'
import { ArrowRight, Minus, Plus, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ThumbImage } from '@/components/thumb-image'
import { withCacheBust } from '@/components/rough-frame-cycle'
import { AiBusyOverlay, type AiBusyStep } from '@/components/ai-busy-overlay'
import { DirectingArrowEditor } from '@/features/writer/directing-arrow-editor'
import { RoughFramesStill } from '@/features/writer/rough-frames-still'
import { SHOT_TYPES, SHOT_TYPE_DESCRIPTIONS } from '@/features/writer/shot-type-info'
import { CAMERA_ANGLES, angleOfCamera, applyStartEdit, nextApplyStep, readRedrawReply, redrawDirectionOnly, sceneShotLabel, type RoughFrame } from '@/lib/writer/shot-edit'
import { notifyIfQuotaExceeded } from '@/lib/generation-quota-toast'
import { pollGenerationJob } from '@/lib/generation-jobs-client'
import { invalidateShots } from '@/lib/shots-cache'
import { flushShotSave, useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import type { DialogueLine, RoughStoryboardImage, Shot, ShotType } from '@/types'

interface Draft {
  actionDescription: string
  dialogueLines: DialogueLine[]
  shotType: ShotType
  durationSeconds: number
}

function draftOf(shot: Shot): Draft {
  return {
    actionDescription: shot.actionDescription,
    dialogueLines: shot.dialogueLines.map((line) => ({ ...line })),
    shotType: shot.shotType,
    durationSeconds: shot.durationSeconds,
  }
}

/** 시작 묶음에서 바뀐 것만 — 저장할 샷 고침. */
function startChanges(shot: Shot, draft: Draft): Partial<Shot> {
  const changes: Partial<Shot> = {}
  if (draft.actionDescription.trim() !== shot.actionDescription) changes.actionDescription = draft.actionDescription.trim()
  if (JSON.stringify(draft.dialogueLines) !== JSON.stringify(shot.dialogueLines)) changes.dialogueLines = draft.dialogueLines.filter((line) => line.text.trim())
  if (draft.shotType !== shot.shotType) changes.shotType = draft.shotType
  return changes
}

export function StoryboardShotDialog({ shotId, panel, onOpenChange }: { shotId: string | null; panel: RoughStoryboardImage | null; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const shot = useWriterStore((s) => s.shots.find((x) => x.shotId === shotId))
  const shots = useWriterStore((s) => s.shots)
  const sceneManifest = useWriterStore((s) => s.sceneManifest)
  const loadProject = useWriterStore((s) => s.loadProject)
  const updateShot = useWriterStore((s) => s.updateShot)
  const projectId = useProjectStore((s) => s.projectId)
  const [tab, setTab] = useState<'start' | 'direction'>('start')
  // 고치는 중인 값 — 팝업을 열 때마다 저장된 샷에서 새로 시작한다(닫으면 버린다 · 채팅이 바꾼 값을 되돌리지 않게, 검토 지적).
  const [draft, setDraft] = useState<{ shotId: string | null; value: Draft | null }>({ shotId: null, value: null })
  const [busy, setBusy] = useState<{ title: string; steps: AiBusyStep[] } | null>(null)
  // [적용] 뒤 남은 일(nextApplyStep) — 'redraw' = 저장은 됐고 그리기만 다시, 'resave' = 저장부터 다시.
  const [retryStep, setRetryStep] = useState<'redraw' | 'resave' | null>(null)

  if (!shotId && draft.shotId) {
    setDraft({ shotId: null, value: null })
    setRetryStep(null)
  }
  if (!shot || !projectId) return null
  if (draft.shotId !== shot.shotId) {
    setDraft({ shotId: shot.shotId, value: draftOf(shot) })
    setTab('start')
    setRetryStep(null)
  }
  const value = draft.shotId === shot.shotId && draft.value ? draft.value : draftOf(shot)
  const patch = (next: Partial<Draft>) => setDraft({ shotId: shot.shotId, value: { ...value, ...next } })
  const close = () => { if (!busy) onOpenChange(false) }

  const label = sceneShotLabel(sceneManifest, shots, shot.shotId) ?? ''
  const scene = sceneManifest?.scenes.find((item) => item.sceneId === shot.sceneId)
  const location = sceneManifest?.locations.find((item) => item.locationId === scene?.location)
  const castNames = shot.characters.map((id) => sceneManifest?.characters.find((c) => c.characterId === id)?.name ?? id)
  const completed = panel?.status === 'completed' && !!panel.frames
  const frames = completed ? panel!.frames! : null
  const changes = startChanges(shot, value)
  const startDirty = Object.keys(changes).length > 0
  const durationDirty = value.durationSeconds !== shot.durationSeconds
  const angleLabel = t(CAMERA_ANGLES.find((item) => item.value === angleOfCamera(shot.camera))?.label ?? 'Eye level')

  const refresh = async () => {
    await invalidateShots(projectId)
    await loadProject()
  }
  /** 그 샷의 러프를 저장한 내용(스토리 · 샷 타입)으로 새로 그린다 — 보드 카드의 [다시 시도]와 같은 길(force). 다 그릴 때까지 기다린다.
   *  안내는 보드와 같은 구분(readRedrawReply) — 접수 확인 중이면 기다리지 않는다(10분 잠김, 검토 지적). */
  const redrawShot = async (): Promise<boolean> => {
    let res: Response
    try {
      res = await fetch('/api/writer/rough-storyboard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, shotIds: [shot.shotId], force: true }),
      })
    } catch {
      toast.error(t('Regeneration failed'))
      return false
    }
    const body: unknown = await res.json().catch(() => null)
    // 자리 부족 · 콘텐츠 정책 — 보드와 같은 공용 안내.
    if (notifyIfQuotaExceeded(res.status, body)) return false
    const reply = readRedrawReply(res.status, body)
    if (reply.kind === 'confirming') {
      toast.info(t('Confirming the previous rough request. It will not be submitted again.'))
      return false
    }
    if (reply.kind === 'busy') {
      toast.info(t('This shot is still being drawn. Try again in a moment.'))
      return false
    }
    if (reply.kind === 'nothing') {
      toast.error(t('There is nothing to draw yet. Write the story of this shot first.'))
      return false
    }
    if (reply.kind === 'failed') {
      toast.error(t('Regeneration failed'))
      return false
    }
    const results = await Promise.allSettled(reply.jobIds.map((jobId) => pollGenerationJob(jobId)))
    if (results.every((result) => result.status === 'fulfilled')) return true
    toast.error(t('Regeneration failed'))
    return false
  }
  const regenerate = async (frame: RoughFrame): Promise<boolean> => {
    try {
      const res = await fetch('/api/writer/rough-directing-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate-frame', projectId, shotId: shot.shotId, frame }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.error ?? t('Regeneration failed'))
        return false
      }
      return true
    } catch {
      toast.error(t('Regeneration failed'))
      return false
    }
  }
  const steps = (current: 'save' | 'draw' | 'done', drawLabel: string): AiBusyStep[] => {
    const order: Array<'save' | 'draw'> = ['save', 'draw']
    const at = current === 'done' ? order.length : order.indexOf(current)
    const labels = { save: t('Saving the changes'), draw: drawLabel }
    return order.map((key, index) => ({ label: labels[key], state: index < at ? 'done' : index === at ? 'current' : 'todo' }))
  }

  const applyStart = async () => {
    // 저장이 실패했던 고침은 화면에 이미 고친 값이 있어 바뀐 것이 없어 보여도 다시 저장한다(저장은 그 샷의 지금 값을 통째로 쓴다).
    if (startDirty || retryStep === 'resave') updateShot(shot.shotId, changes)
    if (!completed) {
      // 아직 러프가 없는 샷 — 저장만 한다(보드가 빠진 러프를 그릴 때 고친 내용으로 그린다).
      try {
        await flushShotSave(shot.shotId)
        setRetryStep(null)
        onOpenChange(false)
      } catch {
        setRetryStep('resave')
        toast.error(t('Could not save the changes. Please try again.'))
      }
      return
    }
    const drawLabel = t('Redrawing the rough of this shot')
    setBusy({ title: t('Drawing the rough'), steps: steps('save', drawLabel) })
    let saved = false
    let drawn = false
    try {
      drawn = await applyStartEdit({
        save: async () => {
          await flushShotSave(shot.shotId)
          saved = true
        },
        redrawShot: async () => {
          setBusy({ title: t('Drawing the rough'), steps: steps('draw', drawLabel) })
          return redrawShot()
        },
      })
    } catch {
      toast.error(t('Could not save the changes. Please try again.'))
    } finally {
      // 새 그림을 다시 읽은 뒤에 잠금을 푼다 — 풀자마자 옛 그림이 잠깐 보이지 않게.
      await refresh().catch(() => undefined)
      setBusy(null)
    }
    const next = nextApplyStep({ saved, drawn })
    setRetryStep(next === 'close' ? null : next)
    if (next === 'close') {
      toast.success(t('Redrew the rough of this shot with your changes.'))
      onOpenChange(false)
    }
  }
  const redrawDirection = async () => {
    if (durationDirty) updateShot(shot.shotId, { durationSeconds: value.durationSeconds })
    const drawLabel = t('Redrawing the directing frame')
    setBusy({ title: t('Drawing the rough'), steps: steps('save', drawLabel) })
    let ok = false
    try {
      ok = await redrawDirectionOnly({
        save: () => flushShotSave(shot.shotId),
        regenerate: async (frame) => {
          setBusy({ title: t('Drawing the rough'), steps: steps('draw', drawLabel) })
          return regenerate(frame)
        },
      })
    } catch {
      toast.error(t('Could not save the changes. Please try again.'))
    } finally {
      // 새 그림을 다시 읽은 뒤에 잠금을 푼다 — 풀자마자 옛 그림이 잠깐 보이지 않게.
      await refresh().catch(() => undefined)
      setBusy(null)
    }
    if (ok) toast.success(t('Redrew the directing frame. The other two are unchanged.'))
  }
  const saveDuration = async () => {
    updateShot(shot.shotId, { durationSeconds: value.durationSeconds })
    try {
      await flushShotSave(shot.shotId)
      onOpenChange(false)
    } catch {
      toast.error(t('Could not save the changes. Please try again.'))
    }
  }

  const bigFrame = (url: string | null | undefined, caption: string) => (
    <div className="relative overflow-hidden rounded-lg border border-border bg-muted/30">
      {url && panel ? (
        <ThumbImage src={withCacheBust(url, panel.generatedAt)} alt={caption} className="block h-auto w-full" />
      ) : (
        <div className="flex aspect-video items-center justify-center text-sm text-muted-foreground">{t('Not sketched yet')}</div>
      )}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded-sm bg-background/70 px-1.5 text-[11px] text-muted-foreground">{caption}</span>
    </div>
  )

  const groupCard = (key: 'start' | 'direction', title: string, sub: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      aria-pressed={tab === key}
      className={cn('flex-1 rounded-lg border p-3 text-left transition-colors', tab === key ? 'border-foreground bg-accent/40' : 'border-border hover:bg-accent/30')}
      data-testid={`shot-edit-group-${key}`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs text-muted-foreground">{sub}</span>
    </button>
  )

  return (
    <>
      <Dialog open={!!shotId} onOpenChange={(open) => { if (!open) close() }}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-[1080px]" showCloseButton={!busy} data-testid="shot-edit">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="text-base">{t('{label} · edit', { label })}</DialogTitle>
            <DialogDescription>{t('Edit in two groups. Editing the start redraws the rough of this shot; editing the directing frame changes only that frame.')}</DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:overflow-hidden">
            <div className="flex min-w-0 flex-col gap-3 p-6 md:overflow-y-auto">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold">{label}</span>
                <span className="text-xs text-muted-foreground">{t('{seconds}s', { seconds: value.durationSeconds })} · {value.shotType} · {angleLabel}</span>
                <span className="ml-auto inline-flex rounded-full border border-border p-0.5">
                  {(['start', 'direction'] as const).map((key) => (
                    <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={cn('rounded-full px-3 py-0.5 text-xs', tab === key ? 'bg-foreground text-background' : 'text-muted-foreground')}>
                      {t(key === 'start' ? 'Start' : 'Directing')}
                    </button>
                  ))}
                </span>
              </div>
              {tab === 'direction' && completed && panel ? (
                <DirectingArrowEditor key={shot.shotId} projectId={projectId} shotId={shot.shotId} panel={panel} onSaved={() => void loadProject()} />
              ) : (
                bigFrame(tab === 'start' ? frames?.start : frames?.direction, t(tab === 'start' ? 'Start' : 'Directing'))
              )}
              {completed && panel ? (
                <RoughFramesStill key={`still-${shot.shotId}-${panel.generatedAt}`} projectId={projectId} shotId={shot.shotId} panel={panel} onRegenerated={() => void loadProject()} />
              ) : null}
              <p className="text-sm text-muted-foreground">{shot.actionDescription}</p>
            </div>

            <div className="flex min-w-0 flex-col gap-5 border-t border-border p-6 md:overflow-y-auto md:border-l md:border-t-0">
              <div className="flex items-stretch gap-2">
                {groupCard('start', t('Edit the start'), t('Story · dialogue · shot type'))}
                <span className="self-center text-xs text-muted-foreground">{t('→ follows')}</span>
                {groupCard('direction', t('Edit the directing'), t('Arrows · length'))}
              </div>

              {tab === 'start' ? (
                <>
                  <Field title={t('Story (action)')}>
                    <Textarea value={value.actionDescription} onChange={(e) => patch({ actionDescription: e.target.value })} rows={3} placeholder={t('What happens in this shot')} data-testid="shot-edit-story" />
                  </Field>
                  <Field title={t('Characters')} hint={t('From the Artist list')}>
                    {castNames.length ? (
                      <div className="flex flex-wrap gap-1.5">{castNames.map((name) => <span key={name} className="rounded-full border border-border px-2.5 py-0.5 text-xs">{name}</span>)}</div>
                    ) : <p className="text-xs text-muted-foreground">{t('No one appears in this shot')}</p>}
                  </Field>
                  <Field title={t('Background')}>
                    <span className="self-start rounded-md border border-border px-2.5 py-1 text-xs">{location?.name ?? scene?.location ?? t('None')}</span>
                  </Field>
                  <Field title={t('Dialogue')} hint={t('Dialogue you write stays as written')}>
                    <div className="flex flex-col gap-2">
                      {value.dialogueLines.map((line, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Select value={line.characterId ?? '__narration'} onValueChange={(next) => patch({ dialogueLines: value.dialogueLines.map((item, i) => (i === index ? { ...item, characterId: next === '__narration' ? null : next } : item)) })}>
                            <SelectTrigger className="h-8 w-28 shrink-0 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__narration">{t('Narration')}</SelectItem>
                              {shot.characters.map((id, i) => <SelectItem key={id} value={id}>{castNames[i]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Input value={line.text} onChange={(e) => patch({ dialogueLines: value.dialogueLines.map((item, i) => (i === index ? { ...item, text: e.target.value } : item)) })} className="h-8 text-sm" />
                          <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label={t('Delete')} onClick={() => patch({ dialogueLines: value.dialogueLines.filter((_, i) => i !== index) })}>
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="outline" className="self-start" onClick={() => patch({ dialogueLines: [...value.dialogueLines, { characterId: shot.characters[0] ?? null, text: '', emotion: '', delivery: '', durationHint: 0 }] })}>
                        <Plus className="size-3.5" />{t('Dialogue')}
                      </Button>
                    </div>
                  </Field>
                  <Field title={t('Shot type (camera focus)')}>
                    <Select value={value.shotType} onValueChange={(next) => patch({ shotType: next as ShotType })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SHOT_TYPES.map((type) => <SelectItem key={type} value={type}>{type} <span className="text-muted-foreground">· {t(SHOT_TYPE_DESCRIPTIONS[type] ?? type)}</span></SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <p className="text-xs text-muted-foreground">{completed ? t('Applying saves the changes and redraws the rough of this shot (start · directing · end).') : t('This shot has no rough yet. It is drawn with your changes.')}</p>
                </>
              ) : (
                <>
                  <Field title={t('Length')}>
                    <div className="flex items-center gap-2">
                      <Button size="icon" variant="outline" className="size-8" aria-label={t('Shorter')} disabled={value.durationSeconds <= 1} onClick={() => patch({ durationSeconds: Math.max(1, value.durationSeconds - 1) })}><Minus className="size-3.5" /></Button>
                      <span className="w-14 text-center font-mono text-sm">{t('{seconds}s', { seconds: value.durationSeconds })}</span>
                      <Button size="icon" variant="outline" className="size-8" aria-label={t('Longer')} disabled={value.durationSeconds >= 30} onClick={() => patch({ durationSeconds: Math.min(30, value.durationSeconds + 1) })}><Plus className="size-3.5" /></Button>
                    </div>
                  </Field>
                  <p className="text-xs text-muted-foreground">{completed ? t('Draw or erase arrows on the directing frame on the left, then save. The card updates right away.') : t('This shot has no rough yet.')}</p>
                  {completed ? (
                    <Button variant="outline" className="self-start" disabled={!!busy} onClick={() => void redrawDirection()} data-testid="shot-edit-redraw-direction">
                      <RefreshCw className="size-4" />{t('Remake only the directing frame')}
                    </Button>
                  ) : null}
                </>
              )}
              <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{t('✦ You can also just say it: tell the agent "close-up on this shot" and it changes it for you.')}</p>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border px-6 py-3">
            <Button variant="outline" onClick={close} disabled={!!busy}>{t('Cancel')}</Button>
            {tab === 'start' ? (
              <Button onClick={() => void applyStart()} disabled={!!busy || (!startDirty && !retryStep)} data-testid="shot-edit-apply-start">
                {retryStep === 'redraw' && !startDirty ? t('Redraw') : completed ? t('Apply · redraw the rough') : t('Apply')}<ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={() => void saveDuration()} disabled={!!busy || !durationDirty} data-testid="shot-edit-apply-direction">
                {t('Apply')}<ArrowRight className="size-4" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AiBusyOverlay open={!!busy} layer="dialog" title={busy?.title ?? ''} steps={busy?.steps} />
    </>
  )
}

function Field({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        {title}
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </h3>
      {children}
    </section>
  )
}
