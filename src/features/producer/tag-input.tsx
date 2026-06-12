'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

/**
 * 문자열 배열(tone[] / targetEmotion[]) 칩 편집기.
 * Enter 또는 blur 로 추가, 칩의 X 로 제거. 중복(대소문자 무시)은 무시.
 * design.md §2.5 — 칩은 Badge(secondary), 색만으로 상태 전달 안 함.
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

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) {
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
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add()
          }
        }}
        onBlur={add}
        placeholder={placeholder ?? '추가…'}
        className="h-7 w-24 min-w-24 flex-1 border-dashed text-xs"
      />
    </div>
  )
}
