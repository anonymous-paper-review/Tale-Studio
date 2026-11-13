// 화면 전환 — 검정으로 물들이기(예전 디졸브, 2026-09-08 오너 지시 2번) · 흰색으로 물들이기 · 교차 디졸브 · 소리 페이드(2단계 ⑤, 오너 결정 4).
//
//   물들이기는 브라우저에서 두 영상을 섞어 그리는 부담을 피해 검은(흰) 막 하나를 영상 위에 두고 시간에 따라 투명도만 바꾼다(오너 결정).
//   교차 디졸브는 앞뒤 클립을 섞는다 — 두 클립을 겹쳐 한쪽의 투명도를 바꾼다(모자란 원본은 첫 장 · 끝 장에 멈춤, 차례는 그릴 것 목록).
//   컷 하나에 전환 하나 — 앞 클립 끝과 뒤 클립 시작이 맞닿은 컷의 전환은 뒤 클립의 transitionIn 이다. 맞닿지 않은 끝(빈 끝)만 그 클립 것이다.
//   자리: 맞닿은 컷은 경계 앞뒤로 반씩. 빈 끝의 교차 디졸브는 클립 안쪽(아래 줄 · 검정에서 나타나고 사라진다), 물들이기는 예전처럼 경계 가운데.
//   그릴 것 목록(selectFrameAt, 2단계 ⑦)이 이 순수 함수들로 시각마다 층 · 막을 정하고 모니터가 그 목록으로 그린다. 내보내기는 아직 예전
//   검은 막(dissolveOpacityAt)만 싣는다 — 같은 목록으로 그리는 것은 ⑦-2 에서.
//   약속: tests/editor/transitions-and-controls.test.ts · tests/editor/transitions-effects.test.ts
import { SEQUENCE_FPS } from '@/lib/editor/sequence-info'
import type { AudioTrackClip, ClipTransition, ClipTransitionType, VideoClip } from '@/types/shot'

export type { ClipTransition }

/** 전환 길이 — 끌어 놓은 전환은 1초로 시작하고, 0.5 · 1 · 2초 칸에서 고른다(효과 컨트롤 · 우클릭 메뉴). */
export const TRANSITION_DEFAULT_SEC = 1
export const TRANSITION_CHOICES = [0.5, 1, 2] as const
/** 예전 이름(검은 디졸브 하나이던 때) — 같은 값. */
export const DISSOLVE_DEFAULT_SEC = TRANSITION_DEFAULT_SEC

/** 클립의 시작(앞) · 끝(뒤). */
export type TransitionEdge = 'start' | 'end'

/** 효과 탭 · 우클릭 메뉴의 영상 전환 차례(시안 E2 409:5319–5328). */
export const VIDEO_TRANSITIONS: readonly ClipTransitionType[] = ['cross', 'dissolve', 'white']
/** 화면 이름 — 영어는 프리미어 이름, 한국어는 사전(오너 결정 4). */
export const TRANSITION_LABEL: Record<ClipTransitionType, string> = {
  cross: 'Cross dissolve',
  dissolve: 'Dip to black',
  white: 'Dip to white',
}
/** 소리 전환(페이드) 이름 — 프리미어 "Constant power". */
export const AUDIO_FADE_LABEL = 'Constant power'

const EDGE_EPS = 1e-3
const round3 = (n: number) => Math.round(n * 1000) / 1000
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** 끌어 놓은 자리 — 클립 앞쪽 절반이면 시작, 뒤쪽 절반(가운데 포함)이면 끝(시안 E2 409:5347). */
export function dropEdge(rect: { left: number; width: number }, clientX: number): TransitionEdge {
  return clientX < rect.left + rect.width / 2 ? 'start' : 'end'
}

/** 전환 값을 범위 안으로 — 모르는 종류는 검정으로 물들이기(예전 디졸브), 길이 0.1 ~ 10초. */
export function cleanTransition(transition: ClipTransition): ClipTransition {
  const type = VIDEO_TRANSITIONS.includes(transition.type) ? transition.type : 'dissolve'
  const sec = Number.isFinite(transition.durationSec) ? transition.durationSec : TRANSITION_DEFAULT_SEC
  return { type, durationSec: Math.max(0.1, Math.min(10, sec)) }
}

export interface LayoutItem {
  shotId: string
  startSec: number
  durationSec: number
  /** 그 클립이 줄에서 시작하는 초 — 위 줄에 가려졌다 다시 보이는 조각이면 startSec 보다 앞이다(2단계 ②). */
  clipStartSec?: number
}

/** 줄에 놓인 클립(selectVideoLayout) — 맞닿은 앞뒤 클립은 같은 줄에서만 찾는다. */
export interface TrackItem {
  shotId: string
  startSec: number
  durationSec: number
  trackId: string
}

type TransitionClip = Pick<VideoClip, 'shotId' | 'transitionIn' | 'transitionOut'>

/**
 * 전역 시각 t 에서 검은 막의 투명도(0 = 없음, 1 = 완전한 검정) — 예전 시작 디졸브(검정으로 물들이기). 내보내기가 이 함수로 그린다.
 *   디졸브가 걸린 클립의 시작 경계 B, 길이 D 에 대해 |t − B| < D/2 이면 1 − |t − B| / (D/2). 여러 경계가 겹치면 짙은 쪽.
 */
export function dissolveOpacityAt(layout: readonly LayoutItem[], clips: readonly Pick<VideoClip, 'shotId' | 'transitionIn'>[], t: number): number {
  let opacity = 0
  for (const item of layout) {
    // 클립 중간부터 보이는 조각(위 줄에 가려졌다 다시 보임)에는 그 클립의 시작 전환이 없다(2단계 ②).
    if (item.clipStartSec !== undefined && Math.abs(item.clipStartSec - item.startSec) > 1e-3) continue
    const clip = clips.find((c) => c.shotId === item.shotId)
    const tr = clip?.transitionIn
    if (!tr || tr.type !== 'dissolve') continue
    const half = Math.max(0.05, tr.durationSec) / 2
    const d = Math.abs(t - item.startSec)
    if (d >= half) continue
    opacity = Math.max(opacity, 1 - d / half)
  }
  return Math.min(1, Math.max(0, Math.round(opacity * 1000) / 1000))
}

/** 같은 줄에서 이 클립 시작(앞) · 끝(뒤)에 맞닿은 클립 — 없으면 null. */
export function joinedNeighbor(layout: readonly TrackItem[], shotId: string, edge: TransitionEdge): TrackItem | null {
  const item = layout.find((l) => l.shotId === shotId)
  if (!item) return null
  const at = edge === 'start' ? item.startSec : item.startSec + item.durationSec
  return (
    layout.find(
      (l) => l.trackId === item.trackId && l.shotId !== shotId && Math.abs((edge === 'start' ? l.startSec + l.durationSec : l.startSec) - at) < EDGE_EPS,
    ) ?? null
  )
}

/**
 * 클립 한 끝의 전환과 그 끝이 앞뒤 클립과 맞닿았는지 — 맞닿은 컷은 뒤 클립의 시작 전환(없으면 앞 클립의 끝 전환: 빈 끝에 넣은 뒤 클립을
 *   옮겨 붙인 경우), 빈 끝은 그 클립 것.
 */
export function edgeTransition(
  layout: readonly TrackItem[],
  clips: readonly TransitionClip[],
  shotId: string,
  edge: TransitionEdge,
): { transition: ClipTransition | null; joined: boolean } {
  const byId = (id: string) => clips.find((c) => c.shotId === id)
  const joined = joinedNeighbor(layout, shotId, edge)
  const own = byId(shotId)
  if (edge === 'start') return { transition: own?.transitionIn ?? (joined ? byId(joined.shotId)?.transitionOut : null) ?? null, joined: !!joined }
  if (joined) return { transition: byId(joined.shotId)?.transitionIn ?? own?.transitionOut ?? null, joined: true }
  return { transition: own?.transitionOut ?? null, joined: false }
}

/** 줄 위에서 전환이 걸린 구간 — 미리 보기와 타임라인 칸이 쓴다. */
export interface TransitionWindow {
  type: ClipTransitionType
  trackId: string
  /** 경계 시각(초). */
  atSec: number
  fromSec: number
  toSec: number
  /** 경계에서 끝나는 클립(빈 시작이면 null) · 경계에서 시작하는 클립(빈 끝이면 null). */
  outgoing: string | null
  incoming: string | null
}

function placeWindow(transition: ClipTransition, trackId: string, atSec: number, outgoing: TrackItem | null, incoming: TrackItem | null): TransitionWindow {
  const d = Math.max(0.05, transition.durationSec)
  let fromSec = atSec - d / 2
  let toSec = atSec + d / 2
  if (transition.type === 'cross') {
    if (outgoing && incoming) {
      // 맞닿은 컷 — 경계 앞뒤로 반씩, 짧은 클립보다 길게 걸치지 않는다.
      const half = Math.min(d / 2, outgoing.durationSec, incoming.durationSec)
      fromSec = atSec - half
      toSec = atSec + half
    } else if (incoming) {
      fromSec = atSec
      toSec = atSec + Math.min(d, incoming.durationSec)
    } else if (outgoing) {
      fromSec = atSec - Math.min(d, outgoing.durationSec)
      toSec = atSec
    }
  }
  return {
    type: transition.type,
    trackId,
    atSec: round3(atSec),
    fromSec: round3(fromSec),
    toSec: round3(toSec),
    outgoing: outgoing?.shotId ?? null,
    incoming: incoming?.shotId ?? null,
  }
}

/**
 * 모든 줄의 전환 구간 — 맞닿은 컷마다 하나, 빈 끝마다 그 클립 것. 경계 시각 차례. 양끝이 모두 교차 디졸브인 클립은 한쪽에 길이의 반까지만
 *   내준다 — 짧은 클립 양끝의 두 구간이 겹치면 한쪽만 그려져 한 장에 튀었다(검토 c (E) 1).
 */
export function transitionWindows(layout: readonly TrackItem[], clips: readonly TransitionClip[]): TransitionWindow[] {
  const byId = new Map(clips.map((c) => [c.shotId, c]))
  const tracks = new Map<string, TrackItem[]>()
  for (const item of layout) if (item.durationSec > 0) tracks.set(item.trackId, [...(tracks.get(item.trackId) ?? []), item])
  const out: TransitionWindow[] = []
  for (const [trackId, items] of tracks) {
    items.sort((a, b) => a.startSec - b.startSec)
    const joined = (a: TrackItem | undefined, b: TrackItem | undefined) => !!a && !!b && Math.abs(a.startSec + a.durationSec - b.startSec) < EDGE_EPS
    const prevOf = items.map((item, i) => (joined(items[i - 1], item) ? items[i - 1] : null))
    const nextOf = items.map((item, i) => (joined(item, items[i + 1]) ? items[i + 1] : null))
    const startOf = items.map((item, i) => byId.get(item.shotId)?.transitionIn ?? (prevOf[i] ? byId.get(prevOf[i]!.shotId)?.transitionOut : null) ?? null)
    const endOf = items.map((item, i) => (nextOf[i] ? startOf[i + 1] : (byId.get(item.shotId)?.transitionOut ?? null)))
    // 교차 디졸브가 이 클립에 걸칠 수 있는 길이 — 양끝이 모두 교차 디졸브면 반씩.
    const share = items.map((item, i) => ({ ...item, durationSec: startOf[i]?.type === 'cross' && endOf[i]?.type === 'cross' ? item.durationSec / 2 : item.durationSec }))
    items.forEach((item, i) => {
      const start = startOf[i]
      if (start) out.push(placeWindow(start, trackId, item.startSec, prevOf[i] ? share[i - 1] : null, share[i]))
      const end = endOf[i]
      if (!nextOf[i] && end) out.push(placeWindow(end, trackId, item.startSec + item.durationSec, share[i], null))
    })
  }
  return out.sort((a, b) => a.atSec - b.atSec)
}

/** 미리 보기 · 내보내기가 그 시각에 그리는 맨 위 클립. */
function topAt(program: readonly LayoutItem[], sec: number): string | null {
  return program.find((p) => sec >= p.startSec && sec < p.startSec + p.durationSec)?.shotId ?? null
}

/** 그 경계가 화면에 보이나 — 경계 바로 앞에 끝나는 클립이나 바로 뒤에 시작하는 클립이 맨 위다(위 줄에 가린 경계는 그리지 않는다). */
function edgeVisible(w: TransitionWindow, program: readonly LayoutItem[]): boolean {
  return (w.outgoing !== null && topAt(program, w.atSec - EDGE_EPS) === w.outgoing) || (w.incoming !== null && topAt(program, w.atSec + EDGE_EPS) === w.incoming)
}

/** 시각 t 의 물들이기 막 — 검정 · 흰색 투명도(0 = 없음, 1 = 꽉 참). 경계 가운데가 가장 짙다. */
export function dipOpacityAt(windows: readonly TransitionWindow[], program: readonly LayoutItem[], t: number): { black: number; white: number } {
  let black = 0
  let white = 0
  for (const w of windows) {
    if (w.type === 'cross' || t <= w.fromSec || t >= w.toSec || !edgeVisible(w, program)) continue
    const opacity = 1 - Math.abs(t - w.atSec) / ((w.toSec - w.fromSec) / 2)
    if (w.type === 'white') white = Math.max(white, opacity)
    else black = Math.max(black, opacity)
  }
  return { black: round3(clamp01(black)), white: round3(clamp01(white)) }
}

/** 영상 층의 원본 시각(초) — 클립 밖(교차 디졸브 짝 · 미리 불러 둔 층)에서 경계 너머에 남은 원본이 없으면 첫 장 · 끝 장에 멈춘다(held). */
export function crossSourceSec(
  item: { startSec: number },
  clip: Pick<VideoClip, 'trimStart' | 'speed'>,
  sourceLenSec: number,
  t: number,
): { sec: number; held: boolean } {
  const local = (clip.trimStart ?? 0) + (t - item.startSec) * (clip.speed ?? 1)
  const last = Math.max(0, sourceLenSec - 1 / SEQUENCE_FPS)
  if (local < 0) return { sec: 0, held: true }
  if (local > last) return { sec: last, held: true }
  return { sec: local, held: false }
}

/** 빈 끝의 교차 디졸브로 그 클립이 옅어진 정도(1 = 그대로, 0 = 아래가 다 비침) — 빈 시작은 0 → 1, 빈 끝은 1 → 0. */
export function edgeFadeAt(windows: readonly TransitionWindow[], shotId: string, t: number): number {
  let fade = 1
  for (const w of windows) {
    if (w.type !== 'cross' || (w.outgoing && w.incoming) || t < w.fromSec || t > w.toSec) continue
    if (w.incoming === shotId) fade = Math.min(fade, (t - w.fromSec) / (w.toSec - w.fromSec))
    else if (w.outgoing === shotId) fade = Math.min(fade, (w.toSec - t) / (w.toSec - w.fromSec))
  }
  return round3(clamp01(fade))
}

/**
 * 소리 조각의 페이드 세기(0 ~ 1) — 지속 가감(Constant power): 페이드 인은 sin(진행 × π/2) 로 0 에서 커지고, 페이드 아웃은 끝을 향해
 *   같은 곡선으로 작아진다. 조각보다 긴 페이드는 조각 길이까지만.
 */
export function audioFadeGain(clip: Pick<AudioTrackClip, 'startSec' | 'durationSec' | 'fadeInSec' | 'fadeOutSec'>, t: number): number {
  const local = t - clip.startSec
  const fadeIn = Math.min(clip.fadeInSec ?? 0, clip.durationSec)
  const fadeOut = Math.min(clip.fadeOutSec ?? 0, clip.durationSec)
  let gain = 1
  if (fadeIn > 0 && local < fadeIn) gain = Math.min(gain, Math.sin((clamp01(local / fadeIn) * Math.PI) / 2))
  const left = clip.durationSec - local
  if (fadeOut > 0 && left < fadeOut) gain = Math.min(gain, Math.sin((clamp01(left / fadeOut) * Math.PI) / 2))
  return round3(gain)
}
