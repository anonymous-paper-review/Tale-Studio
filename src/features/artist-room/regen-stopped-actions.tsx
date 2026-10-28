'use client'

// 멈춘 재생성에서 빠져나가는 두 단추(2026-10-28 검토 지적) — 재생성 그림이 다 그려지기 전에 멈췄을 때만 보인다.
//   [남은 그림 다시 그리기]: 남은 칸만 지금의 [다시 만들기]와 같은 길로 다시 보낸다(실패한 칸은 다시 보내지 않는다, 9/11 규칙).
//   [이전 버전으로 돌아가기]: 남은 재생성을 그만두고 재생성 전 버전의 그림 · 작품 스타일을 불러온다.
//   머리 줄(StyleVersionBar)과 그리는 중 잠금 화면 아래가 같이 쓴다.
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { useArtistVersionStore } from '@/stores/artist-version-store'

export function RegenStoppedActions() {
  const t = useT()
  const stopped = useArtistVersionStore((s) => !!s.regen && !s.regen.complete && s.run.stopped)
  const busy = useArtistVersionStore((s) => s.busy)
  if (!stopped) return null
  const goBack = async () => {
    if (!(await useArtistVersionStore.getState().goBackToPrevious())) {
      toast.error(useArtistVersionStore.getState().lastError ?? t('Could not load the version. Please try again.'))
    }
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5" data-testid="artist-regen-stopped">
      <Button size="sm" variant="outline" className="h-7" disabled={busy !== null} onClick={() => void useArtistVersionStore.getState().resumeRegen()} data-testid="artist-regen-resume">
        <RefreshCw className="size-3.5" />{t('Draw the remaining images again')}
      </Button>
      <Button size="sm" variant="outline" className="h-7" disabled={busy !== null} onClick={() => void goBack()} data-testid="artist-regen-go-back">
        {busy === 'load' ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}{t('Go back to the previous version')}
      </Button>
    </span>
  )
}
