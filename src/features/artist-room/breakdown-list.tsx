'use client'

// Artist 브레이크다운 목록(리뉴얼 1차 2026-10-19, 프로토타입 A1). 확정 산문에서 뽑은 인물 · 배경을 글 목록으로 보고,
//   줄마다 설명을 고친다. 그림은 아직 없다 — [목록이 맞아요 · 그림 만들기]가 스타일 팝업을 연다.
//   [인물·배경 추가]는 없다(인물 · 배경은 산문에서 나온다). 재점검 · 산문으로 돌아가기는 2차.
//   시리즈 다음 화(2026-10-26 · 프로토타입 A1s)는 이어받은 줄에 표시를 붙이고, 이번 산문에 안 나오는 것은 아래 "보관" 묶음으로 내린다.
//   레퍼런스(2026-10-27 오너): 이번 화 줄마다 그림 한 장을 올리면 그대로 그 카드의 그림이 된다(breakdown-reference). 보관 줄은 그리지 않아 칸이 없다.
import { useState, type ReactNode } from 'react'
import { ArrowRight, Check, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BreakdownReference } from '@/features/artist-room/breakdown-reference'
import { splitBreakdownRows } from '@/features/series/artist-series'
import { useSeriesInfo } from '@/features/series/use-series-info'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { breakdownRows, type BreakdownRow } from '@/lib/artist/breakdown'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

type Filter = 'all' | 'person' | 'background'

function Row({ row, reference }: { row: BreakdownRow & { inherited: boolean }; reference?: ReactNode }) {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)
  const save = () => {
    if (draft === null) return
    const value = draft.trim()
    if (row.kind === 'person') useProducerStore.getState().updateCastMember(row.id, { appearance: value })
    else useProducerStore.getState().updateBackground(row.id, { visualDescription: value })
    setDraft(null)
  }
  return (
    <li className="flex gap-4 border-b border-border px-1 py-3 last:border-b-0" data-testid="breakdown-row" data-kind={row.kind}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-2 text-sm">
          <b className="font-semibold">{row.name || t('Unnamed')}</b>
          <span className="rounded-sm border border-border px-1.5 text-[11px] text-muted-foreground">{t(row.kind === 'person' ? 'Person' : 'Background')}</span>
          {row.inherited ? (
            <Badge variant="outline" className="shrink-0 text-[10px]" data-testid="breakdown-series-inherited">
              {t('Carried over from the previous episode')}
            </Badge>
          ) : null}
        </p>
        {draft === null ? (
          <p className={cn('text-sm leading-6', row.description ? 'text-foreground/85' : 'text-muted-foreground')}>
            {row.description || t('No description yet. AI fills it in from the prose when it makes the image.')}
          </p>
        ) : (
          <Textarea value={draft} rows={2} autoFocus onChange={(event) => setDraft(event.target.value)} aria-label={t('Description')} className="text-sm" />
        )}
        {reference}
      </div>
      <div className="shrink-0 pt-0.5">
        {draft === null ? (
          <Button size="sm" variant="outline" onClick={() => setDraft(row.description)}>
            <Pencil className="size-3.5" />{t('Edit description')}
          </Button>
        ) : (
          <Button size="sm" onClick={save}>
            <Check className="size-3.5" />{t('Done')}
          </Button>
        )}
      </div>
    </li>
  )
}

export function BreakdownList({ onMake }: { onMake: () => void }) {
  const t = useT()
  const cast = useProducerStore((s) => s.cast)
  const backgrounds = useProducerStore((s) => s.backgrounds)
  const projectId = useProjectStore((s) => s.projectId)
  const { view: series } = useSeriesInfo(projectId)
  const [filter, setFilter] = useState<Filter>('all')
  // 레퍼런스를 올리는 중인 줄 수 — 올리는 동안 [만들기]를 막는다(먼저 나가면 그 그림은 실리지 않고 AI 가 그린다).
  const [uploading, setUploading] = useState(0)
  const onBusyChange = (busy: boolean) => setUploading((count) => Math.max(0, count + (busy ? 1 : -1)))
  // 보관 묶음은 이번 산문에서 뽑은 것이 아니라 개수에 넣지 않는다.
  const { shown: rows, kept } = splitBreakdownRows(breakdownRows(cast, backgrounds), series)
  const persons = rows.filter((row) => row.kind === 'person').length
  const places = rows.length - persons
  const byFilter = (row: BreakdownRow) => filter === 'all' || row.kind === filter
  const shown = rows.filter(byFilter)
  const keptShown = kept.filter(byFilter)
  // 프로토타입 A1 [모두 · 인물 · 배경].
  const tabs: Array<[Filter, string, number]> = [['all', 'All items', rows.length], ['person', 'People', persons], ['background', 'Backgrounds', places]]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="artist-breakdown">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-lg font-semibold">{t('Artist · breakdown')}</h1>
          <span className="text-xs text-muted-foreground">{t('From the confirmed prose: {persons} characters · {places} backgrounds', { persons, places })}</span>
        </div>
        <Button onClick={onMake} disabled={rows.length === 0 || uploading > 0} data-testid="breakdown-make">
          {t('The list is right · make the images')}<ArrowRight className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
          <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-[3px]" role="group" aria-label={t('Filter')}>
            {tabs.map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cn('rounded-md px-3 py-1 text-sm transition-colors', filter === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {t(label)} <span className="font-mono text-xs tabular-nums">{count}</span>
              </button>
            ))}
          </div>
          {rows.length > 0 ? (
            <p className="text-xs text-muted-foreground">{t("A picture you upload as a reference becomes that card's image as is. The rest are drawn by AI.")}</p>
          ) : null}
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t('No characters or backgrounds were found in the prose yet.')}
            </p>
          ) : (
            <ul className="rounded-xl border border-border bg-card/70 px-4">
              {shown.map((row) => (
                <Row key={`${row.kind}:${row.id}`} row={row} reference={<BreakdownReference row={row} onBusyChange={onBusyChange} />} />
              ))}
            </ul>
          )}
          {keptShown.length > 0 ? (
            <section className="flex flex-col gap-2" data-testid="breakdown-series-kept">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-medium">{t('Kept')}</h2>
                <p className="text-xs text-muted-foreground">{t('Not in this episode. The picture stays as it is and carries over to the next episode.')}</p>
              </div>
              <ul className="rounded-xl border border-border bg-card/40 px-4">
                {keptShown.map((row) => <Row key={`${row.kind}:${row.id}`} row={row} />)}
              </ul>
            </section>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t('Looks that change by scene (clothes, age) can be added after the images are made, from the card details or in Storyboard.')}
          </p>
        </div>
      </div>
    </div>
  )
}
