'use client'

// @멘션 자동완성이 붙은 채팅 입력창.
// `@` + 글자 입력 시 현재 stage의 카드/오브젝트(인물·사물·배경·캐릭터·장소 등) 목록을 드롭다운으로
// 보여주고, 선택하면 `@이름 `을 삽입한다. AI는 이미 카드 컨텍스트를 받으므로 @이름이 명시 참조로 작동한다.
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface MentionItem {
  id: string
  label: string
  hint?: string
}

// 캐럿 직전에 활성 @토큰이 있으면 { query, start } 반환. (앞이 공백이거나 줄 시작일 때만 트리거)
function activeMention(value: string, caret: number): { query: string; start: number } | null {
  const upto = value.slice(0, caret)
  const m = upto.match(/(?:^|\s)@([^\s@]*)$/)
  if (!m) return null
  return { query: m[1], start: caret - m[1].length - 1 }
}

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  items: MentionItem[]
  disabled?: boolean
  placeholder?: string
  className?: string
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionTextarea(
    { value, onChange, onSubmit, items, disabled, placeholder, className },
    ref,
  ) {
    const innerRef = useRef<HTMLTextAreaElement>(null)
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement)

    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [start, setStart] = useState(0)
    const [active, setActive] = useState(0)

    const filtered = open
      ? items
          .filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8)
      : []
    const showList = open && filtered.length > 0

    const sync = (el: HTMLTextAreaElement) => {
      const am = activeMention(el.value, el.selectionStart ?? el.value.length)
      if (am) {
        setOpen(true)
        setQuery(am.query)
        setStart(am.start)
        setActive(0)
      } else {
        setOpen(false)
      }
    }

    const insert = (item: MentionItem) => {
      const el = innerRef.current
      if (!el) return
      const caret = el.selectionStart ?? value.length
      const before = value.slice(0, start)
      const token = `@${item.label} `
      const next = before + token + value.slice(caret)
      onChange(next)
      setOpen(false)
      requestAnimationFrame(() => {
        const pos = (before + token).length
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (showList) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActive((a) => (a + 1) % filtered.length)
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActive((a) => (a - 1 + filtered.length) % filtered.length)
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          insert(filtered[active])
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setOpen(false)
          return
        }
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        onSubmit()
      }
    }

    return (
      <div className="relative flex-1">
        {showList && (
          <div className="absolute bottom-full left-0 z-popover mb-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
            <div className="px-2 py-1 text-[10px] text-muted-foreground">
              카드/오브젝트 멘션 — ↑↓ 이동, Enter 선택
            </div>
            {filtered.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  insert(it)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs',
                  i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                )}
              >
                <span className="truncate">@{it.label}</span>
                {it.hint ? (
                  <span className="shrink-0 text-[10px] text-muted-foreground">{it.hint}</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={innerRef}
          rows={1}
          className={className}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value)
            sync(e.target)
          }}
          onClick={(e) => sync(e.currentTarget)}
          onKeyUp={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) sync(e.currentTarget)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
      </div>
    )
  },
)
