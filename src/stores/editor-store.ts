import { create } from 'zustand'
import type { Shot, VideoClip, DialogueLine, AudioTrackClip } from '@/types'
import { useProjectStore } from '@/stores/project-store'
import { useDirectorStore } from '@/stores/director-store'
import { createClient } from '@/lib/supabase/client'

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

interface EditorState {
  shots: Shot[]
  videoClips: VideoClip[]
  selectedSceneId: string | null
  selectedClipShotId: string | null
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

  // Undo/Redo (편집 상태 스냅샷 스택)
  past: EditorSnapshot[]
  future: EditorSnapshot[]

  loadData: () => void
  loadMockData: () => void
  reset: () => void
  selectScene: (sceneId: string) => void
  selectClip: (shotId: string) => void
  reorderClips: (sceneId: string, fromIndex: number, toIndex: number) => void
  setTrim: (shotId: string, trimStart: number, trimEnd: number) => void
  setSpeed: (shotId: string, speed: number) => void
  deleteClip: (shotId: string) => void
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

  // 재생 / 도구 / Undo·Redo 액션
  togglePlay: () => void
  setPlaying: (playing: boolean) => void
  setToolMode: (mode: 'select' | 'cut') => void
  nudge: (deltaSec: number) => void   // 화살표 키 프레임 이동
  undo: () => void
  redo: () => void
}

// Undo/Redo가 보존하는 편집 상태 (직렬화 가능한 값만)
interface EditorSnapshot {
  clipOrder: Record<string, string[]>
  videoClips: VideoClip[]
  audioClips: AudioTrackClip[]
}

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
    clipOrder: structuredClone(state.clipOrder),
    videoClips: structuredClone(state.videoClips),
    audioClips: structuredClone(state.audioClips),
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  shots: [],
  videoClips: [],
  selectedSceneId: null,
  selectedClipShotId: null,
  clipOrder: {},
  rendering: false,
  error: null,
  sourcePanelOpen: true,
  currentTime: 0,
  pxPerSec: PX_PER_SEC_DEFAULT,
  isPlaying: false,
  toolMode: 'select',
  audioClips: [],
  past: [],
  future: [],

  toggleSourcePanel: () => set((state) => ({ sourcePanelOpen: !state.sourcePanelOpen })),

  togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setToolMode: (mode) => set({ toolMode: mode }),

  nudge: (deltaSec) => get().seek(get().currentTime + deltaSec),

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
      }
    }),

  setPxPerSec: (px) =>
    set({ pxPerSec: Math.max(PX_PER_SEC_MIN, Math.min(PX_PER_SEC_MAX, px)) }),

  addAudioClip: (clip) => {
    const id = `audio_${audioIdSeq++}`
    set((state) => ({
      audioClips: [
        ...state.audioClips,
        { ...clip, id, volume: 1, muted: false },
      ],
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
    })),

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
      clipOrder: {},
      rendering: false,
      error: null,
      currentTime: 0,
      pxPerSec: PX_PER_SEC_DEFAULT,
      isPlaying: false,
      toolMode: 'select',
      audioClips: [],
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

  selectClip: (shotId) => set({ selectedClipShotId: shotId }),

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
        selectedClipShotId:
          state.selectedClipShotId === shotId ? null : state.selectedClipShotId,
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
