'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { HandoffButton } from '@/components/layout/handoff-button'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { SceneCards } from '@/features/writer/scene-cards'
import { ShotsDialog } from '@/features/writer/shots-dialog'
import { MediaGenerationPanel } from '@/features/writer/media-generation-panel'
import { useSvcStatus } from '@/lib/svc/use-svc-status'

export default function WriterPage() {
  const {
    storyText,
    sceneManifest,
    shots,
    generating,
    error,
    generateScenes,
    clearError,
  } = useWriterStore()

  const projectId = useProjectStore((s) => s.projectId)
  const loadProject = useWriterStore((s) => s.loadProject)
  const reorderScenes = useWriterStore((s) => s.reorderScenes)

  // svc-pipeline 진행상황 폴링
  const { status: svcStatus } = useSvcStatus(projectId)
  const svcActive =
    !!svcStatus?.started &&
    !svcStatus.pipeline_completed &&
    !svcStatus.pipeline_failed

  const [autoGenTriggered, setAutoGenTriggered] = useState(false)
  const [openSceneId, setOpenSceneId] = useState<string | null>(null)

  useEffect(() => {
    if (projectId) loadProject()
  }, [projectId, loadProject])

  // 스토리는 있으나 씬이 아직 없고 svc-pipeline 미실행이면 자동 생성
  useEffect(() => {
    if (
      storyText &&
      storyText.length >= 20 &&
      !sceneManifest &&
      !generating &&
      !autoGenTriggered &&
      !svcStatus?.started
    ) {
      setAutoGenTriggered(true)
      generateScenes()
    }
  }, [
    storyText,
    sceneManifest,
    generating,
    autoGenTriggered,
    generateScenes,
    svcStatus?.started,
  ])

  const shotCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of shots) m[s.sceneId] = (m[s.sceneId] ?? 0) + 1
    return m
  }, [shots])

  // ── No scenes yet ──
  if (!sceneManifest) {
    return (
      <>
        <div className="flex flex-1 flex-col overflow-y-auto p-8">
          <div className="mx-auto w-full max-w-3xl space-y-4 text-center">
            {svcActive ? (
              <>
                <Sparkles className="mx-auto size-8 animate-pulse text-primary" />
                <h1 className="text-xl font-bold">AI 자동 생성 진행 중…</h1>
                <div className="text-sm text-muted-foreground">
                  <div>
                    현재 단계:{' '}
                    <span className="font-mono">
                      {svcStatus?.current_stage ?? '시작 중'}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${svcStatus?.progress_percent ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs">
                    {svcStatus?.progress_percent ?? 0}%
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  스토리, 캐릭터, 씬, 샷, 프롬프트를 백그라운드에서 생성 중. 약 3-5분.
                </p>
              </>
            ) : generating ? (
              <>
                <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
                <h1 className="text-xl font-bold">Generating Scenes…</h1>
                <p className="text-sm text-muted-foreground">
                  The AI is breaking your story into scenes and shots.
                </p>
              </>
            ) : svcStatus?.pipeline_failed ? (
              <>
                <h1 className="text-xl font-bold text-destructive">
                  AI 자동 생성 실패
                </h1>
                <p className="text-sm text-muted-foreground">
                  {svcStatus.error ?? 'svc-pipeline error'}
                </p>
                <p className="text-xs text-muted-foreground">
                  아래 수동 작성 버튼으로 직접 진행 가능.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold">No Scenes Yet</h1>
                <p className="text-sm text-muted-foreground">
                  Go back to The Meeting Room and complete your story with the
                  Producer. Scenes will be generated automatically when you hand
                  off.
                </p>
              </>
            )}

            {error && (
              <button
                type="button"
                className="w-full rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive"
                onClick={clearError}
              >
                {error}
              </button>
            )}

            <MediaGenerationPanel projectId={projectId} svcStatus={svcStatus} />
          </div>
        </div>
        <HandoffButton label="Ask Concept Artist" targetStage="artist" disabled />
      </>
    )
  }

  // ── Scene list + chat-centric layout ──
  return (
    <>
      <div className="grid h-full grid-cols-[280px_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-border">
          <SceneCards
            manifest={sceneManifest}
            shotCounts={shotCounts}
            onOpenScene={setOpenSceneId}
            activeSceneId={openSceneId}
            onReorder={reorderScenes}
          />
        </aside>

        <main className="flex min-h-0 flex-col overflow-y-auto p-8">
          <div className="mx-auto w-full max-w-3xl space-y-4">
            <div className="text-center text-sm text-muted-foreground">
              <h2 className="text-base font-semibold text-foreground">
                The Script Room
              </h2>
              <p className="mt-1">Click a scene on the left to edit its shots.</p>
            </div>

            <MediaGenerationPanel projectId={projectId} svcStatus={svcStatus} />
          </div>
        </main>
      </div>

      <ShotsDialog
        sceneId={openSceneId}
        manifest={sceneManifest}
        shots={shots}
        onClose={() => setOpenSceneId(null)}
      />

      {error && (
        <button
          type="button"
          className="w-full border-t border-destructive/30 bg-destructive/10 px-6 py-2 text-left text-sm text-destructive"
          onClick={clearError}
        >
          {error}
        </button>
      )}

      <HandoffButton
        label="Ask Concept Artist"
        targetStage="artist"
        disabled={shots.length === 0}
      />
    </>
  )
}
