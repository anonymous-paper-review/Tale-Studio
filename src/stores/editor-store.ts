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
  rehydrateAudioUrls,
  type PersistedEditor,
} from '@/lib/editor-persistence'
import { NEVER_SEEN, hasShots, readServerCopy, rememberServerSeenAt, savedLater, serverSeenAt, setAsideLocalEdit } from '@/lib/editor/server-copy'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { compactSnapshot, sharePeaks } from '@/lib/editor/peaks'

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

// 열 때 저절로 생긴 바뀜(DB 읽기 · 저장본 되살리기 · 영상 길이 재기 · 파형 채우기)과 칸 크기는 사람이 고친 것이 아니다 — 그동안의 저장은
//   편집에 사람 고침이 실렸다는 표시(serverAware)를 새로 켜지 않는다(재검토 c 2/2, 2026-11-14). 약속: tests/editor/other-browser.test.ts
let automaticChanges = 0
function automatically(change: () => void): void {
  automaticChanges += 1
  try {
    change()
  } finally {
    automaticChanges -= 1
  }
}

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

/** 사람이 뺀 원본 샷 목록에 더한다 — 조각(자른 · 끼운 · 타이틀 카드)은 저절로 돌아올 일이 없어 적지 않는다(검토 c, 2026-11-14). */
function withRemoved(removed: readonly string[], shotIds: readonly string[]): string[] {
  const add = shotIds.filter((id) => !isSyntheticShotId(id) && !removed.includes(id))
  return add.length ? [...removed, ...add] : (removed as string[])
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
  // 사람이 타임라인에서 뺀 원본 샷 — 영상이 없어져 저절로 빠진 샷과 가려, 영상이 다시 생겨도 저절로 돌아오지 않게 한다(검토 c, 2026-11-14).
  removedShotIds: string[]
  // 이 편집에 고침 뒤 화면에서 사람이 고친 것이 실려 있다 — 저장본에 표시(serverAware)로 적는다. 되살린 저장본의 표시를 이어받고, 사람이
  //   고치면 켜진다. 열 때 저절로 생긴 바뀜(처음 상태 · 길이 재기 · 소리 나누기 · 파형)만으로는 켜지지 않는다(재검토 c 2/2, 2026-11-14).
  serverAware: boolean
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
  addClipInstanceAt: (sourceShotId: string, atGlobalSec: number) => string | null
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
  removedShotIds: string[]
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

// ── 영상과 이어진 소리 (오너 2026-11-10 결정 4 "같이 움직인다 — 따로 떼고 싶을 때만 나눈다") ──
//   이어진 소리(linkedShotId)의 자리 · 길이 · 원본 시작점 · 빠르기는 그 영상 클립을 따르고, 타임라인에서 빠진(숨긴 · 지운)
//   영상의 소리는 함께 뺀다. 영상을 바꾸는 동작은 모두 같은 set 안에서 이 함수로 소리를 맞춘다 — 되돌리기 한 번에 함께 돌아간다.
//   약속: tests/editor/audio-link.test.ts
type LinkInput = TimelineInput & { audioClips: AudioTrackClip[] }
export function syncLinkedAudio(state: LinkInput): AudioTrackClip[] {
  if (!state.audioClips.some((a) => a.linkedShotId)) return state.audioClips
  const layout = new Map(selectTimelineLayout(state).map((item) => [item.shotId, item]))
  let changed = false
  const out: AudioTrackClip[] = []
  for (const a of state.audioClips) {
    if (!a.linkedShotId) {
      out.push(a)
      continue
    }
    const item = layout.get(a.linkedShotId)
    if (!item) {
      changed = true
      continue
    }
    const clip = state.videoClips.find((c) => c.shotId === a.linkedShotId)
    const sourceOffsetSec = clip?.trimStart ?? 0
    const playbackRate = clip?.speed ?? 1
    if (a.startSec === item.startSec && a.durationSec === item.durationSec && (a.sourceOffsetSec ?? 0) === sourceOffsetSec && (a.playbackRate ?? 1) === playbackRate) {
      out.push(a)
      continue
    }
    changed = true
    out.push({ ...a, startSec: item.startSec, durationSec: item.durationSec, sourceOffsetSec, playbackRate })
  }
  return changed ? out : state.audioClips
}

/** 영상을 바꾸는 동작의 결과에 이어진 소리를 맞춰 붙인다 — 함께 빠진 소리는 고른 것에서도 뺀다. */
function withLinkedAudio(state: EditorState, changes: Partial<EditorState>): Partial<EditorState> {
  const before = changes.audioClips ?? state.audioClips
  const audioClips = syncLinkedAudio({
    shots: changes.shots ?? state.shots,
    videoClips: changes.videoClips ?? state.videoClips,
    clipOrder: changes.clipOrder ?? state.clipOrder,
    audioClips: before,
  })
  if (audioClips === before) return changes
  const kept = new Set(audioClips.map((a) => a.id))
  const selectedAudioId = 'selectedAudioId' in changes ? changes.selectedAudioId ?? null : state.selectedAudioId
  return {
    ...changes,
    audioClips,
    selectedAudioId: selectedAudioId && kept.has(selectedAudioId) ? selectedAudioId : null,
    selectedAudioIds: (changes.selectedAudioIds ?? state.selectedAudioIds).filter((id) => kept.has(id)),
  }
}

// 소리 조각 자리가 이만큼 안으로 같으면 제자리다 — 초를 다시 계산한 끝자리 차이(검토 b).
const SAME_SPOT_SEC = 1e-6

// 이음 칸이 생기기 전(이번 고침 전) 저장본의 소리를 영상에 다시 잇는다 — 오너 2026-11-10 답 "고쳐 준다", 리드 결정 "사슬로 따라가기".
//   처음 나누기는 원본 샷 순서대로 영상마다 소리 하나를 원본 처음부터(원본 0초) 앞 소리 끝에 이어 놓았다. 그래서 원본 순서(숨긴 샷 포함)대로
//   같은 영상 파일 · 원본 처음부터 · 앞 소리 끝에서 시작하는 소리를 이어 가면 "처음 나눈 그대로인 소리"다 — 그 뒤 자르기 · 속도와 상관없다.
//   - 어떤 샷에 그런 소리가 없으면(처음 나눌 때 영상이 없었거나 사람이 그 소리를 옮겼다면) 그 샷의 계획 · 잰 길이만큼 건너뛴다.
//     그래도 안 맞으면 거기서 멈추고, 남은 옛 소리는 아직 모름(undefined)으로 둔다 — 억지로 잇지 않는다.
//   - 다음 소리는 앞 소리 지금 끝에서, 그리고 "앞 소리 시작 + 그 샷이 차지했을 길이"에서도 찾는다 — 사람이 앞 소리 끝을 줄였어도
//     그 뒤 손대지 않은 소리는 잇는다(재검토 b, 리드 결정 "넓힌다").
//   - 앞 소리는 다음 소리가 그 끝에서 이어지거나 그 길이가 샷 길이와 맞을 때, 마지막 소리는 샷 길이와 맞을 때만 잇는다(끝을 사람이 줄인 소리는 두기).
//   - 사람이 자른 소리(같은 파일의 다른 조각이 이 조각 끝에서 이어지는 것)는 잇지 않는다.
//   다 이은 뒤, 지금 영상 자리와 꼭 맞는 옛 소리(끌어 놓은 복사본 등)도 그 클립에 잇는다.
//   이은 소리는 뒤에서 지금 영상 자리로 옮겨지고(syncLinkedAudio), 숨긴 샷 소리는 함께 빠지며, 나눈 뒤 자른 조각에는 그 구간 소리를 나눠 준다.
//   약속: tests/editor/audio-link.test.ts
const LINK_TOLERANCE_SEC = 0.05
const CHAIN_MAX_SKIPS = 3
function relinkSavedAudio(
  audioClips: AudioTrackClip[],
  timeline: TimelineInput,
  original: Pick<EditorState, 'shots' | 'videoClips'>,
  savedClips: VideoClip[],
): AudioTrackClip[] {
  const loose = audioClips.filter((a) => a.linkedShotId === undefined)
  if (loose.length === 0) return audioClips
  const near = (a: number, b: number) => Math.abs(a - b) <= LINK_TOLERANCE_SEC
  const offsetOf = (a: AudioTrackClip) => a.sourceOffsetSec ?? 0
  const handCut = new Set(
    loose
      .filter((a) => loose.some((b) => b !== a && b.url === a.url && near(offsetOf(b), offsetOf(a) + a.durationSec * (a.playbackRate ?? 1))))
      .map((a) => a.id),
  )
  // 저장해 둔 실제 길이(같은 파일) — 다시 열 때는 아직 재기 전이다.
  const measured = new Map(savedClips.filter((c) => c.url && c.actualDurationSec).map((c) => [c.url as string, c.actualDurationSec as number]))
  const clipOf = (shotId: string) => original.videoClips.find((c) => c.shotId === shotId)
  // 처음 나눌 때 그 샷이 타임라인에서 차지했을 수 있는 길이 — 계획 · 잰 길이 · 둘 중 짧은 것 · 지금 손잡이 · 속도를 넣은 길이.
  const lengthsOf = (shot: Shot): number[] => {
    const clip = clipOf(shot.shotId)
    const real = (clip?.url ? measured.get(clip.url) : undefined) ?? clip?.actualDurationSec
    const out = [shot.durationSeconds]
    if (real) out.push(real, Math.min(shot.durationSeconds, real))
    if (clip && (clip.trimStart != null || clip.trimEnd != null || (clip.speed ?? 1) !== 1)) {
      const end = clip.trimEnd ?? Math.min(shot.durationSeconds, real ?? shot.durationSeconds)
      out.push(Math.max(0.1, (end - (clip.trimStart ?? 0)) / (clip.speed ?? 1)))
    }
    return out
  }
  const uniq = (xs: number[]) => xs.filter((x, i) => xs.findIndex((y) => near(x, y)) === i)

  const chain = new Map<string, string>() // 소리 id → 원본 샷 id
  let cursors = [0]
  let pending: { audio: AudioTrackClip; shot: Shot } | null = null
  let skips = 0
  for (const shotId of selectTimelineShotIds({ shots: original.shots, clipOrder: buildClipOrder(original.shots), videoClips: original.videoClips })) {
    const shot = original.shots.find((s) => s.shotId === shotId)
    if (!shot) continue
    const url = clipOf(shotId)?.url
    const hit = url
      ? loose.find((a) => !chain.has(a.id) && !handCut.has(a.id) && a.url === url && near(offsetOf(a), 0) && cursors.some((c) => near(a.startSec, c)))
      : undefined
    if (hit) {
      // 앞 소리는 이 소리가 그 끝에서 이어지거나, 그 길이가 그 샷이 차지했을 길이와 맞을 때만 잇는다 — 끝을 사람이 줄인 소리는 두기(재검토 b).
      const prev = pending
      if (prev && (near(hit.startSec, prev.audio.startSec + prev.audio.durationSec) || lengthsOf(prev.shot).some((d) => near(prev.audio.durationSec, d)))) {
        chain.set(prev.audio.id, prev.shot.shotId)
      }
      pending = { audio: hit, shot }
      // 다음 소리는 이 소리의 지금 끝에서, 그리고 사람이 이 소리 끝을 줄였을 수 있으니 이 소리 시작 + 그 샷이 차지했을 길이에서도 찾는다.
      cursors = uniq([hit.startSec + hit.durationSec, ...lengthsOf(shot).map((d) => hit.startSec + d)])
      skips = 0
      continue
    }
    if (++skips > CHAIN_MAX_SKIPS) break
    cursors = uniq(cursors.flatMap((c) => lengthsOf(shot).map((d) => c + d))).slice(0, 12)
  }
  if (pending && lengthsOf(pending.shot).some((d) => near(pending.audio.durationSec, d))) chain.set(pending.audio.id, pending.shot.shotId)

  const taken = new Set([...audioClips.map((a) => a.linkedShotId).filter((id): id is string => !!id), ...chain.values()])
  // 지금 영상 자리와 꼭 맞는 옛 소리 — 저장해 둔 잰 길이 · 계획 길이로 둘 다 견준다.
  const aligned = new Map<string, string>()
  for (const videoClips of [
    timeline.videoClips.map((c) => (c.actualDurationSec == null && c.url && measured.has(c.url) ? { ...c, actualDurationSec: measured.get(c.url) } : c)),
    timeline.videoClips.map(({ actualDurationSec: _measured, ...c }) => c),
  ]) {
    const layout = selectTimelineLayout({ ...timeline, videoClips })
    for (const a of loose) {
      if (chain.has(a.id) || aligned.has(a.id) || handCut.has(a.id)) continue
      const item = layout.find((l) => {
        if (taken.has(l.shotId)) return false
        const clip = videoClips.find((c) => c.shotId === l.shotId)
        return (
          !!clip?.url && clip.url === a.url &&
          near(a.startSec, l.startSec) && near(a.durationSec, l.durationSec) &&
          near(offsetOf(a), clip.trimStart ?? 0) && (clip.speed ?? 1) === (a.playbackRate ?? 1)
        )
      })
      if (!item) continue
      taken.add(item.shotId)
      aligned.set(a.id, item.shotId)
    }
  }
  if (chain.size === 0 && aligned.size === 0) return audioClips

  // 처음 나눈 자리로 다시 이은 원본 샷을 그 뒤에 자른 조각이 지금 타임라인에 있으면, 조각마다 소리를 나눠 준다(자리 · 구간은 뒤에서 조각을 따른다).
  const pieces = timeline.shots.map((s) => s.shotId).filter((id) => id.includes('__c'))
  const out: AudioTrackClip[] = []
  for (const a of audioClips) {
    const fromChain = chain.get(a.id)
    const shotId = fromChain ?? aligned.get(a.id)
    if (!shotId) {
      out.push(a)
      continue
    }
    out.push({ ...a, linkedShotId: shotId })
    if (!fromChain) continue
    for (const piece of pieces) {
      if (rootShotIdOf(piece) !== shotId || taken.has(piece)) continue
      taken.add(piece)
      out.push({ ...a, id: `audio_${uid()}`, linkedShotId: piece })
    }
  }
  return out
}

/**
 * 영상이 새로 생겨 들어오는 샷의 자리 — 이야기 순서의 제자리(오너 답 8, 2026-11-14). 같은 장면에서 바로 앞 샷(그 샷을 잘라 낸 조각까지)
 *   뒤, 앞 샷이 타임라인에 없으면 장면의 첫 샷 앞(맨 앞의 타이틀 카드는 그대로 맨 앞), 샷이 없으면 끝. 약속: tests/editor/shots-with-video.test.ts
 */
function placeInStory(order: string[], shotId: string, story: string[]): string[] {
  const roots = order.map(rootShotIdOf)
  for (let i = story.indexOf(shotId) - 1; i >= 0; i--) {
    const last = roots.lastIndexOf(story[i])
    if (last >= 0) return [...order.slice(0, last + 1), shotId, ...order.slice(last + 1)]
  }
  const firstShot = roots.findIndex((root) => story.includes(root))
  const at = firstShot >= 0 ? firstShot : order.length
  return [...order.slice(0, at), shotId, ...order.slice(at)]
}

const round3 = (sec: number) => Math.round(sec * 1000) / 1000

/** 영상이 새로 생겨 들어온 샷의 클립 — 새 영상이니 전에 고친 구간 · 빠르기 · 전환 없이 처음 상태(검토 c 리드 판단, 2026-11-14). */
function freshClip(clip: VideoClip): VideoClip {
  const { trimStart: _start, trimEnd: _end, transitionIn: _transition, ...rest } = clip
  return { ...rest, speed: 1 }
}

/**
 * 사람이 보던 타임라인의 한 시각이 자리가 저절로 바뀐 뒤 어디가 되는가 — 그 시각을 품은(또는 그 앞에서 가장 가까운) 클립이 움직인 만큼.
 *   빠진 칸 안의 시각은 그 칸이 있던 자리(앞에 남은 클립 끝)로 접힌다. 사람이 놓은 소리를 영상과 같이 옮길 때 쓴다(검토 c, 2026-11-14).
 */
function movedTime(
  sec: number,
  shown: ReadonlyArray<{ shotId: string; startSec: number; durationSec: number }>,
  now: ReadonlyMap<string, { startSec: number; durationSec: number }>,
): number {
  let anchor = -1
  for (let i = 0; i < shown.length; i++) {
    if (shown[i].startSec <= sec + 0.0005) anchor = i
    else break
  }
  if (anchor < 0) return sec
  const placed = now.get(shown[anchor].shotId)
  if (placed) return round3(sec + placed.startSec - shown[anchor].startSec)
  for (let i = anchor - 1; i >= 0; i--) {
    const kept = now.get(shown[i].shotId)
    if (kept) return round3(kept.startSec + kept.durationSec)
  }
  return 0
}

/** 샷 구간 · 빠르기를 서버(DB)에서 처음으로 되돌린다(보내고 잊음) — 영상이 새로 생겨 들어온 샷(검토 c, 2026-11-14). */
function persistShotReset(path: '/api/editor/trim' | '/api/editor/speed', body: Record<string, unknown>) {
  const projectId = useProjectStore.getState().projectId
  if (!projectId) return
  fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, ...body }),
  }).catch((err) => console.error('[editor-store] shot reset persist failed:', err))
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
    removedShotIds: [...state.removedShotIds],
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
  removedShotIds: [],
  serverAware: false,
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
    // 영상에 잇는 소리(linkedShotId)는 넣는 즉시 그 영상 클립 자리에 맞춘다 — 그 클립이 그새 빠졌으면 넣지 않는다.
    set((state) =>
      withLinkedAudio(state, {
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
      }),
    )
    return id
  },

  // 소리 조각을 직접 끌어 옮기면(자리나 줄이 바뀌면) 그 소리는 영상에서 떨어진다 — 제자리에 놓으면 그대로 잇는다(결정 4).
  //   초를 다시 계산하며 끝자리만 달라진 것(15.4 → 15.399999999999999)은 제자리다(검토 b).
  moveAudioClip: (id, startSec, trackId) =>
    set((state) => ({
      audioClips: state.audioClips.map((a) => {
        if (a.id !== id) return a
        const nextStart = Math.max(0, startSec)
        const shifted = Math.abs(nextStart - a.startSec) > SAME_SPOT_SEC
        const moved = shifted || (!!trackId && trackId !== a.trackId)
        return {
          ...a,
          startSec: shifted ? nextStart : a.startSec,
          ...(trackId ? { trackId } : {}),
          // 이음이 없던 옛 소리도 사람이 옮기면 뗀 소리가 된다 — 다음에 열어도 다시 잇지 않는다(검토 b).
          ...(moved ? { linkedShotId: null } : {}),
        }
      }),
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
      // 소리 조각을 직접 자르면 두 조각 모두 영상에서 떨어진다(결정 4). 빠르기는 그대로 — 원본은 타임라인 초 × 빠르기만큼 나아간다.
      const rate = a.playbackRate ?? 1
      const first: AudioTrackClip = { ...a, durationSec: localT, linkedShotId: null }
      const second: AudioTrackClip = {
        ...a,
        id: newId,
        startSec: a.startSec + localT,
        durationSec: a.durationSec - localT,
        sourceOffsetSec: srcOff + localT * rate,
        sourceDurationSec: srcDur,
        linkedShotId: null,
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
    automatically(() =>
      set((state) =>
        withLinkedAudio(state, {
          videoClips: state.videoClips.map((c) => (c.shotId === shotId ? { ...c, ...patch } : c)),
        }),
      ),
    ),
  // 자리 · 길이 · 원본 시작점을 바꾸면(소리 조각의 앞 · 뒤를 끌어 줄이기) 영상에서 떨어진다. 파형 · 원본 길이 채우기는 그대로 잇는다(결정 4).
  //   끌어 줄이기는 사람 고침이라 저장본에 견줌 표시(serverAware)를 붙이고, 열 때 채우는 파형 · 원본 길이만은 저절로 생긴 바뀜이다(E2b, 2026-11-14).
  updateAudioClip: (id, patch) => {
    const reshaped = 'startSec' in patch || 'durationSec' in patch || 'sourceOffsetSec' in patch
    const apply = () =>
      set((state) => ({
        audioClips: state.audioClips.map((a) =>
          a.id === id ? { ...a, ...patch, ...(reshaped ? { linkedShotId: null } : {}) } : a,
        ),
      }))
    if (reshaped) apply()
    else automatically(apply)
  },

  // ── 리사이즈 섹션 크기 ──
  setPanelSize: (key, value) =>
    automatically(() =>
      set((state) => {
        const clamped =
          key === 'sourceW'
            ? Math.max(PANEL_SOURCE_W_MIN, Math.min(PANEL_SOURCE_W_MAX, value))
            : Math.max(PANEL_PREVIEW_H_MIN, Math.min(PANEL_PREVIEW_H_MAX, value))
        return { panelSizes: { ...state.panelSizes, [key]: clamped } }
      }),
    ),

  // ── 영속화 로드 (loadData 후 호출) — canonical media is never restored locally ──
  loadPersisted: async () => {
    if (typeof window === 'undefined') return false
    const projectId = useProjectStore.getState().projectId
    if (!projectId) return false
    const loadToken = ++persistedLoadEpoch
    const stale = () => persistedLoadEpoch !== loadToken || useProjectStore.getState().projectId !== projectId
    // 이 브라우저 저장본과 서버 저장본을 함께 읽는다(E2b, 2026-11-14) — 예전에는 이 브라우저 것만 읽고 서버에는 쓰기만 해서,
    //   다른 브라우저가 연 처음 상태가 서버 편집을 덮었다. 약속: tests/editor/other-browser.test.ts
    //   이 브라우저 것을 읽다 망가지면 없는 것으로 보고 이어 간다 — 예외가 그대로 나가면 기다리는 카드가 끝나지 않았다(검토 A E3).
    const [local, server] = await Promise.all([
      loadEditorState(projectId).catch((err) => {
        console.error('[editor-store] saved edit could not be read:', err)
        return null
      }),
      readServerCopy(projectId),
    ])
    if (stale()) return false
    // 샷이 하나도 없는 저장본은 되살릴 편집이 아니다 — 11/3 늦은 비우기가 남긴 빈 편집 상태(운영 3945d1e6 서버 편집 상태 샷 0)를
    //   "되살린 편집"으로 보면 처음 열기의 소리 나누기가 영영 안 된다(검토 A E1). 처음 여는 것으로 본다.
    const localEdit = hasShots(local) ? local : null
    const serverEdit = server && hasShots(server.state) ? server.state : null
    // 서버에 쓸지는 열 때마다 새로 정한다 — 지난번 화면에서 멈춘 쓰기를 이번 화면에 넘기지 않는다.
    serverWritesStopped.delete(projectId)
    blindOpens.delete(projectId)

    if (!server) {
      // 서버 편집을 읽지 못했다 — 편집은 막지 않는다(서버가 잠시 고장 나도 연다, 약속: tests/editor/first-open.test.ts). 이 브라우저
      //   편집이 있으면 그것, 없으면 처음 상태로 열고, 서버에 쓰기 전에 서버를 다시 읽어 이 브라우저가 못 본 편집이 있으면 덮지 않는다.
      const opened = !!localEdit && tryApply(localEdit)
      // 처음 상태로 열었으면 "본 시각"을 아주 옛 값으로 적는다 — 다음에 열 때 샷 있는 서버 편집이 이 처음 상태보다 먼저 열린다(검토 c 보통 1).
      if (!opened) rememberServerSeenAt(projectId, NEVER_SEEN)
      blindOpens.set(projectId, { opened: opened ? 'local' : 'fresh', seen: serverSeenAt(projectId) })
      return opened
    }

    // 다른 곳에서 이 브라우저가 마지막으로 본 뒤에 서버에 저장했으면 서버 편집을 먼저 연다. 이번 고침 전 저장본은 견줄 표시가 없어
    //   이 브라우저 것을 먼저 연다 — E2b 로 서버 편집이 처음 상태 · 빈 편집으로 덮인 프로젝트가 있다(운영 3945d1e6).
    //   다만 고침 뒤 화면이 쓴 서버 저장본(serverAware)은 누군가 고침 뒤에 고친 것이라 고침 전 저장본보다 먼저다(검토 c, A6 다듬기) —
    //   이 규칙은 고침 전 저장본이 남아 있는 동안(옮겨 가는 동안)만 쓰인다.
    const seen = serverSeenAt(projectId)
    const serverFirst =
      !!serverEdit &&
      (!localEdit || (seen === undefined ? serverEdit.serverAware === true : savedLater(server.updatedAt, seen)))
    for (const candidate of serverFirst ? [serverEdit, localEdit] : [localEdit, serverEdit]) {
      if (!candidate) continue
      const fromServer = candidate === serverEdit
      // 다른 브라우저에서 올린 소리 파일은 이 브라우저에 없을 수 있다 — 있으면 다시 잇고, 없으면 자리 · 파형만 남긴다.
      if (fromServer) await rehydrateAudioUrls(candidate, true)
      if (stale()) return false
      if (!tryApply(candidate)) continue
      if (fromServer) {
        // 덮이기 전 이 브라우저 편집을 따로 칸에 한 벌 남긴다(검토 c 낮음 3 · A6). 다음에 이 브라우저에서 서버를 기다리지 않고 열리게
        //   바로 저장하고, 서버의 그 저장 시각을 적어 둔다.
        if (local && local !== candidate) setAsideLocalEdit(projectId, local)
        saveEditorStateNow(projectId, persistSnapshot(get()))
        if (server.updatedAt) rememberServerSeenAt(projectId, server.updatedAt)
      }
      return true
    }
    return false

    // 저장한 편집을 되살린다 — 망가져 예외가 나면 되살리지 않은 것으로 하고 까닭을 남긴다(검토 A E3).
    function tryApply(saved: PersistedEditor): boolean {
      try {
        applySavedEdit(saved)
        return true
      } catch (err) {
        console.error('[editor-store] saved edit could not be restored:', err)
        return false
      }
    }

    // 저장한 편집을 지금(DB 에서 다시 만든) 편집 상태에 입힌다 — 한 번에 set 하므로 중간에 예외가 나면 아무것도 바뀌지 않는다.
    function applySavedEdit(saved: PersistedEditor) {
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
      //   원본 클립에 넣은 전환(디졸브)도 되살린다 — 전환은 DB 에 없다(2026-11-14, 약속: tests/editor/reopen-edits.test.ts).
      const baseClips = cur.videoClips.map((c) => {
        const savedClip = savedClipByShot.get(c.shotId)
        if (!savedClip) return c
        let next = c
        if (cutRoots.has(c.shotId) && (savedClip.trimStart !== undefined || savedClip.trimEnd !== undefined)) {
          next = { ...next, trimStart: savedClip.trimStart, trimEnd: savedClip.trimEnd }
        }
        if (savedClip.transitionIn) next = { ...next, transitionIn: savedClip.transitionIn }
        return next
      })
      const combinedClips = restoredClips.length ? [...baseClips, ...restoredClips] : baseClips

      const canonicalOrder = new Map<string, string[]>()
      for (const shot of combinedShots) {
        const order = canonicalOrder.get(shot.sceneId) ?? []
        order.push(shot.shotId)
        canonicalOrder.set(shot.sceneId, order)
      }
      // 저장할 때 있던 샷이 저장한 순서에 없으면 사람이 타임라인에서 지운 것이다 — 되살리지 않는다.
      //   저장한 뒤에 새로 생긴 샷만 씬 끝에 붙인다(2026-11-10, 약속: tests/editor/reopen-edits.test.ts).
      // 영상이 있는 샷만 타임라인 컷이다(오너 답 8, 2026-11-14) — 영상이 없어진 샷(잘라 낸 조각 포함)과 예전 저장본의 빈 칸은 두지
      //   않는다. 타이틀 카드는 영상 없이 그리는 클립이라 그대로 둔다. 저장할 때 영상이 없어 빠져 있던 샷에 영상이 생기면 이야기 순서의
      //   제자리에 들어온다. 약속: tests/editor/shots-with-video.test.ts
      const clipUrl = new Map(combinedClips.map((c) => [c.shotId, c.url]))
      const playable = (shotId: string) => isTitleCardShotId(shotId) || !!clipUrl.get(shotId)
      const savedShotIds = new Set((saved.shots ?? []).map((s) => s.shotId))
      // 사람이 뺀 원본 샷 — 새 저장본은 목록으로 적혀 있고, 고침 전 저장본은 "저장할 때 있었는데 순서에 없는 샷"이다(그때는 영상 없는
      //   샷도 빈 칸으로 순서에 있었다). 영상이 없어져 저절로 빠진 샷은 이 목록에 없어 영상이 생기면 돌아온다(검토 c, 2026-11-14).
      const savedOrderIds = new Set(Object.values(saved.clipOrder ?? {}).flat())
      const removedShotIds = saved.removedShotIds
        ?? (saved.shots ?? []).map((s) => s.shotId).filter((id) => !isSyntheticShotId(id) && !savedOrderIds.has(id))
      const removed = new Set(removedShotIds)
      const clipOrder: Record<string, string[]> = {}
      // 사람이 보던 자리(저장한 순서, 영상 없는 칸까지) — 자리가 저절로 바뀐 만큼 사람이 놓은 소리도 옮기려고 견준다.
      const shownOrder: Record<string, string[]> = {}
      // 이번에 타임라인에 들어온 샷(영상이 새로 생긴 샷 · 저장 뒤 새로 생긴 샷) — 그 영상 소리를 아래에서 놓는다.
      const entered: string[] = []
      // 그중 영상이 새로 생긴 샷 — 새 영상이라 처음 상태(구간 · 빠르기 · 조각 없이)로 들인다(검토 c 리드 판단).
      const arrived = new Set<string>()
      const keptByScene = new Map<string, string[]>()
      for (const sceneId of canonicalOrder.keys()) {
        const savedIds = saved.clipOrder?.[sceneId] ?? []
        keptByScene.set(sceneId, savedIds.filter((shotId, index) => canonicalShotIds.has(shotId) && savedIds.indexOf(shotId) === index))
      }
      // 지금 있는 어느 장면의 저장 순서에든 놓인 샷은 다시 들이지 않는다 — 사람이 다른 장면으로 옮긴 샷 · Writer 에서 장면을 바꾼 샷이
      //   원래 장면에 한 번 더 깔리고 구간이 처음으로 돌아갔다(재검토 c H2 · H3, 2026-11-14). 약속: tests/editor/shots-with-video.test.ts
      const keptAnywhere = new Set([...keptByScene.values()].flat())
      for (const [sceneId, canonicalIds] of canonicalOrder) {
        const kept = keptByScene.get(sceneId) ?? []
        shownOrder[sceneId] = kept
        let order = kept.filter(playable)
        const story = cur.shots.filter((s) => s.sceneId === sceneId).map((s) => s.shotId)
        for (const id of story) {
          if (order.includes(id) || keptAnywhere.has(id) || !playable(id) || !savedShotIds.has(id) || removed.has(id)) continue
          order = placeInStory(order, id, story)
          entered.push(id)
          // 저장한 순서 어디에도 없던 샷만 영상이 새로 생긴 샷이다. 저장할 때의 장면이 없어져 옮겨 오는 샷은 고친 그대로 들인다.
          if (!savedOrderIds.has(id)) arrived.add(id)
        }
        const fresh = canonicalIds.filter((id) => !order.includes(id) && !savedShotIds.has(id) && playable(id))
        entered.push(...fresh)
        clipOrder[sceneId] = [...order, ...fresh]
      }
      // 타임라인에 없는 조각(자른 · 끼운 조각 · 타이틀 카드)은 버린다 — 샷 목록에만 남는 유령 조각이 없게(검토 c).
      const placedIds = new Set(Object.values(clipOrder).flat())
      const keep = (shotId: string) => !isSyntheticShotId(shotId) || placedIds.has(shotId)
      const timelineShots = combinedShots.filter((s) => keep(s.shotId))
      const timelineClips = combinedClips
        .filter((c) => keep(c.shotId))
        .map((c) => (arrived.has(c.shotId) ? freshClip(c) : c))
      // 이음 칸이 없는 예전 저장본은 지금 영상 자리 · 처음 나눈 자리와 맞는 소리를 다시 잇고, 이어진 소리는 되살린 영상 자리에 맞춘다(결정 4).
      //   같은 소리 파일의 파형은 저장본에 한 번만 있다 — 빠진 조각은 같은 파일의 파형을 함께 쓴다(검토 b).
      const timeline = { shots: timelineShots, videoClips: timelineClips, clipOrder }
      const relinked = relinkSavedAudio(sharePeaks(dedupAudioClips), timeline, { shots: cur.shots, videoClips: cur.videoClips }, saved.videoClips ?? [])
      // ★ 최종 Take 가 바뀌어 영상 주소가 달라졌으면 이어진 소리도 새 영상에서 다시 나눈다 — 사람이 바꾼 크기 · 음소거는 남기고,
      //   구간은 새 영상 자리에 맞추며(아래 맞추기), 파형은 편집 화면을 연 뒤 뒤에서 채운다(검토 c, 2026-11-14).
      const retargeted = relinked.map((a) => {
        const url = a.linkedShotId ? clipUrl.get(a.linkedShotId) : null
        return url && a.url !== url ? { ...a, url, peaks: [], sourceDurationSec: undefined } : a
      })
      // 자리가 저절로 바뀌었으면(영상 없는 샷이 빠지거나 영상이 생긴 샷이 들어옴) 그 자리 뒤에서 시작하는 사람이 놓은 소리도 같은 만큼
      //   옮긴다 — 그 자리 전부터 깔린 소리는 그대로(검토 c 리드 판단, 2단계 ㉠ 과 같은 원칙). 약속: tests/editor/shots-with-video.test.ts
      const shownLayout = selectTimelineLayout({ shots: combinedShots, videoClips: combinedClips, clipOrder: shownOrder })
      const nowLayout = new Map(selectTimelineLayout(timeline).map((l) => [l.shotId, l]))
      const takenOut = new Set(shownLayout.filter((l) => !nowLayout.has(l.shotId) && !isTitleCardShotId(l.shotId)).map((l) => rootShotIdOf(l.shotId)))
      const shifted = takenOut.size || entered.length
        ? retargeted.map((a) => (a.linkedShotId ? a : { ...a, startSec: movedTime(a.startSec, shownLayout, nowLayout) }))
        : retargeted
      let audioClips = syncLinkedAudio({ ...timeline, audioClips: shifted })
      // 들어온 샷은 그 영상 소리도 오디오 칸에 이어서 놓는다 — 처음 열 때처럼(오너 2026-11-10 결정 4). 파형은 편집 화면을 연 뒤
      //   뒤에서 채운다(open-editor 의 빈 파형 채우기). 사람이 고친 것이 아니라 되돌리기 칸에는 남지 않는다(아래 past: []).
      if (entered.length) {
        const layout = selectTimelineLayout(timeline)
        const locale = useLocaleStore.getState().locale
        const added: AudioTrackClip[] = []
        for (const shotId of entered) {
          const item = layout.find((l) => l.shotId === shotId)
          const url = clipUrl.get(shotId)
          if (!item || !url || audioClips.some((a) => a.linkedShotId === shotId)) continue
          const type = timelineShots.find((s) => s.shotId === shotId)?.shotType
          added.push({
            id: `audio_${uid()}`,
            name: translate(locale, '{type} audio', { type: type ?? translate(locale, 'Video') }),
            url,
            startSec: item.startSec,
            durationSec: item.durationSec,
            volume: 1,
            muted: false,
            peaks: [],
            sourceOffsetSec: 0,
            sourceDurationSec: item.durationSec,
            trackId: dedupTracks[0].id,
            linkedShotId: shotId,
          })
        }
        if (added.length) audioClips = syncLinkedAudio({ ...timeline, audioClips: [...audioClips, ...added] })
      }
      // 자리가 저절로 바뀌었으면 열 때 한 번 알린다 — 사람이 하지 않은 일로 뒤 컷 · 소리가 옮겨졌다(검토 c).
      const moved =
        shownLayout.some((l) => {
          const now = nowLayout.get(l.shotId)
          return !!now && Math.abs(now.startSec - l.startSec) > 0.0005
        }) || shifted.some((a, i) => a !== retargeted[i] && Math.abs(a.startSec - retargeted[i].startSec) > 0.0005)
      if (moved) {
        const locale = useLocaleStore.getState().locale
        const out = takenOut.size
        const came = entered.length
        toast.info(
          out && came
            ? translate(locale, 'Shots without video ({removed}) were taken out and new shots ({added}) came in, so the cuts and sounds after them moved.', { removed: out, added: came })
            : out
              ? translate(locale, 'Shots without video ({count}) were taken out, so the cuts and sounds after them moved.', { count: out })
              : translate(locale, 'New shots ({count}) came in, so the cuts and sounds after them moved.', { count: came }),
        )
      }
      // 영상이 새로 생겨 들어온 샷의 옛 구간 · 빠르기는 서버(DB)에서도 처음으로 — 다음에 열 때 옛 구간이 다시 입혀지지 않게.
      for (const id of arrived) {
        const before = cur.videoClips.find((c) => c.shotId === id)
        if (before && (before.trimStart != null || before.trimEnd != null)) persistShotReset('/api/editor/trim', { shotId: id, trimStart: null, trimEnd: null })
        if (before && (before.speed ?? 1) !== 1) persistShotReset('/api/editor/speed', { shotId: id, speed: 1 })
      }
      automatically(() => set({
        // Canonical shots/videoClips come from loadData (DB truth). Only synthetic editor
        // pieces whose base shot is still canonical are merged back in above - a local
        // snapshot must not resurrect deleted media when that DB snapshot is empty.
        shots: timelineShots,
        videoClips: timelineClips,
        clipOrder,
        removedShotIds,
        serverAware: saved.serverAware === true,
        audioClips,
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
      }))
    }
  },

  loadData: async () => {
    const loadEpoch = ++editorLoadEpoch
    const projectId = useProjectStore.getState().projectId
    set({ loadStatus: 'loading' })
    const emptyProjectData = {
      shots: [] as Shot[],
      videoClips: [] as VideoClip[],
      clipOrder: {} as Record<string, string[]>,
      removedShotIds: [] as string[],
      serverAware: false,
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

          // 영상이 있는 샷만 타임라인 컷이 된다 — 영상 없는 샷은 빈 칸으로 깔리지 않고 소스 칸에만 있다(오너 답 8, 2026-11-14).
          //   약속: tests/editor/shots-with-video.test.ts
          const withVideo = new Set(videoClips.filter((c) => c.url).map((c) => c.shotId))
          const order = buildClipOrder(shots.filter((s) => withVideo.has(s.shotId)))
          const firstSceneId = shots[0]?.sceneId ?? null

          automatically(() =>
            set({
              ...emptyProjectData,
              shots,
              videoClips,
              clipOrder: order,
              selectedSceneId: firstSceneId,
              selectedClipShotId: order[firstSceneId!]?.[0] ?? null,
              error: null,
              loadStatus: 'ready',
            }),
          )
          return
        }
        automatically(() => set({ ...emptyProjectData, error: null, loadStatus: 'ready' }))
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
    automatically(() => set((state) => ({
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
      removedShotIds: [],
      serverAware: false,
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
    })))
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

    set((state) =>
      withLinkedAudio(state, {
        videoClips: state.videoClips.map((c) =>
          c.shotId === shotId ? { ...c, speed: clamped } : c,
        ),
      }),
    )

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

    set((state) =>
      withLinkedAudio(state, {
        videoClips: state.videoClips.map((c) =>
          c.shotId === shotId ? { ...c, trimStart: start, trimEnd } : c,
        ),
        // 약속 J3: 타이틀 카드는 원본 영상이 없어 "원본 길이"가 없다 — 손잡이로 늘린 만큼 카드 길이가 길어진다.
        shots: isTitleCardShotId(shotId)
          ? state.shots.map((s) => (s.shotId === shotId && trimEnd > s.durationSeconds ? { ...s, durationSeconds: trimEnd } : s))
          : state.shots,
      }),
    )

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
      // 숨긴 클립에 이어진 소리는 함께 빠지고, 뒤 클립 소리는 영상처럼 당겨진다(결정 4).
      return withLinkedAudio(state, {
        clipOrder: newOrder,
        removedShotIds: withRemoved(state.removedShotIds, [shotId]),
        selectedShotIds: state.selectedShotIds.filter((id) => id !== shotId),
        selectedClipShotId:
          state.selectedClipShotId === shotId ? null : state.selectedClipShotId,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      })
    }),

  deleteSelectedClips: () =>
    set((state) => {
      const ids = new Set(state.selectedShotIds)
      if (ids.size === 0) return state
      const newOrder: Record<string, string[]> = {}
      for (const [sceneId, list] of Object.entries(state.clipOrder)) {
        newOrder[sceneId] = list.filter((id) => !ids.has(id))
      }
      return withLinkedAudio(state, {
        clipOrder: newOrder,
        removedShotIds: withRemoved(state.removedShotIds, [...ids]),
        selectedShotIds: [],
        selectedClipShotId: null,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      })
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

      return withLinkedAudio(state, {
        shots,
        clipOrder: cleared,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      })
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

      // 그 클립에 이어진 소리도 같은 자리에서 둘로 — 뒷조각 소리는 새 조각을 따라간다(결정 4).
      const audioClips = state.audioClips.flatMap((a) =>
        a.linkedShotId === shotId ? [a, { ...a, id: `audio_${uid()}`, linkedShotId: newId }] : [a],
      )

      return withLinkedAudio(state, {
        shots: [...state.shots, newShot],
        videoClips,
        audioClips,
        clipOrder: { ...state.clipOrder, [shot.sceneId]: order },
        selectedClipShotId: shotId,
        selectedAudioId: null,
        selectedAudioIds: [],
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      })
    }),

  // Video Source → 타임라인 드래그-투-애드. atGlobalSec 위치에 새 인스턴스(synthetic) 삽입.
  // 새 인스턴스 id 를 돌려준다 — 화면이 그 클립에 소리를 잇는다(결정 4). 원본이 없으면 null.
  addClipInstanceAt: (sourceShotId, atGlobalSec) => {
    let created: string | null = null
    set((state) => {
      const srcShot = state.shots.find((s) => s.shotId === sourceShotId)
      const srcClip = state.videoClips.find((c) => c.shotId === sourceShotId)
      // 영상이 없는 샷은 타임라인에 들이지 않는다 — 빈 칸이 생긴다(오너 답 8, 2026-11-14).
      if (!srcShot || !srcClip?.url) return state

      const newId = `${sourceShotId}__i${uid()}`
      created = newId
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

      return withLinkedAudio(state, {
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
      })
    })
    return created
  },

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
      //   영상에 이어진 소리는 그 클립을 따라 밀리고(결정 4), 따로 둔 소리만 이 규칙으로 민다.
      const audioClips = state.audioClips.map((a) =>
        !a.linkedShotId && a.startSec >= insertAtSec - 1e-6 ? { ...a, startSec: a.startSec + DEFAULT_DURATION } : a,
      )

      return withLinkedAudio(state, {
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
      })
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
      return withLinkedAudio(state, {
        shots: state.shots.map((s) => (s.shotId === shotId ? { ...s, durationSeconds: sec } : s)),
        videoClips: state.videoClips.map((c) => (c.shotId === shotId ? { ...c, trimStart: 0, trimEnd: sec } : c)),
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
      })
    }),

}))

// ── 자동 저장 ─────────────────────────────────────────────────────────────────
const serverSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const serverSaveGenerations = new Map<string, number>()
const serverSaveSnapshots = new Map<string, PersistedEditor>()
const serverSaveInFlight = new Map<string, boolean>()
// fatal 실패를 사용자에게 알린 프로젝트 — 프로젝트당 1회만 토스트 (콘솔은 개발자용).
const fatalSaveNotified = new Set<string>()
// 열 때 서버 편집을 읽지 못하고 연 프로젝트(E2b, 2026-11-14) — 서버에 쓰기 전에 서버를 다시 읽어, 이 브라우저가 못 본 샷 있는
//   편집이 서버에 있으면 쓰지 않는다. fresh = 처음 상태로 열었음(서버의 샷 있는 편집은 모두 남의 것), local = 이 브라우저 편집으로
//   열었음(이 브라우저가 마지막으로 본 시각 seen 뒤에 저장된 것만 남의 것 — 여는 규칙과 같다). 약속: tests/editor/other-browser.test.ts
const blindOpens = new Map<string, { opened: 'fresh' | 'local'; seen: string | undefined }>()
// 이번 화면에서 서버 쓰기를 멈춘 프로젝트 — 서버에 다른 곳 편집이 있어 덮지 않는다(이 브라우저에는 계속 저장). 다시 열면 풀린다.
const serverWritesStopped = new Set<string>()

/**
 * 서버에 써도 되는가 — 열 때 서버를 읽었으면 늘 된다('write'). 읽지 못하고 열었으면 지금 다시 읽어 본다: 다시 읽기도 실패하면 쓰지 않고
 *   뒤에서 다시 시도('wait' — 이 브라우저에는 저장돼 잃는 것이 없다, 검토 c 낮음 1), 이 브라우저가 못 본 샷 있는 편집이 서버에 있으면
 *   이번 화면에서는 쓰지 않는다('stop'). 다시 읽어 괜찮으면 '못 읽고 엶' 표시를 지워 다음부터 자기 저장을 남의 것으로 보지 않는다(낮음 2).
 */
async function serverWriteDecision(projectId: string): Promise<'write' | 'wait' | 'stop'> {
  const blind = blindOpens.get(projectId)
  if (!blind) return 'write'
  const copy = await readServerCopy(projectId)
  if (!copy) return 'wait'
  const elsewhere =
    hasShots(copy.state) &&
    (blind.opened === 'fresh' || (blind.seen !== undefined && savedLater(copy.updatedAt, blind.seen)))
  if (!elsewhere) {
    blindOpens.delete(projectId)
    return 'write'
  }
  serverWritesStopped.add(projectId)
  // 다시 열면 서버 편집이 열리고 이 화면에서 고친 것은 따로 칸에 한 벌 남는다(검토 c 낮음 3). [다시 열기]는 바로 다시 연다.
  const locale = useLocaleStore.getState().locale
  toast.warning(translate(locale, "There are edits saved in another browser. Changes you make here won't be saved to the server."), {
    duration: Number.POSITIVE_INFINITY,
    action: { label: translate(locale, 'Reopen'), onClick: () => useEditorStore.getState().reset() },
  })
  return 'stop'
}

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
      if (response.ok) {
        // 서버가 적은 저장 시각을 이 브라우저에 적어 둔다 — 다음에 열 때 그 뒤로 다른 곳에서 바뀌었는지 견준다(E2b, 2026-11-14).
        const body = (await response.json().catch(() => null)) as { updatedAt?: unknown } | null
        if (typeof body?.updatedAt === 'string') rememberServerSeenAt(projectId, body.updatedAt)
        return 'saved'
      }
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
  if (serverWritesStopped.has(projectId)) return Promise.resolve(null)
  if (serverSaveGenerations.get(projectId) !== generation) return Promise.resolve(null)
  if (serverSaveInFlight.get(projectId)) return Promise.resolve(null)

  const latestSnapshot = serverSaveSnapshots.get(projectId)
  if (!latestSnapshot) return Promise.resolve(null)
  serverSaveInFlight.set(projectId, true)
  return serverWriteDecision(projectId).then(async (decision) => {
    if (decision === 'stop') {
      // 서버에 다른 곳 편집이 있다 — 이번 화면에서는 서버에 쓰지 않는다(이 브라우저에는 이미 저장했다).
      serverSaveInFlight.delete(projectId)
      serverSaveSnapshots.delete(projectId)
      return null
    }
    if (decision === 'wait') {
      // 서버를 아직 다시 읽지 못했다 — 쓰지 않고 잠시 뒤 다시 읽어 본다.
      serverSaveInFlight.delete(projectId)
      scheduleServerSave(projectId, latestSnapshot, 5000, generation)
      return 'retry' as const
    }
    const result = await saveEditorStateToServer(
      projectId,
      latestSnapshot,
      () => serverSaveGenerations.get(projectId) === generation,
    )
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
  removedShotIds: s.removedShotIds,
  videoClips: s.videoClips,
  audioClips: s.audioClips,
  audioSources: s.audioSources,
  audioTracks: s.audioTracks,
  panelSizes: s.panelSizes,
})

/**
 * 저장본 — 고침 뒤 화면에서 사람이 고친 것이 실린 편집이면 그 표시(serverAware)를 함께 적는다(검토 c · 재검토 c 2/2, 2026-11-14).
 *   파형은 소수 둘째 자리로 줄인다(검토 A E2a).
 */
function persistSnapshot(state: EditorState): PersistedEditor {
  return compactSnapshot({ version: 1, ...(state.serverAware ? { serverAware: true } : {}), ...pickPersisted(state) })
}

/**
 * 지금 편집 상태를 바로 저장한다 — 이 브라우저에 쓰고 서버 답까지 기다린다. Editor 를 처음 열 때 소리를 다 나눈 결과를
 *   편집 화면을 열기 전에 남긴다(오너 2026-11-10 "DB에 다 올라왔을 때 내용이 보여지게"). 서버가 잠시 고장이면 뒤에서 다시 시도한다.
 *   약속: tests/editor/first-open.test.ts
 */
export function saveEditorNow(projectId: string): Promise<ServerSaveResult | null> {
  const snapshot = persistSnapshot(useEditorStore.getState())
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
      cur.removedShotIds === prev.removedShotIds &&
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

    // 사람이 고친 바뀜이면 이 편집에 사람 고침이 실렸다고 적는다 — 열 때 저절로 생긴 바뀜과 칸 크기는 빼고(재검토 c 2/2).
    if (automaticChanges === 0 && !state.serverAware) useEditorStore.setState({ serverAware: true })
    // 파형은 소수 둘째 자리로 줄여 저장한다(검토 A E2a — 꽉 차면 저장이 실패한다). 화면의 편집 상태는 그대로.
    const snapshot = persistSnapshot(useEditorStore.getState())
    saveEditorState(projectId, snapshot)
    scheduleServerSave(projectId, snapshot)
  })
}
