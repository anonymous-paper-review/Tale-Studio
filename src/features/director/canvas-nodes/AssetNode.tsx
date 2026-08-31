'use client'

// Artist 원본을 reference로 쓰는 editable Image 템플릿.
// Character/World 색과 별도 카드 구조를 없애고 일반 Image 노드와 같은 외형·편집 통로를 쓴다.

import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import { ImageIcon } from 'lucide-react'
import { isAssetData, type DirectorNode } from '@/types/director'
import { ThumbImage } from '@/components/thumb-image'
import { useT } from '@/lib/i18n'
import { BaseNode } from './BaseNode'
import { GeneratingOverlay } from '@/components/generating-frame'
import { IMAGE_MODELS, normalizeImageModelKey } from '@/lib/image-models'

function AssetNodeImpl({ id, data, selected }: NodeProps<DirectorNode>) {
  const t = useT()
  if (!isAssetData(data)) return null
  const role = data.assetKind === 'character' ? t('Character') : t('Background')
  const model = IMAGE_MODELS[normalizeImageModelKey(data.imageModel)]

  return (
    <BaseNode
      id={id}
      theme="shot"
      title={data.label}
      selected={selected}
      width={240}
      canDelete={false}
      beam={data.generationStatus === 'generating' ? 'success' : null}
    >
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded-sm border border-border px-1.5 py-0.5">
          {role}
        </span>
        {data.unused && <span>· {t('Unused')}</span>}
      </div>

      <div className="relative mt-2 flex aspect-video w-full items-center justify-center overflow-hidden rounded-sm border border-border/40 bg-muted">
          {data.imageUrl ? (
            <ThumbImage
              src={data.imageUrl}
              alt={data.label}
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
          <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="size-4 text-muted-foreground" />
            </div>
          )}
        <GeneratingOverlay
          active={data.generationStatus === 'generating'}
          label={t('Generating image')}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">{model.label}</span>
        <span>{role}</span>
      </div>
      {data.generationError && (
        <p className="mt-1 line-clamp-2 text-[10px] text-destructive">
          {data.generationError}
        </p>
      )}
    </BaseNode>
  )
}

export const AssetNode = memo(AssetNodeImpl)
