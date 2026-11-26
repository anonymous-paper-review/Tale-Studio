'use client'

// Editor 위 왼쪽 판 탭 줄 — [소스 | 효과 컨트롤 | 생성](시안 E1 의 두 탭 + 2026-11-26 오너 요청 E1 "생성", 시안 없음 — 같은 탭 모양).
//   [생성]은 음악 만들기 판(music-panel.tsx)이다. 약속: tests/editor/music-panel.test.ts
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

export type TopLeftTab = 'source' | 'effects' | 'generate'

export function TopLeftTabs({ value, onChange }: { value: TopLeftTab; onChange: (tab: TopLeftTab) => void }) {
  const t = useT()
  const tabs: ReadonlyArray<readonly [TopLeftTab, string]> = [
    ['source', t('Source')],
    ['effects', t('Effect controls')],
    ['generate', t('Generate')],
  ]
  return (
    <div role="tablist" className="flex shrink-0 items-center gap-4 px-4 pt-3">
      {tabs.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          onClick={() => onChange(tab)}
          className={cn(
            'relative pb-1.5 text-label transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5',
            value === tab ? 'font-semibold text-foreground after:bg-foreground' : 'font-medium text-subtle-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
