'use client'

// 다 불러오지 못한 버전에서 빠져나가는 두 단추(2026-10-31 재검토 지적) — 끊긴 불러오기를 끝내 마저 하지 못했을 때만 보인다.
//   [다시 불러오기]: 그 버전을 다시 불러온다. [이전 버전으로 돌아가기]: 불러오기 전 버전을 불러온다(다 불러오지 못한 버전의 기록은 그대로 남는다).
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { useArtistVersionStore } from '@/stores/artist-version-store'

export function LoadFailedActions() {
  const t = useT()
  const failed = useArtistVersionStore((s) => s.loadFailed)
  const busy = useArtistVersionStore((s) => s.busy)
  if (!failed) return null
  const run = async (action: 'retry' | 'back') => {
    const store = useArtistVersionStore.getState()
    const ok = action === 'retry' ? await store.retryFailedLoad() : await store.goBackFromFailedLoad()
    if (!ok) toast.error(useArtistVersionStore.getState().lastError ?? t('Could not load the version. Please try again.'))
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-testid="artist-load-failed">
      <Button size="sm" variant="outline" className="h-7" disabled={busy !== null} onClick={() => void run('retry')} data-testid="artist-load-retry">
        {busy === 'load' ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{t('Load it again')}
      </Button>
      <Button size="sm" variant="outline" className="h-7" disabled={busy !== null} onClick={() => void run('back')} data-testid="artist-load-go-back">
        <RotateCcw className="size-3.5" />{t('Go back to the previous version')}
      </Button>
    </span>
  )
}
