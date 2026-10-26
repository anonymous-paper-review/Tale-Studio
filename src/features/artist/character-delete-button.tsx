'use client'

// 인물 카드의 지우기 단추(2026-10-27 디자이너 QA 1차 #04 · 오너 "채팅 추가 막고 안내").
//   산문 밖에서(예전 Artist 채팅) 만들어진 인물에만 보인다 — 산문에서 나온 인물에는 단추가 없다.
//   지우기 전에 한 번 묻고, 씬 · 샷에 쓰이거나 그리는 중이면 지우지 않고 그 까닭을 알린다.
import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { isChatMadeCharacter } from '@/lib/artist/character-delete'
import { deleteChatMadeCharacter } from '@/lib/artist/character-delete-client'
import type { CharacterAsset } from '@/types/asset'

export function CharacterDeleteButton({ character }: { character: Pick<CharacterAsset, 'characterId' | 'name' | 'origin'> }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  if (!isChatMadeCharacter(character)) return null
  const name = character.name || t('Character')

  const remove = async () => {
    if (busy || !window.confirm(t('This character is not in the prose, so you can delete it. Delete the {name} card? A deleted card cannot be restored.', { name }))) return
    setBusy(true)
    try {
      const result = await deleteChatMadeCharacter(character.characterId)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
      aria-label={t('Delete this character')}
      title={t('Delete this character')}
      disabled={busy}
      // 카드의 선택 · 더블 클릭(상세 팝업) · Enter 로 번지지 않게 막는다.
      onClick={(event) => {
        event.stopPropagation()
        void remove()
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      data-testid="artist-character-delete"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
    </Button>
  )
}
