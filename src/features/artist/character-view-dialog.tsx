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
import { ImagePlaceholder } from '@/features/artist/image-placeholder'
import { useArtistStore } from '@/stores/artist-store'
import { buildCharacterPrompt } from '@/lib/prompts'
import { CHARACTER_VIEW_LABELS, type CharacterViewKey } from '@/types/asset'

type Props = {
  charId: string | null
  view: CharacterViewKey | null
  onClose: () => void
}

/**
 * 캐릭터 단일 뷰(front/side/back/3Q) 상세 + 재생성 Dialog.
 * 이미지(또는 placeholder) + 사용 프롬프트(수정 가능) + 생성 버튼.
 * 프롬프트를 수정하면 generateSheet의 promptOverride로 전달돼 그대로 생성.
 */
export function CharacterViewDialog({ charId, view, onClose }: Props) {
  const char = useArtistStore((s) =>
    s.characterAssets.find((c) => c.characterId === charId),
  )
  const generateSheet = useArtistStore((s) => s.generateSheet)
  const isGenerating = useArtistStore((s) => s.generatingCharacterId === charId)

  const defaultPrompt =
    char?.fixedPrompt && view ? buildCharacterPrompt(char.fixedPrompt, view) : ''

  const [prompt, setPrompt] = useState(defaultPrompt)
  // char/view 변경 시 prompt 리셋 (effect 없이 render 중)
  const key = `${charId}:${view}`
  const [prevKey, setPrevKey] = useState(key)
  if (key !== prevKey) {
    setPrevKey(key)
    setPrompt(defaultPrompt)
  }

  const open = !!charId && !!view
  // 닫힘이거나 데이터 없으면 렌더 안 함
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
          {/* 이미지 / placeholder */}
          <div className="mx-auto w-full max-w-xs">
            <ImagePlaceholder
              label={label}
              aspectRatio="square"
              imageUrl={imageUrl}
            />
          </div>

          {/* 사용 프롬프트 (수정 가능) */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              프롬프트 (수정 후 생성)
            </label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="이 뷰 이미지를 만들 프롬프트"
            />
          </div>

          {/* 생성 버튼 */}
          <Button
            className="w-full"
            disabled={isGenerating || char.locked || !prompt.trim()}
            onClick={() =>
              generateSheet(char.characterId, [view], { [view]: prompt })
            }
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
