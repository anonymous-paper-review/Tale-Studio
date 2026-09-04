'use client'

import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Download,
  FileArchive,
  MonitorPlay,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Scissors,
  Undo2,
  Redo2,
  Type,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VideoPreviewer } from '@/features/editor/video-previewer'
import { Timeline } from '@/features/editor/timeline'
import { VideoSourcePanel } from '@/features/editor/video-source-panel'
import { AudioMeter } from '@/features/editor/audio-meter'
import { ResizeHandle } from '@/features/editor/resize-handle'
import { useEditorPlayback } from '@/features/editor/use-editor-playback'
import { prefetchVideos, resetVideoPrefetchFor } from '@/features/editor/video-prefetch'
import { useEditorStore, selectTimelineLayout } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { decodeAudioPeaks } from '@/lib/audio-waveform'
import { downloadShotsZip } from '@/lib/editor-zip-export'
import { renderDraftTimeline } from '@/lib/editor-draft-render'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

const FRAME = 1 / 24

export default function PostPage() {
  const t = useT()
  const {
    shots,
    videoClips,
    clipOrder,
    selectedShotIds,
    selectedAudioIds,
    error,
    loadStatus,
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
    toggleAudioSelection,
    selectAudioRange,
    setAudioSelection,
    clearAudioSelection,
    deleteClip,
    deleteSelectedClips,
    moveClipToIndex,
    addClipAtPlayhead,
    setSpeed,
    setTrim,
    splitVideoClipAt,
    addClipInstanceAt,
    addTitleCard,
    setTitleCardDuration,
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
    toggleSourcePanel,
    seek,
    setPxPerSec,
    setPanelSize,
    toggleAudioMute,
    toggleAudioTrackMute,
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
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const router = useRouter()
  // #pps-empty-states: 로드 실패 화면의 '다시 시도' — 로드 effect 를 통째로 재발화시켜
  //   loadData→loadPersisted→오디오 자동 부착 순서를 그대로 다시 탄다.
  const [retryTick, setRetryTick] = useState(0)
  const [exportingZip, setExportingZip] = useState(false)

  // Draft Render (#draft-render 2026-08-26): 타임라인 전체를 브라우저에서 이어 붙여 파일로 저장.
  //   실시간 녹화라 진행 라벨을 버튼에 그대로 노출하고, 진행 중 재클릭 = 취소.
  const [renderLabel, setRenderLabel] = useState<string | null>(null)
  const renderAbortRef = useRef<AbortController | null>(null)
  useEffect(() => () => renderAbortRef.current?.abort(), [])
  const onDraftRender = useCallback(async () => {
    if (renderAbortRef.current) {
      renderAbortRef.current.abort()
      return
    }
    const st = useEditorStore.getState()
    const layout = selectTimelineLayout(st)
    const totalSec = Math.max(
      layout.reduce((sum, l) => sum + l.durationSec, 0),
      st.audioClips.reduce((m, a) => Math.max(m, a.startSec + a.durationSec), 0),
    )
    if (!(totalSec > 0)) {
      toast.info(t('No clips in the timeline to render.'))
      return
    }
    st.setPlaying(false) // 프리뷰 재생과 녹화용 오디오가 겹치지 않게
    const ctrl = new AbortController()
    renderAbortRef.current = ctrl
    setRenderLabel(t('Preparing clips…'))
    toast.info(
      t('Draft render records in real time. Keep this tab visible until it finishes.'),
    )
    try {
      const base = (projectTitle || 'draft').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)
      const stats = await renderDraftTimeline({
        projectId,
        fileBaseName: `${base}_draft`,
        layout,
        shots: st.shots,
        videoClips: st.videoClips,
        audioClips: st.audioClips,
        audioTracks: st.audioTracks,
        signal: ctrl.signal,
        onPhase: (phase, frac) => {
          const percent = Math.round(frac * 100)
          setRenderLabel(
            phase === 'prefetch'
              ? t('Preparing clips… {percent}%', { percent })
              : t('Rendering… {percent}%', { percent }),
          )
        },
      })
      toast.success(
        t('Draft video saved: {seconds}s, {size}MB.', {
          seconds: Math.round(stats.durationSec),
          size: (stats.bytes / (1024 * 1024)).toFixed(1),
        }),
      )
      if (stats.skippedClips > 0) {
        toast.warning(
          t('{count} clips have no video yet and were rendered as placeholders.', {
            count: stats.skippedClips,
          }),
        )
      }
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        toast.info(t('Draft render canceled.'))
      } else {
        toast.error(
          t('Draft render failed: {message}', {
            message: e instanceof Error ? e.message : '',
          }),
        )
      }
    } finally {
      renderAbortRef.current = null
      setRenderLabel(null)
    }
  }, [projectId, projectTitle, t])

  // "전체 보기"(#watch-all) — 타임라인의 모든 클립을 먼저 받아(objectURL) 처음부터 끊김 없이
  //   연속 재생한다. 진행 중에는 버튼이 n/m 을 보여준다. 일부 실패는 그 클립만 스트리밍.
  const [prefetching, setPrefetching] = useState<{ done: number; total: number } | null>(null)
  const handleWatchAll = useCallback(async () => {
    const st = useEditorStore.getState()
    const urls = selectTimelineLayout(st)
      .map((item) => st.videoClips.find((c) => c.shotId === item.shotId)?.url)
      .filter((u): u is string => !!u)
    if (urls.length === 0) {
      toast.info(t('No videos on the timeline yet. Generate videos in Director first.'))
      return
    }
    setPrefetching({ done: 0, total: urls.length })
    try {
      const r = await prefetchVideos(projectId ?? null, urls, (done, total) =>
        setPrefetching({ done, total }),
      )
      if (r.failed > 0) {
        toast.warning(
          t('{failed} of {total} clips could not be preloaded. They will stream as before.', {
            failed: r.failed,
            total: r.total,
          }),
        )
      }
    } finally {
      setPrefetching(null)
    }
    const ready = useEditorStore.getState()
    ready.clearPreviewSource() // 소스 미리보기 모드였으면 타임라인 재생으로 복귀
    ready.seek(0)
    ready.setPlaying(true)
  }, [projectId, t])

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
        name: t('{type} audio', { type: shot?.shotType ?? t('Video') }),
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
  }, [t])

  // loadData(원본) → loadPersisted(저장된 편집 덮어쓰기) → 첫 진입 시 샷 오디오 자동 부착.
  // deps 는 전부 안정 참조여야 한다 (#editor-render-loop 2026-08-24): 하나라도 매 렌더 새로
  //   생기면 effect 재실행 → loadData() → store set() → 리렌더 로 무한 루프가 된다.
  //   t 는 useT 가 useCallback 으로 고정해 준다 (src/lib/i18n/index.ts).
  useEffect(() => {
    let cancelled = false
    // 프로젝트가 바뀌면 이전 프로젝트의 "전체 보기" blob 캐시를 반환한다(같은 프로젝트 재진입은 유지).
    resetVideoPrefetchFor(projectId ?? null)
    ;(async () => {
      await loadData()
      if (cancelled) return
      await loadPersisted()
      if (cancelled) return
      // #d11(2026-08-31 오너 확정): 실제 영상 파일 길이 측정 — 계획 duration 보다 짧은 파일
      //   (시간 인플레이션·모델 최소 길이 산물)은 타임라인이 실측 길이로 자동 트림한다.
      //   메타데이터만 로드하고 실패는 무시(측정 불가 시 종전 동작 그대로).
      void Promise.all(
        useEditorStore
          .getState()
          .videoClips.filter((c) => c.url && c.actualDurationSec == null)
          .map(
            (c) =>
              new Promise<void>((resolve) => {
                const v = document.createElement('video')
                v.preload = 'metadata'
                v.onloadedmetadata = () => {
                  if (!cancelled && Number.isFinite(v.duration) && v.duration > 0) {
                    useEditorStore.getState().updateVideoClip(c.shotId, {
                      actualDurationSec: Math.round(v.duration * 10) / 10,
                    })
                  }
                  resolve()
                }
                v.onerror = () => resolve()
                v.src = c.url as string
              }),
          ),
      )
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
            name: t('{type} audio', { type: shot?.shotType ?? t('Video') }),
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
  }, [projectId, loadData, loadPersisted, t, retryTick])

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

  // 타이틀 카드 삽입(#owner-title-card): 소스 클립 추가(addClipAtPlayhead)와 동일하게 플레이헤드에
  //   가장 가까운 클립 경계에 삽입 — 검은 배경 + 텍스트(+선택 이미지) synthetic 클립.
  const handleAddTitleCard = useCallback(() => {
    const st = useEditorStore.getState()
    const layout = selectTimelineLayout(st)
    const boundaries = [0]
    for (const it of layout) boundaries.push(it.startSec + it.durationSec)
    const cur = st.currentTime
    let nearest = 0
    let best = Infinity
    for (const b of boundaries) {
      const d = Math.abs(b - cur)
      if (d < best) {
        best = d
        nearest = b
      }
    }
    addTitleCard(nearest)
  }, [addTitleCard])

  // #pps-empty-states(2026-08-27 오너 확정): shots=0 의 세 이유(로딩/실패/정상 빈)를 한 화면으로
  //   뭉개지 않는다 — 로딩 플래시가 "이전 단계를 완료하라"는 틀린 진단으로 보이던 것의 수리.
  if (shots.length === 0) {
    if (loadStatus === 'error') {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-sm text-center">
            <h1 className="text-2xl font-bold">Post-Production Suite</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t('Could not load your clips.')}</p>
            {error ? <p className="mt-1 text-xs text-muted-foreground/70">{error}</p> : null}
            <Button variant="outline" className="mt-4" onClick={() => setRetryTick((n) => n + 1)}>
              {t('Retry')}
            </Button>
          </div>
        </div>
      )
    }
    if (loadStatus === 'ready') {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="max-w-sm text-center">
            <h1 className="text-2xl font-bold">Post-Production Suite</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('Complete previous steps first to load video clips.')}
            </p>
            <Button className="mt-4" onClick={() => router.push('/studio/director')}>
              {t('Go to Director')}
            </Button>
          </div>
        </div>
      )
    }
    // 'loading'('idle' 포함 — 로드 effect 발화 전 첫 렌더): 문구 없는 레이아웃 스켈레톤.
    //   소스 패널(좌) + 프리뷰(중) + 타임라인(하) 자리를 그대로 비쳐 화면 점프를 없앤다.
    return (
      <div className="flex flex-1 overflow-hidden" aria-busy>
        <div className="w-64 shrink-0 border-r border-border/50 p-3">
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-md bg-muted-foreground/10" />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="m-4 flex-1 animate-pulse rounded-md bg-muted-foreground/10" />
          <div className="mx-4 mb-4 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-muted-foreground/10" />
            <div className="h-9 w-3/4 animate-pulse rounded bg-muted-foreground/10" />
            <div className="h-9 w-1/2 animate-pulse rounded bg-muted-foreground/10" />
          </div>
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
              className="size-6 hover-red-beam"
              onClick={() => setToolMode('select')}
              title={t('Select tool (V)')}
            >
              <MousePointer2 className="size-3" />
            </Button>
            <Button
              size="icon"
              variant={toolMode === 'cut' ? 'default' : 'ghost'}
              className="size-6 hover-red-beam"
              onClick={() => setToolMode('cut')}
              title={t('Cut tool (C)')}
            >
              <Scissors className="size-3" />
            </Button>
          </div>

          {/* 타이틀 카드 삽입(#owner-title-card) — 지정 플레이헤드 인접 경계에 검은 배경/텍스트 카드 삽입 */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 hover-red-beam"
            onClick={handleAddTitleCard}
            title={t('Insert a black title card with text at the nearest clip boundary')}
          >
            <Type className="size-3" />
            {t('Title Card')}
          </Button>

          {/* 재생 컨트롤 (프레임 버튼은 꾹 누르면 연속) */}
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              className="size-7 hover-red-beam"
              onPointerDown={() => startFrameHold(-FRAME)}
              onPointerUp={stopFrameHold}
              onPointerLeave={stopFrameHold}
              onPointerCancel={stopFrameHold}
              title={t('Previous frame (←) · hold for continuous')}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7 hover-red-beam" onClick={togglePlay} title={t('Play/pause (Space)')}>
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 hover-red-beam"
              onPointerDown={() => startFrameHold(FRAME)}
              onPointerUp={stopFrameHold}
              onPointerLeave={stopFrameHold}
              onPointerCancel={stopFrameHold}
              title={t('Next frame (→) · hold for continuous')}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="size-7 hover-red-beam" onClick={undo} disabled={past.length === 0} title={t('Undo (Ctrl+Z)')}>
              <Undo2 className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7 hover-red-beam" onClick={redo} disabled={future.length === 0} title={t('Redo (Ctrl+Y)')}>
              <Redo2 className="size-4" />
            </Button>
          </div>

          <span className="text-[10px] text-muted-foreground">
            {t('Right-click a clip → speed, split, delete')}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {/* 전체 보기(#watch-all) — 전 클립 프리로드 후 처음부터 연속 재생 */}
            <Button
              size="sm"
              variant="outline"
              disabled={!!prefetching}
              className="gap-1.5 hover-red-beam"
              onClick={() => void handleWatchAll()}
              title={t('Preload every clip, then play the whole timeline from the start')}
            >
              {prefetching ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <MonitorPlay className="size-3" />
              )}
              {prefetching
                ? t('Preparing {done}/{total}…', prefetching)
                : t('Watch all')}
            </Button>
            {/* 샷 영상 일괄 ZIP 다운로드 (타임라인 순서대로 NN_shotId.mp4) */}
            <Button
              size="sm"
              variant="outline"
              disabled={exportingZip}
              className="gap-1.5 hover-red-beam"
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
                    toast.info(t('No shot videos to download. (Generate videos first)'))
                  } else if (r.failed > 0) {
                    toast.warning(
                      t('{downloaded}/{total} ZIP complete, {failed} failed (see _failed.txt inside the zip).', {
                        downloaded: r.downloaded,
                        total: r.total,
                        failed: r.failed,
                      }),
                    )
                  } else {
                    toast.success(t('Downloaded {count} shots as a ZIP in order.', { count: r.downloaded }))
                  }
                } catch (e) {
                  toast.error(t('ZIP generation failed: {message}', { message: e instanceof Error ? e.message : '' }))
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
              {exportingZip ? t('Zipping…') : t('Shot ZIP')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onDraftRender}
              className="gap-1.5 hover-red-beam"
              title={
                renderLabel
                  ? t('Click to cancel')
                  : t('Concatenate every clip in order and save as one video file')
              }
            >
              {renderLabel ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Download className="size-3" />
              )}
              {renderLabel ?? t('Draft Render')}
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
              selectedAudioIds={selectedAudioIds}
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
              onToggleAudioTrackMute={toggleAudioTrackMute}
              onToggleAudioMute={toggleAudioMute}
              onRemoveAudio={removeAudioClip}
              onMoveAudio={moveAudioClip}
              onSetAudioVolume={setAudioVolume}
              onSplitAudio={splitAudioClipAt}
              onSelectAudio={selectAudioClip}
              onToggleAudioSelect={toggleAudioSelection}
              onRangeAudioSelect={selectAudioRange}
              onSetAudioSelection={setAudioSelection}
              onClearAudioSelection={clearAudioSelection}
              onUpdateVideoClip={updateVideoClip}
              onUpdateAudioClip={updateAudioClip}
              onSetTrim={setTrim}
              onSetTitleCardDuration={setTitleCardDuration}
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
