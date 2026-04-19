'use client'

import { Lock, Unlock, Loader2, Sparkles, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore } from '@/stores/artist-store'
import {
  CHARACTER_VIEW_KEYS,
  CHARACTER_VIEW_LABELS,
} from '@/types/asset'
import { cn } from '@/lib/utils'

const ROLE_VARIANT = {
  protagonist: 'default',
  antagonist: 'destructive',
  supporting: 'secondary',
} as const

export function CharacterPanel() {
  const {
    sceneManifest,
    characterAssets,
    selectedCharacterId,
    generatingCharacterId,
    selectCharacter,
    lockCharacter,
    unlockCharacter,
    generateSheet,
  } = useArtistStore()

  const getRole = (id: string) =>
    sceneManifest?.characters.find((c) => c.characterId === id)?.role ??
    'supporting'

  return (
    <ScrollArea className="flex-1 px-6 py-4">
      <div className="space-y-4">
        {characterAssets.map((char) => {
          const role = getRole(char.characterId)
          const isSelected = selectedCharacterId === char.characterId
          const isGenerating = generatingCharacterId === char.characterId

          return (
            <div
              key={char.characterId}
              role="button"
              tabIndex={0}
              onClick={() => selectCharacter(char.characterId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ')
                  selectCharacter(char.characterId)
              }}
              className={cn(
                'cursor-pointer rounded-xl border p-4 transition-colors',
                isSelected
                  ? 'border-primary bg-accent'
                  : 'border-border hover:bg-accent/50',
              )}
            >
              {/* Header: Name + Role + Lock */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{char.name}</span>
                  <Badge variant={ROLE_VARIANT[role]}>{role}</Badge>
                </div>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        char.locked
                          ? unlockCharacter(char.characterId)
                          : lockCharacter(char.characterId)
                      }}
                    >
                      {char.locked ? (
                        <Lock className="size-3.5" />
                      ) : (
                        <Unlock className="size-3.5 text-muted-foreground" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {char.locked ? 'Unlock character' : 'Lock character'}
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* 5-View Grid */}
              <div className="grid grid-cols-5 gap-2">
                {CHARACTER_VIEW_KEYS.map((view) => (
                  <div key={view} className="group relative">
                    <ImagePlaceholder
                      label={CHARACTER_VIEW_LABELS[view]}
                      aspectRatio="square"
                      imageUrl={char.views[view] ?? null}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon-xs"
                          disabled={isGenerating || char.locked}
                          className="absolute bottom-1 right-1 opacity-0 shadow transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            generateSheet(char.characterId, [view])
                          }}
                        >
                          <RefreshCw className="size-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Regenerate {CHARACTER_VIEW_LABELS[view]}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ))}
              </div>

              {/* Generate All */}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                disabled={isGenerating || char.locked}
                onClick={(e) => {
                  e.stopPropagation()
                  generateSheet(char.characterId)
                }}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Generate All Views
                  </>
                )}
              </Button>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
