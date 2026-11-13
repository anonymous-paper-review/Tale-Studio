'use client'

import { useRef, useState } from 'react'
import { useEntityNames } from '@/lib/writer/use-entity-names'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { ChevronDown, Eye, ListPlus, Loader2, Music, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Shot, VideoClip, AudioSource } from '@/types'
import { ingestAudioFile } from '@/lib/audio-waveform'
import { startBinDrag, dropTargetSec } from '@/lib/pointer-drag'
import { formatClipLength } from '@/lib/editor/sequence-info'
import { ThumbImage } from '@/components/thumb-image'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { clipDisplayStatus, clipStatusLabel, shotLabel } from '@/features/editor/editor-labels'
import { useEditorStore } from '@/stores/editor-store'

interface ProjectPanelProps {
  shots: Shot[]
  videoClips: VideoClip[]
  audioSources: AudioSource[]
  /** [새 항목 ▾] 안의 항목 — 지금은 타이틀 카드(결정 페이지 추천 "지금 타이틀 카드는 [새 항목 ▾]에 남김"). */
  newItems: { label: string; onSelect: () => void }[]
  /** 줄을 누르면 위 [소스] 탭에 그 샷을 연다. */
  onOpenSource: (shotId: string) => void
  onAddClip: (shotId: string, atSec: number) => void
  onAddClipAtPlayhead: (shotId: string) => void
  onAddAudioFromSource: (sourceId: string, atSec: number, trackId?: string) => void
  onAddAudioSource: (source: AudioSource) => void
  onRemoveAudioSource: (id: string) => void
  onBinDragStart: (kind: 'video' | 'audio') => void
  onBinDragEnd: () => void
  onSetBinDropSec: (sec: number | null) => void
}

/**
 * 프로젝트 판(시안 E1 409:4743–4776, 2단계 ① 새 배치 2026-11-14) — 예전 소스 보관함(영상 · 오디오 탭 카드)을 줄 목록으로 옮겼다.
 * - [가져오기…] · [새 항목 ▾]: 지금 올릴 수 있는 것은 소리 파일뿐(이미지 · 영상은 3단계 내 파일), 새 항목은 타이틀 카드.
 * - "Director 샷 · N": 줄마다 "샷 N · 종류 · Take N"과 "V · 길이". 누르면 위 [소스] 탭에서 보고, 끌면 타임라인에 넣고,
 *   우클릭은 메뉴(미리보기 · 타임라인 추가). 영상 없는 샷은 길이 대신 상태이고 끌거나 더할 수 없다(오너 답 8).
 * - "내 파일 · N": 올린 소리. 끌면 오디오 줄에 놓이고, 이 칸에 소리 파일을 끌어 놓아도 올라간다.
 * synthetic(분할/추가) 클립(id에 '__')은 노출하지 않음 (원본 소스만). 약속: tests/editor/panels.test.ts
 */
export function ProjectPanel({
  shots,
  videoClips,
  audioSources,
  newItems,
  onOpenSource,
  onAddClip,
  onAddClipAtPlayhead,
  onAddAudioFromSource,
  onAddAudioSource,
  onRemoveAudioSource,
  onBinDragStart,
  onBinDragEnd,
  onSetBinDropSec,
}: ProjectPanelProps) {
  const entityNames = useEntityNames()
  const t = useT()
  const unplayable = useEditorStore((s) => s.unplayableVideoUrls)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dropping, setDropping] = useState(false)

  const sourceShots = shots.filter((s) => !s.shotId.includes('__'))

  const handleAudioFiles = async (files: readonly File[]) => {
    const audio = files.filter((f) => f.type.startsWith('audio/'))
    if (audio.length === 0) return
    setUploading(true)
    try {
      for (const file of audio) onAddAudioSource(await ingestAudioFile(file, 'audio'))
    } catch (err) {
      console.error('[project-panel] audio ingest failed:', err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <aside className="flex h-full w-full min-w-0 flex-col">
      {/* 판 이름 — 효과 탭은 효과 조각(⑤)에서 옆에 붙는다. */}
      <div className="flex items-center px-4 pt-3">
        <span className="relative pb-1.5 text-label font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground">
          {t('Project')}
        </span>
      </div>

      <div className="flex items-center gap-1.5 px-4 pb-1 pt-3">
        <Button size="sm" variant="secondary" className="rounded-full" disabled={uploading} onClick={() => fileInputRef.current?.click()} title={t('Upload audio')}>
          {uploading ? <Loader2 className="size-3 animate-spin" /> : null}
          {t('Import…')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" className="gap-1 rounded-full">
              {t('New item')}
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {newItems.map((item) => (
              <DropdownMenuItem key={item.label} className="text-xs" onSelect={item.onSelect}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleAudioFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1 px-3 pb-4 pt-2">
          <p className="px-1 pb-1 text-meta font-medium text-subtle-foreground">
            {t('Director shots · {count}', { count: sourceShots.length })}
          </p>
          {sourceShots.map((shot, index) => {
            const clip = videoClips.find((c) => c.shotId === shot.shotId)
            // 영상이 있는 샷만 타임라인에 들어간다 — 영상 없는 줄은 끌기를 시작하지 않는다(오너 답 8, 2026-11-14).
            const hasVideo = !!clip?.url
            const lengthSec = Math.min(shot.durationSeconds, clip?.actualDurationSec ?? shot.durationSeconds)
            const status = clip ? clipDisplayStatus(clip, unplayable) : 'pending'
            const thumb = clip?.thumbnailUrl ?? shot.referenceImageUrl
            return (
              <ContextMenu key={shot.shotId}>
                <ContextMenuTrigger asChild>
                  <div
                    onClick={hasVideo ? undefined : () => onOpenSource(shot.shotId)}
                    onPointerDown={hasVideo ? (e) =>
                      startBinDrag({
                        event: e,
                        label: `▶ ${shot.shotType}`,
                        dropSelector: '[data-drop="video-track"]',
                        onClick: () => onOpenSource(shot.shotId),
                        onDragStart: () => onBinDragStart('video'),
                        onDragEnd: onBinDragEnd,
                        onDragOver: (target, clientX) =>
                          onSetBinDropSec(target ? dropTargetSec(target, clientX) : null),
                        onDrop: ({ target, clientX }) => onAddClip(shot.shotId, dropTargetSec(target, clientX)),
                      }) : undefined
                    }
                    title={`${resolveEntityNames(shot.actionDescription, entityNames)}\n${hasVideo ? t('(Click: preview / drag·right-click: add to timeline)') : t('(No video yet. Only shots with video go into the timeline.)')}`}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-card',
                      hasVideo ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                    )}
                  >
                    <div className="flex h-8 w-6 shrink-0 items-center justify-center overflow-hidden rounded bg-art-placeholder text-[8px] font-semibold text-muted-foreground">
                      {thumb ? (
                        <ThumbImage src={thumb} alt={shot.shotType} className="h-full w-full object-cover" draggable={false} />
                      ) : (
                        shot.shotType
                      )}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-label text-foreground">
                      {shotLabel({ number: index + 1, shotType: shot.shotType, takeNumber: hasVideo ? clip?.takeNumber : null }, t)}
                    </span>
                    {hasVideo && status !== 'unplayable' ? (
                      <span className="shrink-0 font-num text-meta text-subtle-foreground tabular-nums">{`V · ${formatClipLength(lengthSec)}`}</span>
                    ) : (
                      <span className={cn('shrink-0 text-meta text-subtle-foreground', (status === 'failed' || status === 'unplayable') && 'text-destructive')}>
                        {t(clipStatusLabel(status))}
                      </span>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-40">
                  <ContextMenuItem className="text-xs" onSelect={() => onOpenSource(shot.shotId)}>
                    <Eye className="size-3.5" /> {t('Preview')}
                  </ContextMenuItem>
                  <ContextMenuItem className="text-xs" disabled={!hasVideo} onSelect={() => onAddClipAtPlayhead(shot.shotId)}>
                    <ListPlus className="size-3.5" /> {t('Add to timeline')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
          {sourceShots.length === 0 && <p className="px-1 py-4 text-meta text-subtle-foreground">{t('No clips generated yet')}</p>}

          {/* 내 파일 — 올린 소리. 이 칸에 소리 파일을 끌어 놓아도 올라간다. */}
          <div
            className="mt-3 flex flex-col gap-1"
            onDragOver={(e) => {
              if (![...e.dataTransfer.types].includes('Files')) return
              e.preventDefault()
              setDropping(true)
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              if (![...e.dataTransfer.types].includes('Files')) return
              e.preventDefault()
              setDropping(false)
              void handleAudioFiles([...e.dataTransfer.files])
            }}
          >
            <p className="px-1 pb-1 text-meta font-medium text-subtle-foreground">{t('My files · {count}', { count: audioSources.length })}</p>
            {audioSources.map((src) => (
              <ContextMenu key={src.id}>
                <ContextMenuTrigger asChild>
                  <div
                    onPointerDown={(e) =>
                      startBinDrag({
                        event: e,
                        label: `♪ ${src.name}`,
                        dropSelector: '[data-drop="audio-track"]',
                        onDragStart: () => onBinDragStart('audio'),
                        onDragEnd: onBinDragEnd,
                        onDrop: ({ target, clientX }) =>
                          onAddAudioFromSource(src.id, dropTargetSec(target, clientX), (target as HTMLElement).dataset.trackId),
                      })
                    }
                    title={`${src.name}\n${t('(Drag: add to audio track / right-click: menu)')}`}
                    className="group flex cursor-grab items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-card active:cursor-grabbing"
                  >
                    <div className="flex h-8 w-6 shrink-0 items-center justify-center rounded bg-card">
                      <Music className="size-3.5 text-stage" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-label text-foreground">{src.name}</span>
                    <span className="shrink-0 font-num text-meta text-subtle-foreground tabular-nums group-hover:hidden">{`A · ${formatClipLength(src.durationSec)}`}</span>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => onRemoveAudioSource(src.id)}
                      className="hidden shrink-0 rounded p-0.5 text-destructive hover:bg-destructive/10 group-hover:block"
                      title={t('Remove source')}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-36">
                  <ContextMenuItem variant="destructive" className="text-xs" onSelect={() => onRemoveAudioSource(src.id)}>
                    <X className="size-3.5" /> {t('Delete')}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {audioSources.length === 0 && (
              <div
                className={cn(
                  'rounded-xl border border-dashed border-border px-3 py-3 text-meta text-subtle-foreground transition-colors',
                  dropping && 'border-stage bg-stage/10',
                )}
              >
                {t('Drag audio files here or press [Import…]')}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </aside>
  )
}
