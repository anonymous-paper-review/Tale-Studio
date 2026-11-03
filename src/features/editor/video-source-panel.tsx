'use client'

import { useRef, useState } from 'react'
import { useEntityNames } from '@/lib/writer/use-entity-names'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import { PanelLeftClose, PanelLeftOpen, Music, Plus, X, Loader2, Eye, ListPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
import type { Shot, VideoClip, AudioSource } from '@/types'
import { ingestAudioFile } from '@/lib/audio-waveform'
import { startBinDrag, dropTargetSec } from '@/lib/pointer-drag'
import { thumbUrl } from '@/lib/image-url'
import { ThumbImage } from '@/components/thumb-image'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { clipStatusLabel } from '@/features/editor/editor-labels'

interface VideoSourcePanelProps {
  open: boolean
  onToggle: () => void
  shots: Shot[]
  videoClips: VideoClip[]
  audioSources: AudioSource[]
  onPreview: (shotId: string) => void
  onAddClip: (shotId: string, atSec: number) => void
  onAddClipAtPlayhead: (shotId: string) => void
  onAddAudioFromSource: (sourceId: string, atSec: number, trackId?: string) => void
  onAddAudioSource: (source: AudioSource) => void
  onRemoveAudioSource: (id: string) => void
  onBinDragStart: (kind: 'video' | 'audio') => void
  onBinDragEnd: () => void
  onSetBinDropSec: (sec: number | null) => void
}

function fmtDur(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 소스 보관함 (bin). Video / Audio 탭.
 * - Video: 생성된 비디오 클립. 클릭=미리보기, 드래그=타임라인 추가, 우클릭=메뉴(미리보기/타임라인 추가).
 * - Audio: 업로드한 오디오 소스. 드래그=오디오 트랙 추가, 우클릭=메뉴(삭제).
 * synthetic(분할/추가) 클립(id에 '__')은 노출하지 않음 (원본 소스만).
 */
export function VideoSourcePanel({
  open,
  onToggle,
  shots,
  videoClips,
  audioSources,
  onPreview,
  onAddClip,
  onAddClipAtPlayhead,
  onAddAudioFromSource,
  onAddAudioSource,
  onRemoveAudioSource,
  onBinDragStart,
  onBinDragEnd,
  onSetBinDropSec,
}: VideoSourcePanelProps) {
  const entityNames = useEntityNames()
  const t = useT()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const sourceShots = shots.filter((s) => !s.shotId.includes('__'))

  const handleAudioFile = async (file: File) => {
    setUploading(true)
    try {
      const source = await ingestAudioFile(file, 'audio')
      onAddAudioSource(source)
    } catch (err) {
      console.error('[video-source-panel] audio ingest failed:', err)
    } finally {
      setUploading(false)
    }
  }

  if (!open) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center py-3">
        <Button size="icon" variant="ghost" className="size-7 text-muted-foreground" onClick={onToggle} title={t('Expand source panel')}>
          <PanelLeftOpen className="size-4" />
        </Button>
        <div className="mt-2 flex flex-1 items-center">
          <span className="rotate-180 text-[11px] font-semibold text-subtle-foreground [writing-mode:vertical-rl]">{t('Source')}</span>
        </div>
      </div>
    )
  }

  // v3 ED1(2026-11-03): 큰 판 안 — "소스" 제목(14px 600), 영상 · 오디오 알약 탭(고른 탭 = 지금 단계 색), 2열 클립 카드.
  return (
    <aside className="flex h-full w-full min-w-0 shrink-0 flex-col">
      <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
        <span className="text-[14px] font-semibold text-foreground">{t('Source')}</span>
        <Button size="icon" variant="ghost" className="size-6 text-muted-foreground" onClick={onToggle} title={t('Collapse panel')}>
          <PanelLeftClose className="size-3.5" />
        </Button>
      </div>

      <Tabs defaultValue="video" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="pill" className="mx-4 mb-1">
          <TabsTrigger value="video">
            {t('Video')} <span className="font-num tabular-nums">{sourceShots.length}</span>
          </TabsTrigger>
          <TabsTrigger value="audio">
            {t('Audio')} <span className="font-num tabular-nums">{audioSources.length}</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Video 탭 ── */}
        <TabsContent value="video" className="mt-0 min-h-0 flex-1">
          <ScrollArea className="h-[calc(100%-22px)]">
            <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-2">
              {sourceShots.map((shot) => {
                const clip = videoClips.find((c) => c.shotId === shot.shotId)
                return (
                  <ContextMenu key={shot.shotId}>
                    <ContextMenuTrigger asChild>
                      <div
                        onPointerDown={(e) =>
                          startBinDrag({
                            event: e,
                            label: `▶ ${shot.shotType}`,
                            dropSelector: '[data-drop="video-track"]',
                            onClick: () => onPreview(shot.shotId),
                            onDragStart: () => onBinDragStart('video'),
                            onDragEnd: onBinDragEnd,
                            onDragOver: (target, clientX) =>
                              onSetBinDropSec(target ? dropTargetSec(target, clientX) : null),
                            onDrop: ({ target, clientX }) => onAddClip(shot.shotId, dropTargetSec(target, clientX)),
                          })
                        }
                        title={`${resolveEntityNames(shot.actionDescription, entityNames)}\n${t('(Click: preview / drag·right-click: add to timeline)')}`}
                        className="group flex cursor-grab flex-col rounded-xl bg-background p-1.5 transition-colors hover:bg-card active:cursor-grabbing"
                      >
                        <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-art-placeholder font-num text-[10px] font-semibold text-muted-foreground">
                          {clip?.url ? (
                            <video src={clip.url} poster={clip.thumbnailUrl ?? thumbUrl(shot.referenceImageUrl)} className="h-full w-full rounded object-cover" muted preload={(clip.thumbnailUrl ?? shot.referenceImageUrl) ? 'none' : 'metadata'} draggable={false} />
                          ) : shot.referenceImageUrl ? (
                            <ThumbImage src={shot.referenceImageUrl} alt={shot.shotType} className="h-full w-full rounded object-cover" draggable={false} />
                          ) : clip?.thumbnailUrl ? (
                            <img src={clip.thumbnailUrl} alt={shot.shotType} className="h-full w-full rounded object-cover" draggable={false} />
                          ) : (
                            shot.shotType
                          )}
                        </div>
                        <p className="mt-1.5 truncate px-0.5 text-[11px] leading-tight text-foreground">{resolveEntityNames(shot.actionDescription, entityNames)}</p>
                        <p className="mt-1 truncate px-0.5 text-[10px] font-medium text-subtle-foreground">
                          {t('{seconds}s', { seconds: shot.durationSeconds })}
                          {clip && <span className={cn(clip.status === 'completed' && 'text-success', clip.status === 'failed' && 'text-destructive')}> · {t(clipStatusLabel(clip.status))}</span>}
                        </p>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-40">
                      <ContextMenuItem className="text-xs" onSelect={() => onPreview(shot.shotId)}>
                        <Eye className="size-3.5" /> {t('Preview')}
                      </ContextMenuItem>
                      <ContextMenuItem className="text-xs" onSelect={() => onAddClipAtPlayhead(shot.shotId)}>
                        <ListPlus className="size-3.5" /> {t('Add to timeline')}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
              {sourceShots.length === 0 && (
                <p className="col-span-2 py-8 text-center text-meta text-subtle-foreground">{t('No clips generated yet')}</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Audio 탭 ── */}
        <TabsContent value="audio" className="mt-0 min-h-0 flex-1">
          <div className="flex items-center justify-between px-4 py-1.5">
            <span className="text-[11px] text-subtle-foreground">{t('Drag = add to audio track')}</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-7 items-center gap-1 rounded-full bg-card px-2.5 text-[11.5px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              title={t('Upload audio')}
            >
              {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} {t('Upload')}
            </button>
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAudioFile(f); e.target.value = '' }} />
          </div>
          <ScrollArea className="h-[calc(100%-25px)]">
            <div className="flex flex-col gap-1.5 px-4 pb-4 pt-1">
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
                      className="group flex cursor-grab items-center gap-2 rounded-xl bg-background px-2.5 py-2 transition-colors hover:bg-card active:cursor-grabbing"
                    >
                      <Music className="size-3.5 shrink-0 text-stage" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] leading-tight text-foreground">{src.name}</p>
                        <span className="font-num text-[10px] text-subtle-foreground">{fmtDur(src.durationSec)}</span>
                      </div>
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
                <p className="py-8 text-center text-meta text-subtle-foreground">
                  {t('No audio sources.')}
                  <br />
                  {t('Upload one, then drag it to the audio track.')}
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  )
}
