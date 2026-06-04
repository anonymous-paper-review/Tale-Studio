'use client'

import { useState } from 'react'
import { Lock, Unlock, Loader2, Sparkles, Check, Share2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { CharacterViewDialog } from '@/features/artist/character-view-dialog'
import { useArtistStore } from '@/stores/artist-store'
import { useProjectStore } from '@/stores/project-store'
import { registerCharacterCard } from '@/stores/asset-storage-store'
import {
  CHARACTER_VIEW_KEYS,
  CHARACTER_VIEW_LABELS,
  type CharacterViewKey,
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

  const projectId = useProjectStore((s) => s.projectId)
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set())
  const [viewDialog, setViewDialog] = useState<{
    charId: string
    view: CharacterViewKey
  } | null>(null)

  const getRole = (id: string) =>
    sceneManifest?.characters.find((c) => c.characterId === id)?.role ??
    'supporting'

  return (
    <>
      <ScrollArea className="flex-1 px-6 py-4">
      <div className="space-y-4">
        {characterAssets.map((char) => {
          const role = getRole(char.characterId)
          const isSelected = selectedCharacterId === char.characterId
          const isGenerating = generatingCharacterId === char.characterId
          const isRegistered = registeredIds.has(char.characterId)
          const hasImage = CHARACTER_VIEW_KEYS.some((v) => char.views[v])

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
                        if (char.locked) {
                          unlockCharacter(char.characterId)
                        } else {
                          lockCharacter(char.characterId)
                        }
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

              {/* 5-View Grid — 셀 클릭 시 프롬프트 확인/수정 + 재생성 Dialog */}
              <div className="grid grid-cols-5 gap-2">
                {CHARACTER_VIEW_KEYS.map((view) => (
                  <button
                    key={view}
                    type="button"
                    title={`${CHARACTER_VIEW_LABELS[view]} — 클릭해서 프롬프트 보기/재생성`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewDialog({ charId: char.characterId, view })
                    }}
                    className="block w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ImagePlaceholder
                      label={CHARACTER_VIEW_LABELS[view]}
                      aspectRatio="square"
                      imageUrl={char.views[view] ?? null}
                    />
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
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

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isRegistered ? 'secondary' : 'default'}
                      size="sm"
                      disabled={!hasImage || isGenerating}
                      onClick={(e) => {
                        e.stopPropagation()
                        registerCharacterCard(char, projectId ?? 'default')
                        setRegisteredIds((prev) =>
                          new Set(prev).add(char.characterId),
                        )
                      }}
                    >
                      {isRegistered ? (
                        <>
                          <Check className="size-3.5" />
                          Registered
                        </>
                      ) : (
                        <>
                          <Share2 className="size-3.5" />
                          Register
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Register to Asset Storage for the Director stage
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )
        })}
      </div>
      </ScrollArea>

      <CharacterViewDialog
        charId={viewDialog?.charId ?? null}
        view={viewDialog?.view ?? null}
        onClose={() => setViewDialog(null)}
      />
    </>
  )
}
