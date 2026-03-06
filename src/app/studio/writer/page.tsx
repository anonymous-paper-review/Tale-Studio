'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Loader2,
  Sparkles,
  MapPin,
  Clock,
  Swords,
  Send,
  Save,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { HandoffButton } from '@/components/layout/handoff-button'
import { useWriterStore } from '@/stores/writer-store'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'
import type { Act } from '@/types'

const ACT_LABELS: Record<Act, string> = {
  intro: 'INTRODUCTION',
  dev: 'DEVELOPMENT',
  turn: 'TURN',
  conclusion: 'CONCLUSION',
}

const ACT_COLORS: Record<Act, string> = {
  intro: 'border-blue-500/50 bg-blue-500/5',
  dev: 'border-amber-500/50 bg-amber-500/5',
  turn: 'border-red-500/50 bg-red-500/5',
  conclusion: 'border-emerald-500/50 bg-emerald-500/5',
}

const ACT_ACCENT: Record<Act, string> = {
  intro: 'bg-blue-500',
  dev: 'bg-amber-500',
  turn: 'bg-red-500',
  conclusion: 'bg-emerald-500',
}

export default function WriterPage() {
  const {
    storyText,
    sceneManifest,
    selectedSceneId,
    generating,
    chatMessages,
    chatLoading,
    error,
    setStoryText,
    generateScenes,
    selectScene,
    updateScene,
    sendChatMessage,
    clearError,
  } = useWriterStore()

  const projectId = useProjectStore((s) => s.projectId)
  const loadProject = useWriterStore((s) => s.loadProject)

  useEffect(() => {
    if (projectId) loadProject()
  }, [projectId, loadProject])

  const [chatInput, setChatInput] = useState('')
  const [storyCollapsed, setStoryCollapsed] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const selectedScene = sceneManifest?.scenes.find(
    (s) => s.sceneId === selectedSceneId,
  )

  const getLocationName = (locId: string) =>
    sceneManifest?.locations.find((l) => l.locationId === locId)?.name ?? locId

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const msg = chatInput
    setChatInput('')
    await sendChatMessage(msg)
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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
                  Generating Scenes…
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

  // ── Scenes generated: show cards + editor + chat ──
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

        {/* ── Scene Cards (horizontal) ── */}
        <div className="border-b border-border px-6 py-4">
          <div className="grid grid-cols-4 gap-3">
            {sceneManifest.scenes.map((scene) => {
              const isSelected = selectedSceneId === scene.sceneId
              return (
                <button
                  key={scene.sceneId}
                  type="button"
                  onClick={() => selectScene(scene.sceneId)}
                  className={cn(
                    'rounded-lg border-2 p-3 text-left transition-all',
                    ACT_COLORS[scene.act],
                    isSelected
                      ? 'border-primary ring-1 ring-primary/30'
                      : 'hover:brightness-110',
                  )}
                >
                  {/* Act label bar */}
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        ACT_ACCENT[scene.act],
                      )}
                    />
                    <span className="text-[10px] font-bold tracking-wider text-muted-foreground">
                      {ACT_LABELS[scene.act]}
                    </span>
                  </div>

                  {/* Scene name */}
                  <p className="mb-2 line-clamp-2 text-sm font-medium leading-tight">
                    {scene.narrativeSummary.split(' ').slice(0, 6).join(' ')}…
                  </p>

                  {/* Meta */}
                  <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {getLocationName(scene.location)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {scene.timeOfDay}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Bottom: Editor (left) + Chat (right) ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Scene Detail Editor */}
          <div className="flex flex-1 flex-col border-r border-border">
            <div className="border-b border-border px-6 py-3">
              <span className="text-sm font-semibold">Scene Detail Editor</span>
              {selectedScene && (
                <span className="ml-2 text-xs text-muted-foreground">
                  [{selectedScene.sceneId}]
                </span>
              )}
            </div>

            {selectedScene ? (
              <ScrollArea className="flex-1 px-6 py-4">
                <div className="space-y-4">
                  {/* Location / Time of Day / Mood */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <MapPin className="size-3" />
                        LOCATION
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                        value={getLocationName(selectedScene.location)}
                        onChange={(e) => {
                          const loc = sceneManifest.locations.find(
                            (l) => l.locationId === selectedScene.location,
                          )
                          if (loc) {
                            useWriterStore.setState((state) => ({
                              sceneManifest: state.sceneManifest
                                ? {
                                    ...state.sceneManifest,
                                    locations:
                                      state.sceneManifest.locations.map((l) =>
                                        l.locationId === loc.locationId
                                          ? { ...l, name: e.target.value }
                                          : l,
                                      ),
                                  }
                                : null,
                            }))
                          }
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Clock className="size-3" />
                        TIME OF DAY
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                        value={selectedScene.timeOfDay}
                        onChange={(e) =>
                          updateScene(selectedScene.sceneId, {
                            timeOfDay: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        <Swords className="size-3" />
                        MOOD
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                        value={selectedScene.mood}
                        onChange={(e) =>
                          updateScene(selectedScene.sceneId, {
                            mood: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Narrative Summary */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      SCENE SUMMARY
                    </label>
                    <Textarea
                      className="min-h-[60px] resize-y text-sm"
                      value={selectedScene.narrativeSummary}
                      onChange={(e) =>
                        updateScene(selectedScene.sceneId, {
                          narrativeSummary: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* Original Text Quote */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      ORIGINAL TEXT QUOTE
                    </label>
                    <Textarea
                      className="min-h-[60px] resize-y text-sm italic"
                      value={selectedScene.originalTextQuote}
                      onChange={(e) =>
                        updateScene(selectedScene.sceneId, {
                          originalTextQuote: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* Characters present */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      CHARACTERS
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedScene.charactersPresent.map((charId) => {
                        const char = sceneManifest.characters.find(
                          (c) => c.characterId === charId,
                        )
                        return (
                          <Badge key={charId} variant="secondary">
                            {char?.name ?? charId}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Select a scene card above
              </div>
            )}
          </div>

          {/* ── Chat Panel ── */}
          <div className="flex w-80 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <MessageSquare className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold">AI Writer</span>
            </div>

            <ScrollArea className="flex-1 px-4 py-3">
              <div className="space-y-3">
                {chatMessages.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Ask the AI Writer to help refine your scenes, suggest
                    improvements, or discuss story structure.
                  </p>
                )}
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      msg.role === 'user'
                        ? 'ml-4 bg-primary/10 text-foreground'
                        : 'mr-4 bg-muted text-foreground',
                    )}
                  >
                    {msg.content}
                  </div>
                ))}
                {chatLoading && (
                  <div className="mr-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Thinking…
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-border p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
                  placeholder="Ask about your scenes…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleChat()
                    }
                  }}
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={handleChat}
                  disabled={chatLoading || !chatInput.trim()}
                >
                  <Send className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
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

      <HandoffButton label="Ask Concept Artist" targetStage="artist" />
    </>
  )
}
