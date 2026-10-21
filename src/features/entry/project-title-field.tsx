'use client'

// 시작 화면 머리의 프로젝트 제목(2026-10-21 오너 "프로젝트 제목을 처음에 설정 불가능") — 눌러서 바로 고친다.
//   Enter · 바깥 누르기 = 저장, Esc = 취소. 비우거나 그대로면 바꾸지 않는다(lib/project/title).
//   여기서 정한 제목은 시작할 때 AI가 붙이는 제목으로 바뀌지 않는다(start-plan 은 제목 없음일 때만 붙인다).
//   약속: tests/producer/start-title.test.ts
import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { isUntitled, nextProjectTitle, titleDraftOf } from '@/lib/project/title'

export function ProjectTitleField({ title, onRename }: { title: string; onRename: (next: string) => void }) {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const untitled = isUntitled(title)

  if (draft !== null) {
    return (
      <Input
        autoFocus
        value={draft}
        maxLength={120}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            cancelled.current = true
            event.currentTarget.blur()
          }
        }}
        onBlur={() => {
          const value = draft
          setDraft(null)
          if (cancelled.current) {
            cancelled.current = false
            return
          }
          const next = nextProjectTitle(value, title)
          if (next) onRename(next)
        }}
        placeholder={t('Untitled')}
        aria-label={t('Rename project')}
        className="h-8 w-64 max-w-full text-sm"
        data-testid="entry-title-input"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(titleDraftOf(title))}
      aria-label={t('Rename project')}
      title={t('Rename project')}
      className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid="entry-title"
    >
      <span className={cn('truncate', untitled && 'text-muted-foreground')}>{untitled ? t('Untitled') : title}</span>
      <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}
