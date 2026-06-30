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
  /** 위/아래 화살표로 불러올 직전 전송 메시지들 (오래된→최신 순). 드롭다운이 닫혀 있고 캐럿이 첫/끝 줄일 때만 동작. */
  history?: string[]
  disabled?: boolean
  placeholder?: string
  className?: string
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionTextarea(
    { value, onChange, onSubmit, items, history = [], disabled, placeholder, className },
    ref,
  ) {
    const innerRef = useRef<HTMLTextAreaElement>(null)
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement)

    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [start, setStart] = useState(0)
    const [active, setActive] = useState(0)
    // 전송 메시지 히스토리 탐색 상태. null = 현재 초안(미탐색). number = history 인덱스.
    const [histIdx, setHistIdx] = useState<number | null>(null)
    const draftRef = useRef('')

    // 캐럿이 첫 줄(위에 줄 없음) / 끝 줄(아래 줄 없음)에 있는지 — 멀티라인 편집을 깨지 않으려 경계에서만 히스토리 탐색.
    const onFirstLine = (el: HTMLTextAreaElement) =>
      el.value.lastIndexOf('\n', (el.selectionStart ?? 0) - 1) === -1
    const onLastLine = (el: HTMLTextAreaElement) =>
      el.value.indexOf('\n', el.selectionStart ?? el.value.length) === -1

    const applyHistory = (next: string) => {
      onChange(next)
      requestAnimationFrame(() => {
        const el = innerRef.current
        if (!el) return
        el.focus()
        const pos = next.length
        el.setSelectionRange(pos, pos)
      })
    }
    // 위 화살표: 더 오래된 메시지로. (이미 가장 오래된 것이면 그대로 소비)
    const recallOlder = (): boolean => {
      if (history.length === 0) return false
      if (histIdx === null) {
        draftRef.current = value
        const ni = history.length - 1
        setHistIdx(ni)
        applyHistory(history[ni])
        return true
      }
      if (histIdx > 0) {
        const ni = histIdx - 1
        setHistIdx(ni)
        applyHistory(history[ni])
      }
      return true
    }
    // 아래 화살표: 더 최신 메시지로. 가장 최신을 지나면 작성 중이던 초안 복원 후 탐색 종료.
    const recallNewer = (): boolean => {
      if (histIdx === null) return false
      if (histIdx < history.length - 1) {
        const ni = histIdx + 1
        setHistIdx(ni)
        applyHistory(history[ni])
      } else {
        setHistIdx(null)
        applyHistory(draftRef.current)
      }
      return true
    }
    // 입력이 외부에서 비워지면(전송 등) 탐색 상태 해제. (set-state-in-render 패턴 — 빈 값에서만 수렴)
    if (value === '' && histIdx !== null) setHistIdx(null)

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
      // IME(한글 등) 조합 중 Chrome은 키다운을 key='Process'/keyCode 229로 보고해 e.key 검사가 빗나간다.
      // 물리 키(e.code)로 화살표/Enter/Tab/Esc를 복구해 조합 중에도 리스트 조작이 동작하게 한다.
      const navKey =
        e.key === 'Process' || e.key === 'Unidentified'
          ? (({
              ArrowDown: 'ArrowDown',
              ArrowUp: 'ArrowUp',
              Enter: 'Enter',
              NumpadEnter: 'Enter',
              Tab: 'Tab',
              Escape: 'Escape',
            } as Record<string, string>)[e.code] ?? e.key)
          : e.key
      if (showList) {
        if (navKey === 'ArrowDown') {
          e.preventDefault()
          setActive((a) => (a + 1) % filtered.length)
          return
        }
        if (navKey === 'ArrowUp') {
          e.preventDefault()
          setActive((a) => (a - 1 + filtered.length) % filtered.length)
          return
        }
        // 조합 중 Enter/Tab은 음절 확정이 우선 — 멘션 선택은 조합이 끝났을 때만.
        if ((navKey === 'Enter' || navKey === 'Tab') && !e.nativeEvent.isComposing) {
          e.preventDefault()
          insert(filtered[active])
          return
        }
        if (navKey === 'Escape') {
          e.preventDefault()
          setOpen(false)
          return
        }
      }
      // 드롭다운이 닫혀 있을 때 위/아래 화살표 → 전송 메시지 히스토리 호출(경계 줄에서만).
      const el = innerRef.current
      if (!showList && el && navKey === 'ArrowUp' && onFirstLine(el)) {
        if (recallOlder()) {
          e.preventDefault()
          return
        }
      }
      if (!showList && el && navKey === 'ArrowDown' && histIdx !== null && onLastLine(el)) {
        if (recallNewer()) {
          e.preventDefault()
          return
        }
      }
      if (navKey === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
            setHistIdx(null) // 직접 타이핑하면 히스토리 탐색 종료
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
