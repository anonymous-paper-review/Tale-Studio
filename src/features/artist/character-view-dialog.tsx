'use client'

import { Loader2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore } from '@/stores/artist-store'
import { CHARACTER_VIEW_LABELS, type CharacterViewKey } from '@/types/asset'

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
  const isGenerating = useArtistStore((s) =>
    view ? s.generatingViews.includes(`${charId}:${view}`) : false,
  )

  const open = !!charId && !!view
  if (!open || !char || !view) return null

  const imageUrl = char.views[view] ?? null
  const label = CHARACTER_VIEW_LABELS[view]
  const isDirectional = view !== 'main'
  const needsMain = isDirectional && !char.views.main

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {char.name} — {label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="mx-auto w-full max-w-sm">
            <ImagePlaceholder
              label={label}
              aspectRatio="square"
              imageUrl={imageUrl}
              generating={isGenerating}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {view === 'main'
              ? 'Main 은 대표 포트레이트입니다. 재생성하면 새 이미지를 만듭니다.'
              : needsMain
                ? '방향 뷰는 Main 을 기준으로 생성됩니다. 먼저 Main 을 생성하세요.'
                : '이 뷰는 Main 이미지를 기준으로 재생성됩니다.'}
          </p>

          <Button
            className="w-full"
            disabled={isGenerating || char.locked || needsMain}
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
          {char.locked && (
            <p className="text-center text-xs text-muted-foreground">
              잠금 상태 — 생성하려면 카드의 잠금을 해제하세요.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
