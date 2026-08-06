'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * 문자열 배열(tone[]) 칩 편집기.
 * 기본 상태는 칩만 — 입력창은 "+" 버튼을 눌렀을 때만 열린다(#b2 2026-08-03: 항상 떠 있는
 * 입력창이 줄을 시끄럽게 했다). "+"는 줄 hover 에서 드러나되, 칩이 하나도 없으면 은은하게
 * 상시 노출(빈 줄에서 진입점이 사라지지 않게). Enter 추가(연속 입력 유지), blur 로 닫힘,
 * Escape 취소. 중복(대소문자 무시)은 무시. design.md §2.5 — 칩은 Badge(secondary).
 */
export function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const add = () => {
    const v = draft.trim()
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange([...values, v])
    }
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <Badge key={v} variant="secondary" className="gap-1 pr-1">
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            aria-label={`${v} 제거`}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setDraft('')
              setEditing(false)
            }
          }}
          onBlur={() => {
            add()
            setEditing(false)
          }}
          placeholder={placeholder ?? '추가…'}
          className="h-7 w-28 min-w-24 border-dashed text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={placeholder ? `추가 (${placeholder})` : '추가'}
          title="추가"
          className={cn(
            'flex size-6 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100',
            // 상시 노출(2026-08-06) — hover 전 opacity-0 은 "톤을 어떻게 바꾸지?"로 읽혔다.
            //   기본 은은하게, 줄 hover(group=MentionableCard)·자체 hover 에서 또렷하게.
            'opacity-60 group-hover:opacity-100',
          )}
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  )
}
