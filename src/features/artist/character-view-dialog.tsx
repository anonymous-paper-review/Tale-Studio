'use client'

import { Loader2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore } from '@/stores/artist-store'
import { CHARACTER_VIEW_LABELS, type CharacterViewKey } from '@/types/asset'
import { isImageStale } from '@/lib/image-provenance'

type Props = {
  charId: string | null
  view: CharacterViewKey | null
  onClose: () => void
}

/**
 * 캐릭터 뷰 상세 — 선택 뷰 프리뷰 + 단일 뷰 재생성 (crop 폐기, 2026-06-05).
 * main = 대표 포트레이트(T2I), 방향 뷰 = main 을 reference 로 한 i2i. 각 뷰를 개별 재생성한다.
 */
export function CharacterViewDialog({ charId, view, onClose }: Props) {
  const char = useArtistStore((s) =>
    s.characterAssets.find((c) => c.characterId === charId),
  )
  const generateCharacterView = useArtistStore((s) => s.generateCharacterView)
  const selectCandidate = useArtistStore((s) => s.selectCandidate)
  const isGenerating = useArtistStore((s) =>
    view ? s.generatingViews.includes(`${charId}:${view}`) : false,
  )

  const open = !!charId && !!view
  if (!open || !char || !view) return null

  const imageUrl = char.views[view] ?? null
  const label = CHARACTER_VIEW_LABELS[view]
  const isObject = char.entityType === 'object'
  // object 캐릭터는 방향뷰 개념 없음 — isDirectional/needsMain 로직 미적용
  const isDirectional = !isObject && view !== 'main'
  const needsMain = isDirectional && !char.views.main

  // stale 판정: 선택된 후보의 sourceHash 기준 (정보 표시만)
  const candidates = char.viewCandidates[view] ?? []
  const selectedCandidate = candidates.find((c) => c.isSelected)
  const isStale = isImageStale(char.fixedPrompt, selectedCandidate?.sourceHash ?? null)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {char.name} — {label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {isStale && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <Badge variant="destructive" className="shrink-0 px-1.5 py-0 text-[10px]">
                낡음
              </Badge>
              외모가 바뀌어 이 이미지는 낡았어요 — 재생성하거나 후보를 고르세요
            </div>
          )}

          <div className="mx-auto w-full max-w-sm">
            <ImagePlaceholder
              label={label}
              aspectRatio="square"
              imageUrl={imageUrl}
              generating={isGenerating}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {isObject
              ? imageUrl
                ? '재생성하면 새 이미지를 만듭니다.'
                : '이미지를 생성합니다.'
              : view === 'main'
                ? 'Main 은 대표 포트레이트입니다. 재생성하면 새 이미지를 만듭니다.'
                : needsMain
                  ? '방향 뷰는 Main 을 기준으로 생성됩니다. 먼저 Main 을 생성하세요.'
                  : '이 뷰는 Main 이미지를 기준으로 재생성됩니다.'}
          </p>

          {/* 후보 히스토리 스트립 — 2개 이상일 때만 표시 */}
          {candidates.length >= 2 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                후보 히스토리
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {candidates.map((cand) => {
                  const candStale = isImageStale(char.fixedPrompt, cand.sourceHash)
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => selectCandidate(char.characterId, view, cand.id)}
                      className={`relative shrink-0 overflow-hidden rounded-md border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        cand.isSelected
                          ? 'border-primary'
                          : 'border-transparent hover:border-border'
                      }`}
                      style={{ width: 64, height: 64 }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cand.url}
                        alt="후보 이미지"
                        className="size-full object-cover"
                      />
                      {candStale && (
                        <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-0.5 py-px text-center text-[9px] leading-tight text-white">
                          옛 묘사
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <Button
            className="w-full"
            disabled={isGenerating || needsMain}
            onClick={() => generateCharacterView(char.characterId, view)}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                생성 중…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {imageUrl ? `${label} 재생성` : `${label} 생성`}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
