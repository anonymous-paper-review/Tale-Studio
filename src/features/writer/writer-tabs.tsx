'use client'

// Writer 탭 — shadcn Tabs를 controlled store 값으로 구동한다.

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWriterUiStore, type WriterTab } from '@/stores/writer-ui-store'

export function WriterTabs() {
  const activeTab = useWriterUiStore((state) => state.activeTab)
  const setActiveTab = useWriterUiStore((state) => state.setActiveTab)

  // artist 탭(Characters/World/Inventory)과 동일한 기본 TabsList 스타일(#c1 2026-07-13).
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as WriterTab)}
      className="w-fit shrink-0"
    >
      <TabsList>
        <TabsTrigger value="storyboard">러프 스토리보드</TabsTrigger>
        <TabsTrigger value="script">트리트먼트</TabsTrigger>
        <TabsTrigger value="dialogue">대사</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
