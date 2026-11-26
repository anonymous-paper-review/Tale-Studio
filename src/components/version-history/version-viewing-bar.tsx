'use client'

// 상세의 보는 판 줄(오너 2026-11-26 A4 · S3 · D2, 시안 없음) — 지난 판 줄에서 연 상세가 그 판을 보이는 동안 큰 그림 아래에 둔다:
//   "지난 그림 보는 중 · 3시간 전" 같은 글 + [채택](그 판을 최종 판으로) + [지금 그림 보기](채택하지 않고 돌아가기).
//   모양은 Director 상세의 보는 판 줄과 같다(점선 테두리 · 테두리 단추 + 체크 — 메인 크림 단추는 화면에 하나).
//   채택할 수 없으면(다른 작품 스타일 판 등) [채택]을 끄고 까닭을 글로 보인다(꺼진 단추는 까닭을 글로 — QA 1차 #06).
//   약속: tests/artist/history-cards.test.ts · history-detail-view.test.ts
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

export function VersionViewingBar({ text, note, adoptDisabled, adoptReason, busy = false, error, onAdopt, onBack, testId, adoptTestId }: {
  /** 무엇을 보고 있는지 — "지난 그림 보는 중 · 3시간 전". */
  text: string
  /** 덧말 — 다른 작품 스타일 판이면 "v1 · 실사 · 다른 스타일". */
  note?: string | null
  adoptDisabled: boolean
  /** [채택]이 꺼진 까닭(글로 보이고 단추에 마우스를 올려도 보인다). */
  adoptReason?: string | null
  /** 채택을 저장하는 중 — 두 번 누르지 않게 끈다. */
  busy?: boolean
  error?: string | null
  onAdopt: () => void | Promise<void>
  onBack: () => void
  testId?: string
  adoptTestId?: string
}) {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-foreground/40 px-3 py-2" data-testid={testId}>
      <p className="min-w-0 flex-1 text-caption text-foreground">
        {text}
        {note ? <span className="ml-1.5 text-subtle-foreground">{note}</span> : null}
      </p>
      <Button type="button" size="sm" variant="outline" disabled={adoptDisabled || busy} title={adoptDisabled && adoptReason ? adoptReason : undefined}
        onClick={() => void onAdopt()} data-testid={adoptTestId}>
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}{t('Adopt')}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onBack}>{t('Back to current')}</Button>
      {adoptDisabled && adoptReason ? <p className="w-full text-caption text-subtle-foreground">{adoptReason}</p> : null}
      {error ? <p className="w-full text-caption text-destructive" role="alert">{error}</p> : null}
    </div>
  )
}
