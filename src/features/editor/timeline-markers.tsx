'use client'

// 타임라인 마커 · 스냅 단추(2단계 ③, 시안 E1 409:4795 [스냅 켬] · 409:4797 [마커]).
//   - 마커는 자 위의 작은 표시다 — 누르면 그 시각으로 가고, 우클릭 [마커 지우기]로 지운다. 이름 · 색은 없다(시안에 마커 그림이 단추뿐,
//     결정 페이지 H9 — 시안 없음).
//   - [스냅 켬]은 켜져 있으면 고른 칩 모습(지금 단계 색 테두리 · 18% 바탕), 끄면 [스냅 끔].
//   약속: tests/editor/split-snap-markers.test.ts
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { formatTimecode } from '@/lib/editor/sequence-info'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** 자 위 마커 — 아래를 가리키는 작은 깃(지금 단계 색). */
export function RulerMarkers({
  markers,
  pxPerSec,
  onSeek,
  onRemove,
}: {
  markers: readonly number[]
  pxPerSec: number
  onSeek: (sec: number) => void
  onRemove: (sec: number) => void
}) {
  const t = useT()
  return (
    <>
      {markers.map((sec) => {
        const label = t('Marker {time}', { time: formatTimecode(sec) })
        return (
          <ContextMenu key={sec}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                data-no-seek
                aria-label={label}
                title={label}
                onClick={() => onSeek(sec)}
                className="absolute top-0 z-20 flex h-full w-3 -translate-x-1/2 cursor-pointer items-end justify-center"
                style={{ left: sec * pxPerSec }}
              >
                {/* 자 아래쪽(눈금 자리)에 둔다 — 위쪽 시각 글자를 가리지 않게. */}
                <span className="h-2 w-2.5 bg-stage [clip-path:polygon(0_0,100%_0,100%_50%,50%_100%,0_50%)]" />
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-40">
              <ContextMenuItem variant="destructive" className="text-xs" onSelect={() => onRemove(sec)}>
                <Trash2 className="size-3.5" /> {t('Delete marker')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </>
  )
}

/** 타임라인 머리의 [스냅 켬] · [마커](시안 E1 409:4795 · 409:4797) — [+ V 트랙] 앞에 선다. */
export function SnapMarkerButtons({
  snapEnabled,
  onToggleSnap,
  onAddMarker,
}: {
  snapEnabled: boolean
  onToggleSnap: () => void
  onAddMarker: () => void
}) {
  const t = useT()
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        aria-pressed={snapEnabled}
        onClick={onToggleSnap}
        title={t('While dragging, clips stick to clip edges, the playhead and markers')}
        className={cn('h-7 rounded-full border-[1.5px] px-3', snapEnabled ? 'border-stage bg-stage/18 text-foreground hover:bg-stage/18' : 'border-transparent')}
      >
        {snapEnabled ? t('Snap on') : t('Snap off')}
      </Button>
      <Button size="sm" variant="secondary" className="h-7 rounded-full px-3" onClick={onAddMarker} title={t('Add a marker at the playhead (M)')}>
        {t('Add marker')}
      </Button>
    </>
  )
}
