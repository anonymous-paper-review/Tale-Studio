import { create } from 'zustand'
import type { ShotSubtitle, TitleCardData } from '@/types/shot'
import { resolveSubtitle } from '@/lib/editor/subtitle'
import type { Shot, VideoClip, DialogueLine, AudioTrackClip, AudioSource, ClipTransition } from '@/types'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/project-store'
import { createClient } from '@/lib/supabase/client'
import { cancelShotsLoad, loadShotsResult } from '@/lib/shots-cache'
import {
  selectHandoffTake,
  selectLatestAttempt,
  type VideoTakeSelectionRecord,
} from '@/lib/director-video-take-selection'
import {
  saveEditorState,
  saveEditorStateNow,
  loadEditorState,
  deleteAudioBlob,
  type PersistedEditor,
} from '@/lib/editor-persistence'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'

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
type HandoffClip = VideoTakeSelectionRecord & {
  shot_id?: unknown
  thumbnail_url?: unknown
  last_attempt_status?: unknown
}


// Each persistence read is tied to the project that initiated it. A late read must
// never apply local state to the project selected while it was in flight.
let persistedLoadEpoch = 0
let editorLoadEpoch = 0

// Editor 를 열 때 샷 · 영상 목록을 기다리는 한도(QA 2026-11-03 밤 "Editor에서 무한 로딩") — 넘으면 기다림을 멈추고
//   "클립을 불러오지 못했어요" + [다시 시도]. 연결이 멈추거나 로그인 갱신이 걸리면 읽기가 끝나지 않았다.
//   약속: tests/editor/load-ends.test.ts
export const EDITOR_LOAD_TIMEOUT_MS = 20_000

// 이 문장은 실패 화면에 그대로 보인다 — 화면 언어로 낸다(2026-11-04 리드 2차 검토).
function timeoutError(ms: number): Error {
  return new Error(translate(useLocaleStore.getState().locale, 'Loading timed out after {seconds} seconds.', { seconds: Math.round(ms / 1000) }))
}

// Per-shot debounce timers for speed persist (300ms)
const speedPersistTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Per-shot debounce timers for trim persist (300ms) — speed 와 동일 패턴 (#a3-state-loss)
const trimPersistTimers = new Map<string, ReturnType<typeof setTimeout>>()

// 컷/드래그-투-애드/타이틀카드가 만드는 로컬 전용 조각(shot_id 에 __c/__i/__t 접미).
//   DB shots 에 행이 없으므로 트림 write-through 대상에서 제외하고,
//   loadPersisted 가 editor_states 스냅샷에서 복원한다 (#a3-state-loss, #owner-title-card).
const SYNTHETIC_SHOT_RE = /__(?:c|i|t)[A-Za-z0-9-]+$/
export function isSyntheticShotId(shotId: string): boolean {
  return SYNTHETIC_SHOT_RE.test(shotId)
}
export function baseShotIdOf(shotId: string): string {
  return shotId.replace(SYNTHETIC_SHOT_RE, '')
}
// 조각을 또 자른 조각(`원본__cA__cB`)도 맨 처음 원본 샷까지 거슬러 간다 — 한 겹만 벗기면 원본을 못 찾아
//   다시 열 때 셋째 조각을 버렸다(2026-11-10). 약속: tests/editor/reopen-edits.test.ts
function rootShotIdOf(shotId: string): string {
  let id = shotId
  while (isSyntheticShotId(id)) id = baseShotIdOf(id)
  return id
}

// 타이틀 카드 판별(#owner-title-card) — __t 접미. baseShotIdOf 대상이 없다(독립 클립, 원본 shot 미연결).
// 약속 J2(2026-09-04): 타이틀 카드를 가운데서 자르면 조각 id 가 `title__tX__cY` 가 된다 — 접미가 __t 로 끝나지 않아도
//   타이틀 카드다. 옛 정규식(/__t…$/)은 자른 조각을 못 알아봐 새로고침 복원에서 버렸다(사라지는 버그의 원인).
const TITLE_CARD_RE = /__t[A-Za-z0-9-]+(?:__[ci][A-Za-z0-9-]+)*$/
export function isTitleCardShotId(shotId: string): boolean {
  return TITLE_CARD_RE.test(shotId)
}

// 고유 id 생성. 모듈 카운터는 HMR/새로고침 후 리셋되어 영속화된 id 와 충돌(audio_1 중복 등)
// → React key 중복 + 같은 id 클립 일괄 토글 버그 유발. crypto.randomUUID 로 충돌 원천 차단.
function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

interface EditorState {
  shots: Shot[]
  videoClips: VideoClip[]
  selectedSceneId: string | null
  selectedClipShotId: string | null   // 다중 선택의 앵커/대표 (range 기준)
  selectedShotIds: string[]           // 다중 선택된 비디오 클립
  selectedAudioId: string | null      // 다중 선택의 앵커/대표 (range 기준, Del 대상 구분)
  selectedAudioIds: string[]          // 다중 선택된 오디오 클립 (marquee/Ctrl/Shift)
  clipOrder: Record<string, string[]> // sceneId → shotId[]
  error: string | null
  // #pps-empty-states(2026-08-27): shots=0 의 세 이유(로딩/실패/정상 빈)를 화면이 구분하게 하는
  //   로드 상태. 'idle' 은 loadData 발화 전 첫 렌더 — 화면은 로딩과 동일하게 취급한다.
  loadStatus: 'idle' | 'loading' | 'error' | 'ready'
  // 편집 상태를 비운(reset) 횟수 — 열린 Editor 화면이 이 값이 바뀌면 다시 읽는다. 프로젝트를 여는 길(switchProject)은
  //   store 들을 늦게(비동기로) 비워, 화면이 읽기 시작한 뒤에 비우면 읽던 결과가 버려진 채 기다림이 끝나지 않았다.
  resetCount: number
  // 영상을 불러오지 못한 클립 주소(404 · 막힘 · 끊김) — 그 클립만 "불러오지 못함"으로 보인다. 저장하지 않고, 다시 읽으면 지운다.
  unplayableVideoUrls: string[]
  // 편집 상태를 준비하는 중(Editor 를 열 때 — 저장한 편집 되살리기, 처음이면 영상 소리를 오디오 칸에 나누고 파형 채우기 · 저장).
  //   null 이 아니면 화면은 편집 화면 대신 기다리는 카드를 보이고, 편집 상태를 저장하지 않는다. done/total 은 파형을 채운 소리 수(오너 2026-11-10).
  editorPrep: { done: number; total: number } | null

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
  // 오디오 트랙(레인) 목록 — 멀티 트랙 (프리미어식). 기본 1개. muted=트랙 전체 음소거
  audioTracks: { id: string; muted?: boolean }[]

  // 소스 클립 단독 미리보기 (Video Source 클릭 시). null이면 타임라인(플레이헤드) 모드.
  previewSourceShotId: string | null

  // 전역 재생 볼륨 0~1 (재생 전용 — draft 생성과 무관)
  masterVolume: number

  // bin→트랙 포인터 드래그 중 드롭존 하이라이트 ('video'|'audio'|null)
  binDragKind: 'video' | 'audio' | null
  // bin→비디오 트랙 드래그 중 삽입 위치(초). 드롭 인디케이터용
  binDropSec: number | null

  // 리사이즈 섹션 크기 (px). 영속화 대상.
  panelSizes: { sourceW: number; previewH: number }

  // Undo/Redo (편집 상태 스냅샷 스택)
  past: EditorSnapshot[]
  future: EditorSnapshot[]

  loadData: () => void
  reset: () => void
  /** 빈 주소는 무시한다. */
  markVideoUnplayable: (url: string | null | undefined) => void
  selectScene: (sceneId: string) => void
  selectClip: (shotId: string) => void                 // 단일 선택 (교체)
  toggleClipSelection: (shotId: string) => void        // ctrl+click
  selectClipRange: (shotId: string) => void            // shift+click (앵커~대상)
  setClipSelection: (ids: string[]) => void            // 마퀴 드래그 선택
  clearClipSelection: () => void
  selectAudioClip: (id: string) => void                // 단일 선택 (교체)
  toggleAudioSelection: (id: string) => void           // ctrl+click 토글 다중
  selectAudioRange: (id: string) => void               // shift+click 순차(앵커~대상)
  setAudioSelection: (ids: string[]) => void           // 마퀴 드래그 선택
  clearAudioSelection: () => void
  deleteSelectedAudio: () => void                       // 선택된 오디오 일괄 삭제
  setSpeed: (shotId: string, speed: number) => void
  deleteClip: (shotId: string) => void
  deleteSelectedClips: () => void                       // 선택된 클립 일괄 삭제
  moveClipToIndex: (shotId: string, targetIndex: number) => void  // 드래그 순서변경
  addClipAtPlayhead: (sourceShotId: string) => void     // 소스→플레이헤드 인접 경계에 추가+포커스
  // cut(자르기) — 비디오 클립을 전역 시간 atSec 지점에서 둘로 분할
  splitVideoClipAt: (shotId: string, atGlobalSec: number) => void
  // Video Source → 타임라인 드래그-투-애드 (atSec 위치에 새 인스턴스 삽입)
  addClipInstanceAt: (sourceShotId: string, atGlobalSec: number) => void
  // 타이틀 카드(#owner-title-card) — 검은 배경+텍스트(+선택 이미지) synthetic 클립을 atGlobalSec
  //   인접 경계에 삽입. 길이는 기존 트림 문법(setTrim)을 재사용.
  addTitleCard: (atGlobalSec: number) => void
  // 타이틀 카드 텍스트/이미지 갱신(인스펙터/더블클릭 편집). history 는 호출부가 관리.
  updateTitleCard: (shotId: string, patch: Partial<TitleCardData>) => void
  /** 약속 J3·J4: 타이틀 카드 길이를 초 단위 숫자로 — 5초를 넘을 수 있다. */
  setTitleCardDuration: (shotId: string, seconds: number) => void
  /** 약속 K: 클립 자막(글자·자리) — 손대는 순간 대사 초기값이 저장값이 된다. null 이면 지운다. */
  setSubtitle: (shotId: string, patch: Partial<ShotSubtitle> | null) => void
  /** 화면 전환(2026-09-08): 클립 앞 경계의 디졸브를 넣거나(길이) 뺀다(null). 되돌리기 대상. */
  setTransitionIn: (shotId: string, transition: ClipTransition | null) => void

  // Video Source 패널 액션
  toggleSourcePanel: () => void

  // 통합 타임라인 액션
  seek: (timeSec: number) => void          // playhead 이동 (+ 해당 클립 자동 선택)
  setPxPerSec: (px: number) => void        // zoom 설정 (clamp 8~240)

  // 오디오 트랙 액션
  addAudioClip: (clip: Omit<AudioTrackClip, 'id' | 'volume' | 'muted'>) => string
  moveAudioClip: (id: string, startSec: number, trackId?: string) => void
  setAudioVolume: (id: string, volume: number) => void
  toggleAudioMute: (id: string) => void
  removeAudioClip: (id: string) => void
  splitAudioClipAt: (id: string, atGlobalSec: number) => void   // cut(자르기) for audio

  // 오디오/보이스 소스 보관함 (bin)
  addAudioSource: (source: AudioSource) => void
  removeAudioSource: (id: string) => void
  addAudioClipFromSource: (sourceId: string, startSec: number, trackId?: string) => string | null

  // 오디오 멀티 트랙
  addAudioTrack: () => void
  removeAudioTrack: (trackId: string) => void
  toggleAudioTrackMute: (trackId: string) => void   // 트랙 전체 음소거 토글

  // 소스 단독 미리보기 (Video Source 클릭)
  previewSource: (shotId: string) => void
  clearPreviewSource: () => void

  // 리사이즈 섹션 크기 + 영속화
  setPanelSize: (key: 'sourceW' | 'previewH', value: number) => void
  /** 이 브라우저에 저장한 편집을 되살린다 — 되살렸으면 true(저장한 편집이 없거나 그새 다른 프로젝트로 바뀌었으면 false). */
  loadPersisted: () => Promise<boolean>
  setEditorPrep: (prep: { done: number; total: number } | null) => void

  // 전역 볼륨 / bin 드래그 하이라이트
  setMasterVolume: (v: number) => void
  setBinDragKind: (kind: 'video' | 'audio' | null) => void
  setBinDropSec: (sec: number | null) => void

  // 드래그 중 클립 필드 라이브 갱신 (history/persist 스팸 방지 — pushHistory는 드래그 시작 1회)
  updateVideoClip: (shotId: string, patch: Partial<VideoClip>) => void
  updateAudioClip: (id: string, patch: Partial<AudioTrackClip>) => void

  // 트림 확정(핸들 드롭) — 로컬 갱신 + canonical 샷이면 DB write-through (#a3-state-loss)
  setTrim: (shotId: string, trimStart: number, trimEnd: number) => void

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
  audioTracks: { id: string; muted?: boolean }[]
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
/** 축척 +/− 한 단계(2026-09-08 오너 지시 5번): ×1.25 / ÷1.25, 한계 안에서. */
export function zoomStep(px: number, dir: 'in' | 'out'): number {
  const next = dir === 'in' ? px * 1.25 : px / 1.25
  return Math.max(PX_PER_SEC_MIN, Math.min(PX_PER_SEC_MAX, next))
}

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
    // #d11: 수동 트림이 없으면 실측 파일 길이로 자동 트림 — 계획이 실제보다 길면(시간 인플레이션
    //   +모델 최소 길이) 영상이 끝난 뒤 죽은 꼬리가 재생되던 것을 잘라낸다.
    const trimEnd = clip?.trimEnd ?? Math.min(base, clip?.actualDurationSec ?? base)
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
    audioTracks: structuredClone(state.audioTracks),
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

// 오디오 클립의 "순차" 순서 — 트랙 순서 → 트랙 내 시작초. shift+click range 기준.
function globalAudioOrder(
  state: Pick<EditorState, 'audioClips' | 'audioTracks'>,
): string[] {
  const trackIndex = new Map(state.audioTracks.map((t, i) => [t.id, i]))
  const first = state.audioTracks[0]?.id ?? ''
  return [...state.audioClips]
    .sort((a, b) => {
      const ta = trackIndex.get(a.trackId ?? first) ?? 0
      const tb = trackIndex.get(b.trackId ?? first) ?? 0
      if (ta !== tb) return ta - tb
      return a.startSec - b.startSec
    })
    .map((a) => a.id)
}

export const useEditorStore = create<EditorState>((set, get) => ({
  shots: [],
  videoClips: [],
  selectedSceneId: null,
  selectedClipShotId: null,
  selectedShotIds: [],
  selectedAudioId: null,
  selectedAudioIds: [],
  clipOrder: {},
  error: null,
  loadStatus: 'idle',
  resetCount: 0,
  unplayableVideoUrls: [],
  editorPrep: null,
  sourcePanelOpen: true,
  currentTime: 0,
  pxPerSec: PX_PER_SEC_DEFAULT,
  isPlaying: false,
  toolMode: 'select',
  audioClips: [],
  audioSources: [],
  audioTracks: [{ id: 'atrack_1' }],
  previewSourceShotId: null,
  masterVolume: 1,
  binDragKind: null,
  binDropSec: null,
  panelSizes: { ...DEFAULT_PANEL_SIZES },
  past: [],
  future: [],

  toggleSourcePanel: () => set((state) => ({ sourcePanelOpen: !state.sourcePanelOpen })),

  setEditorPrep: (prep) => set({ editorPrep: prep }),

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
      // 상한 클램프 제거 — 영상 끝을 넘어 오디오 편집 영역까지 플레이헤드 이동 허용 (요청 5)
      const t = Math.max(0, timeSec)
      // playhead 아래 클립을 자동 선택 (프리뷰 동기화)
      const layout = selectTimelineLayout(state)
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
    const id = `audio_${uid()}`
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
      selectedAudioIds: [id],
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    }))
    return id
  },

  moveAudioClip: (id, startSec, trackId) =>
    set((state) => ({
      audioClips: state.audioClips.map((a) =>
        a.id === id
          ? { ...a, startSec: Math.max(0, startSec), ...(trackId ? { trackId } : {}) }
          : a,
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

  removeAudioClip: (id) =>
    set((state) => ({
      audioClips: state.audioClips.filter((a) => a.id !== id),
      selectedAudioId: state.selectedAudioId === id ? null : state.selectedAudioId,
      selectedAudioIds: state.selectedAudioIds.filter((x) => x !== id),
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
      const newId = `audio_${uid()}`
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
        selectedAudioIds: [newId],
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

  addAudioClipFromSource: (sourceId, startSec, trackId) => {
    const src = get().audioSources.find((s) => s.id === sourceId)
    if (!src) return null
    const id = `audio_${uid()}`
    const lane = trackId ?? get().audioTracks[0]?.id ?? 'atrack_1'
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
          trackId: lane,
        },
      ],
      selectedAudioId: id,
      selectedAudioIds: [id],
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    }))
    return id
  },

  addAudioTrack: () =>
    set((state) => ({
      audioTracks: [...state.audioTracks, { id: `atrack_${uid()}` }],
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    })),

  removeAudioTrack: (trackId) =>
    set((state) => {
      if (state.audioTracks.length <= 1) return state // 최소 1개 트랙 유지
      const firstId = state.audioTracks[0]?.id
      return {
        audioTracks: state.audioTracks.filter((t) => t.id !== trackId),
        // 해당 레인의 클립 제거 (trackId 없으면 첫 트랙 소속으로 간주)
        audioClips: state.audioClips.filter((c) => (c.trackId ?? firstId) !== trackId),
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  // 트랙 전체 음소거 토글 — 재생 시 audio-meter 가 clip.muted || track.muted 로 볼륨 0 처리.
  toggleAudioTrackMute: (trackId) =>
    set((state) => ({
      audioTracks: state.audioTracks.map((t) =>
        t.id === trackId ? { ...t, muted: !t.muted } : t,
      ),
    })),

  // ── 소스 단독 미리보기 (Video Source 클릭) ──
  previewSource: (shotId) => set({ previewSourceShotId: shotId, isPlaying: true }),
  clearPreviewSource: () => set({ previewSourceShotId: null }),

  // ── 전역 볼륨 / bin 드래그 ──
  setMasterVolume: (v) => set({ masterVolume: Math.max(0, Math.min(1, v)) }),
  setBinDragKind: (kind) => set({ binDragKind: kind }),
  setBinDropSec: (sec) => set({ binDropSec: sec }),

  updateVideoClip: (shotId, patch) =>
    set((state) => ({
      videoClips: state.videoClips.map((c) => (c.shotId === shotId ? { ...c, ...patch } : c)),
    })),
  updateAudioClip: (id, patch) =>
    set((state) => ({
      audioClips: state.audioClips.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  // ── 리사이즈 섹션 크기 ──
  setPanelSize: (key, value) =>
    set((state) => {
      const clamped =
        key === 'sourceW'
          ? Math.max(PANEL_SOURCE_W_MIN, Math.min(PANEL_SOURCE_W_MAX, value))
          : Math.max(PANEL_PREVIEW_H_MIN, Math.min(PANEL_PREVIEW_H_MAX, value))
      return { panelSizes: { ...state.panelSizes, [key]: clamped } }
    }),

  // ── 영속화 로드 (loadData 후 호출) — canonical media is never restored locally ──
  loadPersisted: async () => {
    if (typeof window === 'undefined') return false
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return false
    const loadToken = ++persistedLoadEpoch
    const saved = await loadEditorState(projectId)
    if (
      !saved ||
      persistedLoadEpoch !== loadToken ||
      useProjectStore.getState().projectId !== projectId
    ) return false

    // 복구: 이전 버전(모듈 카운터)에서 중복된 트랙/오디오 클립 id 제거
    const seenTracks = new Set<string>()
    const dedupTracks: { id: string }[] = []
    for (const t of saved.audioTracks ?? []) {
      if (!seenTracks.has(t.id)) {
        seenTracks.add(t.id)
        dedupTracks.push(t)
      }
    }
    if (dedupTracks.length === 0) dedupTracks.push({ id: 'atrack_1' })
    const validTrackIds = new Set(dedupTracks.map((t) => t.id))
    const seenClips = new Set<string>()
    const dedupAudioClips = (saved.audioClips ?? []).map((c) => {
      const id = seenClips.has(c.id) ? `audio_${uid()}` : c.id
      seenClips.add(id)
      const trackId = c.trackId && validTrackIds.has(c.trackId) ? c.trackId : dedupTracks[0].id
      return { ...c, id, trackId }
    })

    const cur = get()
    const canonicalShotIds = new Set(cur.shots.map((shot) => shot.shotId))

    // Synthetic piece restore (#a3-state-loss 2026-08-26): cut/drag-to-add pieces (__c/__i)
    // exist only in the editor - loadData rebuilds from DB shots and dropped them, so a mere
    // tab visit reverted every cut (reproduced: evidence/a3-0*.png). Restore a saved piece
    // only when its base shot is still canonical: deleted media must not resurrect, and the
    // piece replays the base clip's *current* url so regenerated takes flow through.
    const savedClipByShot = new Map((saved.videoClips ?? []).map((c) => [c.shotId, c]))
    const baseClipByShot = new Map(cur.videoClips.map((c) => [c.shotId, c]))
    const baseShotById = new Map(cur.shots.map((s) => [s.shotId, s]))
    const restoredShots: Shot[] = []
    const restoredClips: VideoClip[] = []
    // 잘라 낸 조각을 되살린 원본 샷 — 자르기가 바꾼 앞 조각(원본)의 구간은 DB 에 쓰지 않으므로 저장한 편집에서 되살린다(2026-11-10).
    const cutRoots = new Set<string>()
    for (const savedShot of saved.shots ?? []) {
      if (!isSyntheticShotId(savedShot.shotId)) continue
      if (canonicalShotIds.has(savedShot.shotId)) continue
      // 타이틀 카드(#owner-title-card)는 원본 shot에 연결되지 않은 독립 클립 — base shot 검증을 건너뛰고
      // 저장된 shot/clip을 그대로 복원한다 (텍스트/이미지/길이 모두 스냅샷에 있음).
      if (isTitleCardShotId(savedShot.shotId)) {
        restoredShots.push(savedShot)
        const savedClip = savedClipByShot.get(savedShot.shotId)
        restoredClips.push({
          shotId: savedShot.shotId,
          url: null,
          status: 'completed',
          thumbnailUrl: null,
          trimStart: savedClip?.trimStart,
          trimEnd: savedClip?.trimEnd,
          speed: savedClip?.speed ?? 1.0,
          transitionIn: savedClip?.transitionIn ?? null,
        })
        canonicalShotIds.add(savedShot.shotId)
        continue
      }
      const base = baseShotById.get(rootShotIdOf(savedShot.shotId))
      if (!base) continue
      if (savedShot.shotId.includes('__c')) cutRoots.add(base.shotId)
      restoredShots.push({ ...savedShot, sceneId: base.sceneId, durationSeconds: base.durationSeconds })
      const savedClip = savedClipByShot.get(savedShot.shotId)
      const baseClip = baseClipByShot.get(base.shotId)
      restoredClips.push({
        shotId: savedShot.shotId,
        url: baseClip?.url ?? null,
        status: baseClip?.status ?? 'pending',
        thumbnailUrl: baseClip?.thumbnailUrl ?? null,
        trimStart: savedClip?.trimStart,
        trimEnd: savedClip?.trimEnd,
        speed: savedClip?.speed ?? 1.0,
        transitionIn: savedClip?.transitionIn ?? null,
      })
      canonicalShotIds.add(savedShot.shotId)
    }
    // 약속 K8: 자막은 새로고침해도 남는다 — DB 에서 온 원본 샷에도 스냅샷의 자막(글자·자리)을 다시 입힌다.
    const savedSubtitleById = new Map<string, ShotSubtitle | null>()
    for (const savedShot of saved.shots ?? []) {
      if (savedShot.subtitle !== undefined) savedSubtitleById.set(savedShot.shotId, savedShot.subtitle ?? null)
    }
    const baseShots = savedSubtitleById.size
      ? cur.shots.map((s) => (savedSubtitleById.has(s.shotId) ? { ...s, subtitle: savedSubtitleById.get(s.shotId) ?? null } : s))
      : cur.shots
    const combinedShots = restoredShots.length ? [...baseShots, ...restoredShots] : baseShots
    // 자른 앞 조각(원본)의 구간은 저장한 편집에서 되살린다 — 그 밖의 원본 구간은 DB 값(손잡이로 바꾼 구간은 DB 에도 쓴다).
    const baseClips = cutRoots.size
      ? cur.videoClips.map((c) => {
          const savedClip = cutRoots.has(c.shotId) ? savedClipByShot.get(c.shotId) : undefined
          return savedClip && (savedClip.trimStart !== undefined || savedClip.trimEnd !== undefined)
            ? { ...c, trimStart: savedClip.trimStart, trimEnd: savedClip.trimEnd }
            : c
        })
      : cur.videoClips
    const combinedClips = restoredClips.length ? [...baseClips, ...restoredClips] : baseClips

    const canonicalOrder = new Map<string, string[]>()
    for (const shot of combinedShots) {
      const order = canonicalOrder.get(shot.sceneId) ?? []
      order.push(shot.shotId)
      canonicalOrder.set(shot.sceneId, order)
    }
    // 저장할 때 있던 샷이 저장한 순서에 없으면 사람이 타임라인에서 지운 것이다 — 되살리지 않는다.
    //   저장한 뒤에 새로 생긴 샷만 씬 끝에 붙인다(2026-11-10, 약속: tests/editor/reopen-edits.test.ts).
    const savedShotIds = new Set((saved.shots ?? []).map((s) => s.shotId))
    const clipOrder: Record<string, string[]> = {}
    for (const [sceneId, canonicalIds] of canonicalOrder) {
      const savedIds = saved.clipOrder?.[sceneId] ?? []
      const retained = savedIds.filter(
        (shotId, index) => canonicalShotIds.has(shotId) && savedIds.indexOf(shotId) === index,
      )
      clipOrder[sceneId] = [...retained, ...canonicalIds.filter((id) => !retained.includes(id) && !savedShotIds.has(id))]
    }
    set({
      // Canonical shots/videoClips come from loadData (DB truth). Only synthetic editor
      // pieces whose base shot is still canonical are merged back in above - a local
      // snapshot must not resurrect deleted media when that DB snapshot is empty.
      shots: combinedShots,
      videoClips: combinedClips,
      clipOrder,
      audioClips: dedupAudioClips,
      audioSources: saved.audioSources ?? [],
      audioTracks: dedupTracks,
      panelSizes: saved.panelSizes ?? { ...DEFAULT_PANEL_SIZES },
      selectedClipShotId: cur.selectedClipShotId,
      selectedShotIds: [],
      selectedAudioId: null,
      selectedAudioIds: [],
      previewSourceShotId: null,
      currentTime: 0,
      isPlaying: false,
      past: [],
      future: [],
    })
    return true
  },

  loadData: async () => {
    const loadEpoch = ++editorLoadEpoch
    const projectId = useProjectStore.getState().projectId
    set({ loadStatus: 'loading' })
    const emptyProjectData = {
      shots: [] as Shot[],
      videoClips: [] as VideoClip[],
      clipOrder: {} as Record<string, string[]>,
      selectedSceneId: null,
      selectedClipShotId: null,
      selectedShotIds: [] as string[],
      selectedAudioId: null,
      selectedAudioIds: [] as string[],
      previewSourceShotId: null,
      currentTime: 0,
      isPlaying: false,
      audioClips: [] as AudioTrackClip[],
      audioSources: [] as AudioSource[],
      audioTracks: [{ id: 'atrack_1' }],
      binDragKind: null,
      binDropSec: null,
      unplayableVideoUrls: [] as string[],
    }

    // 1) Try Supabase
    if (projectId) {
      try {
        const supabase = createClient()
        // 한도(EDITOR_LOAD_TIMEOUT_MS) 안에 못 받으면 기다림을 멈추고 실패로 알린다. 샷은 같은 요청을 함께 기다리는 사물함이라
        //   그 칸의 멈춘 요청을 취소해 둔다 — 그대로 두면 [다시 시도]도 같은 요청에 붙어 또 멈춘다.
        let timer: ReturnType<typeof setTimeout> | undefined
        const timedOut = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            cancelShotsLoad(projectId)
            reject(timeoutError(EDITOR_LOAD_TIMEOUT_MS))
          }, EDITOR_LOAD_TIMEOUT_MS)
        })
        const [{ data: dbShots, error: shotsError }, { data: dbClips, error: clipsError }] = await Promise.race([
          Promise.all([
            loadShotsResult(projectId),
            supabase
              .from('video_clips')
              .select('id, shot_id, url, status, is_final, take_number, created_at, deleted_at, thumbnail_url, last_attempt_status, last_attempt_at')
              .eq('project_id', projectId),
          ]),
          timedOut,
        ]).finally(() => clearTimeout(timer))
        if (
          editorLoadEpoch !== loadEpoch ||
          useProjectStore.getState().projectId !== projectId
        ) {
          return
        }
        if (shotsError) throw new Error(`Editor shots load failed: ${shotsError.message}`)
        if (clipsError) throw new Error(`Editor video clips load failed: ${clipsError.message}`)

        // The thumbnail must represent the same successful take chosen for export/editor handoff.
        const clipsByShot = new Map<string, HandoffClip[]>()
        for (const clip of dbClips ?? []) {
          if (typeof clip.shot_id !== 'string') continue
          const clips = clipsByShot.get(clip.shot_id) ?? []
          clips.push(clip)
          clipsByShot.set(clip.shot_id, clips)
        }
        const handoffByShot = new Map<string, HandoffClip>()
        const latestAttemptByShot = new Map<string, HandoffClip>()
        for (const [shotId, clips] of clipsByShot) {
          const handoff = selectHandoffTake(clips)
          if (handoff) handoffByShot.set(shotId, handoff)
          const latestAttempt = selectLatestAttempt(clips)
          if (latestAttempt) latestAttemptByShot.set(shotId, latestAttempt)
        }

        if (dbShots?.length) {
          const shots: Shot[] = dbShots.map((s) => ({
            shotId: s.shot_id,
            sceneId: s.scene_id,
            shotType: s.shot_type as Shot['shotType'],
            actionDescription: s.action_description ?? '',
            characters: s.characters ?? [],
            durationSeconds: s.duration_seconds ?? 5,
            generationMethod: (s.generation_method ?? 'T2V') as Shot['generationMethod'],
            dialogueLines: (s.dialogue_lines ?? []) as unknown as DialogueLine[],
            camera: { ...DEFAULT_CAMERA, ...((s.camera_config ?? {}) as object) },
            lighting: { ...DEFAULT_LIGHTING, ...((s.lighting_config ?? {}) as object) },
            referenceImageUrl: s.reference_image ?? null,
          }))

          const videoClips: VideoClip[] = dbShots.map((s) => {
            const relationalRows = clipsByShot.get(s.shot_id) ?? []
            const handoff = handoffByShot.get(s.shot_id)
            const handoffUrl =
              typeof handoff?.url === 'string' && handoff.url.trim()
                ? handoff.url.trim()
                : null
            const legacyUrl =
              relationalRows.length === 0 &&
              typeof s.video_url === 'string' &&
              s.video_url.trim()
                ? s.video_url.trim()
                : null
            const url = handoffUrl ?? legacyUrl
            const latestStatus =
              latestAttemptByShot.get(s.shot_id)?.last_attempt_status ??
              latestAttemptByShot.get(s.shot_id)?.status
            const status: VideoClip['status'] = url
              ? 'completed'
              : latestStatus === 'failed'
                ? 'failed'
                : latestStatus === 'generating' ||
                    latestStatus === 'queued' ||
                    latestStatus === 'processing'
                  ? 'generating'
                  : 'pending'
            const thumbnailUrl =
              typeof handoff?.thumbnail_url === 'string' &&
              handoff.thumbnail_url.trim()
                ? handoff.thumbnail_url.trim()
                : null
            return {
              shotId: s.shot_id,
              url,
              status,
              thumbnailUrl,
              trimStart: s.trim_start ?? undefined,
              trimEnd: s.trim_end ?? undefined,
              speed: s.speed ?? 1.0,
            }
          })

          const order = buildClipOrder(shots)
          const firstSceneId = shots[0]?.sceneId ?? null

          set({
            ...emptyProjectData,
            shots,
            videoClips,
            clipOrder: order,
            selectedSceneId: firstSceneId,
            selectedClipShotId: order[firstSceneId!]?.[0] ?? null,
            error: null,
            loadStatus: 'ready',
          })
          return
        }
        set({ ...emptyProjectData, error: null, loadStatus: 'ready' })
        return
      } catch (err) {
        console.error('[editor-store] DB load failed:', err)
        if (editorLoadEpoch !== loadEpoch || useProjectStore.getState().projectId !== projectId) {
          return
        }
        set({
          ...emptyProjectData,
          error: err instanceof Error ? err.message : 'Editor data load failed',
          loadStatus: 'error',
        })
        return
      }
    }

    // 2) DB가 단일 진실 (unify-director-store-db Step 1) — 옛 director-store fallback 제거.
    //    Director 캔버스 편집은 Step 0 write-through로 DB shots에 반영되므로 위 (1) 경로가 캐넌.

    set({ ...emptyProjectData, error: null, loadStatus: 'ready' })
  },

  reset: () => {
    ++editorLoadEpoch
    ++persistedLoadEpoch
    set((state) => ({
      resetCount: state.resetCount + 1,
      unplayableVideoUrls: [],
      editorPrep: null,
      shots: [],
      videoClips: [],
      selectedSceneId: null,
      selectedClipShotId: null,
      selectedShotIds: [],
      selectedAudioId: null,
      selectedAudioIds: [],
      clipOrder: {},
      error: null,
      loadStatus: 'idle',
      currentTime: 0,
      pxPerSec: PX_PER_SEC_DEFAULT,
      isPlaying: false,
      toolMode: 'select',
      audioClips: [],
      audioSources: [],
      audioTracks: [{ id: 'atrack_1' }],
      previewSourceShotId: null,
      masterVolume: 1,
      binDragKind: null,
      panelSizes: { ...DEFAULT_PANEL_SIZES },
      past: [],
      future: [],
    }))
  },

  // 영상을 불러오지 못한 클립(미리 보기 · 열 때의 길이 재기가 영상 오류를 받음) — 그 클립만 "불러오지 못함".
  markVideoUnplayable: (url) =>
    set((state) => (!url || state.unplayableVideoUrls.includes(url) ? state : { unplayableVideoUrls: [...state.unplayableVideoUrls, url] })),

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
      selectedAudioIds: [],
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
        selectedAudioIds: [],
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
        return { selectedShotIds: [shotId], selectedClipShotId: shotId, selectedAudioId: null, selectedAudioIds: [] }
      }
      const [lo, hi] = ai <= bi ? [ai, bi] : [bi, ai]
      return {
        selectedShotIds: order.slice(lo, hi + 1),
        selectedClipShotId: shotId,
        selectedAudioId: null,
        selectedAudioIds: [],
        previewSourceShotId: null,
      }
    }),

  // 마퀴 드래그 선택
  setClipSelection: (ids) =>
    set({ selectedShotIds: ids, selectedClipShotId: ids[ids.length - 1] ?? null }),

  clearClipSelection: () => set({ selectedShotIds: [], selectedClipShotId: null }),

  // 오디오 클립 단일 선택 (교체) — Del 대상이 오디오로 전환 (비디오 선택 해제)
  selectAudioClip: (id) =>
    set({
      selectedAudioId: id,
      selectedAudioIds: [id],
      selectedShotIds: [],
      selectedClipShotId: null,
    }),

  // ctrl+click — 토글 다중 선택
  toggleAudioSelection: (id) =>
    set((state) => {
      const has = state.selectedAudioIds.includes(id)
      const ids = has
        ? state.selectedAudioIds.filter((i) => i !== id)
        : [...state.selectedAudioIds, id]
      return {
        selectedAudioIds: ids,
        selectedAudioId: has ? (ids[ids.length - 1] ?? null) : id,
        selectedShotIds: [],
        selectedClipShotId: null,
      }
    }),

  // shift+click — 앵커(selectedAudioId)부터 대상까지 순차 (트랙→시작초 순서 기준)
  selectAudioRange: (id) =>
    set((state) => {
      const order = globalAudioOrder(state)
      const anchor = state.selectedAudioId ?? id
      const ai = order.indexOf(anchor)
      const bi = order.indexOf(id)
      if (ai < 0 || bi < 0) {
        return {
          selectedAudioIds: [id],
          selectedAudioId: id,
          selectedShotIds: [],
          selectedClipShotId: null,
        }
      }
      const [lo, hi] = ai <= bi ? [ai, bi] : [bi, ai]
      return {
        selectedAudioIds: order.slice(lo, hi + 1),
        selectedAudioId: id,
        selectedShotIds: [],
        selectedClipShotId: null,
      }
    }),

  // 마퀴 드래그 선택
  setAudioSelection: (ids) =>
    set({
      selectedAudioIds: ids,
      selectedAudioId: ids[ids.length - 1] ?? null,
      selectedShotIds: [],
      selectedClipShotId: null,
    }),

  clearAudioSelection: () => set({ selectedAudioIds: [], selectedAudioId: null }),

  deleteSelectedAudio: () =>
    set((state) => {
      if (state.selectedAudioIds.length === 0) return state
      const ids = new Set(state.selectedAudioIds)
      return {
        audioClips: state.audioClips.filter((a) => !ids.has(a.id)),
        selectedAudioIds: [],
        selectedAudioId: null,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

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
      const speedProjectId = useProjectStore.getState().projectId
      if (speedProjectId) {
        fetch('/api/editor/speed', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: speedProjectId, shotId, speed: clamped }),
        }).catch((err) => console.error('[editor-store] speed persist failed:', err))
      }
    }, 300)
    speedPersistTimers.set(shotId, timer)
  },

  setTrim: (shotId, trimStart, trimEnd) => {
    if (!Number.isFinite(trimStart) || !Number.isFinite(trimEnd)) return
    const start = Math.max(0, trimStart)
    if (trimEnd <= start) return

    set((state) => ({
      videoClips: state.videoClips.map((c) =>
        c.shotId === shotId ? { ...c, trimStart: start, trimEnd } : c,
      ),
      // 약속 J3: 타이틀 카드는 원본 영상이 없어 "원본 길이"가 없다 — 손잡이로 늘린 만큼 카드 길이가 길어진다.
      shots: isTitleCardShotId(shotId)
        ? state.shots.map((s) => (s.shotId === shotId && trimEnd > s.durationSeconds ? { ...s, durationSeconds: trimEnd } : s))
        : state.shots,
    }))

    // synthetic pieces have no shots row - the editor_states snapshot restores them instead.
    if (isSyntheticShotId(shotId)) return

    // Debounced persist to DB (fire-and-forget), same pattern as setSpeed.
    const existing = trimPersistTimers.get(shotId)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(() => {
      trimPersistTimers.delete(shotId)
      const trimProjectId = useProjectStore.getState().projectId
      if (trimProjectId) {
        fetch('/api/editor/trim', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: trimProjectId, shotId, trimStart: start, trimEnd }),
        }).catch((err) => console.error('[editor-store] trim persist failed:', err))
      }
    }, 300)
    trimPersistTimers.set(shotId, timer)
  },

  // soft-delete: 타임라인(clipOrder)에서만 제거하고 videoClips 데이터는 보존.
  // → 같은 소스를 다시 드래그하면 url 이 살아있어 정상 추가됨 (요청 6a).
  deleteClip: (shotId) =>
    set((state) => {
      const newOrder: Record<string, string[]> = {}
      for (const [sceneId, ids] of Object.entries(state.clipOrder)) {
        newOrder[sceneId] = ids.filter((id) => id !== shotId)
      }
      return {
        clipOrder: newOrder,
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

      const newId = `${shotId}__c${uid()}`
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
        selectedAudioIds: [],
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

      const newId = `${sourceShotId}__i${uid()}`
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
        selectedShotIds: [newId],
        selectedAudioId: null,
        selectedAudioIds: [],
        previewSourceShotId: null,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  // 소스 → 현재 플레이헤드에 가장 가까운 클립 경계에 추가 + 포커스 (요청 4)
  addClipAtPlayhead: (sourceShotId) => {
    const state = get()
    const layout = selectTimelineLayout(state)
    const boundaries = [0]
    for (const it of layout) boundaries.push(it.startSec + it.durationSec)
    const t = state.currentTime
    let nearest = 0
    let best = Infinity
    for (const b of boundaries) {
      const d = Math.abs(b - t)
      if (d < best) {
        best = d
        nearest = b
      }
    }
    get().addClipInstanceAt(sourceShotId, nearest)
  },

  // 타이틀 카드(#owner-title-card) — addClipInstanceAt 과 동일한 삽입 문법, 단 원본 shot 없이 독립 생성.
  //   기본 5초 / 검은 배경 / 빈 텍스트 — 삽입 즉시 인스펙터에서 텍스트를 채운다.
  addTitleCard: (atGlobalSec) =>
    set((state) => {
      const newId = `title__t${uid()}`
      const sceneId = state.selectedSceneId ?? state.shots[0]?.sceneId ?? 'scene_1'
      const DEFAULT_DURATION = 5
      const newShot: Shot = {
        shotId: newId,
        sceneId,
        shotType: 'WS',
        actionDescription: '',
        characters: [],
        durationSeconds: DEFAULT_DURATION,
        generationMethod: 'T2V',
        dialogueLines: [],
        camera: { ...DEFAULT_CAMERA },
        lighting: { ...DEFAULT_LIGHTING },
        referenceImageUrl: null,
        titleCard: { text: '', imageUrl: null },
      }
      // 영상 없는 synthetic clip — 프리뷰에서 url 없음 → 검은 배경 렌더링 경로를 타려는 대신
      // isTitleCardShotId 로 구별해 프리뷰어가 직접 텍스트 카드를 그린다.
      const newClip: VideoClip = { shotId: newId, url: null, status: 'completed', thumbnailUrl: null }

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
      let insertSceneId: string
      let localIndex: number
      if (order.length === 0) {
        insertSceneId = sceneId
        localIndex = 0
      } else if (g >= order.length) {
        insertSceneId = order[order.length - 1].sceneId
        localIndex = (state.clipOrder[insertSceneId] ?? []).length
      } else {
        insertSceneId = order[g].sceneId
        localIndex = (state.clipOrder[insertSceneId] ?? []).indexOf(order[g].shotId)
        if (localIndex < 0) localIndex = (state.clipOrder[insertSceneId] ?? []).length
      }

      const sceneOrder = [...(state.clipOrder[insertSceneId] ?? [])]
      sceneOrder.splice(localIndex, 0, newId)
      // 오디오 동행(2026-09-08 오너 지시 1번): 카드가 끼는 자리 뒤에서 시작하는 오디오는 영상처럼 카드 길이만큼 밀린다.
      //   카드 자리는 끼어드는 영상 클립의 시작(맨 뒤면 전체 길이). 그 앞에서 시작한 오디오는 그대로.
      const insertAtSec = g < layout.length ? layout[g].startSec : layout.reduce((sum, l) => sum + l.durationSec, 0)
      const audioClips = state.audioClips.map((a) =>
        a.startSec >= insertAtSec - 1e-6 ? { ...a, startSec: a.startSec + DEFAULT_DURATION } : a,
      )

      return {
        shots: [...state.shots, { ...newShot, sceneId: insertSceneId }],
        videoClips: [...state.videoClips, newClip],
        audioClips,
        clipOrder: { ...state.clipOrder, [insertSceneId]: sceneOrder },
        selectedClipShotId: newId,
        selectedShotIds: [newId],
        selectedAudioId: null,
        selectedAudioIds: [],
        previewSourceShotId: null,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  updateTitleCard: (shotId, patch) =>
    set((state) => ({
      shots: state.shots.map((s) =>
        s.shotId === shotId
          ? { ...s, titleCard: { text: s.titleCard?.text ?? '', imageUrl: s.titleCard?.imageUrl ?? null, layout: s.titleCard?.layout ?? null, ...patch } }
          : s,
      ),
    })),

  setSubtitle: (shotId, patch) =>
    set((state) => ({
      shots: state.shots.map((s) => {
        if (s.shotId !== shotId) return s
        if (patch === null) return { ...s, subtitle: null }
        const base = resolveSubtitle(s)
        return { ...s, subtitle: { ...base, ...patch } }
      }),
    })),

  setTransitionIn: (shotId, transition) =>
    set((state) => {
      if (!state.videoClips.some((c) => c.shotId === shotId)) return state
      const next = transition ? { type: 'dissolve' as const, durationSec: Math.max(0.1, Math.min(10, transition.durationSec)) } : null
      return {
        videoClips: state.videoClips.map((c) => (c.shotId === shotId ? { ...c, transitionIn: next } : c)),
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

  setTitleCardDuration: (shotId, seconds) =>
    set((state) => {
      if (!isTitleCardShotId(shotId) || !Number.isFinite(seconds)) return state
      const sec = Math.max(0.5, Math.min(600, Math.round(seconds * 10) / 10))
      return {
        shots: state.shots.map((s) => (s.shotId === shotId ? { ...s, durationSeconds: sec } : s)),
        videoClips: state.videoClips.map((c) => (c.shotId === shotId ? { ...c, trimStart: 0, trimEnd: sec } : c)),
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      }
    }),

}))

// ── 자동 저장 ─────────────────────────────────────────────────────────────────
const serverSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const serverSaveGenerations = new Map<string, number>()
const serverSaveSnapshots = new Map<string, PersistedEditor>()
const serverSaveInFlight = new Map<string, boolean>()
// fatal 실패를 사용자에게 알린 프로젝트 — 프로젝트당 1회만 토스트 (콘솔은 개발자용).
const fatalSaveNotified = new Set<string>()

// 저장 결과 3분류 — 'saved' 성공 / 'retry' 일시 장애(5초 뒤 재시도) / 'fatal' 재시도로
//   달라지지 않는 실패(4xx: 인증 만료·삭제된 프로젝트 410 등 → 루프 중단, localStorage 만 유지).
//   기존엔 모든 실패가 5초 무한 재시도라, 죽은 프로젝트/만료 세션에서 콘솔이 500 에러로 도배됐다.
type ServerSaveResult = 'saved' | 'retry' | 'fatal'

async function saveEditorStateToServer(
  projectId: string,
  snapshot: PersistedEditor,
  isCurrent: () => boolean,
): Promise<ServerSaveResult> {
  let diagnostic = 'Unknown error'
  let fatal = false
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!isCurrent()) return 'retry'
    try {
      const response = await fetch('/api/editor/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, state: snapshot }),
      })
      if (response.ok) return 'saved'
      // 서버가 남긴 실제 사유를 진단에 붙인다 — "HTTP 500"만으로는 원인 추적이 안 된다.
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      diagnostic = `HTTP ${response.status}${body?.error ? ` — ${body.error}` : ''}`
      if (response.status >= 400 && response.status < 500) {
        fatal = true
        break
      }
    } catch (error) {
      diagnostic = error instanceof Error ? error.message : 'Network error'
    }
    if (!isCurrent()) return 'retry'
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
  if (isCurrent()) {
    console.error(
      `[editor-store] server state save failed ${fatal ? '(non-retryable, giving up)' : 'after retries'}:`,
      diagnostic,
    )
  }
  return fatal ? 'fatal' : 'retry'
}

export function scheduleServerSave(
  projectId: string,
  snapshot: PersistedEditor,
  delay = 1500,
  generation = (serverSaveGenerations.get(projectId) ?? 0) + 1,
) {
  if (generation === (serverSaveGenerations.get(projectId) ?? 0) + 1) {
    serverSaveGenerations.set(projectId, generation)
    serverSaveSnapshots.set(projectId, snapshot)
  }

  const timer = serverSaveTimers.get(projectId)
  if (timer) clearTimeout(timer)
  const scheduled = setTimeout(() => {
    if (serverSaveTimers.get(projectId) !== scheduled) return
    serverSaveTimers.delete(projectId)
    void runServerSave(projectId, generation)
  }, delay)
  serverSaveTimers.set(projectId, scheduled)
}

// 이 세대(generation)의 저장을 서버에 보낸다 — 더 새 세대가 있거나 이미 보내는 중이면 보내지 않는다(null).
function runServerSave(projectId: string, generation: number): Promise<ServerSaveResult | null> {
  if (serverSaveGenerations.get(projectId) !== generation) return Promise.resolve(null)
  if (serverSaveInFlight.get(projectId)) return Promise.resolve(null)

  const latestSnapshot = serverSaveSnapshots.get(projectId)
  if (!latestSnapshot) return Promise.resolve(null)
  serverSaveInFlight.set(projectId, true)
  return saveEditorStateToServer(
    projectId,
    latestSnapshot,
    () => serverSaveGenerations.get(projectId) === generation,
  ).then((result) => {
    serverSaveInFlight.delete(projectId)
    const latestGeneration = serverSaveGenerations.get(projectId)
    if (latestGeneration !== generation) {
      const newestSnapshot = serverSaveSnapshots.get(projectId)
      if (newestSnapshot) scheduleServerSave(projectId, newestSnapshot, 0, latestGeneration)
      return result
    }
    if (result === 'saved') {
      serverSaveSnapshots.delete(projectId)
      return result
    }
    if (result === 'fatal') {
      // 재시도로 달라지지 않는 실패(삭제된 프로젝트·만료 세션) — 루프를 멈춘다.
      //   편집 내용은 localStorage(saveEditorState)에 그대로 남아 있고, 다음 편집이
      //   새 generation 으로 다시 저장을 시도한다.
      serverSaveSnapshots.delete(projectId)
      if (!fatalSaveNotified.has(projectId)) {
        fatalSaveNotified.add(projectId)
        toast.error(
          translate(
            useLocaleStore.getState().locale,
            "Couldn't save your edits to the server. The project may have been deleted or the session may have expired. Refresh to restore your most recent project.",
          ),
        )
      }
      return result
    }
    const retrySnapshot = serverSaveSnapshots.get(projectId)
    if (retrySnapshot) scheduleServerSave(projectId, retrySnapshot, 5000, generation)
    return result
  })
}

// 저장하는 편집 상태 — 재생 · 선택 · 확대처럼 보는 상태는 넣지 않는다.
const pickPersisted = (s: EditorState) => ({
  shots: s.shots,
  clipOrder: s.clipOrder,
  videoClips: s.videoClips,
  audioClips: s.audioClips,
  audioSources: s.audioSources,
  audioTracks: s.audioTracks,
  panelSizes: s.panelSizes,
})

/**
 * 지금 편집 상태를 바로 저장한다 — 이 브라우저에 쓰고 서버 답까지 기다린다. Editor 를 처음 열 때 소리를 다 나눈 결과를
 *   편집 화면을 열기 전에 남긴다(오너 2026-11-10 "DB에 다 올라왔을 때 내용이 보여지게"). 서버가 잠시 고장이면 뒤에서 다시 시도한다.
 *   약속: tests/editor/first-open.test.ts
 */
export function saveEditorNow(projectId: string): Promise<ServerSaveResult | null> {
  const snapshot: PersistedEditor = { version: 1, ...pickPersisted(useEditorStore.getState()) }
  saveEditorStateNow(projectId, snapshot)
  const generation = (serverSaveGenerations.get(projectId) ?? 0) + 1
  serverSaveGenerations.set(projectId, generation)
  serverSaveSnapshots.set(projectId, snapshot)
  const timer = serverSaveTimers.get(projectId)
  if (timer) clearTimeout(timer)
  serverSaveTimers.delete(projectId)
  return runServerSave(projectId, generation)
}

if (typeof window !== 'undefined') {
  const pick = pickPersisted
  let prev = pick(useEditorStore.getState())

  useEditorStore.subscribe((state) => {
    const cur = pick(state)
    if (
      cur.shots === prev.shots &&
      cur.clipOrder === prev.clipOrder &&
      cur.videoClips === prev.videoClips &&
      cur.audioClips === prev.audioClips &&
      cur.audioSources === prev.audioSources &&
      cur.audioTracks === prev.audioTracks &&
      cur.panelSizes === prev.panelSizes
    ) {
      return // 편집 상태 변화 없음 (재생/선택 등) → 저장 안 함
    }
    prev = cur
    // 아직 못 읽은 빈 편집 상태(비워짐 · 읽는 중 · 읽기 실패)는 저장하지 않는다(QA 2026-11-03 밤) — 프로젝트를 여는 길의 늦은 비우기가
    //   빈 상태를 막 연 프로젝트 이름으로 저장해 자른 조각 · 타이틀 카드 · 자막 · 오디오 배치를 덮었다(운영 3945d1e6 서버 편집 상태 샷 0).
    if (state.loadStatus !== 'ready' && state.shots.length === 0) return
    // 편집 상태를 준비하는 동안(Editor 를 열 때 — 저장한 편집 되살리기, 처음이면 소리 나누기)은 저장하지 않는다(오너 2026-11-10).
    //   반쯤 된 상태(오디오 · 파형 없음, 되살리기 전 DB 모습)가 저장되면 다음에 열 때 그것을 다 된 편집으로 읽는다.
    //   처음 열 때는 다 나눈 뒤 saveEditorNow 가 한 번에 저장한다. 약속: tests/editor/first-open.test.ts
    if (state.editorPrep) return

    const projectId = useProjectStore.getState().projectId
    if (!projectId) return

    const snapshot: PersistedEditor = { version: 1, ...cur }
    saveEditorState(projectId, snapshot)
    scheduleServerSave(projectId, snapshot)
  })
}
