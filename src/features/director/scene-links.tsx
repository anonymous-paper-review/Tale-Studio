'use client'

// 다른 씬 카드와 이어진 선의 꼬리표(오너 D8 · 혼자 정한 것 h9, 2026-11-22) — 씬별 보기는 다른 씬 카드를 그리지 않아 그 선의 끝이 없다.
//   선 대신 이 씬 카드 위쪽에 "← 씬 1 · 샷 2"(들어오는 선은 왼쪽) · "씬 3 · 샷 9 →"(나가는 선은 오른쪽)를 달고, 누르면 그 씬으로 가서 그 카드를 가운데에 둔다.
//   꼬리표 목록은 캔버스(page.tsx CanvasInner)가 scene-view.sceneCanvas 의 links 로 짓는다. 약속: tests/director/scene-view.test.ts
import { createContext, useContext, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export interface SceneLinkChip {
  key: string
  side: 'in' | 'out'
  /** 이어진 카드의 전체 이름("씬 1 · 샷 2"). */
  text: string
  /** 그 씬으로 가서 그 카드를 가운데에. */
  go: () => void
}

const SceneLinksContext = createContext<ReadonlyMap<string, readonly SceneLinkChip[]> | null>(null)

export function SceneLinksProvider({ chips, children }: { chips: ReadonlyMap<string, readonly SceneLinkChip[]>; children: ReactNode }) {
  return <SceneLinksContext.Provider value={chips}>{children}</SceneLinksContext.Provider>
}

/** 노드 카드 위쪽의 꼬리표. nodrag · nopan: 꼬리표를 누르는 것이 카드 끌기 · 화면 끌기가 되지 않게. 누름은 카드 고르기로 번지지 않는다. */
export function SceneLinkChips({ nodeId }: { nodeId: string }) {
  const t = useT()
  const chips = useContext(SceneLinksContext)?.get(nodeId)
  if (!chips || chips.length === 0) return null
  return (
    <>
      {(['in', 'out'] as const).map((side) => {
        const list = chips.filter((chip) => chip.side === side)
        if (list.length === 0) return null
        return (
          <div
            key={side}
            className={cn('nodrag nopan absolute bottom-full mb-1.5 flex max-w-full gap-1', side === 'in' ? 'left-0' : 'right-0')}
          >
            {list.map((chip) => (
              <button
                key={chip.key}
                type="button"
                data-scene-link={side}
                title={t('Linked to a card in another scene. Click to go there.')}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  chip.go()
                }}
                className="flex h-6 min-w-0 items-center gap-1 rounded-full bg-card px-2 text-[10.5px] font-medium text-muted-foreground shadow-node transition-colors duration-100 hover:bg-accent hover:text-foreground"
              >
                {side === 'in' && <ArrowLeft aria-hidden className="size-3 shrink-0" />}
                <span className="truncate">{chip.text}</span>
                {side === 'out' && <ArrowRight aria-hidden className="size-3 shrink-0" />}
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}
