'use client'

// @멘션 자동완성이 붙은 채팅 입력창.
// `@` + 글자 입력 시 현재 stage의 카드/오브젝트(인물·사물·배경·캐릭터·장소 등) 목록을 드롭다운으로
// 보여주고, 선택하면 `@이름 `을 삽입한다. AI는 이미 카드 컨텍스트를 받으므로 @이름이 명시 참조로 작동한다.
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useLayoutEffect,
  useState,
  type KeyboardEvent,
} from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

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
  /** 약속 M: 입력 뒤에 회색으로 보이는 안내("이 카드 채워줘") — 값이 있어도 보인다(placeholder 는 빈 칸에서만 보이므로). */
  ghost?: string
  className?: string
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function MentionTextarea(
    { value, onChange, onSubmit, items, disabled, placeholder, ghost, className },
    ref,
  ) {
    const innerRef = useRef<HTMLTextAreaElement>(null)
    useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement)
    const t = useT()

    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [start, setStart] = useState(0)
    const [active, setActive] = useState(0)
    // 입력이 max-height를 넘어 내부 스크롤이 생겼을 때, 안 보이는 내용이 위/아래에 있는지(#a3).
    //   있으면 회색 ^/v 버튼을 띄워 클릭으로 몇 줄씩 스크롤할 수 있게 한다.
    const [scrollHint, setScrollHint] = useState({ up: false, down: false })
    const syncScrollHint = () => {
      const el = innerRef.current
      if (!el) return
      const up = el.scrollTop > 1
      const down = el.scrollTop + el.clientHeight < el.scrollHeight - 1
      setScrollHint((prev) =>
        prev.up === up && prev.down === down ? prev : { up, down },
      )
    }
    // 값이 바뀌면(auto-grow 반영 후) 오버플로 상태 재측정.
    useLayoutEffect(() => {
      syncScrollHint()
    })
    const scrollByLines = (dir: 1 | -1) => {
      innerRef.current?.scrollBy({ top: dir * 60, behavior: 'smooth' })
    }
    // 활성 항목을 스크롤 영역 안으로 자동 노출(아래로 길게 내려가도 선택이 보이게).
    const activeItemRef = useRef<HTMLButtonElement>(null)
    // (전송 히스토리 ↑/↓ recall 은 제거 — 2026-08-07. 선택지(#choices-keys) 키보드 조작과
    //  충돌했고 실사용도 낮았다. ↑/↓ 는 이제 멘션 리스트/선택지 내비게이션 전용.)

    // #mention-popup-cap(2026-08-26, 오너 E2 "@ 누르면 다 안 보임"): 옛 slice(0,8)이 후보를
    //   8개에서 잘랐다 — writer 는 씬·샷·스크립트 라인 합쳐 수십 개라 뒷항목이 영영 안 보였다.
    //   캡을 걷고 목록 스크롤(max-h + overflow)에 맡긴다. 타이핑 필터가 실질 축소를 담당.
    const filtered = open
      ? items.filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))
      : []
    const showList = open && filtered.length > 0
    useLayoutEffect(() => {
      if (showList) activeItemRef.current?.scrollIntoView({ block: 'nearest' })
    }, [active, showList])

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
      if (navKey === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        onSubmit()
      }
    }

    return (
      <div className="relative flex-1">
        {showList && (
          <div className="absolute bottom-full left-0 z-popover mb-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
            <div className="px-2 py-1 text-[10px] text-muted-foreground">
              {t('Card/object mentions: ↑↓ to move, Enter to select')}
            </div>
            {filtered.map((it, i) => (
              <button
                key={it.id}
                type="button"
                ref={i === active ? activeItemRef : undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  insert(it)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded border-l-2 px-2 py-1.5 text-left text-xs transition-colors',
                  i === active
                    ? 'border-sky-400 bg-sky-400/20 font-medium text-foreground'
                    : 'border-transparent text-foreground/80 hover:bg-accent/50',
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
          onScroll={syncScrollHint}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
        {/* 회색 안내(ghost) — 같은 클래스(패딩·글꼴)의 거울 층에 값을 투명하게 깔고 그 뒤에 안내를 잇는다. 클릭은 통과. */}
        {ghost && (
          <div
            aria-hidden
            data-testid="mention-ghost"
            className={cn(className, 'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words')}
            style={{ color: 'transparent' }}
          >
            <span>{value}</span>
            <span className="text-muted-foreground/60">{ghost}</span>
          </div>
        )}
        {/* 위/아래에 가려진 입력 내용이 있음을 알리는 회색 ^/v — 클릭 시 몇 줄씩 스크롤(#a3).
            mousedown preventDefault로 textarea 포커스를 뺏지 않는다. */}
        {scrollHint.up && (
          <button
            type="button"
            aria-label={t('View content above')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => scrollByLines(-1)}
            className="absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-full border border-border bg-card/90 p-0.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <ChevronUp className="size-3" />
          </button>
        )}
        {scrollHint.down && (
          <button
            type="button"
            aria-label={t('View content below')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => scrollByLines(1)}
            className="absolute bottom-1 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card/90 p-0.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          >
            <ChevronDown className="size-3" />
          </button>
        )}
      </div>
    )
  },
)
