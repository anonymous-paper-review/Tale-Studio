'use client'

// Writer 탭 — shadcn Tabs를 controlled store 값으로 구동한다.

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWriterUiStore, type WriterTab } from '@/stores/writer-ui-store'
import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { AltArrowHint } from '@/components/alt-arrow-hint'
import { useT } from '@/lib/i18n'

const TAB_ORDER: readonly WriterTab[] = ['storyboard', 'script', 'dialogue']
// V2 run 프로젝트: 프리뷰 탭이 맨 앞 (#v2-tab — 진입 기본 탭이자 리뷰 표면).
const TAB_ORDER_V2: readonly WriterTab[] = ['v2', 'storyboard', 'script', 'dialogue']

export function WriterTabs() {
  const activeTab = useWriterUiStore((state) => state.activeTab)
  const setActiveTab = useWriterUiStore((state) => state.setActiveTab)
  const v2Available = useWriterUiStore((state) => state.v2Available)
  const t = useT()
  const order = v2Available ? TAB_ORDER_V2 : TAB_ORDER
  // Alt+←/→ 로 러프 스토리보드 ↔ 트리트먼트 ↔ 대사 순환(#keyboard-only)
  useAltArrowCycle(order, activeTab, setActiveTab)

  // artist 탭(Characters/World/Inventory)과 동일한 기본 TabsList 스타일(#c1 2026-07-13).
  //   AltArrowHint: Alt 홀드 중 좌우 ←/→ 칩 — 이 묶음이 Alt+화살표로 넘어감을 알린다.
  return (
    <AltArrowHint>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as WriterTab)}
        className="w-fit shrink-0"
      >
        <TabsList>
          {v2Available ? <TabsTrigger value="v2">{t('V2 units')}</TabsTrigger> : null}
          <TabsTrigger value="storyboard">{t('Rough storyboard')}</TabsTrigger>
          <TabsTrigger value="script">{t('Treatment')}</TabsTrigger>
          <TabsTrigger value="dialogue">{t('Dialogue')}</TabsTrigger>
        </TabsList>
      </Tabs>
    </AltArrowHint>
  )
}
