'use client'

import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import {
  Loader2,
  Download,
  FileArchive,
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
import { VideoPreviewer } from '@/features/editor/video-previewer'
import { Timeline } from '@/features/editor/timeline'
import { VideoSourcePanel } from '@/features/editor/video-source-panel'
import { AudioMeter } from '@/features/editor/audio-meter'
import { ResizeHandle } from '@/features/editor/resize-handle'
import { useEditorPlayback } from '@/features/editor/use-editor-playback'
import { useEditorStore, selectTimelineLayout } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { decodeAudioPeaks } from '@/lib/audio-waveform'
import { downloadShotsZip } from '@/lib/editor-zip-export'
import { toast } from 'sonner'

const FRAME = 1 / 24

export default function PostPage() {
  const {
    shots,
    videoClips,
    clipOrder,
    selectedShotIds,
    selectedAudioId,
    rendering,
    error,
    sourcePanelOpen,
    currentTime,
    pxPerSec,
    audioClips,
    audioSources,
    audioTracks,
    isPlaying,
    toolMode,
    binDragKind,
    binDropSec,
    panelSizes,
    past,
    future,
    loadData,
    loadPersisted,
    selectClip,
    toggleClipSelection,
    selectClipRange,
    setClipSelection,
    clearClipSelection,
    selectAudioClip,
    deleteClip,
    deleteSelectedClips,
    moveClipToIndex,
    addClipAtPlayhead,
    setSpeed,
    splitVideoClipAt,
    addClipInstanceAt,
    previewSource,
    addAudioSource,
    removeAudioSource,
    addAudioClipFromSource,
    addAudioTrack,
    removeAudioTrack,
    setAudioVolume,
    setBinDragKind,
    setBinDropSec,
    updateVideoClip,
    updateAudioClip,
    renderDraft,
    toggleSourcePanel,
    seek,
    setPxPerSec,
    setPanelSize,
    toggleAudioMute,
    removeAudioClip,
    moveAudioClip,
    splitAudioClipAt,
    pushHistory,
    togglePlay,
    nudge,
    setToolMode,
    undo,
    redo,
  } = useEditorStore()

  // 재생 엔진 + 전역 단축키 (Space/←→/Ctrl+Z·Y/V·C/Del)
  useEditorPlayback()

  const timelineLayout = useMemo(
    () => selectTimelineLayout({ shots, videoClips, clipOrder }),
    [shots, videoClips, clipOrder],
  )

  const projectId = useProjectStore((s) => s.projectId)
  const [exportingZip, setExportingZip] = useState(false)

  // 비디오 소스에 오디오가 있으면 같은 위치 오디오 트랙에 함께 삽입.
  // 비디오 파일을 decodeAudioData 로 디코드 시도 → 성공 시 소리 있음. 실패(무음/CORS) 시 비디오만.
  const attachVideoAudio = useCallback(async (shotId: string, atSec: number) => {
    const st = useEditorStore.getState()
    const src = st.videoClips.find((c) => c.shotId === shotId)
    const shot = st.shots.find((s) => s.shotId === shotId)
    if (!src?.url) return
    try {
      const { durationSec, peaks } = await decodeAudioPeaks(src.url)
      if (!(durationSec > 0)) return
      st.addAudioClip({
        name: `${shot?.shotType ?? '비디오'} 오디오`,
        url: src.url,
        startSec: atSec,
        // 표시 길이는 영상 슬롯(shot.durationSeconds)에 맞춰 옆 클립과 안 겹치게.
        // 실제 오디오 길이는 sourceDurationSec(트림 한계)로 보존.
        durationSec: shot?.durationSeconds ?? durationSec,
        peaks,
        sourceOffsetSec: 0,
        sourceDurationSec: durationSec,
        trackId: st.audioTracks[0]?.id,
      })
    } catch {
      // 비디오에 오디오 트랙 없음 / 디코드 불가(CORS 등) → 비디오만 삽입
    }
  }, [])

  // loadData(원본) → loadPersisted(저장된 편집 덮어쓰기) → 첫 진입 시 샷 오디오 자동 부착.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await loadData()
      if (cancelled) return
      await loadPersisted()
      if (cancelled) return
      // Director→Editor 첫 진입: 저장된 오디오가 없으면 각 샷 오디오를 영상 카드처럼
      //   '즉시' 한 번에 트랙에 올린다(빈 파형) → 파형/실제 길이는 백그라운드 병렬 디코드로 채움.
      //   (영상은 음소거 재생 + 오디오는 별도 트랙 구조. 소리는 <audio>로 나므로 디코드 전에도 재생됨)
      const st = useEditorStore.getState()
      if (st.audioClips.length === 0) {
        const items = selectTimelineLayout(st)
        const trackId = st.audioTracks[0]?.id
        // 1) 즉시 생성 (순차 디코드 대기 없이 바로 표시)
        const created: { id: string; url: string }[] = []
        for (const item of items) {
          const src = st.videoClips.find((c) => c.shotId === item.shotId)
          if (!src?.url) continue
          const shot = st.shots.find((s) => s.shotId === item.shotId)
          const id = st.addAudioClip({
            name: `${shot?.shotType ?? '비디오'} 오디오`,
            url: src.url,
            startSec: item.startSec,
            durationSec: item.durationSec,
            peaks: [],
            sourceOffsetSec: 0,
            sourceDurationSec: item.durationSec,
            trackId,
          })
          created.push({ id, url: src.url })
        }
        // 2) 백그라운드 병렬 디코드 → 파형/실제 길이 채움. 무음/CORS면 파형만 생략(소리는 재생).
        void Promise.all(
          created.map(async ({ id, url }) => {
            try {
              const { durationSec, peaks } = await decodeAudioPeaks(url)
              if (cancelled || !(durationSec > 0)) return
              useEditorStore
                .getState()
                .updateAudioClip(id, { peaks, sourceDurationSec: durationSec })
            } catch {
              /* 무음/CORS → 파형 생략 */
            }
          }),
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, loadData, loadPersisted])

  // Editor 진입 시 채팅 기본 접힘 (요청 6b). 떠날 때 이전 상태 복원
  useEffect(() => {
    const prev = useChatUiStore.getState().collapsed
    useChatUiStore.setState({ collapsed: true })
    return () => {
      useChatUiStore.setState({ collapsed: prev })
    }
  }, [])

  // 프레임 이동 버튼 꾹 누르기 → 연속 반복 (요청 2)
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startFrameHold = useCallback(
    (delta: number) => {
      nudge(delta)
      if (holdRef.current) clearInterval(holdRef.current)
      holdRef.current = setInterval(() => nudge(delta), 70)
    },
    [nudge],
  )
  const stopFrameHold = useCallback(() => {
    if (holdRef.current) {
      clearInterval(holdRef.current)
      holdRef.current = null
    }
  }, [])
  useEffect(() => {
    return () => {
      if (holdRef.current) clearInterval(holdRef.current)
    }
  }, [])

  // 드래그-드롭: 비디오 + (있으면) 오디오 함께 삽입
  const handleAddVideoClip = useCallback(
    (shotId: string, atSec: number) => {
      addClipInstanceAt(shotId, atSec)
      void attachVideoAudio(shotId, atSec)
    },
    [addClipInstanceAt, attachVideoAudio],
  )

  // 우클릭 "타임라인 추가": 플레이헤드 인접 경계 + 오디오 동반
  const handleAddVideoClipAtPlayhead = useCallback(
    (shotId: string) => {
      addClipAtPlayhead(shotId)
      const st = useEditorStore.getState()
      const item = selectTimelineLayout(st).find((l) => l.shotId === st.selectedClipShotId)
      if (item) void attachVideoAudio(shotId, item.startSec)
    },
    [addClipAtPlayhead, attachVideoAudio],
  )

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
      {/* Far left: 소스 보관함 (Video/Voice). 열렸을 때만 너비 조절 가능 */}
      {sourcePanelOpen ? (
        <>
          <div style={{ width: panelSizes.sourceW }} className="h-full shrink-0">
            <VideoSourcePanel
              open
              onToggle={toggleSourcePanel}
              shots={shots}
              videoClips={videoClips}
              audioSources={audioSources}
              onPreview={previewSource}
              onAddClip={handleAddVideoClip}
              onAddClipAtPlayhead={handleAddVideoClipAtPlayhead}
              onAddAudioFromSource={addAudioClipFromSource}
              onAddAudioSource={addAudioSource}
              onRemoveAudioSource={removeAudioSource}
              onBinDragStart={setBinDragKind}
              onBinDragEnd={() => {
                setBinDragKind(null)
                setBinDropSec(null)
              }}
              onSetBinDropSec={setBinDropSec}
            />
          </div>
          <ResizeHandle
            axis="x"
            getValue={() => panelSizes.sourceW}
            onChange={(v) => setPanelSize('sourceW', v)}
          />
        </>
      ) : (
        <VideoSourcePanel
          open={false}
          onToggle={toggleSourcePanel}
          shots={shots}
          videoClips={videoClips}
          audioSources={audioSources}
          onPreview={previewSource}
          onAddClip={handleAddVideoClip}
          onAddClipAtPlayhead={handleAddVideoClipAtPlayhead}
          onAddAudioFromSource={addAudioClipFromSource}
          onAddAudioSource={addAudioSource}
          onRemoveAudioSource={removeAudioSource}
          onBinDragStart={setBinDragKind}
          onBinDragEnd={() => {
            setBinDragKind(null)
            setBinDropSec(null)
          }}
          onSetBinDropSec={setBinDropSec}
        />
      )}

      {/* Center: Preview ─ (resize) ─ Toolbar ─ Timeline(+VU) */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Preview — 높이 조절 대상 */}
        <div style={{ height: panelSizes.previewH }} className="shrink-0 overflow-hidden">
          <VideoPreviewer />
        </div>

        <ResizeHandle
          axis="y"
          getValue={() => panelSizes.previewH}
          onChange={(v) => setPanelSize('previewH', v)}
        />

        {/* 재생 컨트롤바 + 도구 */}
        <div className="flex items-center gap-2 border-y border-border px-3 py-1.5">
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

          {/* 재생 컨트롤 (프레임 버튼은 꾹 누르면 연속) */}
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onPointerDown={() => startFrameHold(-FRAME)}
              onPointerUp={stopFrameHold}
              onPointerLeave={stopFrameHold}
              onPointerCancel={stopFrameHold}
              title="이전 프레임 (←) · 꾹 누르면 연속"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={togglePlay} title="재생/정지 (Space)">
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onPointerDown={() => startFrameHold(FRAME)}
              onPointerUp={stopFrameHold}
              onPointerLeave={stopFrameHold}
              onPointerCancel={stopFrameHold}
              title="다음 프레임 (→) · 꾹 누르면 연속"
            >
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

          <span className="text-[10px] text-muted-foreground">
            클립 우클릭 → 속도·분할·삭제
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* 샷 영상 일괄 ZIP 다운로드 (타임라인 순서대로 NN_shotId.mp4) */}
            <Button
              size="sm"
              variant="outline"
              disabled={exportingZip}
              className="gap-1.5"
              onClick={async () => {
                setExportingZip(true)
                try {
                  const r = await downloadShotsZip({
                    shots,
                    videoClips,
                    clipOrder,
                    fileBaseName: 'draft_shots',
                  })
                  if (r.total === 0) {
                    toast.info('다운로드할 샷 영상이 없습니다. (먼저 영상을 생성하세요)')
                  } else if (r.failed > 0) {
                    toast.warning(
                      `${r.downloaded}/${r.total}개 ZIP 완료 — ${r.failed}개 실패(zip 안 _failed.txt 참고).`,
                    )
                  } else {
                    toast.success(`샷 ${r.downloaded}개를 순서대로 ZIP 다운로드했습니다.`)
                  }
                } catch (e) {
                  toast.error('ZIP 생성 실패: ' + (e instanceof Error ? e.message : ''))
                } finally {
                  setExportingZip(false)
                }
              }}
            >
              {exportingZip ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <FileArchive className="size-3" />
              )}
              {exportingZip ? '압축 중…' : '샷 ZIP'}
            </Button>
            <Button size="sm" variant="outline" onClick={renderDraft} disabled={rendering} className="gap-1.5">
              {rendering ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
              {rendering ? 'Rendering…' : 'Draft Render'}
            </Button>
          </div>
        </div>

        {/* 통합 타임라인 + VU 미터 (우측) */}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <Timeline
              layout={timelineLayout}
              shots={shots}
              videoClips={videoClips}
              selectedShotIds={selectedShotIds}
              selectedAudioId={selectedAudioId}
              currentTime={currentTime}
              pxPerSec={pxPerSec}
              toolMode={toolMode}
              binDragKind={binDragKind}
              binDropSec={binDropSec}
              audioClips={audioClips}
              audioTracks={audioTracks}
              onSeek={seek}
              onSelect={selectClip}
              onToggleSelect={toggleClipSelection}
              onRangeSelect={selectClipRange}
              onSetSelection={setClipSelection}
              onClearSelection={clearClipSelection}
              onDelete={deleteClip}
              onDeleteSelected={deleteSelectedClips}
              onMoveClipToIndex={moveClipToIndex}
              onZoom={setPxPerSec}
              onSplitVideo={splitVideoClipAt}
              onSetSpeed={setSpeed}
              onAddAudioSource={addAudioSource}
              onAddAudioFromSource={addAudioClipFromSource}
              onAddAudioTrack={addAudioTrack}
              onRemoveAudioTrack={removeAudioTrack}
              onToggleAudioMute={toggleAudioMute}
              onRemoveAudio={removeAudioClip}
              onMoveAudio={moveAudioClip}
              onSetAudioVolume={setAudioVolume}
              onSplitAudio={splitAudioClipAt}
              onSelectAudio={selectAudioClip}
              onUpdateVideoClip={updateVideoClip}
              onUpdateAudioClip={updateAudioClip}
              onPushHistory={pushHistory}
            />
          </div>
          <AudioMeter audioClips={audioClips} />
        </div>

        {error && <p className="shrink-0 px-4 py-1 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  )
}
