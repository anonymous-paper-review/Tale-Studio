import { create } from 'zustand'
import type { Shot, VideoClip, DialogueLine, AudioTrackClip, AudioSource } from '@/types'
import { useProjectStore } from '@/stores/project-store'
import { useDirectorStore } from '@/stores/director-store'
import { createClient } from '@/lib/supabase/client'
import {
  saveEditorState,
  loadEditorState,
  deleteAudioBlob,
  type PersistedEditor,
} from '@/lib/editor-persistence'

const DEFAULT_CAMERA = {
  horizontal: 0,
  vertical: 0,
  pan: 0,
  tilt: 0,
  roll: 0,
  zoom: 0,
}

const DEFAULT_LIGHTING = {
  position: 'front' as const,
  brightness: 50,
  colorTemp: 5000,
}

// Per-shot debounce timers for speed persist (300ms)
const speedPersistTimers = new Map<string, ReturnType<typeof setTimeout>>()

// 오디오 클립 id 시퀀스 (Date.now/random 회피 — 모듈 카운터)
let audioIdSeq = 1
// cut(split)·drag-add 로 생기는 synthetic 비디오 인스턴스 id 시퀀스
let instanceSeq = 1

interface EditorState {
  shots: Shot[]
  videoClips: VideoClip[]
  selectedSceneId: string | null
  selectedClipShotId: string | null   // 다중 선택의 앵커/대표 (range 기준)
  selectedShotIds: string[]           // 다중 선택된 비디오 클립
  selectedAudioId: string | null      // 선택된 오디오 클립 (Del 대상 구분)
  clipOrder: Record<string, string[]> // sceneId → shotId[]
  rendering: boolean
  error: string | null

  // Video Source 패널 (프리미어2 좌상단 카드 그리드) — 토글로 접기
  sourcePanelOpen: boolean

  // 통합 타임라인 재생/뷰 상태
  currentTime: number   // 전역 playhead 위치 (초)
  pxPerSec: number      // 타임라인 zoom (1초당 픽셀). 마우스휠 zoom이 조절
  isPlaying: boolean    // 연속 재생 중
  toolMode: 'select' | 'cut'  // 도구 모드: V=선택, C=자르기

  // 오디오 트랙 (비디오와 독립). 외부 업로드. 기본 mute.
  audioClips: AudioTrackClip[]
  // 오디오/보이스 소스 보관함 (bin) — 드래그해 오디오 트랙에 인스턴스화
  audioSources: AudioSource[]

  // 소스 클립 단독 미리보기 (Video Source 클릭 시). null이면 타임라인(플레이헤드) 모드.
  previewSourceShotId: string | null

  // 전역 재생 볼륨 0~1 (재생 전용 — draft 생성과 무관)
  masterVolume: number

  // bin→트랙 포인터 드래그 중 드롭존 하이라이트 ('video'|'audio'|null)
  binDragKind: 'video' | 'audio' | null

  // 리사이즈 섹션 크기 (px). 영속화 대상.
  panelSizes: { sourceW: number; previewH: number }

  // Undo/Redo (편집 상태 스냅샷 스택)
  past: EditorSnapshot[]
  future: EditorSnapshot[]

  loadData: () => void
  loadMockData: () => void
  reset: () => void
  selectScene: (sceneId: string) => void
  selectClip: (shotId: string) => void                 // 단일 선택 (교체)
  toggleClipSelection: (shotId: string) => void        // ctrl+click
  selectClipRange: (shotId: string) => void            // shift+click (앵커~대상)
  setClipSelection: (ids: string[]) => void            // 마퀴 드래그 선택
  clearClipSelection: () => void
  selectAudioClip: (id: string) => void
  reorderClips: (sceneId: string, fromIndex: number, toIndex: number) => void
  setTrim: (shotId: string, trimStart: number, trimEnd: number) => void
  setSpeed: (shotId: string, speed: number) => void
  deleteClip: (shotId: string) => void
  deleteSelectedClips: () => void                       // 선택된 클립 일괄 삭제
  moveClipToIndex: (shotId: string, targetIndex: number) => void  // 드래그 순서변경
  // cut(자르기) — 비디오 클립을 전역 시간 atSec 지점에서 둘로 분할
  splitVideoClipAt: (shotId: string, atGlobalSec: number) => void
  // Video Source → 타임라인 드래그-투-애드 (atSec 위치에 새 인스턴스 삽입)
  addClipInstanceAt: (sourceShotId: string, atGlobalSec: number) => void
  renderDraft: () => Promise<void>

  // Video Source 패널 액션
  toggleSourcePanel: () => void

  // 통합 타임라인 액션
  seek: (timeSec: number) => void          // playhead 이동 (+ 해당 클립 자동 선택)
  setPxPerSec: (px: number) => void        // zoom 설정 (clamp 8~240)

  // 오디오 트랙 액션
  addAudioClip: (clip: Omit<AudioTrackClip, 'id' | 'volume' | 'muted'>) => string
  moveAudioClip: (id: string, startSec: number) => void
  setAudioVolume: (id: string, volume: number) => void
  toggleAudioMute: (id: string) => void
  setAudioPeaks: (id: string, peaks: number[]) => void
  removeAudioClip: (id: string) => void
  splitAudioClipAt: (id: string, atGlobalSec: number) => void   // cut(자르기) for audio

  // 오디오/보이스 소스 보관함 (bin)
  addAudioSource: (source: AudioSource) => void
  removeAudioSource: (id: string) => void
  addAudioClipFromSource: (sourceId: string, startSec: number) => string | null

  // 소스 단독 미리보기 (Video Source 클릭)
  previewSource: (shotId: string) => void
  clearPreviewSource: () => void

  // 리사이즈 섹션 크기 + 영속화
  setPanelSize: (key: 'sourceW' | 'previewH', value: number) => void
  loadPersisted: () => Promise<void>

  // 전역 볼륨 / bin 드래그 하이라이트
  setMasterVolume: (v: number) => void
  setBinDragKind: (kind: 'video' | 'audio' | null) => void

  // 재생 / 도구 / Undo·Redo 액션
  togglePlay: () => void
  setPlaying: (playing: boolean) => void
  setToolMode: (mode: 'select' | 'cut') => void
  nudge: (deltaSec: number) => void   // 화살표 키 프레임 이동 (재생 중이면 정지)
  pushHistory: () => void             // 드래그 시작 등 연속 편집 직전 1회 스냅샷
  undo: () => void
  redo: () => void
}

// Undo/Redo가 보존하는 편집 상태 (직렬화 가능한 값만).
// shots 포함 — cut/drag-add 가 synthetic shot 을 추가하므로 undo 시 복원 필요.
interface EditorSnapshot {
  shots: Shot[]
  clipOrder: Record<string, string[]>
  videoClips: VideoClip[]
  audioClips: AudioTrackClip[]
  audioSources: AudioSource[]
}

// 리사이즈 섹션 기본 크기 (px)
export const DEFAULT_PANEL_SIZES = { sourceW: 256, previewH: 360 }
export const PANEL_SOURCE_W_MIN = 180
export const PANEL_SOURCE_W_MAX = 480
export const PANEL_PREVIEW_H_MIN = 160
export const PANEL_PREVIEW_H_MAX = 760

// 타임라인 zoom 한계 (px/sec)
export const PX_PER_SEC_MIN = 8
export const PX_PER_SEC_MAX = 240
export const PX_PER_SEC_DEFAULT = 40

// 타임라인 selector 입력 — 필요한 필드만 (전체 EditorState 불필요)
type TimelineInput = Pick<EditorState, 'shots' | 'videoClips' | 'clipOrder'>

/**
 * 통합 타임라인용 전역 샷 순서 (씬 경계를 넘어 한 줄로 펼침).
 * 비디오 클립은 "붙어있는" 모델이므로 씬 순서대로 이어붙인다.
 */
export function selectTimelineShotIds(state: TimelineInput): string[] {
  const sceneIds = [...new Set(state.shots.map((s) => s.sceneId))]
  const ids: string[] = []
  for (const sceneId of sceneIds) {
    for (const shotId of state.clipOrder[sceneId] ?? []) ids.push(shotId)
  }
  return ids
}

/**
 * 통합 타임라인 각 클립의 시작 오프셋(초) + 유효 길이(트림/속도 반영).
 * 붙어있는 모델: 앞 클립 끝 = 다음 클립 시작.
 */
export function selectTimelineLayout(
  state: TimelineInput,
): Array<{ shotId: string; startSec: number; durationSec: number }> {
  const ids = selectTimelineShotIds(state)
  const out: Array<{ shotId: string; startSec: number; durationSec: number }> = []
  let cursor = 0
  for (const shotId of ids) {
    const shot = state.shots.find((s) => s.shotId === shotId)
    const clip = state.videoClips.find((c) => c.shotId === shotId)
    if (!shot) continue
    const base = shot.durationSeconds
    const trimStart = clip?.trimStart ?? 0
    const trimEnd = clip?.trimEnd ?? base
    const speed = clip?.speed ?? 1.0
    const durationSec = Math.max(0.1, (trimEnd - trimStart) / speed)
    out.push({ shotId, startSec: cursor, durationSec })
    cursor += durationSec
  }
  return out
}

function buildClipOrder(shots: Shot[]): Record<string, string[]> {
  const order: Record<string, string[]> = {}
  for (const shot of shots) {
    if (!order[shot.sceneId]) order[shot.sceneId] = []
    order[shot.sceneId].push(shot.shotId)
  }
  return order
}

const HISTORY_LIMIT = 50

// 현재 편집 상태를 스냅샷 (deep copy — 직렬화 가능 값만)
function snapshotOf(state: EditorState): EditorSnapshot {
  return {
    shots: structuredClone(state.shots),
    clipOrder: structuredClone(state.clipOrder),
    videoClips: structuredClone(state.videoClips),
    audioClips: structuredClone(state.audioClips),
    audioSources: structuredClone(state.audioSources),
  }
}

// 전역 클립 순서 + 각 클립의 sceneId (씬 경계 넘어 한 줄). 삽입 위치 계산용.
function globalOrder(
  state: Pick<EditorState, 'shots' | 'clipOrder'>,
): Array<{ shotId: string; sceneId: string }> {
  const sceneIds = [...new Set(state.shots.map((s) => s.sceneId))]
  const out: Array<{ shotId: string; sceneId: string }> = []
  for (const sceneId of sceneIds) {
    for (const shotId of state.clipOrder[sceneId] ?? []) out.push({ shotId, sceneId })
  }
  return out
}

export const useEditorStore = create<EditorState>((set, get) => ({
  shots: [],
  videoClips: [],
  selectedSceneId: null,
  selectedClipShotId: null,
  selectedShotIds: [],
  selectedAudioId: null,
  clipOrder: {},
  rendering: false,
  error: null,
  sourcePanelOpen: true,
  currentTime: 0,
  pxPerSec: PX_PER_SEC_DEFAULT,
  isPlaying: false,
  toolMode: 'select',
  audioClips: [],
  audioSources: [],
  previewSourceShotId: null,
  masterVolume: 1,
  binDragKind: null,
  panelSizes: { ...DEFAULT_PANEL_SIZES },
  past: [],
  future: [],

  toggleSourcePanel: () => set((state) => ({ sourcePanelOpen: !state.sourcePanelOpen })),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setToolMode: (mode) => set({ toolMode: mode }),

  // 프레임 이동: 재생 중이면 정지 후 해당 위치로 이동 (요청 8 — 이동 후 정지)
  nudge: (deltaSec) => {
    if (get().isPlaying) set({ isPlaying: false })
    get().seek(get().currentTime + deltaSec)
  },

  pushHistory: () =>
    set((state) => ({
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      const newPast = state.past.slice(0, -1)
      return {
        ...previous,
        past: newPast,
        future: [snapshotOf(state), ...state.future].slice(0, HISTORY_LIMIT),
      }
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        ...next,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      }
    }),

  seek: (timeSec) =>
    set((state) => {
      const layout = selectTimelineLayout(state)
      const total = layout.reduce((sum, l) => sum + l.durationSec, 0)
      const t = Math.max(0, Math.min(timeSec, total))
      // playhead 아래 클립을 자동 선택 (프리뷰 동기화)
      const hit = layout.find((l) => t >= l.startSec && t < l.startSec + l.durationSec)
      return {
        currentTime: t,
        selectedClipShotId: hit?.shotId ?? state.selectedClipShotId,
        previewSourceShotId: null, // 타임라인 조작 → 소스 미리보기 해제 (전체 재생 복귀)
      }
    }),

  setPxPerSec: (px) =>
    set({ pxPerSec: Math.max(PX_PER_SEC_MIN, Math.min(PX_PER_SEC_MAX, px)) }),

  addAudioClip: (clip) => {
    const id = `audio_${audioIdSeq++}`
    set((state) => ({
      audioClips: [
        ...state.audioClips,
        {
          ...clip,
          id,
          volume: 1,
          muted: false,
          sourceOffsetSec: clip.sourceOffsetSec ?? 0,
          sourceDurationSec: clip.sourceDurationSec ?? clip.durationSec,
        },
      ],
      selectedAudioId: id,
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    }))
    return id
  },

  moveAudioClip: (id, startSec) =>
    set((state) => ({
      audioClips: state.audioClips.map((a) =>
        a.id === id ? { ...a, startSec: Math.max(0, startSec) } : a,
      ),
    })),

  setAudioVolume: (id, volume) =>
    set((state) => ({
      audioClips: state.audioClips.map((a) =>
        a.id === id ? { ...a, volume: Math.max(0, Math.min(1, volume)) } : a,
      ),
    })),

  toggleAudioMute: (id) =>
    set((state) => ({
      audioClips: state.audioClips.map((a) =>
        a.id === id ? { ...a, muted: !a.muted } : a,
      ),
    })),

  setAudioPeaks: (id, peaks) =>
    set((state) => ({
      audioClips: state.audioClips.map((a) =>
        a.id === id ? { ...a, peaks } : a,
      ),
    })),

  removeAudioClip: (id) =>
    set((state) => ({
      audioClips: state.audioClips.filter((a) => a.id !== id),
      selectedAudioId: state.selectedAudioId === id ? null : state.selectedAudioId,
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  // cut(자르기) for audio — 전역 시간 atGlobalSec 에서 오디오 클립을 둘로 분할.
  // 같은 소스 파일을 공유하므로 뒷조각은 sourceOffsetSec 를 이어받아 올바른 구간을 재생.
  splitAudioClipAt: (id, atGlobalSec) =>
    set((state) => {
      const a = state.audioClips.find((x) => x.id === id)
      if (!a) return state
      const localT = atGlobalSec - a.startSec
      const MIN = 0.1
      if (localT <= MIN || localT >= a.durationSec - MIN) return state // 가장자리 너무 가까움

      const srcOff = a.sourceOffsetSec ?? 0
      const srcDur = a.sourceDurationSec ?? a.durationSec
      const newId = `audio_${audioIdSeq++}`
      const first: AudioTrackClip = { ...a, durationSec: localT }
      const second: AudioTrackClip = {
        ...a,
        id: newId,
        startSec: a.startSec + localT,
        durationSec: a.durationSec - localT,
        sourceOffsetSec: srcOff + localT,
        sourceDurationSec: srcDur,
      }
      return {
        audioClips: state.audioClips.flatMap((x) => (x.id === id ? [first, second] : [x])),
        selectedAudioId: newId,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  // ── 오디오/보이스 소스 보관함 (bin) ──
  addAudioSource: (source) =>
    set((state) => ({ audioSources: [...state.audioSources, source] })),

  removeAudioSource: (id) => {
    const src = get().audioSources.find((s) => s.id === id)
    set((state) => ({ audioSources: state.audioSources.filter((s) => s.id !== id) }))
    // 같은 blob을 쓰는 소스가 더 없으면 IndexedDB blob 삭제
    if (src?.blobKey) {
      const stillUsed = get().audioSources.some((s) => s.blobKey === src.blobKey)
      if (!stillUsed) void deleteAudioBlob(src.blobKey)
    }
  },

  addAudioClipFromSource: (sourceId, startSec) => {
    const src = get().audioSources.find((s) => s.id === sourceId)
    if (!src) return null
    const id = `audio_${audioIdSeq++}`
    set((state) => ({
      audioClips: [
        ...state.audioClips,
        {
          id,
          name: src.name,
          url: src.url,
          startSec: Math.max(0, startSec),
          durationSec: src.durationSec,
          volume: 1,
          muted: false,
          peaks: src.peaks,
          sourceOffsetSec: 0,
          sourceDurationSec: src.durationSec,
          blobKey: src.blobKey,
          sourceId: src.id,
        },
      ],
      selectedAudioId: id,
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    }))
    return id
  },

  // ── 소스 단독 미리보기 (Video Source 클릭) ──
  previewSource: (shotId) => set({ previewSourceShotId: shotId, isPlaying: true }),
  clearPreviewSource: () => set({ previewSourceShotId: null }),

  // ── 전역 볼륨 / bin 드래그 ──
  setMasterVolume: (v) => set({ masterVolume: Math.max(0, Math.min(1, v)) }),
  setBinDragKind: (kind) => set({ binDragKind: kind }),

  // ── 리사이즈 섹션 크기 ──
  setPanelSize: (key, value) =>
    set((state) => {
      const clamped =
        key === 'sourceW'
          ? Math.max(PANEL_SOURCE_W_MIN, Math.min(PANEL_SOURCE_W_MAX, value))
          : Math.max(PANEL_PREVIEW_H_MIN, Math.min(PANEL_PREVIEW_H_MAX, value))
      return { panelSizes: { ...state.panelSizes, [key]: clamped } }
    }),

  // ── 영속화 로드 (loadData 후 호출) — 저장된 편집이 있으면 덮어씀 ──
  loadPersisted: async () => {
    if (typeof window === 'undefined') return
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return
    const saved = await loadEditorState(projectId)
    if (!saved) return
    set({
      shots: saved.shots ?? [],
      clipOrder: saved.clipOrder ?? {},
      videoClips: saved.videoClips ?? [],
      audioClips: saved.audioClips ?? [],
      audioSources: saved.audioSources ?? [],
      panelSizes: saved.panelSizes ?? { ...DEFAULT_PANEL_SIZES },
      selectedClipShotId: null,
      selectedAudioId: null,
      previewSourceShotId: null,
      currentTime: 0,
      isPlaying: false,
      past: [],
      future: [],
    })
  },

  loadData: async () => {
    const projectId = useProjectStore.getState().projectId

    // 1) Try Supabase
    if (projectId) {
      try {
        const supabase = createClient()
        const { data: dbShots } = await supabase
          .from('shots')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order')

        if (dbShots?.length) {
          const shots: Shot[] = dbShots.map((s) => ({
            shotId: s.shot_id,
            sceneId: s.scene_id,
            shotType: s.shot_type,
            actionDescription: s.action_description ?? '',
            characters: s.characters ?? [],
            durationSeconds: s.duration_seconds ?? 5,
            generationMethod: s.generation_method ?? 'T2V',
            dialogueLines: (s.dialogue_lines as DialogueLine[]) ?? [],
            camera: { ...DEFAULT_CAMERA, ...(s.camera_config ?? {}) },
            lighting: { ...DEFAULT_LIGHTING, ...(s.lighting_config ?? {}) },
            referenceImageUrl: s.reference_image ?? null,
          }))

          const videoClips: VideoClip[] = dbShots.map((s) => ({
            shotId: s.shot_id,
            url: s.video_url ?? null,
            status: s.video_url ? 'completed' : 'pending',
            thumbnailUrl: null,
            trimStart: s.trim_start ?? undefined,
            trimEnd: s.trim_end ?? undefined,
            speed: s.speed ?? 1.0,
          }))

          const order = buildClipOrder(shots)
          const firstSceneId = shots[0]?.sceneId ?? null

          set({
            shots,
            videoClips,
            clipOrder: order,
            selectedSceneId: firstSceneId,
            selectedClipShotId: order[firstSceneId!]?.[0] ?? null,
          })
          return
        }
      } catch (err) {
        console.error('[editor-store] DB load failed, falling back:', err)
      }
    }

    // 2) Try upstream director store
    const directorState = useDirectorStore.getState()
    if (directorState.shots.length > 0) {
      const order = buildClipOrder(directorState.shots)
      const firstSceneId = directorState.shots[0]?.sceneId ?? null

      set({
        shots: directorState.shots,
        videoClips: directorState.videoClips,
        clipOrder: order,
        selectedSceneId: firstSceneId,
        selectedClipShotId: order[firstSceneId!]?.[0] ?? null,
      })
      return
    }

    // No data available — keep empty state (don't show fake mock data)
  },

  reset: () =>
    set({
      shots: [],
      videoClips: [],
      selectedSceneId: null,
      selectedClipShotId: null,
      selectedShotIds: [],
      selectedAudioId: null,
      clipOrder: {},
      rendering: false,
      error: null,
      currentTime: 0,
      pxPerSec: PX_PER_SEC_DEFAULT,
      isPlaying: false,
      toolMode: 'select',
      audioClips: [],
      audioSources: [],
      previewSourceShotId: null,
      masterVolume: 1,
      binDragKind: null,
      panelSizes: { ...DEFAULT_PANEL_SIZES },
      past: [],
      future: [],
    }),

  loadMockData: async () => {
    const [{ mockShots }, { mockVideoClips }] = await Promise.all([
      import('@/mocks/shot-sequences'),
      import('@/mocks/video-clips'),
    ])

    const order = buildClipOrder(mockShots)

    set({
      shots: mockShots,
      videoClips: mockVideoClips,
      clipOrder: order,
      selectedSceneId: mockShots[0]?.sceneId ?? null,
      selectedClipShotId: mockShots[0]?.shotId ?? null,
    })
  },

  selectScene: (sceneId) =>
    set((state) => {
      const firstShotId = state.clipOrder[sceneId]?.[0] ?? null
      return {
        selectedSceneId: sceneId,
        selectedClipShotId: firstShotId,
      }
    }),

  // 타임라인 비디오 클립 단일 선택 (교체) — 오디오/소스 미리보기 해제
  selectClip: (shotId) =>
    set({
      selectedClipShotId: shotId,
      selectedShotIds: [shotId],
      selectedAudioId: null,
      previewSourceShotId: null,
    }),

  // ctrl+click — 토글 다중 선택
  toggleClipSelection: (shotId) =>
    set((state) => {
      const has = state.selectedShotIds.includes(shotId)
      const ids = has
        ? state.selectedShotIds.filter((i) => i !== shotId)
        : [...state.selectedShotIds, shotId]
      return {
        selectedShotIds: ids,
        selectedClipShotId: has ? (ids[ids.length - 1] ?? null) : shotId,
        selectedAudioId: null,
        previewSourceShotId: null,
      }
    }),

  // shift+click — 앵커(selectedClipShotId)부터 대상까지 전체 선택 (전역 순서 기준)
  selectClipRange: (shotId) =>
    set((state) => {
      const order = globalOrder(state).map((o) => o.shotId)
      const anchor = state.selectedClipShotId ?? shotId
      const ai = order.indexOf(anchor)
      const bi = order.indexOf(shotId)
      if (ai < 0 || bi < 0) {
        return { selectedShotIds: [shotId], selectedClipShotId: shotId, selectedAudioId: null }
      }
      const [lo, hi] = ai <= bi ? [ai, bi] : [bi, ai]
      return {
        selectedShotIds: order.slice(lo, hi + 1),
        selectedClipShotId: shotId,
        selectedAudioId: null,
        previewSourceShotId: null,
      }
    }),

  // 마퀴 드래그 선택
  setClipSelection: (ids) =>
    set({ selectedShotIds: ids, selectedClipShotId: ids[ids.length - 1] ?? null }),

  clearClipSelection: () => set({ selectedShotIds: [], selectedClipShotId: null }),

  // 오디오 클립 선택 — Del 대상이 오디오로 전환 (비디오 선택 해제)
  selectAudioClip: (id) =>
    set({ selectedAudioId: id, selectedShotIds: [], selectedClipShotId: null }),

  reorderClips: (sceneId, fromIndex, toIndex) => {
    set((state) => {
      const order = [...(state.clipOrder[sceneId] ?? [])]
      const [moved] = order.splice(fromIndex, 1)
      order.splice(toIndex, 0, moved)
      const newOrder = { ...state.clipOrder, [sceneId]: order }

      // Persist to DB (fire-and-forget)
      fetch('/api/editor/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId, clipOrder: order }),
      }).catch((err) => console.error('[editor-store] reorder persist failed:', err))

      return {
        clipOrder: newOrder,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    })
  },

  setTrim: (shotId, trimStart, trimEnd) => {
    set((state) => ({
      videoClips: state.videoClips.map((c) =>
        c.shotId === shotId ? { ...c, trimStart, trimEnd } : c,
      ),
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    }))

    // Persist to DB (fire-and-forget)
    fetch('/api/editor/trim', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shotId, trimStart, trimEnd }),
    }).catch((err) => console.error('[editor-store] trim persist failed:', err))
  },

  setSpeed: (shotId, speed) => {
    const clamped = Math.max(0.25, Math.min(4.0, speed))

    set((state) => ({
      videoClips: state.videoClips.map((c) =>
        c.shotId === shotId ? { ...c, speed: clamped } : c,
      ),
    }))

    // Debounced persist to DB (fire-and-forget)
    const existing = speedPersistTimers.get(shotId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      speedPersistTimers.delete(shotId)
      fetch('/api/editor/speed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shotId, speed: clamped }),
      }).catch((err) => console.error('[editor-store] speed persist failed:', err))
    }, 300)
    speedPersistTimers.set(shotId, timer)
  },

  deleteClip: (shotId) =>
    set((state) => {
      const newOrder: Record<string, string[]> = {}
      for (const [sceneId, ids] of Object.entries(state.clipOrder)) {
        newOrder[sceneId] = ids.filter((id) => id !== shotId)
      }
      return {
        clipOrder: newOrder,
        videoClips: state.videoClips.filter((c) => c.shotId !== shotId),
        selectedShotIds: state.selectedShotIds.filter((id) => id !== shotId),
        selectedClipShotId:
          state.selectedClipShotId === shotId ? null : state.selectedClipShotId,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  deleteSelectedClips: () =>
    set((state) => {
      const ids = new Set(state.selectedShotIds)
      if (ids.size === 0) return state
      const newOrder: Record<string, string[]> = {}
      for (const [sceneId, list] of Object.entries(state.clipOrder)) {
        newOrder[sceneId] = list.filter((id) => !ids.has(id))
      }
      return {
        clipOrder: newOrder,
        videoClips: state.videoClips.filter((c) => !ids.has(c.shotId)),
        selectedShotIds: [],
        selectedClipShotId: null,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  // 드래그 순서변경 — shotId 를 전역 순서의 targetIndex 위치로 이동 (씬 경계 넘으면 sceneId 재배정)
  moveClipToIndex: (shotId, targetIndex) =>
    set((state) => {
      const order = globalOrder(state)
      const movedShot = state.shots.find((s) => s.shotId === shotId)
      if (order.findIndex((o) => o.shotId === shotId) < 0 || !movedShot) return state

      const remaining = order.filter((o) => o.shotId !== shotId)
      const t = Math.max(0, Math.min(targetIndex, remaining.length))

      // shotId 를 모든 씬 order 에서 제거
      const cleared: Record<string, string[]> = {}
      for (const [sceneId, list] of Object.entries(state.clipOrder)) {
        cleared[sceneId] = list.filter((id) => id !== shotId)
      }

      // 대상 위치 → sceneId + 로컬 인덱스
      let sceneId: string
      let localIndex: number
      if (remaining.length === 0) {
        sceneId = movedShot.sceneId
        localIndex = 0
      } else if (t >= remaining.length) {
        sceneId = remaining[remaining.length - 1].sceneId
        localIndex = (cleared[sceneId] ?? []).length
      } else {
        sceneId = remaining[t].sceneId
        const li = (cleared[sceneId] ?? []).indexOf(remaining[t].shotId)
        localIndex = li < 0 ? (cleared[sceneId] ?? []).length : li
      }

      const sceneOrder = [...(cleared[sceneId] ?? [])]
      sceneOrder.splice(localIndex, 0, shotId)
      cleared[sceneId] = sceneOrder

      const shots =
        movedShot.sceneId === sceneId
          ? state.shots
          : state.shots.map((s) => (s.shotId === shotId ? { ...s, sceneId } : s))

      return {
        shots,
        clipOrder: cleared,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  // cut(자르기) for video — atGlobalSec 에서 클립을 둘로 분할.
  // 모델: 1 shot = 1 video clip 이므로, 뒷조각은 synthetic shotId 로 복제하고 trim 으로 구간을 나눈다.
  splitVideoClipAt: (shotId, atGlobalSec) =>
    set((state) => {
      const layout = selectTimelineLayout(state)
      const item = layout.find((l) => l.shotId === shotId)
      const shot = state.shots.find((s) => s.shotId === shotId)
      if (!item || !shot) return state

      const clip = state.videoClips.find((c) => c.shotId === shotId)
      const base = shot.durationSeconds
      const trimStart = clip?.trimStart ?? 0
      const trimEnd = clip?.trimEnd ?? base
      const speed = clip?.speed ?? 1.0
      // 전역 오프셋(타임라인 초) → 소스 시간으로 환산 (속도 반영)
      const srcSplit = trimStart + (atGlobalSec - item.startSec) * speed
      const MIN = 0.1
      if (srcSplit <= trimStart + MIN || srcSplit >= trimEnd - MIN) return state

      const newId = `${shotId}__c${instanceSeq++}`
      const newShot: Shot = { ...shot, shotId: newId }
      const baseClip: VideoClip =
        clip ?? { shotId, url: null, status: 'pending', thumbnailUrl: null }

      const videoClips = state.videoClips.map((c) =>
        c.shotId === shotId ? { ...c, trimStart, trimEnd: srcSplit } : c,
      )
      videoClips.push({ ...baseClip, shotId: newId, trimStart: srcSplit, trimEnd })

      const order = [...(state.clipOrder[shot.sceneId] ?? [])]
      const idx = order.indexOf(shotId)
      if (idx >= 0) order.splice(idx + 1, 0, newId)
      else order.push(newId)

      return {
        shots: [...state.shots, newShot],
        videoClips,
        clipOrder: { ...state.clipOrder, [shot.sceneId]: order },
        selectedClipShotId: shotId,
        selectedAudioId: null,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  // Video Source → 타임라인 드래그-투-애드. atGlobalSec 위치에 새 인스턴스(synthetic) 삽입.
  addClipInstanceAt: (sourceShotId, atGlobalSec) =>
    set((state) => {
      const srcShot = state.shots.find((s) => s.shotId === sourceShotId)
      if (!srcShot) return state
      const srcClip = state.videoClips.find((c) => c.shotId === sourceShotId)

      const newId = `${sourceShotId}__i${instanceSeq++}`
      const newShot: Shot = { ...srcShot, shotId: newId }
      // 새 인스턴스는 소스 전체를 그대로 (trim/speed 초기화)
      const newClip: VideoClip = {
        shotId: newId,
        url: srcClip?.url ?? null,
        status: srcClip?.status ?? 'pending',
        thumbnailUrl: srcClip?.thumbnailUrl ?? null,
      }

      // 드롭 위치 → 전역 삽입 인덱스
      const layout = selectTimelineLayout(state)
      let g = layout.length
      for (let i = 0; i < layout.length; i++) {
        const it = layout[i]
        if (atGlobalSec < it.startSec + it.durationSec / 2) {
          g = i
          break
        }
      }

      const order = globalOrder(state)
      let sceneId: string
      let localIndex: number
      if (order.length === 0) {
        sceneId = srcShot.sceneId
        localIndex = 0
      } else if (g >= order.length) {
        sceneId = order[order.length - 1].sceneId
        localIndex = (state.clipOrder[sceneId] ?? []).length
      } else {
        sceneId = order[g].sceneId
        localIndex = (state.clipOrder[sceneId] ?? []).indexOf(order[g].shotId)
        if (localIndex < 0) localIndex = (state.clipOrder[sceneId] ?? []).length
      }

      const sceneOrder = [...(state.clipOrder[sceneId] ?? [])]
      sceneOrder.splice(localIndex, 0, newId)

      return {
        shots: [...state.shots, newShot],
        videoClips: [...state.videoClips, newClip],
        clipOrder: { ...state.clipOrder, [sceneId]: sceneOrder },
        selectedClipShotId: newId,
        selectedAudioId: null,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  renderDraft: async () => {
    set({ rendering: true, error: null })

    try {
      const { clipOrder, selectedSceneId } = get()

      const res = await fetch('/api/editor/render-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipOrder,
          sceneId: selectedSceneId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Render failed')
      }

      // MVP: just marks render complete (actual video merge is post-MVP)
      set({ rendering: false })
    } catch (err) {
      set({
        rendering: false,
        error: err instanceof Error ? err.message : 'Render failed',
      })
    }
  },
}))

// ── 자동 저장 ────────────────────────────────────────────────────────────────
// 영속화 대상 슬라이스(편집 상태)가 바뀔 때만 저장. currentTime/isPlaying 등 재생
// 상태 변화(60fps)에는 반응하지 않도록 ref 비교로 거른다.
//   1) localStorage (+ IndexedDB blob) — saveEditorState 내부 debounce. 항상 동작.
//   2) /api/editor/state (DB) — best-effort. 테이블 미적용(마이그레이션 전)이면 첫 실패 후 비활성.
let _serverSaveDisabled = false
let _serverSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleServerSave(projectId: string, snapshot: PersistedEditor) {
  if (_serverSaveDisabled) return
  if (_serverSaveTimer) clearTimeout(_serverSaveTimer)
  _serverSaveTimer = setTimeout(() => {
    fetch('/api/editor/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, state: snapshot }),
    })
      .then((r) => {
        if (!r.ok) _serverSaveDisabled = true // 테이블 없음(500) 등 → 세션 동안 서버 저장 중단
      })
      .catch(() => {
        _serverSaveDisabled = true
      })
  }, 1500)
}

if (typeof window !== 'undefined') {
  const pick = (s: EditorState) => ({
    shots: s.shots,
    clipOrder: s.clipOrder,
    videoClips: s.videoClips,
    audioClips: s.audioClips,
    audioSources: s.audioSources,
    panelSizes: s.panelSizes,
  })
  let prev = pick(useEditorStore.getState())

  useEditorStore.subscribe((state) => {
    const cur = pick(state)
    if (
      cur.shots === prev.shots &&
      cur.clipOrder === prev.clipOrder &&
      cur.videoClips === prev.videoClips &&
      cur.audioClips === prev.audioClips &&
      cur.audioSources === prev.audioSources &&
      cur.panelSizes === prev.panelSizes
    ) {
      return // 편집 상태 변화 없음 (재생/선택 등) → 저장 안 함
    }
    prev = cur

    const projectId = useProjectStore.getState().projectId
    if (!projectId) return

    const snapshot: PersistedEditor = { version: 1, ...cur }
    saveEditorState(projectId, snapshot)
    scheduleServerSave(projectId, snapshot)
  })
}
