'use client'

// Writer 탭 — shadcn Tabs를 controlled store 값으로 구동한다.

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWriterUiStore, type WriterTab } from '@/stores/writer-ui-store'

export function WriterTabs() {
  const activeTab = useWriterUiStore((state) => state.activeTab)
  const setActiveTab = useWriterUiStore((state) => state.setActiveTab)

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as WriterTab)}
      className="w-fit shrink-0 gap-0"
    >
      <TabsList variant="line" className="!h-7 gap-1 p-0">
        <TabsTrigger value="storyboard" className="h-7 flex-none rounded-none px-2 py-0 text-xs">
          스토리보드
        </TabsTrigger>
        <TabsTrigger value="script" className="h-7 flex-none rounded-none px-2 py-0 text-xs">
          스크립트
        </TabsTrigger>
        <TabsTrigger
          value="dialogue"
          disabled
          className="h-7 flex-none rounded-none px-2 py-0 text-xs"
        >
          <span>대사</span>
          <Badge variant="outline" className="ml-1 px-1.5 py-0 text-[10px]">
            준비 중
          </Badge>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
