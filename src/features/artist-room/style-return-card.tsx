'use client'

// Artist 채팅 "이전 스타일로 돌아갈까요?" 카드(2026-10-28 오너, 프로토타입 AY) — 다시 그리지 않고 이전 버전을 불러오는 단추들,
//   이전 버전이 없으면 [재생성하기](스타일 고르기 창). 단추 글은 카드를 띄울 때 채팅 언어로 만들어 둔 것이다(global-chat-store offerStyleReturn).
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'

export function StyleReturnCard({ options, regenerate }: { options: ReadonlyArray<{ n: number; label: string }>; regenerate: boolean }) {
  const t = useT()
  const busy = useArtistVersionStore((s) => s.busy)
  const dismiss = () => {
    const current = useGlobalChatStore.getState().suggestion
    if (current?.action?.kind === 'artistVersions') useGlobalChatStore.getState().dismissSuggestion({ implicit: true })
  }
  const load = async (n: number) => {
    const ok = await useArtistVersionStore.getState().loadVersion(n)
    if (ok) dismiss()
    else toast.error(useArtistVersionStore.getState().lastError ?? t('Could not load the version. Please try again.'))
  }
  return (
    <div className="mt-2 flex flex-col items-start gap-1.5 px-1" data-testid="artist-style-return">
      {options.map((option) => (
        <Button key={option.n} size="sm" variant="outline" disabled={!!busy} onClick={() => void load(option.n)}>
          {busy === 'load' ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
          {option.label}
        </Button>
      ))}
      {regenerate ? (
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => { dismiss(); useArtistVersionStore.getState().openRegenerate() }}>
          <RefreshCw className="size-4" />{t('Regenerate everything')}
        </Button>
      ) : null}
    </div>
  )
}
