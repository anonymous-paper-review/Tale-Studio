'use client'

// Editor 위 막대 · 둘째 줄 · 내보내기 탭 · 단축키 창(시안 E1 409:4633–4646 · 결정 페이지 추천, 2단계 ① 새 배치 2026-11-14).
//   - 맨 위 오른쪽: [← Director로] 보조 단추 · [내보내기] 크림 단추(메인 단추는 크림 하나).
//   - 둘째 줄: [편집 | 내보내기] 탭 · 시퀀스 이름과 "길이 · 가로×세로 · 초당 장 수" · [실행 취소] [↷] · [단축키].
//     [가져오기] 탭은 내 파일(3단계)에서 더한다.
//   - 내보내기 탭(시안 그림 없음): 지금의 드래프트 렌더(영상 파일) · 샷 ZIP 단추를 그대로 옮겼다.
//   약속: tests/editor/panels.test.ts
import { ArrowLeft, Keyboard, Loader2, Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export type EditorTab = 'edit' | 'export'

/** 맨 위 오른쪽 단추 — [← Director로] 보조 · [내보내기] 크림. */
export function EditorTopActions({ onBack, onExport }: { onBack: () => void; onExport: () => void }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" className="rounded-full" onClick={onBack}>
        <ArrowLeft className="size-3.5" />
        {t('To Director')}
      </Button>
      <Button size="sm" className="rounded-full" onClick={onExport}>
        {t('Export')}
      </Button>
    </div>
  )
}

/** 둘째 줄 — 탭 · 시퀀스 정보 · 되돌리기 · 단축키. */
export function EditorWorkbar({
  tab,
  onTab,
  sequenceInfo,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onShortcuts,
}: {
  tab: EditorTab
  onTab: (tab: EditorTab) => void
  sequenceInfo: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onShortcuts: () => void
}) {
  const t = useT()
  const tabs: { value: EditorTab; label: string }[] = [
    { value: 'edit', label: t('Edit') },
    { value: 'export', label: t('Export') },
  ]
  return (
    <div className="flex min-w-0 shrink-0 items-center gap-6">
      <div role="tablist" className="flex items-center gap-1">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => onTab(item.value)}
            className={cn(
              'h-8 rounded-lg px-3 text-label whitespace-nowrap transition-colors',
              tab === item.value ? 'bg-accent font-semibold text-foreground' : 'font-medium text-subtle-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="shrink-0 text-body font-semibold text-foreground">{t('Sequence 01')}</span>
        <span className="truncate font-num text-meta text-subtle-foreground tabular-nums">{sequenceInfo}</span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="secondary" className="rounded-full" onClick={onUndo} disabled={!canUndo} title={t('Undo (Ctrl+Z)')}>
          <Undo2 className="size-3.5" />
          {t('Undo')}
        </Button>
        <Button size="icon-sm" variant="secondary" className="rounded-full" onClick={onRedo} disabled={!canRedo} title={t('Redo (Ctrl+Y)')} aria-label={t('Redo (Ctrl+Y)')}>
          <Redo2 className="size-3.5" />
        </Button>
        <Button size="sm" variant="secondary" className="rounded-full" onClick={onShortcuts}>
          <Keyboard className="size-3.5" />
          {t('Shortcuts')}
        </Button>
      </div>
    </div>
  )
}

/** 내보내기 탭 — 영상 파일(드래프트 렌더) · 샷 ZIP. 진행 중에는 단추 글이 진행을 보이고, 다시 누르면 영상 파일 만들기를 멈춘다. */
export function ExportTab({
  renderLabel,
  onDraftRender,
  exportingZip,
  onShotZip,
}: {
  renderLabel: string | null
  onDraftRender: () => void
  exportingZip: boolean
  onShotZip: () => void
}) {
  const t = useT()
  return (
    <div className="mt-4 grid max-w-[880px] gap-3 sm:grid-cols-2">
      <section className="flex flex-col gap-3 rounded-[20px] bg-panel p-5">
        <div>
          <h2 className="text-body font-semibold text-foreground">{t('Video file')}</h2>
          <p className="mt-1 text-label text-muted-foreground">
            {t('Plays the whole timeline in this browser and saves it as one video file. Keep this tab visible until it finishes.')}
          </p>
        </div>
        <Button size="sm" variant="secondary" className="w-fit gap-1.5 rounded-full px-3.5" onClick={onDraftRender} title={renderLabel ? t('Click to cancel') : undefined}>
          {renderLabel ? <Loader2 className="size-3 animate-spin" /> : null}
          {renderLabel ?? t('Draft Render')}
        </Button>
      </section>
      <section className="flex flex-col gap-3 rounded-[20px] bg-panel p-5">
        <div>
          <h2 className="text-body font-semibold text-foreground">{t('Shot ZIP')}</h2>
          <p className="mt-1 text-label text-muted-foreground">{t('Downloads the original shot videos in timeline order as one ZIP.')}</p>
        </div>
        <Button size="sm" variant="secondary" className="w-fit gap-1.5 rounded-full px-3.5" disabled={exportingZip} onClick={onShotZip}>
          {exportingZip ? <Loader2 className="size-3 animate-spin" /> : null}
          {exportingZip ? t('Zipping…') : t('Shot ZIP')}
        </Button>
      </section>
    </div>
  )
}

/** Editor 가 받는 단축키(use-editor-playback). 글은 사전 키. */
export const EDITOR_SHORTCUTS: readonly { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Play or pause' },
  { keys: '← →', action: 'One frame back or forward' },
  { keys: 'Shift+← →', action: 'Five frames back or forward' },
  { keys: 'Ctrl+← →', action: 'Previous or next edit point' },
  { keys: 'Ctrl+Z', action: 'Undo' },
  { keys: 'Ctrl+Y', action: 'Redo' },
  { keys: 'V', action: 'Selection tool' },
  { keys: 'C', action: 'Cut tool' },
  { keys: 'T', action: 'Type tool' },
  { keys: 'Ctrl+K', action: 'Split at the playhead' },
  { keys: 'M', action: 'Add a marker' },
  { keys: 'Delete', action: 'Remove the clip and leave a gap' },
  { keys: 'Shift+Delete', action: 'Ripple delete' },
]

export function ShortcutsList() {
  const t = useT()
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
      {EDITOR_SHORTCUTS.map((item) => (
        <div key={item.keys} className="contents">
          <dt>
            <kbd className="inline-flex h-6 items-center rounded-md bg-card px-2 font-num text-meta font-medium text-foreground">{item.keys}</kbd>
          </dt>
          <dd className="text-label text-muted-foreground">{t(item.action)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t('Keyboard shortcuts')}</DialogTitle>
          <DialogDescription>{t('Shortcuts work anywhere in the Editor except while typing.')}</DialogDescription>
        </DialogHeader>
        <ShortcutsList />
      </DialogContent>
    </Dialog>
  )
}
