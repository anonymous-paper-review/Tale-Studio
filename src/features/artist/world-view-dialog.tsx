'use client'

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { HoverBeam } from '@/components/hover-beam'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import {
  useArtistStore,
  worldShotDefaultPrompt,
  WORLD_SHOT_LABELS,
  type WorldShotKey,
} from '@/stores/artist-store'

type Props = {
  locationId: string | null
  shot: WorldShotKey | null
  onClose: () => void
}

/**
 * World 샷(wide/establishing) 상세 + 재생성 Dialog.
 * 이미지(또는 placeholder) + 사용 프롬프트(수정 가능) + 생성 버튼.
 * 캐릭터 뷰 Dialog와 대칭 구조.
 */
export function WorldViewDialog({ locationId, shot, onClose }: Props) {
  const world = useArtistStore((s) =>
    s.worldAssets.find((w) => w.locationId === locationId),
  )
  const generateWorldShot = useArtistStore((s) => s.generateWorldShot)
  const selectWorldCandidate = useArtistStore((s) => s.selectWorldCandidate)
  const isGenerating = useArtistStore((s) =>
    locationId ? s.generatingLocations.includes(locationId) : false,
  )

  const defaultPrompt =
    locationId && shot ? worldShotDefaultPrompt(locationId, shot) : ''

  const [prompt, setPrompt] = useState(defaultPrompt)
  const key = `${locationId}:${shot}`
  const [prevKey, setPrevKey] = useState(key)
  if (key !== prevKey) {
    setPrevKey(key)
    setPrompt(defaultPrompt)
  }

  const open = !!locationId && !!shot
  if (!open || !world || !shot) return null

  const imageUrl = world[shot] ?? null
  const label = WORLD_SHOT_LABELS[shot]

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {world.name} — {label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* 이미지 / placeholder */}
          <ImagePlaceholder
            label={label}
            aspectRatio="video"
            imageUrl={imageUrl}
          />

          {/* 후보 히스토리 스트립 — 2개 이상일 때만 (C4 AC18, 캐릭터 대칭). 클릭 = 선택본 되돌리기. */}
          {(world.viewCandidates?.[shot]?.length ?? 0) >= 2 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                후보 히스토리
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {(world.viewCandidates?.[shot] ?? []).map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => selectWorldCandidate(world.locationId, shot, cand.id)}
                    className={`relative shrink-0 overflow-hidden rounded-md border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      cand.isSelected
                        ? 'border-primary'
                        : 'border-transparent hover:border-muted-foreground/40'
                    }`}
                  >
                    <img
                      src={cand.url}
                      alt=""
                      className="h-16 w-24 object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {cand.isSelected && (
                      <span className="absolute right-0.5 top-0.5 rounded bg-primary px-1 text-[9px] text-primary-foreground">
                        선택
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 사용 프롬프트 (수정 가능) */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              프롬프트 (수정 후 생성)
            </label>
            <HoverBeam>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="이 배경 이미지를 만들 프롬프트"
              />
            </HoverBeam>
          </div>

          {/* 생성 버튼 */}
          <Button
            className="w-full"
            disabled={isGenerating || !prompt.trim()}
            onClick={() => generateWorldShot(world.locationId, shot, prompt)}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                생성 중…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {imageUrl ? '재생성' : '생성'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
