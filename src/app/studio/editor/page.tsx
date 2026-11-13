'use client'

import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MousePointer2, Scissors, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TopBarActions } from '@/components/layout/studio-top-bar'
import { AiBusyCard } from '@/components/ai-busy-overlay'
import { useHoldChatClosed } from '@/hooks/use-hold-chat-closed'
import { editorEmptyScreen, editorPrepTitle } from '@/features/editor/editor-labels'
import { EDITOR_FETCH_LIMIT, finishEditorOpen, runLimited } from '@/features/editor/open-editor'
import { VideoPreviewer } from '@/features/editor/video-previewer'
import { Timeline } from '@/features/editor/timeline'
import { ProjectPanel } from '@/features/editor/video-source-panel'
import { EffectControls } from '@/features/editor/effect-controls'
import { SourceMonitor } from '@/features/editor/source-monitor'
import { EditorTopActions, EditorWorkbar, ExportTab, ShortcutsDialog, type EditorTab } from '@/features/editor/editor-workbar'
import { SnapMarkerButtons } from '@/features/editor/timeline-markers'
import { AudioMeter } from '@/features/editor/audio-meter'
import { ResizeHandle } from '@/features/editor/resize-handle'
import { useEditorPlayback } from '@/features/editor/use-editor-playback'
import { resetVideoPrefetchFor } from '@/features/editor/video-prefetch'
import { useEditorStore, selectOverlayLayout, selectProgramLayout, selectTimelineLayout, timelineEnd, zoomStep, PANEL_SOURCE_W_MIN } from '@/stores/editor-store'
import { useProjectStore } from '@/stores/project-store'
import { useProjectFormatStore } from '@/stores/project-format-store'
import { sequenceInfoLine, sequenceLengthSec } from '@/lib/editor/sequence-info'
import { decodeAudioPeaks } from '@/lib/audio-waveform'
import { downloadShotsZip } from '@/lib/editor-zip-export'
import { renderDraftTimeline } from '@/lib/editor-draft-render'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

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
    currentTime,
    pxPerSec,
    audioClips,
    audioSources,
    audioTracks,
    videoTracks,
    overlay,
    markers,
    snapEnabled,
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
    placeClipAt,
    rippleDeleteClip,
    rippleDeleteSelectedClips,
    rippleDeleteGapBefore,
    addClipAtPlayhead,
    setSpeed,
    setTrim,
    splitVideoClipAt,
    addClipInstanceAt,
    addTitleCard,
    setTitleCardDuration,
    addAudioSource,
    removeAudioSource,
    addAudioClipFromSource,
    addAudioTrack,
    addVideoTrack,
    removeVideoTrack,
    moveClipToTrack,
    toggleTrackLock,
    toggleTrackVisible,
    toggleAudioTrackSolo,
    toggleSnap,
    addMarker,
    removeMarker,
    removeAudioTrack,
    setAudioVolume,
    setBinDragKind,
    setBinDropSec,
    updateVideoClip,
    updateAudioClip,
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
  // V1 밖 줄(V2 · V3 …)의 클립 자리(2단계 ②).
  const overlayLayout = useMemo(
    () => selectOverlayLayout({ shots, videoClips, clipOrder, overlay }),
    [shots, videoClips, clipOrder, overlay],
  )

  const projectId = useProjectStore((s) => s.projectId)
  const projectTitle = useProjectStore((s) => s.projectTitle)
  const projectInitLoading = useProjectStore((s) => s.initLoading)
  const router = useRouter()
  // #pps-empty-states: 로드 실패 화면의 '다시 시도' — 로드 effect 를 통째로 재발화시켜
  //   loadData→loadPersisted→오디오 자동 부착 순서를 그대로 다시 탄다.
  const [retryTick, setRetryTick] = useState(0)
  const [exportingZip, setExportingZip] = useState(false)
  // 새 배치(시안 E1, 2단계 ① 2026-11-14): 둘째 줄 탭 · 위 왼쪽 판 탭([소스 | 효과 컨트롤]) · 소스 탭에 연 샷 · 단축키 창.
  const [tab, setTab] = useState<EditorTab>('edit')
  const [topLeftTab, setTopLeftTab] = useState<'source' | 'effects'>('effects')
  const [sourceShotId, setSourceShotId] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const projectFormat = useProjectFormatStore((s) => s.format)
  // 타임라인에서 클립 · 소리 조각을 고르면 위 왼쪽 판이 효과 컨트롤로 바뀐다 — 고른 것을 바로 바꾸게.
  const hasSelection = selectedShotIds.length > 0 || selectedAudioIds.length > 0
  useEffect(() => {
    if (hasSelection) setTopLeftTab('effects')
  }, [hasSelection, selectedShotIds, selectedAudioIds])

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
    // 줄이 여럿이면 시각마다 눈을 켠 가장 위 줄의 클립을 녹화한다 — 미리 보기와 같다(2단계 ②).
    const layout = selectProgramLayout(st)
    const totalSec = Math.max(
      timelineEnd(layout),
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

  // 샷 영상 일괄 ZIP 다운로드 (타임라인 순서대로 NN_shotId.mp4) — 내보내기 탭.
  const handleShotZip = useCallback(async () => {
    setExportingZip(true)
    try {
      const st = useEditorStore.getState()
      const r = await downloadShotsZip({
        shots: st.shots,
        videoClips: st.videoClips,
        clipOrder: st.clipOrder,
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
  }, [t])

  // 프로젝트 판에서 샷을 누르면 위 [소스] 탭에서 본다 — 프로그램 모니터는 늘 시퀀스.
  const handleOpenSource = useCallback((shotId: string) => {
    setSourceShotId(shotId)
    setTopLeftTab('source')
  }, [])

  // 비디오 소스에 오디오가 있으면 그 영상 클립(linkTo)에 이어 오디오 트랙에 함께 삽입.
  // 비디오 파일을 decodeAudioData 로 디코드 시도 → 성공 시 소리 있음. 실패(무음/CORS) 시 비디오만.
  //   자리 · 길이는 넣는 순간 이어진 클립을 따른다 — 디코드하는 사이 클립을 옮기거나 숨겨도 맞는다(오너 2026-11-10 결정 4).
  const attachVideoAudio = useCallback(async (shotId: string, linkTo: string) => {
    const st = useEditorStore.getState()
    const src = st.videoClips.find((c) => c.shotId === shotId)
    const shot = st.shots.find((s) => s.shotId === shotId)
    if (!src?.url) return
    try {
      const { durationSec, peaks } = await decodeAudioPeaks(src.url)
      if (!(durationSec > 0)) return
      const now = useEditorStore.getState()
      now.addAudioClip({
        name: t('{type} audio', { type: shot?.shotType ?? t('Video') }),
        url: src.url,
        startSec: 0,
        durationSec: shot?.durationSeconds ?? durationSec,
        peaks,
        sourceOffsetSec: 0,
        // 실제 오디오 길이는 sourceDurationSec(트림 한계)로 보존.
        sourceDurationSec: durationSec,
        trackId: now.audioTracks[0]?.id,
        linkedShotId: linkTo,
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

  // 드래그-드롭: 비디오 + (있으면) 오디오 함께 삽입 — 오디오는 새로 놓인 클립에 잇는다(결정 4).
  const handleAddVideoClip = useCallback(
    (shotId: string, atSec: number, trackId?: string) => {
      // 끌어 놓은 줄에 놓는다 — V1 밖 줄이면 그 시각(2단계 ②).
      const instanceId = addClipInstanceAt(shotId, atSec, trackId)
      if (instanceId) void attachVideoAudio(shotId, instanceId)
    },
    [addClipInstanceAt, attachVideoAudio],
  )

  // 우클릭 "타임라인 추가": 플레이헤드 인접 경계 + 오디오 동반 — 더한 새 클립에만 소리를 잇는다(V1 이 잠겨 못 더하면 잇지 않는다, 검토 c ② 보통 2).
  const handleAddVideoClipAtPlayhead = useCallback(
    (shotId: string) => {
      const id = addClipAtPlayhead(shotId)
      if (id) void attachVideoAudio(shotId, id)
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

  const topLeftW = Math.max(PANEL_SOURCE_W_MIN, panelSizes.sourceW)
  // 내보내기 탭으로 가면 재생을 멈춘다 — 모니터 · 소리가 없는 탭에서 시계만 흐르지 않게.
  const openTab = (next: EditorTab) => {
    if (next === 'export') useEditorStore.getState().setPlaying(false)
    setTab(next)
  }
  const toolButton = (active: boolean) =>
    cn(
      'size-8 rounded-lg border-[1.5px]',
      active ? 'border-stage bg-stage/18 text-foreground hover:bg-stage/18' : 'border-transparent text-muted-foreground',
    )

  return (
    // 새 배치(시안 E1 409:4354, 2단계 ① 2026-11-14) — 맨 위 오른쪽 [← Director로] 보조 · [내보내기] 크림, 둘째 줄(탭 · 시퀀스 정보 ·
    //   되돌리기 · 단축키), 위 줄 [소스 | 효과 컨트롤] · 프로그램 모니터, 아래 줄 프로젝트 판 · 도구 열 · 타임라인 · 오디오 미터.
    //   판 사이 틈이 크기 조절 손잡이다(위 왼쪽 판 폭 · 위 줄 높이, 기억은 예전 그대로). 내보내기 탭은 그 자리를 드래프트 렌더 · 샷 ZIP 으로 바꾼다.
    //   좁은 화면 · Lumi 판을 연 화면(시안 없음): 위 왼쪽 판이 최소 폭까지 먼저 줄고, 그보다 좁으면 작업 영역을 가로로 넘겨 본다.
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden px-7 pb-7 pt-4">
      <div className="flex min-h-0 min-w-[900px] flex-1 flex-col">
        <TopBarActions>
          <EditorTopActions onBack={() => router.push('/studio/director')} onExport={() => openTab('export')} />
        </TopBarActions>
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <EditorWorkbar
          tab={tab}
          onTab={openTab}
          // 시퀀스 길이 — 모든 영상 줄 끝 · 소리 끝 중 늦은 쪽(2단계 ②), 예전 화면 머리의 "N초"를 옮긴 자리.
          sequenceInfo={sequenceInfoLine(sequenceLengthSec([...timelineLayout, ...overlayLayout], audioClips), projectFormat)}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
          onUndo={undo}
          onRedo={redo}
          onShortcuts={() => setShortcutsOpen(true)}
        />
        {tab === 'export' ? (
          <ExportTab renderLabel={renderLabel} onDraftRender={onDraftRender} exportingZip={exportingZip} onShotZip={() => void handleShotZip()} />
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            {/* 위 줄 — 높이 조절 대상 */}
            <div style={{ height: panelSizes.previewH }} className="flex shrink-0 overflow-hidden">
              <div style={{ width: topLeftW }} className="flex h-full min-w-[340px] shrink flex-col overflow-hidden rounded-[20px] bg-panel">
                <div role="tablist" className="flex shrink-0 items-center gap-4 px-4 pt-3">
                  {(
                    [
                      ['source', t('Source')],
                      ['effects', t('Effect controls')],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={topLeftTab === value}
                      onClick={() => setTopLeftTab(value)}
                      className={cn(
                        'relative pb-1.5 text-label transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5',
                        topLeftTab === value ? 'font-semibold text-foreground after:bg-foreground' : 'font-medium text-subtle-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {topLeftTab === 'source' ? <SourceMonitor shotId={sourceShotId} /> : <EffectControls />}
                </div>
              </div>
              <ResizeHandle
                axis="x"
                getValue={() => topLeftW}
                onChange={(v) => setPanelSize('sourceW', v)}
              />

              {/* 프로그램 모니터 — 늘 시퀀스를 보인다 */}
              <div className="flex min-w-[480px] flex-1 flex-col overflow-hidden rounded-[20px] bg-panel">
                <div className="flex shrink-0 items-center px-4 pt-3">
                  <span className="relative pb-1.5 text-label font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground">
                    {t('Program: {name}', { name: t('Sequence 01') })}
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden pt-2">
                  <VideoPreviewer />
                </div>
              </div>
            </div>

            <ResizeHandle
              axis="y"
              getValue={() => panelSizes.previewH}
              onChange={(v) => setPanelSize('previewH', v)}
            />

            {/* 아래 줄 — 프로젝트 판 · 도구 열 · 타임라인 · 오디오 미터 */}
            <div className="flex min-h-0 flex-1 gap-3">
              <div className="w-[272px] shrink-0 overflow-hidden rounded-[20px] bg-panel">
                <ProjectPanel
                  shots={shots}
                  videoClips={videoClips}
                  audioSources={audioSources}
                  newItems={[{ label: t('Title card'), onSelect: handleAddTitleCard }]}
                  onOpenSource={handleOpenSource}
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

              {/* 도구 열 (V/C) — 고른 도구는 지금 단계 색 테두리 · 18% 바탕(고르기 칩과 같은 규칙) */}
              <div className="flex w-11 shrink-0 flex-col items-center gap-1 rounded-[20px] bg-panel py-2">
                <Button size="icon" variant="ghost" className={toolButton(toolMode === 'select')} onClick={() => setToolMode('select')} title={t('Select tool (V)')} aria-label={t('Select tool (V)')} aria-pressed={toolMode === 'select'}>
                  <MousePointer2 className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className={toolButton(toolMode === 'cut')} onClick={() => setToolMode('cut')} title={t('Cut tool (C)')} aria-label={t('Cut tool (C)')} aria-pressed={toolMode === 'cut'}>
                  <Scissors className="size-4" />
                </Button>
              </div>

              {/* 타임라인 판 */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-panel">
                <div className="min-h-0 flex-1">
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
                    onPlaceClipAt={placeClipAt}
                    onRippleDeleteGap={rippleDeleteGapBefore}
                    onRippleDelete={rippleDeleteClip}
                    onRippleDeleteSelected={rippleDeleteSelectedClips}
                    onZoom={setPxPerSec}
                    onSplitVideo={splitVideoClipAt}
                    onSetSpeed={setSpeed}
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
                    videoTracks={videoTracks}
                    overlayLayout={overlayLayout}
                    onMoveClipToTrack={moveClipToTrack}
                    onToggleTrackLock={toggleTrackLock}
                    onToggleTrackVisible={toggleTrackVisible}
                    onToggleAudioTrackSolo={toggleAudioTrackSolo}
                    onRemoveVideoTrack={removeVideoTrack}
                    snapEnabled={snapEnabled}
                    markers={markers}
                    onRemoveMarker={removeMarker}
                    toolbar={
                      <>
                        {/* 시안 E1 409:4795–4802 차례 — [스냅 켬] · [마커] · [+ V 트랙] · [+ A 트랙](2단계 ③). */}
                        <SnapMarkerButtons snapEnabled={snapEnabled} onToggleSnap={toggleSnap} onAddMarker={addMarker} />
                        <Button size="sm" variant="secondary" className="h-7 gap-1 rounded-full px-3" onClick={() => addVideoTrack()} title={t('Add video track')}>
                          <Plus className="size-3.5" />
                          {t('V track')}
                        </Button>
                        <Button size="sm" variant="secondary" className="h-7 gap-1 rounded-full px-3" onClick={() => addAudioTrack()} title={t('Add audio track')}>
                          <Plus className="size-3.5" />
                          {t('A track')}
                        </Button>
                        {/* 도구 설명은 남는 폭만 쓰고 줄어든다 — 단추가 늘어도(2단계 ③ [스냅 켬] · [마커]) 확대 −·+ 가 둘째 줄로 내려가지 않게. */}
                        <span
                          className="min-w-0 flex-1 basis-0 truncate text-right text-meta text-subtle-foreground"
                          title={toolMode === 'cut' ? t('Cut tool · Click a clip to split it there') : t('Selection tool · Drag to move, drag an edge to change length')}
                        >
                          {toolMode === 'cut' ? t('Cut tool · Click a clip to split it there') : t('Selection tool · Drag to move, drag an edge to change length')}
                        </span>
                        {/* 축척 −·+ (2026-09-08 오너 지시 5번 · 시안 E1 409:4806 · 409:4808) — 축척 숫자는 없앴다(결정 페이지 추천). */}
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="secondary" className="size-7 rounded-full" onClick={() => setPxPerSec(zoomStep(pxPerSec, 'out'))} title={t('Zoom out timeline')} aria-label={t('Zoom out timeline')}>
                            <Minus className="size-3.5" />
                          </Button>
                          <Button size="icon" variant="secondary" className="size-7 rounded-full" onClick={() => setPxPerSec(zoomStep(pxPerSec, 'in'))} title={t('Zoom in timeline')} aria-label={t('Zoom in timeline')}>
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </>
                    }
                  />
                </div>
                {error && <p className="shrink-0 px-4 py-1 text-xs text-destructive">{error}</p>}
              </div>

              {/* 오디오 미터(재생 소리 · 0 ~ −60dB) — L/R 두 줄은 미터 조각(⑧) */}
              <div className="flex w-11 shrink-0 justify-center overflow-hidden rounded-[20px] bg-panel">
                <AudioMeter audioClips={audioClips} className="border-l-0" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
