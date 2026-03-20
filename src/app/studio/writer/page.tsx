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

  // ── No scenes yet: show story input ──
  if (!sceneManifest) {
    return (
      <>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-2xl space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold">The Script Room</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste your story below and let the AI Writer break it into
                scenes.
              </p>
            </div>

            <Textarea
              placeholder="Enter your story here (min 20 characters)…"
              className="min-h-[200px] resize-y"
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
            />

            <Button
              onClick={generateScenes}
              disabled={generating || storyText.trim().length < 20}
              className="w-full"
              size="lg"
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating Scenes & Shots…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Auto-Generate Scenes
                </>
              )}
            </Button>

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

        {/* ── Bottom: Shot Grid + Editor (left) + Chat (right) ── */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Left panel: Shot Grid + Shot Editor */}
          <div className="flex flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
            {/* Shot Grid */}
            <ShotGrid
              shots={sceneShotsFiltered}
              selectedShotId={selectedShotId}
              manifest={sceneManifest}
              onSelectShot={selectShot}
            />

            {/* Shot Detail Editor */}
            <div className="flex flex-1 flex-col overflow-hidden">
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

          {/* Right panel: AI Writer Chat */}
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
