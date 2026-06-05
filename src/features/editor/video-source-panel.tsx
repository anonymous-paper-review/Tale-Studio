'use client'

import { useRef, useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Film, Mic, Plus, X, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { Shot, VideoClip, AudioSource } from '@/types'
import { ingestAudioFile } from '@/lib/audio-waveform'
import { startBinDrag, dropTargetSec } from '@/lib/pointer-drag'

interface VideoSourcePanelProps {
  open: boolean
  onToggle: () => void
  shots: Shot[]
  videoClips: VideoClip[]
  audioSources: AudioSource[]
  onPreview: (shotId: string) => void
  onAddClip: (shotId: string, atSec: number) => void
  onAddAudioFromSource: (sourceId: string, atSec: number) => void
  onAddAudioSource: (source: AudioSource) => void
  onRemoveAudioSource: (id: string) => void
  onBinDragStart: (kind: 'video' | 'audio') => void
  onBinDragEnd: () => void
}

function fmtDur(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 소스 보관함 (bin). Video / Voice 탭.
 * - Video: 생성된 비디오 클립. 클릭 → 플레이어 단독 미리보기. 드래그 → 타임라인 비디오 트랙에 추가.
 * - Voice: 업로드한 보이스/오디오 소스. 드래그 → 타임라인 오디오 트랙에 추가.
 * synthetic(분할/추가) 클립(id에 '__')은 bin 에 노출하지 않는다 (원본 소스만).
 */
export function VideoSourcePanel({
  open,
  onToggle,
  shots,
  videoClips,
  audioSources,
  onPreview,
  onAddClip,
  onAddAudioFromSource,
  onAddAudioSource,
  onRemoveAudioSource,
  onBinDragStart,
  onBinDragEnd,
}: VideoSourcePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const sourceShots = shots.filter((s) => !s.shotId.includes('__'))

  const handleVoiceFile = async (file: File) => {
    setUploading(true)
    try {
      const source = await ingestAudioFile(file, 'voice')
      onAddAudioSource(source)
    } catch (err) {
      console.error('[video-source-panel] voice ingest failed:', err)
    } finally {
      setUploading(false)
    }
  }

  if (!open) {
    return (
      <div className="flex w-9 shrink-0 flex-col items-center border-r border-border bg-card py-2">
        <Button size="icon" variant="ghost" className="size-7" onClick={onToggle} title="소스 패널 펼치기">
          <PanelLeftOpen className="size-4" />
        </Button>
        <div className="mt-2 flex flex-1 items-center">
          <span className="rotate-180 text-[10px] font-medium tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
            SOURCE
          </span>
        </div>
      </div>
    )
  }

  return (
    <aside className="flex h-full w-full min-w-0 shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold">Source</span>
        <Button size="icon" variant="ghost" className="size-6" onClick={onToggle} title="패널 접기">
          <PanelLeftClose className="size-3.5" />
        </Button>
      </div>

      <Tabs defaultValue="video" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-2 mt-2 grid grid-cols-2">
          <TabsTrigger value="video" className="gap-1 text-xs">
            <Film className="size-3" /> Video
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px] tabular-nums">
              {sourceShots.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="voice" className="gap-1 text-xs">
            <Mic className="size-3" /> Voice
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px] tabular-nums">
              {audioSources.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ── Video 탭 ── */}
        <TabsContent value="video" className="mt-0 min-h-0 flex-1">
          <p className="border-b border-border px-3 py-1 text-[9px] text-muted-foreground">
            클릭 = 미리보기 · 드래그 = 타임라인에 추가
          </p>
          <ScrollArea className="h-[calc(100%-22px)]">
            <div className="grid grid-cols-2 gap-2 p-2">
              {sourceShots.map((shot) => {
                const clip = videoClips.find((c) => c.shotId === shot.shotId)
                return (
                  <div
                    key={shot.shotId}
                    onPointerDown={(e) =>
                      startBinDrag({
                        event: e,
                        label: `▶ ${shot.shotType}`,
                        dropSelector: '[data-drop="video-track"]',
                        onClick: () => onPreview(shot.shotId),
                        onDragStart: () => onBinDragStart('video'),
                        onDragEnd: onBinDragEnd,
                        onDrop: ({ target, clientX }) =>
                          onAddClip(shot.shotId, dropTargetSec(target, clientX)),
                      })
                    }
                    title={`${shot.actionDescription}\n(클릭: 미리보기 / 드래그: 타임라인에 추가)`}
                    className="group flex cursor-grab flex-col rounded-md border border-border p-1.5 transition-all hover:bg-accent/50 active:cursor-grabbing"
                  >
                    <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-muted text-[9px] text-muted-foreground">
                      {clip?.url ? (
                        <video src={clip.url} className="h-full w-full rounded object-cover" muted preload="metadata" draggable={false} />
                      ) : shot.referenceImageUrl ? (
                        <img src={shot.referenceImageUrl} alt={shot.shotType} className="h-full w-full rounded object-cover" draggable={false} />
                      ) : clip?.thumbnailUrl ? (
                        <img src={clip.thumbnailUrl} alt={shot.shotType} className="h-full w-full rounded object-cover" draggable={false} />
                      ) : (
                        shot.shotType
                      )}
                    </div>
                    <p className="mt-1 truncate text-[9px] leading-tight">{shot.actionDescription}</p>
                    <div className="mt-0.5 flex items-center gap-1">
                      <Badge variant="secondary" className="h-3.5 px-1 font-mono text-[8px]">
                        {shot.durationSeconds}s
                      </Badge>
                      {clip && (
                        <Badge variant={clip.status === 'completed' ? 'default' : 'secondary'} className="h-3.5 px-1 text-[8px]">
                          {clip.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
              {sourceShots.length === 0 && (
                <p className="col-span-2 py-8 text-center text-[10px] text-muted-foreground">생성된 클립이 없습니다</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── Voice 탭 ── */}
        <TabsContent value="voice" className="mt-0 min-h-0 flex-1">
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <span className="text-[9px] text-muted-foreground">드래그 = 오디오 트랙에 추가</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="보이스/오디오 업로드"
            >
              {uploading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} 업로드
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleVoiceFile(f)
                e.target.value = ''
              }}
            />
          </div>
          <ScrollArea className="h-[calc(100%-25px)]">
            <div className="flex flex-col gap-1.5 p-2">
              {audioSources.map((src) => (
                <div
                  key={src.id}
                  onPointerDown={(e) =>
                    startBinDrag({
                      event: e,
                      label: `♪ ${src.name}`,
                      dropSelector: '[data-drop="audio-track"]',
                      onDragStart: () => onBinDragStart('audio'),
                      onDragEnd: onBinDragEnd,
                      onDrop: ({ target, clientX }) =>
                        onAddAudioFromSource(src.id, dropTargetSec(target, clientX)),
                    })
                  }
                  title={`${src.name}\n(드래그: 오디오 트랙에 추가)`}
                  className="group flex cursor-grab items-center gap-2 rounded-md border border-border p-1.5 transition-all hover:bg-accent/50 active:cursor-grabbing"
                >
                  <Mic className="size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] leading-tight">{src.name}</p>
                    <span className="font-mono text-[8px] text-muted-foreground">{fmtDur(src.durationSec)}</span>
                  </div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onRemoveAudioSource(src.id)}
                    className="hidden shrink-0 rounded p-0.5 text-destructive hover:bg-destructive/10 group-hover:block"
                    title="소스 삭제"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              {audioSources.length === 0 && (
                <p className="py-8 text-center text-[10px] text-muted-foreground">
                  보이스/오디오 소스가 없습니다.
                  <br />
                  업로드 후 오디오 트랙으로 드래그하세요.
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  )
}
