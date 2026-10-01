'use client'

// Producer 메인의 씬 스토리(2026-10-01 오너 "writer 파이프라인 full run 전 scene 스토리 수정 과정을 producer 메인에 넣는다").
//   Writer 로 넘기면 Writer 가 먼저 씬 스토리 초안을 쓰고(#s3-gate) 확정을 기다린다. 그 확인·수정·확정을 여기서 한다 —
//   수정 요청은 채팅 입력창(게이트 제안이 활성인 동안 입력은 수정 요청으로 간다), 확정은 이 버튼이나 빈 입력창 Enter.
//   확정하면 나머지 생성이 이어지고 Writer 화면으로 간다(그 화면은 조작 없이 진행만 보여 준다).
//   확정 뒤에는 읽기 전용 문서로 남는다(대본 보존 프로젝트는 원본 대본, 오너 "원본 보여줘").
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, FileText, Loader2, MessageSquareText, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { replaceSlugs } from '@/lib/script-lines'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'
import { useWriterStatus } from '@/lib/writer/use-writer-status'
import { writerProgressView } from '@/lib/writer/progress-view'
import { sceneGatePhase, sceneGateSuggestion } from '@/lib/writer/scene-gate'
import { sceneStoryView } from '@/lib/producer/scene-story'
import { useLocale, useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { useWriterStore } from '@/stores/writer-store'

// 확정 안내 재등록 주기 — 다른 제안에 밀리거나 수정 요청으로 내려가도 확정 대기인 동안 되살린다(WriterGenerationView 에서 옮김).
const SCENE_GATE_REOFFER_MS = 3000

export function SceneStorySection() {
  const t = useT()
  const locale = useLocale()
  const projectId = useProjectStore((s) => s.projectId)
  const locked = useProjectStore((s) => s.producerLocked)
  const currentStage = useProjectStore((s) => s.currentStage)
  const preserveScript = useProducerStore((s) => s.preserveScript)
  const storyText = useProducerStore((s) => s.storyText)
  const savedScenes = useWriterStore((s) => s.sceneManifest?.scenes)
  const confirmSceneGate = useGlobalChatStore((s) => s.confirmSceneGate)
  const { status } = useWriterStatus(locked ? projectId : null)
  const phase = locked ? sceneGatePhase(status) : 'before'
  const showOriginal = preserveScript === true && storyText.trim().length > 0
  const { preview } = useWriterPreview(projectId, { enabled: locked && !showOriginal })
  const [confirming, setConfirming] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  const roster = preview?.roster ?? []
  const streamed = (preview?.scenes ?? [])
    .filter((scene) => scene.beats.length > 0)
    .map((scene) => replaceSlugs(scene.beats.join(' '), roster, ''))
  const saved = [...(savedScenes ?? [])]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((scene) => scene.narrativeSummary?.trim() ?? '')
    .filter(Boolean)
  const view = sceneStoryView({ preserveScript, storyText, locked, streamed, saved })
  const paragraphs = view.kind === 'scenes' ? view.paragraphs : []
  const text = view.kind === 'original' ? view.text : paragraphs.join('\n\n')
  const progress = writerProgressView(status, locale)

  // 확정 대기 동안 채팅에 확정 안내를 띄운다 — Producer 단계 제안이라 채팅 입력이 수정 요청으로 간다.
  const gateMessage = t(
    "The scene story draft is ready. Review it on the Producer screen.\nType changes in the input box below, or press Enter with it empty to confirm and continue.",
  )
  const confirmLabel = t('Confirm as-is')
  useEffect(() => {
    if (phase !== 'gate' || !projectId || currentStage !== 'producer') return
    const offer = () => {
      const chat = useGlobalChatStore.getState()
      // 예전 Writer 단계로 떠 있던 같은 확정 안내는 내린다 — 단계가 달라 입력이 수정 요청으로 가지 않는다.
      if (chat.suggestion?.id === `scene-gate:${projectId}` && chat.suggestion.stage !== 'producer') chat.dismissSuggestion({ implicit: true })
      chat.offerSuggestion(sceneGateSuggestion(projectId, gateMessage, confirmLabel), { preempt: true })
    }
    offer()
    const iv = setInterval(offer, SCENE_GATE_REOFFER_MS)
    return () => {
      clearInterval(iv)
      const current = useGlobalChatStore.getState().suggestion
      if (current?.id === `scene-gate:${projectId}`) useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
    }
  }, [phase, projectId, currentStage, gateMessage, confirmLabel])

  // 씬 스토리를 쓰기 시작하거나 확정을 기다리면 이 문서를 화면에 보여 준다(위 카드에 가려지지 않게).
  useEffect(() => {
    if (phase !== 'writing' && phase !== 'gate') return
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [phase])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('Copied'))
    } catch {
      toast.error(t('Could not copy. Select the text and copy it instead.'))
    }
  }

  const confirm = async () => {
    if (confirming) return
    setConfirming(true)
    try {
      const ok = await confirmSceneGate()
      if (ok) toast.success(t('Scenes confirmed. Starting character, visual, and shot design'))
      else toast.error(t('Could not confirm the scene story. Please try again.'))
    } finally {
      setConfirming(false)
    }
  }

  const badge =
    phase === 'writing'
      ? { label: t('Writer is drafting'), tone: 'busy' as const }
      : phase === 'gate'
        ? { label: t('Waiting for your confirmation'), tone: 'gate' as const }
        : phase === 'continuing'
          ? { label: t('Confirmed, Writer is making the rest'), tone: 'quiet' as const }
          : phase === 'failed'
            ? { label: t('Writer stopped'), tone: 'gate' as const }
            : { label: showOriginal ? t('Original script, kept as written') : t('Read only'), tone: 'quiet' as const }

  return (
    <section ref={sectionRef} className="scroll-mt-4 space-y-3" data-testid="producer-scene-story" data-phase={phase}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t('Scene story')}</h2>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]',
              badge.tone === 'busy' && 'border-primary/40 text-foreground',
              badge.tone === 'gate' && 'border-warning/50 bg-warning/10 text-warning',
              badge.tone === 'quiet' && 'border-border text-muted-foreground',
            )}
          >
            {badge.tone === 'busy' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            {badge.label}
          </span>
        </div>
        {text.trim() && phase !== 'writing' ? (
          <Button size="sm" variant="outline" onClick={() => void copy()}>
            <Copy className="size-4" /> {t('Copy')}
          </Button>
        ) : null}
      </div>

      <div className={cn('rounded-xl border bg-card/70 p-6', phase === 'gate' ? 'border-warning/50' : 'border-border')}>
        {phase === 'writing' ? (
          <div className="mb-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{progress.label}</span>
            <span>{progress.detail}</span>
            <div className="ml-auto h-1.5 w-32 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={progress.label} aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : null}

        {view.kind === 'original' ? (
          <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap font-mono text-[13px] leading-6 text-foreground/90">
            {view.text}
          </pre>
        ) : view.kind === 'scenes' ? (
          <article className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">
            {paragraphs.map((paragraph, index) => (
              <div key={index} className="flex gap-3">
                <span className="w-7 shrink-0 pt-1 font-mono text-[11px] text-muted-foreground">S{index + 1}</span>
                <p className="text-[15px] leading-8 text-foreground/90">{paragraph}</p>
              </div>
            ))}
          </article>
        ) : view.kind === 'writing' ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <ScrollText className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t('Writer is still writing the scenes. They appear here as they are ready.')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <FileText className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{t('No scene story yet')}</p>
            <p className="max-w-md text-xs text-muted-foreground">
              {t('When you hand over to Writer, Writer first drafts the scene story here. Review it, ask for changes, and confirm it before the rest is made.')}
            </p>
          </div>
        )}

        {phase === 'gate' ? (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-4" data-testid="scene-gate-actions">
            <Button onClick={() => void confirm()} disabled={confirming} data-testid="scene-gate-confirm">
              {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {t('Confirm as-is')}
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageSquareText className="size-3.5 shrink-0" aria-hidden />
              {t('To change something, type it in the chat input. Pressing Enter on an empty input also confirms.')}
            </p>
          </div>
        ) : null}

        {phase === 'continuing' ? (
          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            {t('Confirmed. Writer is making characters, visuals, shots, and dialogue. Follow the progress on the Writer screen.')}
          </p>
        ) : null}
        {phase === 'failed' ? (
          <p className="mt-5 border-t border-border pt-4 text-xs text-warning">
            {t('Writer stopped. Check the error on the Writer screen and continue from there.')}
          </p>
        ) : null}
      </div>
    </section>
  )
}
