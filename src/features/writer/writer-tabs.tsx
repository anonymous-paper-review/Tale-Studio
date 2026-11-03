'use client'

// Writer 탭 — shadcn Tabs를 controlled store 값으로 구동한다.

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWriterUiStore, type WriterTab } from '@/stores/writer-ui-store'
import { writerTabOrder } from '@/lib/writer/tab-order'
import { useAltArrowCycle } from '@/lib/use-alt-arrow-cycle'
import { AltArrowHint } from '@/components/alt-arrow-hint'
import { useT } from '@/lib/i18n'

export function WriterTabs() {
  const activeTab = useWriterUiStore((state) => state.activeTab)
  const setActiveTab = useWriterUiStore((state) => state.setActiveTab)
  const v2Available = useWriterUiStore((state) => state.v2Available)
  const t = useT()
  // V2 run 프로젝트는 프리뷰 탭이 맨 앞(#v2-tab). 마스터 시트는 탭이 아니라 [내보내기] 메뉴에 있다(2026-10-20).
  const order = writerTabOrder(v2Available)
  // Alt+←/→ 로 러프 스토리보드 ↔ 대사 순환(#keyboard-only)
  useAltArrowCycle(order, activeTab, setActiveTab)

  // v3(2026-11-03, 시안 S1 "러프 | 대본"): 칩처럼 떨어진 알약 탭 — 고른 탭은 지금 단계 색 테두리 · 18% 바탕.
  //   탭 이름은 그대로 둔다(tests/writer/tabs.test.ts 가 글을 못 박았다 — 시안의 "러프 | 대본"은 결정 대기).
  //   AltArrowHint: Alt 홀드 중 좌우 ←/→ 칩 — 이 묶음이 Alt+화살표로 넘어감을 알린다.
  return (
    <AltArrowHint>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as WriterTab)}
        className="w-fit shrink-0"
      >
        <TabsList variant="pill">
          {v2Available ? <TabsTrigger value="v2">{t('V2 units')}</TabsTrigger> : null}
          <TabsTrigger value="storyboard">{t('Rough storyboard')}</TabsTrigger>
          <TabsTrigger value="dialogue">{t('Dialogue')}</TabsTrigger>
        </TabsList>
      </Tabs>
    </AltArrowHint>
  )
}
