'use client'

// 대사(Dialogue) 탭의 대사 한 줄(2026-11-02 오너 "탭 안에서 바로 고치기") — 누르면 그 자리에서 글을 고친다.
//   보기 · 고치기 · 저장 중 · 저장 실패 네 모습이 같은 바깥 상자(div)를 쓴다 — 저장하는 동안 포커스를 둔 상자가 그대로 남아,
//   저장이 끝나도 키보드 포커스가 그 줄에 있다. 무엇을 할지(키 · 저장 여부)는 lib/writer/dialogue-line-edit 이 정하고 여기는 보이기만 한다.
import { useId } from 'react'
import { AlertCircle, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { lineEditKey } from '@/lib/writer/dialogue-line-edit'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

export type DialogueLineState =
  | { kind: 'idle' }
  | { kind: 'editing'; draft: string }
  | { kind: 'saving'; draft: string }
  | { kind: 'failed'; draft: string }

interface DialogueLineRowProps {
  speaker: string
  /** 화자 이름 색(선택된 인물만 색) · V.O. 기울임. */
  speakerClassName: string
  /** 줄 바 · 강조 · 흐림. */
  rowClassName: string
  /** 화면에 보이는 글(인물 id 를 이름으로 바꾼 글). */
  text: string
  delivery?: string
  /** 읽어 주는 이름 — "샷 N의 대사 M (화자) 고치기". 샷 전체 글은 담지 않는다. */
  label: string
  state: DialogueLineState
  /** 대사를 새로 쓰는 중 — 고칠 수 없다. */
  disabled?: boolean
  /** 선택된 인물의 대사(굵게). */
  focused?: boolean
  rowRef?: (element: HTMLDivElement | null) => void
  onStart: () => void
  onDraftChange: (draft: string) => void
  onCommit: (via: 'key' | 'blur') => void
  onCancel: () => void
  onRetry: () => void
  onRevert: () => void
}

export function DialogueLineRow({
  speaker,
  speakerClassName,
  rowClassName,
  text,
  delivery,
  label,
  state,
  disabled,
  focused,
  rowRef,
  onStart,
  onDraftChange,
  onCommit,
  onCancel,
  onRetry,
  onRevert,
}: DialogueLineRowProps) {
  const t = useT()
  const textId = useId()
  const speakerLabel = (
    <span className={cn('mr-2 font-num text-micro font-semibold uppercase tracking-wide', speakerClassName)}>{speaker}</span>
  )
  const quoted = (value: string) => (
    <span id={textId} className={cn('text-[15px] leading-7 text-foreground', focused && 'font-medium')}>
      &ldquo;{value}&rdquo;
    </span>
  )

  if (state.kind === 'editing') {
    return (
      <div ref={rowRef} data-testid="dialogue-line" data-state="editing" className={cn(rowClassName, 'flex flex-col gap-1')}>
        <div className="flex items-start gap-1">
          <span className="pt-1.5">{speakerLabel}</span>
          <Textarea
            autoFocus
            rows={1}
            value={state.draft}
            aria-label={label}
            onChange={(event) => onDraftChange(event.target.value)}
            onFocus={(event) => {
              const end = event.currentTarget.value.length
              event.currentTarget.setSelectionRange(end, end)
            }}
            onKeyDown={(event) => {
              const action = lineEditKey({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
                keyCode: event.keyCode,
              })
              if (!action) return
              event.preventDefault()
              event.stopPropagation()
              if (action === 'save') onCommit('key')
              else onCancel()
            }}
            onBlur={() => onCommit('blur')}
            className="min-h-0 flex-1 resize-none px-2 py-1 text-[15px] leading-7 md:text-[15px]"
          />
        </div>
        <span className="pl-1 text-micro text-subtle-foreground">{t('Enter to save · Esc to cancel')}</span>
      </div>
    )
  }

  if (state.kind === 'saving') {
    return (
      <div ref={rowRef} tabIndex={-1} aria-label={label} aria-busy="true" data-testid="dialogue-line" data-state="saving" className={rowClassName}>
        {speakerLabel}
        {quoted(state.draft)}
        <Loader2 className="ml-2 inline size-3 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">{t('Saving…')}</span>
      </div>
    )
  }

  if (state.kind === 'failed') {
    return (
      <div ref={rowRef} tabIndex={-1} aria-label={label} data-testid="dialogue-line" data-state="failed" className={cn(rowClassName, 'flex flex-col gap-1.5')}>
        <span>
          {speakerLabel}
          {quoted(state.draft)}
        </span>
        <p role="alert" className="flex items-center gap-1.5 text-caption text-destructive">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {t('Could not save the line. Save it again or undo the change.')}
        </p>
        <div className="flex gap-2">
          <Button size="xs" variant="secondary" className="rounded-full" onClick={onRetry}>
            {t('Save again')}
          </Button>
          <Button size="xs" variant="ghost" onClick={onRevert}>
            {t('Undo')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-describedby={textId}
      aria-disabled={disabled || undefined}
      data-testid="dialogue-line"
      data-state="idle"
      onClick={disabled ? undefined : onStart}
      onKeyDown={(event) => {
        if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        onStart()
      }}
      className={cn(
        rowClassName,
        'group/line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring/50',
        disabled ? 'cursor-default' : 'cursor-text',
      )}
    >
      {speakerLabel}
      {quoted(text)}
      {delivery ? <span className="ml-2 text-caption text-subtle-foreground">({delivery})</span> : null}
      {disabled ? null : (
        <Pencil
          className="ml-1.5 inline size-3.5 align-[-2px] text-muted-foreground opacity-0 transition-opacity group-hover/line:opacity-60 group-focus-visible/line:opacity-60"
          aria-hidden
        />
      )}
    </div>
  )
}
