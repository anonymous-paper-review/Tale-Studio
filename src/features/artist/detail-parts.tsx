'use client'

// Artist 카드 상세 팝업(프로토타입 A7 · A7r, 2026-10-20 오너 "HTML 확인해서 팝업 수정")의 공용 조각 — 인물 · 배경 상세가 같이 쓴다.
//   두 칸: 왼쪽 그림(머리 줄: 모습 이름 · 기준 · 바뀜 · 기록 · [다시 만들기]) / 오른쪽 설명 · 모습 목록 · 쓰인 샷. 아래 [닫기].
//   [다시 만들기]는 확인 창(A7r: 설명 · 추천 칩 · 이미지 생성 도구)을 거쳐 그린다. 약속: tests/artist/detail-popup.test.ts
import { useState, type ReactNode } from 'react'
import { History, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

export type DetailKind = 'person' | 'background' | 'object'

/** 상세 팝업 제목(번역 키) — "민호 · 인물" / "회사 복도 · 배경" / "컵 · 사물". */
export function artistDetailTitleKey(kind: DetailKind): string {
  return kind === 'background' ? '{name} · Background' : kind === 'object' ? '{name} · Object' : '{name} · Character'
}

/** 다시 만들기 창의 추천 칩(프로토타입 A7r) — 번역 키. 인물 = 캐릭터성, 배경 = 공간의 성격. */
export const TRAIT_GROUPS: Record<'person' | 'background', ReadonlyArray<{ name: string; words: readonly string[] }>> = {
  person: [
    { name: 'Personality', words: ['Cool-headed', 'Kind-hearted', 'Quirky', 'Timid', 'Confident'] },
    { name: 'Mood · tone', words: ['Comedy', 'Horror', 'Romance', 'Noir', 'Warm'] },
    { name: 'Build · impression', words: ['Slim', 'Sturdy', 'Baby-faced', 'Sharp eyes', 'Smiling face'] },
    { name: 'Era · fashion', words: ['Modern office look', '1990s', 'Casual', 'Suit', 'Vintage'] },
  ],
  background: [
    { name: 'Time · weather', words: ['Day', 'Night', 'Rain', 'Sunset'] },
    { name: 'Mood · tone', words: ['Comedy', 'Horror', 'Warm', 'Cold'] },
    { name: 'Sense of space', words: ['Cramped', 'Spacious', 'Cluttered', 'Tidy'] },
  ],
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// m: 줄을 바꾼 바로 뒤(줄 맨 앞)의 칩도 찾는다(검토 지적).
const traitPattern = (word: string) => new RegExp(`(^|[ \\t])@${escapeRegExp(word)}(?=$|\\s)`, 'gm')

/** 설명에 이 추천 칩(@단어)이 들어 있나 — 띄어쓰기 있는 칩("@날카로운 눈매")도 통째로 찾는다. */
export function hasTrait(text: string, word: string): boolean {
  return traitPattern(word).test(text)
}

/** 추천 칩 — 누르면 설명 끝에 "@단어"를 넣고, 다시 누르면 뺀다(설명의 줄바꿈은 그대로 둔다). */
export function toggleTrait(text: string, word: string): string {
  if (hasTrait(text, word)) {
    return text.replace(traitPattern(word), '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
  }
  return text.trim() ? `${text.trim()} @${word}` : `@${word}`
}

/** 모습을 지운 뒤 보일 모습 — 팝업은 닫지 않는다. 보던 모습을 지웠으면 기준 모습(없으면 남은 첫 모습), 아니면 보던 모습 그대로. */
export function lookAfterDelete<K>(input: { deleted: K; viewing: K; base: K | null; remaining: readonly K[] }): K | null {
  if (input.deleted !== input.viewing) return input.viewing
  if (input.base !== null && input.base !== input.deleted) return input.base
  return input.remaining.find((key) => key !== input.deleted) ?? null
}

/** 상세 팝업 틀 — 두 칸(왼쪽 고정 · 오른쪽 스크롤), 좁으면 한 칸으로 쌓인다. busy(그리는 중)면 닫히지 않는다. */
export function DetailFrame({ open, onClose, title, left, right, footer, busy = false, testId }: {
  open: boolean
  onClose: () => void
  title: string
  left: ReactNode
  right: ReactNode
  footer: ReactNode
  busy?: boolean
  testId?: string
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose() }}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-[1080px]" showCloseButton={!busy} data-testid={testId}>
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:overflow-hidden">
          <div className="flex min-w-0 flex-col gap-3 p-6 md:overflow-y-auto">{left}</div>
          <div className="flex min-w-0 flex-col gap-5 border-t border-border p-6 md:overflow-y-auto md:border-l md:border-t-0">{right}</div>
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-6 py-3">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** 오른쪽 칸의 한 묶음 — 굵은 이름 · 옅은 안내 한 줄. */
export function DetailSection({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        {title}
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </h3>
      {children}
    </section>
  )
}

/** 기록(시계) — 같은 칸에 남은 이전 그림. "지금" 아래 이전 그림마다 [불러오기]. 두 장 이상일 때만 열린다. */
export function HistoryButton({ candidates, onPick }: {
  candidates: ReadonlyArray<{ id: string; url: string; isSelected: boolean }>
  onPick: (id: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const enabled = candidates.length >= 2
  return (
    <Popover open={open && enabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="size-8" disabled={!enabled} aria-label={t('History · load an earlier image')} title={t('History · load an earlier image')} data-testid="detail-history">
          <History className="size-4" />
          {enabled ? <span className="sr-only">{candidates.length}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">{t('History · load an earlier image')}</p>
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={candidate.url} alt={t('Candidate image')} className="h-10 w-16 shrink-0 rounded object-cover" />
              <span className="flex-1 text-xs">{candidate.isSelected ? t('Now') : ''}</span>
              {candidate.isSelected ? null : (
                <Button size="sm" variant="outline" className="h-7" onClick={() => { onPick(candidate.id); setOpen(false) }}>{t('Load')}</Button>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/** 설명 상자 — ✎ 를 누르면 고치고 [적용]으로 바로 저장한다(그림은 [다시 만들기]로만 새로 만든다). readOnly 는 보기만. */
export function DescriptionBox({ caption, value, placeholder, readOnly = false, changed = false, onApply, testId }: {
  caption: string
  value: string
  placeholder?: string
  readOnly?: boolean
  changed?: boolean
  onApply?: (next: string) => Promise<void> | void
  testId?: string
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const apply = async () => {
    const next = draft.trim()
    if (!next || busy) return
    setBusy(true)
    try {
      await onApply?.(next)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={cn('rounded-lg border border-border p-3', readOnly && 'bg-muted/40 text-muted-foreground')} data-testid={testId}>
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{caption}</span>
        {readOnly ? <span>{t('View only')}</span> : null}
        {changed ? <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px]">{t('Changed · remake to apply')}</span> : null}
        {!readOnly && !editing ? (
          <Button size="icon" variant="ghost" className="size-7" aria-label={t('Edit description')} onClick={() => { setDraft(value); setEditing(true) }} data-testid={testId ? `${testId}-edit` : undefined}>
            <Pencil className="size-3.5" />
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} placeholder={placeholder} />
          <p className="text-xs text-muted-foreground">{t('After you apply it, you can remake the image on the left.')}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>{t('Cancel')}</Button>
            <Button size="sm" onClick={() => void apply()} disabled={busy || !draft.trim()} data-testid={testId ? `${testId}-apply` : undefined}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}{t('Apply')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">{value || placeholder}</p>
      )}
    </div>
  )
}

/** 추천 칩 묶음(접었다 펴기) — 누르면 설명에 "@단어"가 들어가고 빠진다. */
export function TraitChips({ kind, value, onChange }: { kind: 'person' | 'background'; value: string; onChange: (next: string) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="flex items-center gap-1.5 text-left text-sm font-medium" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        {t(kind === 'person' ? 'Character trait suggestions' : 'Space character suggestions')}
        <span className="text-xs font-normal text-muted-foreground">{t('Click to add it to the description with @')}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2">
          {TRAIT_GROUPS[kind].map((group) => (
            <div key={group.name} className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{t(group.name)}</span>
              {group.words.map((word) => {
                const label = t(word)
                const on = hasTrait(value, label)
                return (
                  <button
                    key={word}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange(toggleTrait(value, label))}
                    className={cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors', on ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')}
                  >
                    {on ? `✓ @${label}` : `+ ${label}`}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** 다시 만들기 확인 창(A7r) — 설명 · 추천 칩 · 이미지 생성 도구(호출부가 그린다) · 알림. [다시 만들기]면 onConfirm. */
export function RegenerateDialog({ open, onOpenChange, title, intro, kind, description, onDescriptionChange, modelPicker, notes, confirmLabel, busy, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  intro: string
  kind: 'person' | 'background' | null
  description: string
  onDescriptionChange: (next: string) => void
  modelPicker: ReactNode
  notes?: ReactNode
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-xl" data-testid="detail-regenerate">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <DetailSection title={t('Look description')} hint={kind ? t('It is made from this description · suggestion chips go in with @') : undefined}>
            <Textarea value={description} onChange={(e) => onDescriptionChange(e.target.value)} rows={4} data-testid="detail-regenerate-description" />
          </DetailSection>
          {kind ? <TraitChips kind={kind} value={description} onChange={onDescriptionChange} /> : null}
          <DetailSection title={t('Image generation tool')}>{modelPicker}</DetailSection>
          {notes}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>{t('Cancel')}</Button>
          <Button onClick={onConfirm} disabled={busy || !description.trim()} data-testid="detail-regenerate-go">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}{confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
