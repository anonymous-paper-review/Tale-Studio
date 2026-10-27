'use client'

// 산문 재점검 창(2026-10-27 오너 · 디자이너 QA 2차, 프로토타입 WT · WTm). 브레이크다운 [인물·배경이 빠졌거나 겹쳤어요]가 연다.
//   왼쪽은 확정 산문(S1 · S2 …)이고 목록의 이름(다른 이름 포함)이 나오는 자리만 인물 · 장소로 표시한다 — 짐작으로 표시하지 않는다.
//   빠진 말은 산문에서 끌어 고른 뒤 [추가하기] → 인물로 · 장소로, 이름이 틀렸으면 [수정](같은 종류의 이미 있는 이름이면 합칠지 묻는다).
//   오른쪽은 뽑은 목록. 고친 것은 창 안에만 쌓이고 [목록에 반영]해야 목록 · 실행 기록에 들어간다 — [취소]하면 버린다.
//   프로토타입의 선택 창(산문 다시 쓰기 / 재점검, A1c)은 두지 않는다 — 산문 다시 쓰기(되돌아가기)가 아직 없어 바로 이 창을 연다.
import { Fragment, useId, useMemo, useState, type SyntheticEvent } from 'react'
import { Loader2, Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { BreakdownRow } from '@/lib/artist/breakdown'
import {
  markMentions,
  pickState,
  proseScenesFromPreview,
  recheckEntitiesOf,
  recheckEntries,
  recheckReducer,
  startRecheck,
  type ProseScene,
  type RecheckAction,
  type RecheckKind,
  type RecheckSession,
} from '@/lib/artist/recheck'
import { loadSeriesInfo } from '@/features/series/use-series-info'
import { useWriterPreview } from '@/lib/writer/use-writer-preview'
import { useProducerStore } from '@/stores/producer-store'
import { useProjectStore } from '@/stores/project-store'

// 인물 · 장소 표시 색 — 예약해 둔 엔티티 색(design.md §2.2: chart-1 인물 · chart-2 월드)을 옅게 깐다.
const KIND_TAG: Record<RecheckKind, string> = {
  person: 'border-chart-1/40 bg-chart-1/15',
  background: 'border-chart-2/40 bg-chart-2/15',
}
const tagClass = (kind: RecheckKind) => cn('rounded-sm border px-[3px] text-foreground', KIND_TAG[kind])

export interface RecheckBodyProps {
  session: RecheckSession
  prose: ProseScene[]
  dispatch: (action: RecheckAction) => void
  /** 산문(실행 기록)을 아직 읽는 중. */
  loading: boolean
  /** 산문을 읽지 못했다. */
  failed: boolean
  /** [목록에 반영]을 보내는 중. */
  applying: boolean
  onCancel: () => void
  onApply: () => void
}

/** 창 안 — 머리 · 산문과 고르기 줄 · 뽑은 목록 · 아래 단추. 정적으로 그려 시험한다(창 상태는 recheckReducer 가 정한다). */
export function RecheckBody({ session, prose, dispatch, loading, failed, applying, onCancel, onApply }: RecheckBodyProps) {
  const t = useT()
  const listId = useId()
  const entries = recheckEntries(session, prose)
  const byKey = new Map(entries.map((entry) => [entry.key, entry]))
  const pick = pickState(session, prose)
  const editingKey = session.editing?.key ?? null

  // 산문에서 끌어 고른 말 — 표시된 말을 누른 것은 고르기가 아니다(프로토타입). 산문 밖까지 걸친 고르기는 버린다.
  const onSelect = (event: SyntheticEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest?.('[data-recheck-tag]')) return
    const selection = typeof window !== 'undefined' ? window.getSelection?.() : null
    if (!selection || selection.isCollapsed) return
    const container = event.currentTarget
    if (!selection.anchorNode || !selection.focusNode || !container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) return
    dispatch({ type: 'select', text: selection.toString() })
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('Prose re-check')}</DialogTitle>
        <DialogDescription className="flex items-start gap-1.5">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{t('The prose stays locked; you only fix the marks. Press [Update the list] to refill the Artist list from these marks.')}</span>
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto py-1 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-3">
          {loading || failed || prose.length === 0 ? (
            <p className="rounded-lg border border-border px-3 py-8 text-center text-sm text-muted-foreground" role="status">
              {failed ? t('Could not load the prose. Please try again.') : loading ? t('Loading…') : t('No prose yet')}
            </p>
          ) : (
            <article
              className="select-text space-y-3 rounded-lg border border-border bg-card/60 px-4 py-3"
              aria-label={t('Prose')}
              onMouseUp={onSelect}
              onKeyUp={onSelect}
              data-testid="recheck-prose"
            >
              {prose.map((scene, index) => (
                <div key={scene.sceneId} className="flex gap-3">
                  <span className="w-7 shrink-0 select-none pt-1.5 font-mono text-[11px] text-muted-foreground">{`S${index + 1}`}</span>
                  <p className="text-[15px] leading-9 text-foreground/90">
                    {markMentions(scene.text, entries).map((segment, at) => {
                      const entry = segment.key ? byKey.get(segment.key) : undefined
                      if (!entry) return <Fragment key={at}>{segment.text}</Fragment>
                      return (
                        <button
                          key={at}
                          type="button"
                          data-recheck-tag=""
                          data-kind={entry.kind}
                          aria-pressed={editingKey === entry.key}
                          title={t('{name} · press to fix', { name: entry.name })}
                          onClick={() => dispatch({ type: 'edit', key: entry.key })}
                          className={cn(tagClass(entry.kind), 'mx-px cursor-pointer leading-normal transition-shadow focus-visible:outline-2 focus-visible:outline-ring', editingKey === entry.key && 'ring-2 ring-ring')}
                        >
                          {segment.text}
                        </button>
                      )
                    })}
                  </p>
                </div>
              ))}
            </article>
          )}
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn(tagClass('person'), 'text-[11px]')}>{t('Person')}</span>
            <span className={cn(tagClass('background'), 'text-[11px]')}>{t('Place')}</span>
            <span>{t('Only what AI picked is marked · Press a marked word to fix it')}</span>
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[13px]" data-testid="recheck-pickbar">
            {pick === 'none' || !session.pick ? (
              <>
                <span className="text-muted-foreground">{t('If a character or place is missing, drag over that word in the prose to pick it, then press [Add to list].')}</span>
                <span title={t('Pick a word in the prose first')}>
                  <Button size="sm" variant="outline" disabled title={t('Pick a word in the prose first')} data-testid="recheck-add">
                    <Plus className="size-3.5" aria-hidden />{t('Add to list')}
                  </Button>
                </span>
              </>
            ) : (
              <>
                <span className="flex flex-wrap items-center gap-1.5">
                  {t('Picked word')}
                  <b className="rounded-sm bg-muted px-1.5 font-medium">{session.pick}</b>
                  {pick === 'listed' ? <span className="text-muted-foreground">{t('{word} is already on the list.', { word: session.pick })}</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {pick === 'picked' ? (
                    <Button size="sm" onClick={() => dispatch({ type: 'startAdd' })} data-testid="recheck-add">
                      <Plus className="size-3.5" aria-hidden />{t('Add to list')}
                    </Button>
                  ) : null}
                  {pick === 'adding' ? (
                    <>
                      <Button size="sm" onClick={() => dispatch({ type: 'add', kind: 'person' })} data-testid="recheck-add-person">{t('Add as a person')}</Button>
                      <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'add', kind: 'background' })} data-testid="recheck-add-place">{t('Add as a place')}</Button>
                      <Button size="sm" variant="link" onClick={() => dispatch({ type: 'clearPick' })} data-testid="recheck-add-cancel">{t('Cancel')}</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="link" onClick={() => dispatch({ type: 'clearPick' })} data-testid="recheck-pick-clear">{t('Pick again')}</Button>
                  )}
                </span>
              </>
            )}
          </div>
        </div>
        <aside className="flex min-w-0 flex-col gap-2 self-start rounded-lg border border-border bg-card/60 p-3 md:w-[260px]" aria-labelledby={`${listId}-title`} data-testid="recheck-list">
          <h3 id={`${listId}-title`} className="flex items-baseline gap-1.5 text-sm font-medium">
            {t('Picked list')}
            <small className="text-xs font-normal text-muted-foreground">{t('{count} entries', { count: entries.length })}</small>
          </h3>
          <ul className="flex flex-col gap-1">
            {entries.map((entry) => {
              const editing = session.editing?.key === entry.key ? session.editing : null
              return (
                <li key={entry.key} className={cn('flex flex-col gap-1 rounded-md px-2 py-1.5 text-[13px]', editing && 'bg-muted')} data-testid="recheck-entry">
                  {editing ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <Input
                          autoFocus
                          value={editing.value}
                          list={`${listId}-${entry.kind}`}
                          aria-label={t('Fix the name')}
                          className="h-8 text-[13px]"
                          onChange={(event) => dispatch({ type: 'editValue', value: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                              event.preventDefault()
                              dispatch({ type: 'saveEdit' })
                            }
                          }}
                          data-testid="recheck-rename-input"
                        />
                        <Button size="sm" onClick={() => dispatch({ type: 'saveEdit' })} data-testid="recheck-rename-save">{t('Use this name')}</Button>
                        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'cancelEdit' })} data-testid="recheck-rename-cancel">{t('Cancel')}</Button>
                      </div>
                      {/* 같은 종류의 이름만 추천한다 — 인물과 장소는 서로 합쳐지지 않는다. */}
                      <datalist id={`${listId}-${entry.kind}`}>
                        {entries.filter((other) => other.kind === entry.kind && other.key !== entry.key && other.name.trim()).map((other) => (
                          <option key={other.key} value={other.name} />
                        ))}
                      </datalist>
                      <span className="text-[11px] text-muted-foreground">
                        {t(entry.kind === 'person' ? 'If you change it to a character name already on the list, they merge into one' : 'If you change it to a place name already on the list, they merge into one')}
                      </span>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className={cn(tagClass(entry.kind), 'truncate')}>{entry.name || t('Unnamed')}</span>
                        <small className="shrink-0 text-[11px] text-muted-foreground">{t(entry.kind === 'person' ? 'Person' : 'Place')}</small>
                      </span>
                      <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2" onClick={() => dispatch({ type: 'edit', key: entry.key })} data-testid="recheck-rename">{t('Fix')}</Button>
                    </div>
                  )}
                  {entry.aliases.length > 0 ? <span className="text-[11px] text-muted-foreground">{t('Also called {names}', { names: entry.aliases.join(' · ') })}</span> : null}
                </li>
              )
            })}
          </ul>
        </aside>
      </div>
      <DialogFooter className="items-center gap-3 border-t border-border pt-4 sm:justify-between">
        <p className="text-xs text-muted-foreground">{t('If you need a character or background that is not in the prose, the prose has to be rewritten.')}</p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={onCancel} disabled={applying} data-testid="recheck-cancel">{t('Cancel')}</Button>
          <span title={session.editing ? t('Confirm the name you are fixing first') : undefined}>
            <Button onClick={onApply} disabled={!!session.editing || applying || loading || failed} data-testid="recheck-apply">
              {applying ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {t('Update the list')}
            </Button>
          </span>
        </div>
      </DialogFooter>
    </>
  )
}

/** 이미 있는 이름으로 고쳤을 때 — 하나로 합칠지 한 번 묻는다(프로토타입 WTm). 합치면 고친 쪽 이름들이 남는 쪽의 다른 이름이 된다. */
export function RecheckMergeDialog({ session, prose, dispatch }: { session: RecheckSession; prose: ProseScene[]; dispatch: (action: RecheckAction) => void }) {
  const t = useT()
  const entries = recheckEntries(session, prose)
  const from = session.merge ? entries.find((entry) => entry.key === session.merge!.from) : undefined
  const into = session.merge ? entries.find((entry) => entry.key === session.merge!.into) : undefined
  const open = !!from && !!into
  const aliases = from ? [from.name, ...from.aliases].join('", "') : ''
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) dispatch({ type: 'cancelMerge' }) }}>
      <DialogContent className="sm:max-w-md" data-testid="recheck-merge">
        {from && into ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('{from} → {into}, merge into one?', { from: from.name, into: into.name })}</DialogTitle>
              <DialogDescription>
                {into.kind === 'person'
                  ? t('{into} is already on the list. Merging makes them one character, and "{aliases}" in the prose stays as another name (or) of {into}.', { into: into.name, aliases })
                  : t('{into} is already on the list. Merging makes them one place, and "{aliases}" in the prose stays as another name (or) of {into}.', { into: into.name, aliases })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => dispatch({ type: 'cancelMerge' })} data-testid="recheck-merge-cancel">{t('Cancel')}</Button>
              <Button onClick={() => dispatch({ type: 'confirmMerge' })} data-testid="recheck-merge-go">{t('Merge')}</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** 브레이크다운이 띄우는 창. 열 때마다 지금 목록(rows — 이번 화 줄)에서 시작하고, 산문은 Writer 실행 기록에서 읽는다.
 *  keptIds: 창에 보이지 않는 보관 줄(시리즈 다음 화) — 반영할 때 함께 보내 서버가 창과 같은 목록으로 맞춰 본다. */
export function ProseRecheckDialog({ open, onOpenChange, rows, keptIds = [] }: { open: boolean; onOpenChange: (open: boolean) => void; rows: BreakdownRow[]; keptIds?: string[] }) {
  const projectId = useProjectStore((s) => s.projectId)
  // 산문은 잠겨 바뀌지 않는다 — 열려 있는 동안 한 번 읽으면 된다(드물게만 다시 읽는다).
  const { preview, failed } = useWriterPreview(projectId, { enabled: open, intervalMs: 60_000 })
  const prose = useMemo(() => proseScenesFromPreview(preview), [preview])
  const [session, setSession] = useState<RecheckSession>(() => startRecheck(recheckEntitiesOf(rows)))
  const [applying, setApplying] = useState(false)
  // 열 때마다 지금 목록에서 시작한다(렌더 중 맞춤 — StyleMakeDialog 와 같은 방식). 닫으면 창에서 고친 것은 버린다.
  const [openedWith, setOpenedWith] = useState(open)
  if (open !== openedWith) {
    setOpenedWith(open)
    if (open) setSession(startRecheck(recheckEntitiesOf(rows)))
  }
  const dispatch = (action: RecheckAction) => setSession((current) => recheckReducer(current, action, prose))

  const apply = async () => {
    if (applying || session.editing) return
    if (session.ops.length === 0) {
      onOpenChange(false)
      return
    }
    setApplying(true)
    try {
      const result = await useProducerStore.getState().applyRecheck(session.ops, keptIds)
      // 보관 줄이 있는 화: 반영했거나(성공) 반영했는지 몰라 목록을 다시 읽었으면 시리즈 정보도 다시 읽는다 —
      //   넣은 보관 인물이 이번 화 씬에 들어가 보관 묶음에서 이번 화 목록으로 올라온다(검토).
      if ((result.ok || ('reloaded' in result && result.reloaded)) && keptIds.length && projectId) void loadSeriesInfo(projectId, false)
      if (!result.ok) {
        toast.error(result.error)
        if ('reloaded' in result && result.reloaded) onOpenChange(false)
        return
      }
      onOpenChange(false)
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!applying) onOpenChange(next) }}>
        <DialogContent
          className="flex max-h-[90vh] flex-col sm:max-w-[min(56rem,90vw)]"
          showCloseButton={!applying}
          // Esc 는 고치던 이름 · 고르던 말부터 닫는다 — 창 전체를 닫아 고친 것을 잃지 않게.
          onEscapeKeyDown={(event) => {
            if (session.editing) {
              event.preventDefault()
              dispatch({ type: 'cancelEdit' })
            } else if (session.adding) {
              event.preventDefault()
              dispatch({ type: 'clearPick' })
            }
          }}
          data-testid="recheck-dialog"
        >
          <RecheckBody
            session={session}
            prose={prose}
            dispatch={dispatch}
            loading={open && !preview && !failed}
            failed={failed && prose.length === 0}
            applying={applying}
            onCancel={() => onOpenChange(false)}
            onApply={() => void apply()}
          />
        </DialogContent>
      </Dialog>
      <RecheckMergeDialog session={session} prose={prose} dispatch={dispatch} />
    </>
  )
}
