'use client'

// 약속 I(2026-09-04): 러프 3장(시작·연출·끝)을 나란히 **멈춰** 보이고, 한 장씩 따로 다시 만든다.
//   순환(RoughFrameCycle)이 아니라 정지 그림 3장 — 연출을 확인하려면 한눈에 비교돼야 한다. 한 장을 다시 만들어도
//   나머지 두 장은 서버(regenerateRoughFrame)가 손대지 않는다. Writer 팝업(ShotDetailDialog)의 것이고 Director 그리드가
//   같은 팝업을 빌려 쓴다.
import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ThumbImage } from '@/components/thumb-image'
import { withCacheBust } from '@/components/rough-frame-cycle'
import type { RoughStoryboardImage } from '@/types/shot'
import { useT } from '@/lib/i18n'

export type RoughFrameKey = 'start' | 'direction' | 'end'
export const ROUGH_FRAME_ORDER: readonly RoughFrameKey[] = ['start', 'direction', 'end']

export function RoughFramesStill({
  projectId,
  shotId,
  panel,
  onRegenerated,
}: {
  projectId: string
  shotId: string
  panel: RoughStoryboardImage
  onRegenerated: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState<RoughFrameKey | null>(null)
  const frames = panel.frames
  if (!frames) return null
  const labels: Record<RoughFrameKey, string> = {
    start: t('Start frame'),
    direction: t('Directing frame'),
    end: t('End frame'),
  }

  const regenerate = async (frame: RoughFrameKey) => {
    setBusy(frame)
    try {
      toast.info(t('Redrawing the {frame} frame, about 30 seconds', { frame: labels[frame] }))
      const res = await fetch('/api/writer/rough-directing-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate-frame', projectId, shotId, frame }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`)
      toast.success(t('Redrew the {frame} frame. The other two are unchanged.', { frame: labels[frame] }))
      onRegenerated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Regeneration failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2" data-testid="rough-frames-still">
      {ROUGH_FRAME_ORDER.map((frame) => (
        <figure key={frame} className="flex min-w-0 flex-col gap-1.5">
          <div className="relative overflow-hidden rounded-md border border-border bg-muted/30">
            <ThumbImage
              src={withCacheBust(frames[frame], panel.generatedAt)}
              alt={labels[frame]}
              className="block h-auto w-full"
            />
            <span className="pointer-events-none absolute left-1 top-1 rounded-sm bg-background/70 px-1 text-[9px] uppercase text-muted-foreground">
              {labels[frame]}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void regenerate(frame)}
            title={t('Redraw only this frame (1 image generation). The other two stay as they are.')}
          >
            {busy === frame ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {t('Regenerate this frame only')}
          </Button>
        </figure>
      ))}
    </div>
  )
}
