'use client'

import { useEffect, useState } from 'react'
import {
  Loader2,
  Sparkles,
  Save,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { HandoffButton } from '@/components/layout/handoff-button'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { SceneCards } from '@/features/writer/scene-cards'
import { ShotGrid } from '@/features/writer/shot-grid'
import { ShotEditor } from '@/features/writer/shot-editor'
import { WriterChat } from '@/features/writer/writer-chat'

export default function WriterPage() {
  const {
    storyText,
    sceneManifest,
    selectedSceneId,
    shots,
    selectedShotId,
    generating,
    chatMessages,
    chatLoading,
    error,
    setStoryText,
    generateScenes,
    selectScene,
    selectShot,
    updateShot,
    addDialogueLine,
    removeDialogueLine,
    updateDialogueLine,
    sendChatMessage,
    clearError,
  } = useWriterStore()

  const projectId = useProjectStore((s) => s.projectId)
  const loadProject = useWriterStore((s) => s.loadProject)

  useEffect(() => {
    if (projectId) loadProject()
  }, [projectId, loadProject])

  const [storyCollapsed, setStoryCollapsed] = useState(false)

  const sceneShotsFiltered = shots.filter(
    (s) => s.sceneId === selectedSceneId,
  )
  const selectedShot = shots.find((s) => s.shotId === selectedShotId)

  // ── No scenes yet: scenes should have been generated during Producer handoff ──
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
                  Go back to The Meeting Room and complete your story with the Producer.
                  Scenes will be generated automatically when you hand off.
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

  // ── Scenes generated: full layout ──
  return (
    <>
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <div>
            <h1 className="text-lg font-semibold">The Script Room</h1>
            <p className="text-xs text-muted-foreground">
              Organize your plot (Ki-Seung-Jeon-Gyeol)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 text-xs">
              <Save className="size-3" />
              Auto-Save
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={generateScenes}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Regenerate
            </Button>
          </div>
        </div>

        {/* ── Collapsible Story Input ── */}
        <div className="border-b border-border">
          <button
            type="button"
            className="flex w-full items-center justify-between px-6 py-2 text-xs text-muted-foreground hover:bg-accent/50"
            onClick={() => setStoryCollapsed(!storyCollapsed)}
          >
            <span>Original Story ({storyText.length} chars)</span>
            {storyCollapsed ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronUp className="size-3.5" />
            )}
          </button>
          {!storyCollapsed && (
            <div className="px-6 pb-3">
              <Textarea
                className="min-h-[80px] resize-y text-sm"
                value={storyText}
                onChange={(e) => setStoryText(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* ── Scene Cards ── */}
        <SceneCards
          manifest={sceneManifest}
          selectedSceneId={selectedSceneId}
          onSelectScene={selectScene}
        />

        {/* ── Middle: Shot Grid + Editor ── */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Left: Shot Grid */}
          <ShotGrid
            shots={sceneShotsFiltered}
            selectedShotId={selectedShotId}
            manifest={sceneManifest}
            onSelectShot={selectShot}
          />

          {/* Right: Shot Detail Editor */}
          <div className="flex min-h-0 flex-1 flex-col border-t border-border lg:border-l lg:border-t-0">
            <div className="border-b border-border px-6 py-2">
              <span className="text-sm font-semibold">Shot Detail Editor</span>
              {selectedShot && (
                <span className="ml-2 text-xs text-muted-foreground">
                  [{selectedShot.shotId}]
                </span>
              )}
            </div>

            {selectedShot ? (
              <ShotEditor
                shot={selectedShot}
                manifest={sceneManifest}
                onUpdateShot={updateShot}
                onAddDialogue={addDialogueLine}
                onRemoveDialogue={removeDialogueLine}
                onUpdateDialogue={updateDialogueLine}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {sceneShotsFiltered.length > 0
                  ? 'Select a shot above'
                  : 'Generate scenes to create shots'}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom: AI Writer Chat (full width) ── */}
        <div className="h-64 border-t border-border">
          <WriterChat
            messages={chatMessages}
            loading={chatLoading}
            onSend={sendChatMessage}
          />
        </div>
      </div>

      {/* Error bar */}
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
