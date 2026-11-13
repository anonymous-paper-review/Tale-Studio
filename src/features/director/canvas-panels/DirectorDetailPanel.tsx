'use client'

import { X } from 'lucide-react'
import { useDirectorCanvasStore } from '@/stores/director-store'
import { isAssetData, isShotData, isVideoData } from '@/types/director'
import { ShotDetailPanel } from './ShotDetailPanel'
import { VideoDetailPanel } from './VideoDetailPanel'
import { AssetDetailPanel } from './AssetDetailPanel'
import { DirectorShotDetail } from '@/features/director/shot-detail/director-shot-detail'
import { useT } from '@/lib/i18n'

/**
 * 노드 뷰 좌측 상세 패널 (Higgsfield 우측 패널을 좌측 미러 — 우측은 글로벌 챗 점유).
 * selectedNodeId가 Image/Video/asset-backed Image일 때 표시한다.
 * Scene/prompt는 패널 없음(collapse).
 * 닫기는 selectNode(null) — page.tsx의 재클릭/더블클릭/빈공간 클릭과 동일 의미.
 */
export function DirectorDetailPanel() {
  const t = useT()
  const selectedNodeId = useDirectorCanvasStore((s) => s.selectedNodeId)
  const selectNode = useDirectorCanvasStore((s) => s.selectNode)
  const node = useDirectorCanvasStore((s) =>
    s.nodes.find((n) => n.id === selectedNodeId),
  )

  if (!node) return null
  const showShot = isShotData(node.data)
  const showVideo = isVideoData(node.data)
  const showAsset = isAssetData(node.data)
  if (!showShot && !showVideo && !showAsset) return null

  // 샷 · 샷의 Take 는 샷 상세(디자이너 11/13 D7 — 노드형은 왼쪽 패널, 스토리보드형 팝업과 같은 내용).
  //   Take 에서 열면 그 샷의 영상 탭이 그 Take 를 먼저 보인다. 마더 샷이 없는 독립 영상 · 에셋은 지금 패널.
  const shotNodeId = isShotData(node.data) ? node.id : isVideoData(node.data) ? node.data.parentShotNodeId : null
  if (shotNodeId) {
    return (
      <aside className="absolute left-0 top-0 z-10 flex h-full w-[420px] flex-col border-r border-border bg-background/95 shadow-lg backdrop-blur">
        <DirectorShotDetail
          key={node.id}
          shotNodeId={shotNodeId}
          initialTab={isVideoData(node.data) ? 'video' : 'image'}
          initialTakeId={isVideoData(node.data) ? node.id : null}
          layout="panel"
          onClose={() => selectNode(null)}
        />
      </aside>
    )
  }

  return (
    <aside className="absolute left-0 top-0 z-10 flex h-full w-80 flex-col border-r border-border bg-background/95 shadow-lg backdrop-blur">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('{kind} details', {
            kind: showVideo ? t('Video') : t('Image'),
          })}
        </span>
        <button
          type="button"
          onClick={() => selectNode(null)}
          aria-label={t('Close')}
          className="rounded p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {isShotData(node.data) && (
          <ShotDetailPanel nodeId={node.id} data={node.data} />
        )}
        {isVideoData(node.data) && (
          <VideoDetailPanel nodeId={node.id} data={node.data} />
        )}
        {isAssetData(node.data) && (
          <AssetDetailPanel nodeId={node.id} data={node.data} />
        )}
      </div>
    </aside>
  )
}
