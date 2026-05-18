'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { HandoffButton } from '@/components/layout/handoff-button'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { SceneCards } from '@/features/writer/scene-cards'
import { ShotsDialog } from '@/features/writer/shots-dialog'

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

  const [autoGenTriggered, setAutoGenTriggered] = useState(false)
  const [openSceneId, setOpenSceneId] = useState<string | null>(null)

  useEffect(() => {
    if (projectId) loadProject()
  }, [projectId, loadProject])

  // Auto-generate scenes if story exists but no scenes yet
  useEffect(() => {
    if (
      storyText &&
      storyText.length >= 20 &&
      !sceneManifest &&
      !generating &&
      !autoGenTriggered
    ) {
      setAutoGenTriggered(true)
      generateScenes()
    }
  }, [storyText, sceneManifest, generating, autoGenTriggered, generateScenes])

  const shotCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of shots) m[s.sceneId] = (m[s.sceneId] ?? 0) + 1
    return m
  }, [shots])

  // ── No scenes yet ──
  if (!sceneManifest) {
    return (
      <>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-md space-y-4 text-center">
            {generating ? (
              <>
                <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
                <h1 className="text-xl font-bold">Generating Scenes…</h1>
                <p className="text-sm text-muted-foreground">
                  The AI is breaking your story into scenes and shots.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold">No Scenes Yet</h1>
                <p className="text-sm text-muted-foreground">
                  Go back to The Meeting Room and complete your story with
                  the Producer. Scenes will be generated automatically when
                  you hand off.
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
          </div>
        </div>
        <HandoffButton
          label="Ask Concept Artist"
          targetStage="artist"
          disabled
        />
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

        <main className="flex min-h-0 items-center justify-center p-8">
          <div className="max-w-sm space-y-2 text-center text-sm text-muted-foreground">
            <h2 className="text-base font-semibold text-foreground">
              The Script Room
            </h2>
            <p>
              Click a scene on the left to edit its shots, or use the chat on
              the right to refine anything — {'"'}add a shot to scene 2{'"'},
              {' "'}regenerate scene 3{'"'}, and so on.
            </p>
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
