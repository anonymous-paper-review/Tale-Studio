'use client'

import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Scissors,
  Undo2,
  Redo2,
  Type,
  Minus,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'
import { AiBusyCard } from '@/components/ai-busy-overlay'
import { useHoldChatClosed } from '@/hooks/use-hold-chat-closed'
import { editorEmptyScreen, editorHeaderMeta, editorPrepTitle } from '@/features/editor/editor-labels'
import { EDITOR_FETCH_LIMIT, finishEditorOpen, runLimited } from '@/features/editor/open-editor'
import { VideoPreviewer } from '@/features/editor/video-previewer'
import { Timeline } from '@/features/editor/timeline'
import { VideoSourcePanel } from '@/features/editor/video-source-panel'
import { AudioMeter } from '@/features/editor/audio-meter'
import { ResizeHandle } from '@/features/editor/resize-handle'
import { useEditorPlayback } from '@/features/editor/use-editor-playback'
import { prefetchVideos, resetVideoPrefetchFor } from '@/features/editor/video-prefetch'
import { useEditorStore, selectTimelineLayout, zoomStep } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { decodeAudioPeaks } from '@/lib/audio-waveform'
import { downloadShotsZip } from '@/lib/editor-zip-export'
import { renderDraftTimeline } from '@/lib/editor-draft-render'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
    editorPrep,
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
    setTransitionIn,
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
  const projectInitLoading = useProjectStore((s) => s.initLoading)
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

  // loadData(원본) → loadPersisted(저장한 편집 되살리기) → finishEditorOpen(처음 여는 프로젝트면 영상 실제 길이를 잰 자리에
  //   영상마다 소리를 오디오 칸에 나누어 놓고 파형을 채워 브라우저 · 서버에 저장). 다 준비하기 전에는 편집 화면 대신
  //   기다리는 카드를 보이고 편집 상태를 저장하지 않는다(editorPrep, 오너 2026-11-10 "처음 Editor에 입장해서 수정하면 수정 내역 없어지는데").
  // deps 는 전부 안정 참조여야 한다 (#editor-render-loop 2026-08-24): 하나라도 매 렌더 새로
  //   생기면 effect 재실행 → loadData() → store set() → 리렌더 로 무한 루프가 된다.
  //   t 는 useT 가 useCallback 으로 고정해 준다 (src/lib/i18n/index.ts).
  useEffect(() => {
    let cancelled = false
    // 프로젝트가 바뀌면 이전 프로젝트의 "전체 보기" blob 캐시를 반환한다(같은 프로젝트 재진입은 유지).
    resetVideoPrefetchFor(projectId ?? null)
    useEditorStore.getState().setEditorPrep({ done: 0, total: 0 })
    // 여는 길에 예외가 나도(망가진 저장본 등) 떠나지 않은 한 finally 에서 준비 표시를 내린다 — 기다리는 카드가 끝나지 않았다(검토 A E3).
    ;(async () => {
      try {
        await loadData()
        if (cancelled) return
        const restored = await loadPersisted()
        if (cancelled) return
        // #d11(2026-08-31 오너 확정): 실제 영상 파일 길이 측정 — 계획 duration 보다 짧은 파일
        //   (시간 인플레이션·모델 최소 길이 산물)은 타임라인이 실측 길이로 자동 트림한다.
        //   메타데이터만 로드하고 실패는 무시(측정 불가 시 종전 동작 그대로). 처음 열 때는 다 잰 뒤에 소리를 놓는다.
        //   한 번에 EDITOR_FETCH_LIMIT 개까지만 잰다(검토 A E6).
        const measureClips = () =>
          runLimited(
            useEditorStore
              .getState()
              .videoClips.filter((c) => c.url && c.actualDurationSec == null),
            EDITOR_FETCH_LIMIT,
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
                // 영상을 불러오지 못하면(404 · 막힘) 그 클립만 "불러오지 못함"으로 남긴다 — 나머지는 그대로 연다.
                v.onerror = () => {
                  if (!cancelled) useEditorStore.getState().markVideoUnplayable(c.url as string)
                  resolve()
                }
                v.src = c.url as string
              }),
          )
        await finishEditorOpen({
          projectId: projectId ?? null,
          restored,
          isCancelled: () => cancelled,
          audioName: (shotType) => t('{type} audio', { type: shotType ?? t('Video') }),
          measureClips,
          decodeAudio: (url) => decodeAudioPeaks(url),
        })
      } finally {
        if (!cancelled) useEditorStore.getState().setEditorPrep(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId, loadData, loadPersisted, t, retryTick])

  // 이 화면이 열린 동안 편집 상태가 비워지면(프로젝트를 여는 길의 늦은 비우기, QA 2026-11-03 밤) '다시 시도'처럼 처음부터 다시 읽는다 —
  //   읽던 결과는 비우기 때 버려지므로, 다시 읽지 않으면 기다림 화면이 끝나지 않았다. 비우기 한 번에 다시 읽기 한 번.
  //   약속: tests/editor/load-ends.test.ts
  useEffect(() => {
    let seen = useEditorStore.getState().resetCount
    return useEditorStore.subscribe((s) => {
      if (s.resetCount === seen) return
      seen = s.resetCount
      setRetryTick((n) => n + 1)
    })
  }, [])

  // Editor 진입 시 채팅 기본 접힘 (요청 6b). 떠날 때 이전 상태 복원 — Director 와 같은 약속(닫아 둔 모습은 기억에 남기지 않는다).
  useHoldChatClosed('editor')

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
    // 프로젝트를 여는 중(바꾸는 동안 포함)에는 "이전 단계를 먼저 끝내세요" 대신 기다림을 보인다(QA 2026-11-03 밤).
    const emptyScreen = editorEmptyScreen({ loadStatus, projectId, initLoading: projectInitLoading })
    if (emptyScreen === 'error') {
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
    if (emptyScreen === 'empty') {
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
    // 'loading'('idle' 포함 — 로드 effect 발화 전 첫 렌더): Director → Editor 로 넘어가며 기다리는 화면.
    //   11/5 SYS(모든 팝업 · 기다리는 화면 공통): 큰 Lumi 대신 기다리는 카드(Editor 옷 · Lumi L) — 글은 예전 그대로 "클립 준비 중…".
    //   AI 작업 잠금(AiBusyOverlay)이 아니라 카드만 이 자리에 그린다 — 읽는 동안에도 레일로 다른 단계에 갈 수 있다(예전처럼).
    //   설명은 비워 둔다 — 비우지 않으면 카드가 AI 작업 잠금 안내를 쓴다. "이전 단계를 완료하라" 같은 틀린 안내는 여전히 띄우지 않는다(#pps-empty-states).
    return (
      <div className="flex flex-1 items-center justify-center p-6" aria-busy>
        <AiBusyCard lumi="editor" title={t('Preparing clips…')} description="" />
      </div>
    )
  }
  // 편집 상태를 준비하는 동안(저장한 편집 되살리기 · 처음 열 때 소리 나누기)은 샷이 있어도 편집 화면 대신 같은 기다리는 카드 —
  //   다 준비되고(처음이면 저장까지) 나서 연다. 처음 열 때는 소리 나누기 진행을 %로 붙인다(오너 2026-11-10).
  if (editorPrep) {
    return (
      <div className="flex flex-1 items-center justify-center p-6" aria-busy>
        <AiBusyCard lumi="editor" title={editorPrepTitle(editorPrep, t)} description="" />
      </div>
    )
  }

  // v3 ED1 화면 머리 숫자 — "컷 7 · 33초 · 영상 0/7"(타임라인에 놓인 것 기준).
  const headerMeta = editorHeaderMeta(timelineLayout, videoClips, t)

  return (
    // v3 ED1(2026-11-03): 작업 영역(왼쪽 · 오른쪽 · 아래 28, 위 24) — 화면 머리, 위 줄(소스 판 | 미리 보기 판), 아래 타임라인 판.
    //   판 사이 틈이 크기 조절 손잡이다(소스 폭 · 위 줄 높이, 기억은 예전 그대로).
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-7 pb-7 pt-6">
      <PageHeader title={t('Final edit')} meta={headerMeta} />
      <div className="mt-[18px] flex min-h-0 flex-1 flex-col">
        {/* 위 줄 — 높이 조절 대상 */}
        <div style={{ height: panelSizes.previewH }} className="flex shrink-0 overflow-hidden">
          {/* 소스 보관함 (Video/Voice). 열렸을 때만 너비 조절 가능 */}
          {sourcePanelOpen ? (
            <>
              <div style={{ width: panelSizes.sourceW }} className="h-full shrink-0 overflow-hidden rounded-[20px] bg-panel">
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
            <>
              <div className="h-full shrink-0 overflow-hidden rounded-[20px] bg-panel">
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
              </div>
              <div className="w-3 shrink-0" />
            </>
          )}

          {/* 미리 보기 판 */}
          <div className="min-w-0 flex-1 overflow-hidden rounded-[20px] bg-black">
            <VideoPreviewer />
          </div>
        </div>

        <ResizeHandle
          axis="y"
          getValue={() => panelSizes.previewH}
          onChange={(v) => setPanelSize('previewH', v)}
        />

        {/* 타임라인 판 — 도구 줄 + 통합 타임라인(+VU) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-panel">
          {/* 재생 컨트롤바 + 도구 */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1 pt-3">
            {/* 도구 모드 (V/C) — v3 ED1: 작업 바탕색 칸 안, 고른 도구는 크림 */}
            <div className="flex items-center gap-0.5 rounded-[10px] bg-background p-[3px]">
              <Button
                size="icon"
                variant={toolMode === 'select' ? 'default' : 'ghost'}
                className={cn('size-7 rounded-lg', toolMode !== 'select' && 'text-muted-foreground')}
                onClick={() => setToolMode('select')}
                title={t('Select tool (V)')}
              >
                <MousePointer2 className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant={toolMode === 'cut' ? 'default' : 'ghost'}
                className={cn('size-7 rounded-lg', toolMode !== 'cut' && 'text-muted-foreground')}
                onClick={() => setToolMode('cut')}
                title={t('Cut tool (C)')}
              >
                <Scissors className="size-3.5" />
              </Button>
            </div>

            {/* 타이틀 카드 삽입(#owner-title-card) — 지정 플레이헤드 인접 경계에 검은 배경/텍스트 카드 삽입 */}
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5 rounded-full px-3.5"
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
                className="size-7 rounded-lg text-muted-foreground"
                onPointerDown={() => startFrameHold(-FRAME)}
                onPointerUp={stopFrameHold}
                onPointerLeave={stopFrameHold}
                onPointerCancel={stopFrameHold}
                title={t('Previous frame (←) · hold for continuous')}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" className="size-7 rounded-lg text-muted-foreground" onClick={togglePlay} title={t('Play/pause (Space)')}>
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 rounded-lg text-muted-foreground"
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
              <Button size="icon" variant="ghost" className="size-7 rounded-lg text-muted-foreground" onClick={undo} disabled={past.length === 0} title={t('Undo (Ctrl+Z)')}>
                <Undo2 className="size-4" />
              </Button>
              <Button size="icon" variant="ghost" className="size-7 rounded-lg text-muted-foreground" onClick={redo} disabled={future.length === 0} title={t('Redo (Ctrl+Y)')}>
                <Redo2 className="size-4" />
              </Button>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {/* 축척 −·지표·+ (2026-09-08 오너 지시 5번) — 전체 보기 왼쪽. 지표는 1초당 픽셀. v3 ED1: 카드색 알약. */}
              <div className="flex h-8 items-center gap-0.5 rounded-full bg-card px-1">
                <Button size="icon" variant="ghost" className="size-6 rounded-full text-muted-foreground" onClick={() => setPxPerSec(zoomStep(pxPerSec, 'out'))} title={t('Zoom out timeline')}>
                  <Minus className="size-3" />
                </Button>
                <span className="min-w-[64px] text-center font-num text-meta font-medium tabular-nums text-muted-foreground" title={t('Timeline scale')}>
                  {t('1s = {px}px', { px: Math.round(pxPerSec) })}
                </span>
                <Button size="icon" variant="ghost" className="size-6 rounded-full text-muted-foreground" onClick={() => setPxPerSec(zoomStep(pxPerSec, 'in'))} title={t('Zoom in timeline')}>
                  <Plus className="size-3" />
                </Button>
              </div>
              {/* 전체 보기(#watch-all) — 전 클립 프리로드 후 처음부터 연속 재생 */}
              <Button
                size="sm"
                variant="secondary"
                disabled={!!prefetching}
                className="gap-1.5 rounded-full px-3.5"
                onClick={() => void handleWatchAll()}
                title={t('Preload every clip, then play the whole timeline from the start')}
              >
                {/* 쉬는 동안은 글만(v3 11/5 판 ED1 — 타임라인 단추는 아이콘 없이). 받는 동안만 도는 원을 둔다. */}
                {prefetching ? <Loader2 className="size-3 animate-spin" /> : null}
                {prefetching
                  ? t('Preparing {done}/{total}…', prefetching)
                  : t('Watch all')}
              </Button>
              {/* 샷 영상 일괄 ZIP 다운로드 (타임라인 순서대로 NN_shotId.mp4) */}
              <Button
                size="sm"
                variant="secondary"
                disabled={exportingZip}
                className="gap-1.5 rounded-full px-3.5"
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
                {exportingZip ? <Loader2 className="size-3 animate-spin" /> : null}
                {exportingZip ? t('Zipping…') : t('Shot ZIP')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onDraftRender}
                className="gap-1.5 rounded-full px-3.5"
                title={
                  renderLabel
                    ? t('Click to cancel')
                    : t('Concatenate every clip in order and save as one video file')
                }
              >
                {renderLabel ? <Loader2 className="size-3 animate-spin" /> : null}
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
                onSetTransitionIn={setTransitionIn}
                onPushHistory={pushHistory}
              />
            </div>
            <AudioMeter audioClips={audioClips} />
          </div>

          {error && <p className="shrink-0 px-4 py-1 text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  )
}
