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
 * 캐릭터 뷰 상세 — 선택 뷰 이미지 프리뷰 + 턴어라운드 시트 재생성 (decisions #37).
 * 각 뷰는 시트 1장에서 crop된 것이므로 개별 뷰 재생성이 아니라 시트 전체를 재생성한다.
 */
export function CharacterViewDialog({ charId, view, onClose }: Props) {
  const char = useArtistStore((s) =>
    s.characterAssets.find((c) => c.characterId === charId),
  )
  const generateSheet = useArtistStore((s) => s.generateSheet)
  const isGenerating = useArtistStore((s) => s.generatingCharacterId === charId)

  const open = !!charId && !!view
  if (!open || !char || !view) return null

  const imageUrl = char.views[view] ?? null
  const label = CHARACTER_VIEW_LABELS[view]

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
            />
          </div>

          <p className="text-xs text-muted-foreground">
            각 뷰는 턴어라운드 시트 1장에서 잘라낸 것입니다. 다시 만들려면 시트
            전체를 재생성하세요.
          </p>

          <Button
            className="w-full"
            disabled={isGenerating || char.locked}
            onClick={() => generateSheet(char.characterId)}
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                생성 중…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                {char.views.main ? '시트 재생성' : '시트 생성'}
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
