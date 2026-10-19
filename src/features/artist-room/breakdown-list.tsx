'use client'

// Artist 브레이크다운 목록(리뉴얼 1차 2026-10-19, 프로토타입 A1). 확정 산문에서 뽑은 인물 · 배경을 글 목록으로 보고,
//   줄마다 설명을 고친다. 그림은 아직 없다 — [목록이 맞아요 · 그림 만들기]가 스타일 팝업을 연다.
//   [인물·배경 추가]는 없다(인물 · 배경은 산문에서 나온다). 재점검 · 산문으로 돌아가기는 2차.
import { useState } from 'react'
import { ArrowRight, Check, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { breakdownRows, type BreakdownRow } from '@/lib/artist/breakdown'
import { useProducerStore } from '@/stores/producer-store'

type Filter = 'all' | 'person' | 'background'

function Row({ row }: { row: BreakdownRow }) {
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
        </p>
        {draft === null ? (
          <p className={cn('text-sm leading-6', row.description ? 'text-foreground/85' : 'text-muted-foreground')}>
            {row.description || t('No description yet. AI fills it in from the prose when it makes the image.')}
          </p>
        ) : (
          <Textarea value={draft} rows={2} autoFocus onChange={(event) => setDraft(event.target.value)} aria-label={t('Description')} className="text-sm" />
        )}
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
  const [filter, setFilter] = useState<Filter>('all')
  const rows = breakdownRows(cast, backgrounds)
  const persons = rows.filter((row) => row.kind === 'person').length
  const places = rows.length - persons
  const shown = rows.filter((row) => filter === 'all' || row.kind === filter)
  const tabs: Array<[Filter, string, number]> = [['all', 'All', rows.length], ['person', 'Characters', persons], ['background', 'Background', places]]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="artist-breakdown">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-lg font-semibold">{t('Artist · breakdown')}</h1>
          <span className="text-xs text-muted-foreground">{t('From the confirmed prose: {persons} characters · {places} backgrounds', { persons, places })}</span>
        </div>
        <Button onClick={onMake} disabled={rows.length === 0} data-testid="breakdown-make">
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
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t('No characters or backgrounds were found in the prose yet.')}
            </p>
          ) : (
            <ul className="rounded-xl border border-border bg-card/70 px-4">
              {shown.map((row) => <Row key={`${row.kind}:${row.id}`} row={row} />)}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {t('Looks that change by scene (clothes, age) can be added after the images are made, from the card details or in Storyboard.')}
          </p>
        </div>
      </div>
    </div>
  )
}
