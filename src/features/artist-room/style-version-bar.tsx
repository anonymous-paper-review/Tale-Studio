'use client'

// Artist 머리 줄의 작품 스타일 막대(2026-10-28 오너, 프로토타입 A5) — 작은 견본 그림 + 스타일 이름 + "작품 스타일 · v{n}",
//   [불러오기 · 기록 N] [재생성하기]. 단추가 꺼지면 그 까닭을 글로 보인다(마우스를 올려야 보이는 안내만으로는 몰랐다, QA 1차 #06):
//   Storyboard 를 연 뒤 · 그리는 중 · 기록이 하나뿐(재생성하면 이전 버전이 여기 남아요).
//   재생성 그림이 멈추면 까닭과 [남은 그림 다시 그리기] · [이전 버전으로 돌아가기]를 막대 아래에 보인다(2026-10-28 검토 지적).
import { History, ImageIcon, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThumbImage } from '@/components/thumb-image'
import { useLocale, useT } from '@/lib/i18n'
import { isDemoSession } from '@/lib/demo/context'
import { versionHeader, versionStyleLabel } from '@/lib/artist/style-versions'
import { RegenStoppedActions } from '@/features/artist-room/regen-stopped-actions'
import { useArtistVersionStore } from '@/stores/artist-version-store'
import { useProducerStore } from '@/stores/producer-store'

const NOTE_TEXT = {
  completed: 'The style cannot be changed after Storyboard opens.',
  drawing: 'Drawing the images. You can change the style once they are done.',
  loading: 'Loading the version.',
  stopped: 'Some images were not drawn. Draw the rest again, or go back to the previous version.',
  single: 'Regenerating keeps the earlier version here',
} as const

export function StyleVersionBar({ completed, drawing }: { completed: boolean; drawing: boolean }) {
  const t = useT()
  const locale = useLocale()
  const versions = useArtistVersionStore((s) => s.versions)
  const loaded = useArtistVersionStore((s) => s.loaded)
  const busy = useArtistVersionStore((s) => s.busy)
  const stopped = useArtistVersionStore((s) => !!s.regen && !s.regen.complete && s.run.stopped)
  const anchors = useProducerStore((s) => s.styleAnchors)
  const styleKey = useProducerStore((s) => s.styleAnchorKey)
  const custom = useProducerStore((s) => s.customStyleAnchor)
  const header = versionHeader({ versions, completed, drawing: drawing || busy === 'regenerate', loading: busy === 'load', demo: isDemoSession(), stopped })
  const label = versionStyleLabel({ styleKey, customStyle: custom }, anchors, locale)
  const swatch = custom?.url ?? anchors.find((anchor) => anchor.key === styleKey)?.previewUrl ?? null
  const note = header.note ? t(NOTE_TEXT[header.note]) : null
  const store = useArtistVersionStore.getState
  // 기록과 스타일 목록을 읽기 전에는 자리만 둔다 — 읽기 전 값("스타일 없음 · 기록 1")이 잠깐 보였다(2026-10-28 e2e).
  const ready = (loaded || isDemoSession()) && (anchors.length > 0 || !!custom)
  if (!ready) return <div className="h-8 w-80 max-w-full rounded-md border border-border bg-muted/30" aria-hidden data-testid="artist-style-bar-loading" />

  return (
    <div className="flex flex-col items-start gap-1" data-testid="artist-style-version">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border py-1 pl-1 pr-1.5 text-xs" data-testid="artist-style-bar">
        <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
          {swatch ? <ThumbImage src={swatch} alt={label} className="size-full object-cover" /> : <ImageIcon className="size-3.5 text-muted-foreground" aria-hidden />}
        </span>
        <b className="font-medium">{label}</b>
        <span className="text-muted-foreground" data-testid="artist-style-version-n">{t('Work style · v{n}', { n: header.n })}</span>
        <span className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={!loaded || !header.canLoad}
            title={header.canLoad ? undefined : note ?? undefined}
            onClick={() => store().openHistory()}
            data-testid="artist-version-history-open"
          >
            <History className="size-3.5" />{t('Load · history {count}', { count: header.count })}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            disabled={!loaded || !header.canRegenerate}
            title={header.note === 'single' ? undefined : note ?? undefined}
            onClick={() => store().openRegenerate()}
            data-testid="artist-regen-open"
          >
            <RefreshCw className="size-3.5" />{t('Regenerate everything')}
          </Button>
        </span>
      </div>
      {note ? <p className="text-xs text-muted-foreground" role="status" data-testid="artist-style-note">{note}</p> : null}
      {header.note === 'stopped' ? <RegenStoppedActions /> : null}
    </div>
  )
}
