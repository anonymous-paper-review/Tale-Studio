'use client'

// 프로젝트 목록 머리의 찾기 칸 · 정렬 단추(11/5 시안 R2, 리드 2026-11-09) — 값은 목록 화면이 갖고 여기는 보이고 알리기만 한다.
//   시안: 찾기 알약 260(바탕 side) · 정렬 알약(side-raised, 지금 정렬 이름 + ▾) · 펼친 메뉴(바탕 · 모서리 14)는 고른 줄이 tab-selected 에 ✓.
import { Check, ChevronDown, Search } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { PROJECT_SORTS, type ProjectSort } from './project-list'

export function ProjectListTools({
  query,
  onQueryChange,
  sort,
  onSortChange,
}: {
  query: string
  onQueryChange: (query: string) => void
  sort: ProjectSort
  onSortChange: (sort: ProjectSort) => void
}) {
  const t = useT()
  const current = PROJECT_SORTS.find((option) => option.key === sort) ?? PROJECT_SORTS[0]
  return (
    <div className="flex items-center gap-2">
      <div className="relative w-[260px] max-w-full">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('Find by project name')}
          aria-label={t('Find by project name')}
          className="h-10 rounded-full bg-side pl-10 pr-4"
          data-testid="projects-search"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-10 shrink-0 items-center gap-2 rounded-full bg-side-raised px-4 text-label font-semibold text-foreground transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            data-testid="projects-sort"
          >
            {t(current.label)}
            <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px] space-y-0.5 rounded-[14px] bg-background p-1.5">
          {PROJECT_SORTS.map((option) => {
            const picked = option.key === sort
            return (
              <DropdownMenuItem
                key={option.key}
                onClick={() => onSortChange(option.key)}
                className={cn('rounded-lg px-2.5 py-2', picked ? 'bg-tab-selected text-foreground' : 'text-muted-foreground')}
                data-testid={`projects-sort-${option.key}`}
              >
                <span className="flex-1">{t(option.label)}</span>
                {picked ? <Check className="size-4 text-foreground" aria-hidden /> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
