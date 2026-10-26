'use client'

// Writer 산문 작업공간(리뉴얼 1차 2026-10-19, 프로토타입 W1 · W1r · W3 · W4 · W5 · W6 · WP · WN).
//   Writer 는 산문만 다룬다 — 제목 아래 설정 칩 · 인물 · 배경 카드 · 스타일이 없다(예전 Meeting Room 을 대신한다).
//   두 탭이 같은 산문을 쓴다: 화면에서 고치기(1안: 조건 줄 + 오른쪽 채팅) · 채팅으로 고치기(2안: 가운데 채팅에 산문 카드).
//   AI 가 일하는 동안(초안 쓰기 · 다시 쓰기 · 수정안)은 화면 전체를 진행 표시로 덮는다.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Check, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AiBusyOverlay, type AiBusyStep } from '@/components/ai-busy-overlay'
import { WriterResumeButton } from '@/components/layout/writer-resume-button'
import { useT } from '@/lib/i18n'
import { withDemoShare } from '@/lib/demo/context'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'
import { proseWorkspaceTab, useWriterRoomStore, type WorkspaceTab } from '@/stores/writer-room-store'
import { useSeriesInfo } from '@/features/series/use-series-info'
import { ProseSeriesBanner } from '@/features/series/prose-series-banner'
import { useProse } from '@/features/prose/use-prose'
import { ConditionBar } from '@/features/prose/condition-bar'
import { ProseDocument } from '@/features/prose/prose-document'
import { ProseChatTab } from '@/features/prose/prose-chat-tab'
import { VariantsPicker } from '@/features/prose/variants-picker'
import { ManualEditDialog } from '@/features/prose/manual-edit-dialog'
import { ProseConfirmDialog } from '@/features/prose/prose-confirm-dialog'

const DRAFT_STEPS = ['Organizing the material', 'Story skeleton', 'Writing the scene story'] as const

export function ProseWorkspace() {
  const t = useT()
  const router = useRouter()
  const prose = useProse()
  const projectId = useProjectStore((s) => s.projectId)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const loadProject = useProducerStore((s) => s.loadProject)
  const rememberedTab = useWriterRoomStore((s) => s.tab)
  // 확정한 산문은 고치기 탭 없이 화면 보기로 연다 — 오른쪽 채팅도 열린다(레이아웃이 같은 규칙을 쓴다, 디자이너 QA 1차 #09).
  const { tab, tabsShown } = proseWorkspaceTab({ tab: rememberedTab, locked: prose.locked })
  const messagesLoaded = useGlobalChatStore((s) => s.messagesLoadedProjectId === projectId)
  // 다음 화(시리즈)면 화면 맨 위에 띠 한 줄로 알린다(프로토타입 W1s). 앞 화 산문은 [앞 화 줄거리 보기]를 누를 때만 따로 읽는다.
  const series = useSeriesInfo(projectId)
  const title = projectTitle && projectTitle !== 'Untitled' ? projectTitle : t('A story without a title yet')

  useEffect(() => {
    useWriterRoomStore.getState().loadTab()
  }, [])
  useEffect(() => {
    if (projectId) void loadProject()
  }, [projectId, loadProject])

  // 산문을 처음 열면 Writer 가 먼저 한 줄 건넨다(프로토타입 채팅 첫 줄) — 이 프로젝트 Writer 채팅이 비어 있을 때 한 번.
  const sceneCount = prose.paragraphs.length
  useEffect(() => {
    if (!projectId || !messagesLoaded || !prose.draftLive || prose.phase !== 'gate' || sceneCount === 0) return
    useGlobalChatStore.getState().announceProseReady(projectId, sceneCount, prose.preserved)
  }, [projectId, messagesLoaded, prose.draftLive, prose.phase, sceneCount, prose.preserved])

  const busySteps = useMemo<AiBusyStep[] | undefined>(() => {
    if (!prose.busy) return undefined
    if (prose.busy.kind === 'draft') {
      const at = prose.busy.step
      // 진행 상태를 읽기 전에는 어느 줄인지 모른다 — 줄 목록 없이 잠근다(다 쓴 초안이 첫 줄부터 다시 쓰는 것처럼 보이지 않게).
      if (at === null) return undefined
      return DRAFT_STEPS.map((label, index) => ({ label: t(label), state: index < at ? 'done' : index === at ? 'current' : 'todo' }))
    }
    return [
      { label: t('Reading the request'), state: 'done' },
      { label: t(prose.busy.kind === 'rewrite' ? 'Writing three versions' : 'Writing the change'), state: 'current' },
    ]
  }, [prose.busy, t])

  // 예전 방식 프로젝트의 씬 스토리 확정(리뉴얼 전 흐름) — 확정하면 나머지를 이어 만들고 Storyboard 로 간다.
  const [legacyConfirming, setLegacyConfirming] = useState(false)
  const confirmLegacy = async () => {
    if (legacyConfirming) return
    setLegacyConfirming(true)
    try {
      const ok = await useGlobalChatStore.getState().confirmSceneGate()
      if (ok === false) toast.error(t('Could not confirm the scene story. Please try again.'))
    } finally {
      setLegacyConfirming(false)
    }
  }

  const variantsOpen = tab === 'screen' && !!prose.proposal?.variants?.length && prose.proposal.status !== 'generating' && !prose.locked
  const currentScenes = (prose.preview?.scenes ?? []).filter((scene) => scene.beats.length > 0).map((scene) => ({ sceneId: scene.sceneId, text: prose.sceneText(scene.beats) }))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="prose-workspace" data-tab={tab}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold" data-testid="prose-title">{title}</h1>
          {prose.locked ? (
            <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground"><Lock className="size-3" />{t('Confirmed')}</Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabsShown ? (
            <Tabs value={tab} onValueChange={(value) => useWriterRoomStore.getState().setTab(value as WorkspaceTab)}>
              <TabsList>
                <TabsTrigger value="screen" data-testid="prose-tab-screen">{t('Edit on screen')}</TabsTrigger>
                <TabsTrigger value="chat" data-testid="prose-tab-chat">{t('Edit in chat')}</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}
          {prose.locked ? (
            <Button onClick={() => router.push(withDemoShare('/studio/artist'))} data-testid="prose-go-artist">
              {t('Go to Artist')}<ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={() => useWriterRoomStore.getState().openConfirm()} disabled={!prose.canBreakdown} data-testid="prose-breakdown">
              {t('Run breakdown')}<ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {series.view ? <ProseSeriesBanner projectId={projectId} view={series.view} /> : null}

      {prose.legacyGate ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-6 py-2.5 text-sm" role="status" data-testid="prose-legacy-gate">
          <p className="min-w-0 flex-1">{t('This project was handed to Writer before the renewal. Confirm the scene story to make the rest (characters, backgrounds, scenes and shots).')}</p>
          <Button size="sm" onClick={() => void confirmLegacy()} disabled={legacyConfirming} data-testid="prose-legacy-confirm">
            {legacyConfirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}{t('Confirm as-is')}
          </Button>
        </div>
      ) : null}

      {prose.runStopped ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-6 py-2.5 text-sm" role="alert" data-testid="prose-run-stopped">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t('AI generation stopped')}</p>
            <p className="break-words text-xs text-muted-foreground">{prose.status?.error ?? t('Background generation stopped.')}</p>
          </div>
          <WriterResumeButton projectId={prose.projectId} onResumed={prose.restartStatus} />
        </div>
      ) : null}

      {tab === 'chat' ? (
        <ProseChatTab prose={prose} title={title} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
            {prose.locked ? (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm" role="status" data-testid="prose-locked-banner">
                <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <p>{t('This prose is confirmed and locked. You can read and copy it, but not change it.')}</p>
              </div>
            ) : prose.preserved ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm" role="status" data-testid="prose-preserved-banner">
                {t('This project uses the script as written. You cannot change the prose. Check it, then run the breakdown.')}
              </div>
            ) : (
              <ConditionBar prose={prose} />
            )}
            <div className="rounded-xl border border-border bg-card/70 p-6">
              <ProseDocument prose={prose} />
            </div>
          </div>
        </div>
      )}

      <Dialog open={variantsOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl" showCloseButton={false} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('Three versions')}</DialogTitle>
            <DialogDescription>{t('Pick one and apply it, or discard them. Your prose stays as it is until you apply.')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto">
            {prose.proposal ? <VariantsPicker proposal={prose.proposal} current={currentScenes} sceneText={prose.sceneText} /> : null}
          </div>
        </DialogContent>
      </Dialog>
      <ManualEditDialog preview={prose.preview} enabled={prose.tools.manual} />
      <ProseConfirmDialog />
      <AiBusyOverlay
        open={!!prose.busy}
        title={t(prose.busy?.kind === 'draft' ? 'Writing the prose draft' : 'Revising the prose')}
        steps={busySteps}
      />
    </div>
  )
}
