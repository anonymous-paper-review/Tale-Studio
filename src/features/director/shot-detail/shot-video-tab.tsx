'use client'

// 샷 상세의 영상 탭(디자이너 11/13 시안 D7) — 그 샷의 Take 를 새것부터 쌓아 보이고, 고른 Take 의 설정 · 미리보기는 지금 영상 상세를 쓴다.
//   ★ 를 고르지 않았으면 가장 최근 완성 Take 가 "★ 최종 (자동)"이다(Editor 로 가는 것과 같은 규칙).
//   규칙: lib/director/shot-detail · 약속: tests/director/shot-detail.test.ts · shot-detail-view.test.ts
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { shotDetailTakes } from '@/lib/director/shot-detail'
import { useDirectorCanvasStore } from '@/stores/director-store'
import type { ShotNodeData } from '@/types/director'
import { VideoDetailPanel } from '@/features/director/canvas-panels/VideoDetailPanel'

export function ShotVideoTab({ shotNodeId, data, layout, initialTakeId }: {
  shotNodeId: string
  data: ShotNodeData
  layout: 'popup' | 'panel'
  initialTakeId?: string | null
}) {
  const t = useT()
  const nodes = useDirectorCanvasStore((s) => s.nodes)
  const generateVideoForShot = useDirectorCanvasStore((s) => s.generateVideoForShot)
  const { takes, final } = shotDetailTakes(nodes, shotNodeId)
  const [picked, setPicked] = useState<string | null>(initialTakeId ?? null)
  const current = takes.find((take) => take.id === picked) ?? takes.find((take) => take.id === final?.id) ?? takes[0] ?? null

  if (takes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3" data-testid="shot-detail-video-tab">
        <p className="text-body text-muted-foreground">{t('No video for this shot yet.')}</p>
        <Button type="button" size="sm" disabled={!data.storyboardImage?.url} onClick={() => void generateVideoForShot(shotNodeId)}>
          {t('Make the video')}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn(layout === 'popup' ? 'grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-6' : 'flex flex-col gap-4')} data-testid="shot-detail-video-tab">
      <ol className="space-y-2" aria-label={t('Takes')}>
        {takes.map((take) => {
          const isFinal = final?.id === take.id
          const active = current?.id === take.id
          return (
            <li key={take.id}>
              <button type="button" onClick={() => setPicked(take.id)} aria-pressed={active}
                className={cn('w-full rounded-[12px] border px-3 py-2 text-left transition-colors', active ? 'border-foreground/60 bg-accent' : 'border-border hover:bg-accent')}>
                <span className="flex items-center gap-2 text-body font-semibold">
                  {t('Take {n}', { n: take.data.takeNumber })}
                  {isFinal ? <span className="rounded-full border border-success/60 px-2 text-micro font-medium text-success">{final?.auto ? t('★ Final (auto)') : t('★ Final')}</span> : null}
                </span>
                <span className="text-caption text-subtle-foreground">{t(statusLabel(take.data.status))}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {current ? <VideoDetailPanel key={current.id} nodeId={current.id} data={current.data} /> : null}
    </div>
  )
}

function statusLabel(status: string): string {
  if (status === 'completed') return 'Done'
  if (status === 'generating' || status === 'queued') return 'Making'
  if (status === 'failed') return 'Failed'
  return 'Not made yet'
}
