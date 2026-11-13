'use client'

// Director 샷 상세(디자이너 11/13 시안 D6 · D7, 오너 2026-11-14) — 샷 하나에 이미지 · 영상 탭.
//   스토리보드형은 팝업(DirectorNodePopup), 노드형은 왼쪽 패널(DirectorDetailPanel)이 이 부품을 같은 내용으로 연다.
//   규칙: lib/director/shot-detail · 약속: tests/director/shot-detail.test.ts · shot-detail-view.test.ts
import { useState } from 'react'
import { X } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { shotDetailTakes, videoTabLabelKey, type ShotDetailTab } from '@/lib/director/shot-detail'
import { effectivePrompt, useDirectorCanvasStore } from '@/stores/director-store'
import { isShotData } from '@/types/director'
import { ShotImageTab } from './shot-image-tab'
import { ShotVideoTab } from './shot-video-tab'

export function DirectorShotDetail({ shotNodeId, initialTab = 'image', initialTakeId = null, layout, onClose }: {
  shotNodeId: string
  initialTab?: ShotDetailTab
  /** 영상 노드에서 열었으면 그 Take 를 먼저 보인다. */
  initialTakeId?: string | null
  layout: 'popup' | 'panel'
  onClose: () => void
}) {
  const t = useT()
  const [tab, setTab] = useState<ShotDetailTab>(initialTab)
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const node = nodes.find((n) => n.id === shotNodeId)
  if (!node || !isShotData(node.data)) return null
  const data = node.data
  const scene = data.parentSceneNodeId ? nodes.find((n) => n.id === data.parentSceneNodeId) : undefined
  const { takes } = shotDetailTakes(nodes, shotNodeId)
  const videoLabel = videoTabLabelKey(takes.length)
  const meta = [scene?.data.label, t('{seconds}s', { seconds: data.durationSeconds }), effectivePrompt(data)].filter(Boolean).join(' · ')

  return (
    <div className={cn('flex min-h-0 flex-col gap-4', layout === 'panel' && 'h-full overflow-y-auto p-5')} data-testid="director-shot-detail">
      <header className="flex items-center gap-3">
        <h2 className="text-h3 font-semibold">{data.label}</h2>
        <Tabs value={tab} onValueChange={(value) => setTab(value as ShotDetailTab)}>
          <TabsList className="h-9 rounded-full bg-background p-1 shadow-node">
            <TabsTrigger value="image" className="rounded-full px-4">{t('Image')}</TabsTrigger>
            <TabsTrigger value="video" className="rounded-full px-4">{t(videoLabel.key, videoLabel.params)}</TabsTrigger>
          </TabsList>
        </Tabs>
        {/* 팝업은 창 자신의 닫기(✕)를 쓴다 — 왼쪽 패널만 여기서 닫는다. */}
        {layout === 'panel' ? (
          <button type="button" onClick={onClose} aria-label={t('Close')} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-accent">
            <X className="size-5" />
          </button>
        ) : null}
      </header>
      <p className="line-clamp-2 text-caption text-subtle-foreground">{meta}</p>
      {tab === 'image'
        ? <ShotImageTab nodeId={shotNodeId} data={data} layout={layout} onMakeVideo={() => setTab('video')} />
        : <ShotVideoTab shotNodeId={shotNodeId} data={data} layout={layout} initialTakeId={initialTakeId} />}
    </div>
  )
}
