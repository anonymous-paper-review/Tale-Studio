'use client'

import { useEffect } from 'react'
import { Loader2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { VideoPreviewer } from '@/features/editor/video-previewer'
import { SceneTabs } from '@/features/editor/scene-tabs'
import { ShotTimeline } from '@/features/editor/shot-timeline'
import { EditToolbar } from '@/features/editor/edit-toolbar'
import { useEditorStore } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'

export default function PostPage() {
  const {
    shots,
    videoClips,
    selectedSceneId,
    selectedClipShotId,
    clipOrder,
    rendering,
    error,
    loadData,
    selectScene,
    selectClip,
    reorderClips,
    deleteClip,
    renderDraft,
  } = useEditorStore()

  const projectId = useProjectStore((s) => s.projectId)

  useEffect(() => {
    loadData()
  }, [projectId, loadData])

  const sceneIds = [...new Set(shots.map((s) => s.sceneId))]
  const currentOrder = selectedSceneId
    ? clipOrder[selectedSceneId] ?? []
    : []
  const selectedShot = shots.find((s) => s.shotId === selectedClipShotId)
  const selectedClip = videoClips.find(
    (c) => c.shotId === selectedClipShotId,
  )

  if (shots.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Post-Production Suite</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete previous steps first to load video clips.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Top: Video Previewer */}
      <div className="flex-1">
        <VideoPreviewer shot={selectedShot} clip={selectedClip} />
      </div>

      <Separator />

      {/* Bottom panel */}
      <div className="flex h-48 shrink-0">
        {/* Scene Tabs + Timeline */}
        <div className="flex flex-1 flex-col">
          {/* Scene tabs */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <SceneTabs
              sceneIds={sceneIds}
              selectedSceneId={selectedSceneId}
              onSelect={selectScene}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={renderDraft}
              disabled={rendering}
              className="gap-1.5"
            >
              {rendering ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              {rendering ? 'Rendering…' : 'Draft Render'}
            </Button>
          </div>

          {/* Timeline */}
          <ShotTimeline
            orderedShotIds={currentOrder}
            shots={shots}
            videoClips={videoClips}
            selectedShotId={selectedClipShotId}
            onSelect={selectClip}
            onReorder={(from, to) =>
              selectedSceneId && reorderClips(selectedSceneId, from, to)
            }
            onDelete={deleteClip}
          />

          {error && (
            <p className="px-4 pb-2 text-xs text-destructive">{error}</p>
          )}
        </div>

        {/* Right: Edit Toolbar */}
        <EditToolbar />
      </div>
    </div>
  )
}
