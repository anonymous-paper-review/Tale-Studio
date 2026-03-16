'use client'

import { Video, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { AngleControl } from './angle-control'
import { KeyLight } from './key-light'
import type { Shot, CameraConfig, LightingConfig } from '@/types'

interface CinematographicInspectorProps {
  shot: Shot | undefined
  onUpdateCamera: (config: Partial<CameraConfig>) => void
  onUpdateLighting: (config: Partial<LightingConfig>) => void
  onGenerateVideo?: () => void
  isGenerating?: boolean
}

export function CinematographicInspector({
  shot,
  onUpdateCamera,
  onUpdateLighting,
  onGenerateVideo,
  isGenerating,
}: CinematographicInspectorProps) {
  if (!shot) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Select a shot</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        {/* Shot info header */}
        <div>
          <h3 className="text-sm font-semibold">Inspector</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {shot.shotType} — {shot.generationMethod}
          </p>
        </div>

        <Separator />

        <AngleControl camera={shot.camera} onUpdate={onUpdateCamera} />

        <Separator />

        <KeyLight lighting={shot.lighting} onUpdate={onUpdateLighting} />

        {/* Dialogue preview */}
        {shot.dialogueLines.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dialogue
              </h4>
              {shot.dialogueLines.map((line, i) => (
                <p key={i} className="text-xs italic text-muted-foreground">
                  &ldquo;{line.text}&rdquo;
                </p>
              ))}
            </div>
          </>
        )}

        <Separator />

        {/* Generate Video */}
        <Button
          className="w-full"
          onClick={onGenerateVideo}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Video className="mr-2 size-4" />
              Generate Video
            </>
          )}
        </Button>
      </div>
    </ScrollArea>
  )
}
