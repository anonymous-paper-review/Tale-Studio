'use client'

import { useEffect, useMemo } from 'react'
import {
  Loader2,
  Download,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Scissors,
  Undo2,
  Redo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { VideoPreviewer } from '@/features/editor/video-previewer'
import { Timeline } from '@/features/editor/timeline'
import { VideoSourcePanel } from '@/features/editor/video-source-panel'
import { AudioMeter } from '@/features/editor/audio-meter'
import { useEditorPlayback } from '@/features/editor/use-editor-playback'
import {
  useEditorStore,
  selectTimelineLayout,
} from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { cn } from '@/lib/utils'

const FRAME = 1 / 24

export default function PostPage() {
  const {
    shots,
    videoClips,
    clipOrder,
    selectedClipShotId,
    rendering,
    error,
    sourcePanelOpen,
    currentTime,
    pxPerSec,
    audioClips,
    isPlaying,
    toolMode,
    past,
    future,
    loadData,
    selectClip,
    deleteClip,
    renderDraft,
    toggleSourcePanel,
    seek,
    setPxPerSec,
    addAudioClip,
    toggleAudioMute,
    removeAudioClip,
    togglePlay,
    nudge,
    setToolMode,
    undo,
    redo,
  } = useEditorStore()

  // 재생 엔진 + 전역 단축키 (Space/←→/Ctrl+Z·Y/V·C)
  useEditorPlayback()

  // 파생 배열은 useMemo로 (selector가 매번 새 배열을 만들면 무한루프 경고)
  const timelineLayout = useMemo(
    () => selectTimelineLayout({ shots, videoClips, clipOrder }),
    [shots, videoClips, clipOrder],
  )

  const projectId = useProjectStore((s) => s.projectId)

  useEffect(() => {
    loadData()
  }, [projectId, loadData])

  const selectedShot = shots.find((s) => s.shotId === selectedClipShotId)
  const selectedClip = videoClips.find((c) => c.shotId === selectedClipShotId)
  const playbackSpeed = selectedClip?.speed ?? 1.0

  if (shots.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Post-Production Suite</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complete previous steps first to load video clips.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Far left: Video Source 패널 (토글로 접기) */}
      <VideoSourcePanel
        open={sourcePanelOpen}
        onToggle={toggleSourcePanel}
        shots={shots}
        videoClips={videoClips}
        selectedShotId={selectedClipShotId}
        onSelect={selectClip}
      />

      {/* Center: Preview + Toolbar + Timeline */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top: Video Previewer + VU 미터 */}
        <div className="flex flex-1 overflow-hidden">
          <div className="min-w-0 flex-1">
            <VideoPreviewer shot={selectedShot} clip={selectedClip} />
          </div>
          <AudioMeter audioClips={audioClips} />
        </div>

        <Separator />

        {/* 재생 컨트롤바 + 도구 + 상태바 */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          {/* 도구 모드 (V/C) */}
          <div className="flex items-center gap-0.5 rounded border border-border p-0.5">
            <Button
              size="icon"
              variant={toolMode === 'select' ? 'default' : 'ghost'}
              className="size-6"
              onClick={() => setToolMode('select')}
              title="선택 도구 (V)"
            >
              <MousePointer2 className="size-3" />
            </Button>
            <Button
              size="icon"
              variant={toolMode === 'cut' ? 'default' : 'ghost'}
              className="size-6"
              onClick={() => setToolMode('cut')}
              title="자르기 도구 (C)"
            >
              <Scissors className="size-3" />
            </Button>
          </div>

          {/* 재생 컨트롤 */}
          <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="size-7" onClick={() => nudge(-FRAME)} title="이전 프레임 (←)">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={togglePlay} title="재생/정지 (Space)">
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => nudge(FRAME)} title="다음 프레임 (→)">
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="size-7" onClick={undo} disabled={past.length === 0} title="실행취소 (Ctrl+Z)">
              <Undo2 className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={redo} disabled={future.length === 0} title="다시실행 (Ctrl+Y)">
              <Redo2 className="size-4" />
            </Button>
          </div>

          {/* 상태바: 재생 속도 (ClipInspector에서 이동) */}
          <span
            className={cn(
              'rounded border border-border px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
              playbackSpeed !== 1.0 ? 'text-primary' : 'text-muted-foreground',
            )}
            title="현재 클립 재생 속도"
          >
            {playbackSpeed.toFixed(2)}×
          </span>

          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={renderDraft} disabled={rendering} className="gap-1.5">
              {rendering ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
              {rendering ? 'Rendering…' : 'Draft Render'}
            </Button>
          </div>
        </div>

        {/* 통합 타임라인 */}
        <div className="flex h-56 shrink-0 flex-col">
          <div className="min-h-0 flex-1">
            <Timeline
              layout={timelineLayout}
              shots={shots}
              videoClips={videoClips}
              selectedShotId={selectedClipShotId}
              currentTime={currentTime}
              pxPerSec={pxPerSec}
              audioClips={audioClips}
              onSeek={seek}
              onSelect={selectClip}
              onDelete={deleteClip}
              onZoom={setPxPerSec}
              onAddAudio={addAudioClip}
              onToggleAudioMute={toggleAudioMute}
              onRemoveAudio={removeAudioClip}
            />
          </div>

          {error && <p className="px-4 pb-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
