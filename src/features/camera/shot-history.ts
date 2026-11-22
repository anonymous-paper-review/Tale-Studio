// Camera 샷 줄의 이력(오너 2026-11-22 D2~D5 — "사진과 영상 히스토리가 계속 쌓이는 모양 … 이력 사이에 변경 내역 요약") — 화면이 쓰는 순수 규칙.
//   재료는 지금 저장된 것뿐이다(새 표 · 새 칸 없음): 실사 그림 판 = shots.storyboard_image.versions[], 영상 판 = 그 샷의 Take(video_clips).
//   차례: 그림 판은 다 그린 때(generatedAt), Take 는 부탁한 때(createdAt) — 오래된 판이 왼쪽, 새 판이 오른쪽(리드 11/22).
//   요약은 아는 사실만 적는다(처음 · 다시 · 올림 · 러프 바뀐 뒤 · 모델 · 해상도 · 쓴 그림 판 · 바꿀 점 · 이어서 · 상태). LLM 은 부르지 않는다.
//   약속: tests/camera/history.test.ts
import { storyboardImageVersions, currentStoryboardVersion } from '@/lib/director/storyboard-image-versions'
import { takeImageVersions, takePhaseOf, takeSettings, type ShotDetailTake, type TakePhase } from '@/lib/director/shot-detail'
import { VIDEO_MODELS, effectiveVideoResolution } from '@/lib/video-models'
import type { DialogueLine } from '@/types'
import type { ShotNodeData, StoryboardImage, StoryboardImageVersion, VideoOverride } from '@/types/director'
import { DEFAULT_VIDEO_MODE } from '@/lib/director/video-modes'
import { dialogueChangedSince, type DialogueLineLike } from '@/lib/director/dialogue-fingerprint'
import { VIDEO_MODE_LABEL, takeVideoMode } from './video-mode'

/** 요약 한 마디 — key 는 영어 원문 = i18n 키(모델 이름 · 해상도는 번역 없이 그대로 나온다). 화면이 t() 로 옮기고 " · " 로 잇는다. */
export interface HistoryPhrase {
  key: string
  params?: Record<string, string | number>
}

export type HistoryEntry =
  | {
      kind: 'image'
      id: string
      n: number
      at: number
      version: StoryboardImageVersion
      current: boolean
      used: boolean
      summary: HistoryPhrase[]
    }
  | {
      kind: 'take'
      id: string
      takeNumber: number
      at: number
      phase: TakePhase
      take: ShotDetailTake
      final: 'manual' | 'auto' | null
      used: boolean
      summary: HistoryPhrase[]
      /** 이 Take 를 만든 뒤 그 샷 대사가 바뀌었다(오너 2026-11-22 E3 — fb-video dialogueChangedSince 가 true 일 때만). 모르면 false. */
      dialogueChanged: boolean
    }
  | {
      /** 그리는 중 · 일괄 차례를 기다림 · 다시 그리기 실패 자리 — 판이 아니라 줄 끝의 알림 자리다(지금 그림은 그대로). */
      kind: 'image-pending'
      id: 'image-pending'
      phase: 'drawing' | 'waiting' | 'failed'
      at: number
      used: false
      summary: HistoryPhrase[]
    }
  | {
      /** 영상 묶음에서 차례를 기다리는 자리(아직 Take 가 없다). position 0 = 다음 차례. */
      kind: 'video-pending'
      id: 'video-pending'
      position: number
      at: number
      used: false
      summary: HistoryPhrase[]
    }

export type HistoryAction = 'useImage' | 'setFinal' | 'unsetFinal'

/** 그 샷의 그림 일 — 그리는 중 · 일괄이 맡아 차례를 기다림 · 다시 그리기 실패. 화면이 생성 상태 훅으로 정해 넘긴다. */
export type ImageWork = { phase: 'drawing' } | { phase: 'waiting' } | { phase: 'failed'; message?: string | null }

const ms = (value: string | null | undefined): number => {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

/** 그 판을 부탁한 사람 말(오너 2026-11-22 결정 4) — 아는 사실 뒤에 붙는다. 없으면 null. */
function notePhrase(version: StoryboardImageVersion): HistoryPhrase | null {
  const note = version.note?.trim()
  if (!note) return null
  return version.via === 'chat' ? { key: 'Asked in chat: {note}', params: { note } } : { key: 'Change: {note}', params: { note } }
}

function imageFacts(version: StoryboardImageVersion, previous: StoryboardImageVersion | null): HistoryPhrase {
  if (version.source === 'upload') return { key: 'Uploaded image' }
  if (version.cancelled) return { key: 'Finished after it was stopped' }
  if (!previous) return { key: 'First image' }
  const roughChanged = typeof version.roughGeneratedAt === 'number' && typeof previous.roughGeneratedAt === 'number' && version.roughGeneratedAt !== previous.roughGeneratedAt
  return { key: roughChanged ? 'Redrawn after the rough changed' : 'Drawn again' }
}

function imageSummary(version: StoryboardImageVersion, previous: StoryboardImageVersion | null): HistoryPhrase[] {
  const said = notePhrase(version)
  return said ? [imageFacts(version, previous), said] : [imageFacts(version, previous)]
}

/** 그 Take 의 사실 — 모델 · 실제 해상도 · 쓴 그림 판(시작 그림 기준) · 방식(오너 2026-11-22 D2~D5, 모르면 기본). */
function takeFacts(shot: Pick<ShotNodeData, 'provider'>, image: StoryboardImage | null | undefined, take: ShotDetailTake) {
  const setup = takeSettings(shot, take.data)
  return {
    model: VIDEO_MODELS[setup.model].label,
    resolution: take.data.videoResolution ?? effectiveVideoResolution(setup.model, setup.resolution),
    imageVersion: takeImageVersions(image, take.data)?.start ?? null,
    mode: takeVideoMode(take.data) ?? DEFAULT_VIDEO_MODE,
  }
}

function phasePhrase(take: ShotDetailTake, phase: TakePhase): HistoryPhrase | null {
  if (phase === 'making') return { key: 'Making' }
  if (phase === 'stopped') return { key: 'Stopped' }
  if (phase === 'idle') return { key: 'Not made yet' }
  if (phase === 'failed') {
    const reason = (take.data.lastAttemptError || take.data.errorMessage || '').split('\n')[0].trim()
    return reason ? { key: 'Failed: {reason}', params: { reason } } : { key: 'Failed' }
  }
  return null
}

function takeSummary(
  shot: Pick<ShotNodeData, 'provider'>,
  image: StoryboardImage | null | undefined,
  take: ShotDetailTake,
  previous: ShotDetailTake | null,
  phase: TakePhase,
): HistoryPhrase[] {
  const facts = takeFacts(shot, image, take)
  // 그 Take 를 만들 때 적은 사람 말(오너 2026-11-22 결정 4) — note 칸이 있으면 그것만(빈 말이면 없음), 없는 옛 Take 는 바꿀 점(changeNote).
  const override = (take.data.override ?? {}) as VideoOverride
  const note = (typeof override.note === 'string' ? override.note : override.changeNote ?? '').trim()
  const out: HistoryPhrase[] = []
  const state = phasePhrase(take, phase)
  if (state) out.push(state)
  if (!previous) {
    out.push({ key: 'First video' }, { key: facts.model }, { key: facts.resolution })
    if (facts.imageVersion !== null) out.push({ key: 'Image v{n}', params: { n: facts.imageVersion } })
    // 방식은 기본이 아닐 때만 적는다.
    if (facts.mode !== DEFAULT_VIDEO_MODE) out.push({ key: VIDEO_MODE_LABEL[facts.mode] })
  } else {
    const before = takeFacts(shot, image, previous)
    if (facts.model !== before.model) out.push({ key: facts.model })
    if (facts.resolution !== before.resolution) out.push({ key: facts.resolution })
    if (facts.imageVersion !== null && facts.imageVersion !== before.imageVersion) out.push({ key: 'Image v{n}', params: { n: facts.imageVersion } })
    // 앞 Take 와 방식이 바뀌었으면 바뀐 방식(기본으로 돌아와도 적는다).
    if (facts.mode !== before.mode) out.push({ key: VIDEO_MODE_LABEL[facts.mode] })
  }
  if (take.data.videoChainInputId) out.push({ key: 'Continued from the previous video' })
  if (note) out.push(override.via === 'chat' ? { key: 'Asked in chat: {note}', params: { note } } : { key: 'Change: {note}', params: { note } })
  // 앞 Take 와 같은 설정 · 같은 그림으로 다시 만든 것 — 아무것도 안 적으면 빈 칸이 된다.
  if (previous && out.length === (state ? 1 : 0)) out.push({ key: 'Made again' })
  return out
}

/**
 * 한 샷의 이력 — 그림 판과 Take 를 한 줄로(오래된 것 → 새것), 지금 그림 · ★ Take 는 쓰는 판, 나머지는 안 쓴 판.
 *   final 은 shotDetailTakes 의 결과(사람이 고른 ★, 없으면 가장 새 완성 Take 가 자동 ★)를 그대로 받는다 — Editor 로 가는 것과 같은 규칙.
 *   imageWork 가 있으면 줄 끝에 그리는 중 · 다시 그리기 실패 자리를 둔다(지금 그림 · 옛 판은 그대로).
 */
export function shotHistory(input: {
  image: StoryboardImage | null | undefined
  takes: readonly ShotDetailTake[]
  final: { id: string; auto: boolean } | null
  shot: Pick<ShotNodeData, 'provider'>
  /** 그 샷의 지금 대사(shots.dialogue_lines 그대로) — 대사 바뀜 판정(E3). undefined = 화면이 모른다(Writer 샷 없는 손으로 더한 샷) — 묻지 않는다. */
  dialogueLines?: readonly DialogueLineLike[] | null
  imageWork?: ImageWork | null
  /** 영상 묶음에서 이 샷의 차례(0 = 다음 차례). 기다리지 않으면 없음. */
  videoLine?: number | null
}): HistoryEntry[] {
  const versions = [...storyboardImageVersions(input.image)].sort((a, b) => a.n - b.n)
  const currentId = currentStoryboardVersion(input.image)?.id ?? null
  const images: HistoryEntry[] = versions.map((version, i) => ({
    kind: 'image',
    id: version.id,
    n: version.n,
    at: version.generatedAt,
    version,
    current: version.id === currentId,
    used: version.id === currentId,
    summary: imageSummary(version, i > 0 ? versions[i - 1]! : null),
  }))

  const takes = [...input.takes].sort((a, b) => ms(a.data.createdAt ?? a.data.lastAttemptAt) - ms(b.data.createdAt ?? b.data.lastAttemptAt) || a.data.takeNumber - b.data.takeNumber)
  const takeEntries: HistoryEntry[] = takes.map((take, i) => {
    const phase = takePhaseOf(take.data)
    const final = input.final?.id === take.id ? (input.final.auto ? 'auto' : 'manual') : null
    return {
      kind: 'take',
      id: take.id,
      takeNumber: take.data.takeNumber,
      at: ms(take.data.createdAt ?? take.data.lastAttemptAt),
      phase,
      take,
      final,
      used: final !== null,
      summary: takeSummary(input.shot, input.image, take, i > 0 ? takes[i - 1]! : null, phase),
      // 판정은 fb-video 의 dialogueChangedSince 하나 — 지문 칸을 직접 읽지 않는다. 'unknown'(옛 Take · 다시 만드는 중 · 재시도 실패)은 표시 없음.
      dialogueChanged: input.dialogueLines !== undefined && dialogueChangedSince(take.data, input.dialogueLines) === true,
    }
  })

  // 같은 때면 그림 판이 먼저(그림이 있어야 영상을 만든다), 그다음 번호 순.
  const order = (entry: HistoryEntry) => (entry.kind === 'image' ? entry.n : entry.kind === 'take' ? 10_000 + entry.takeNumber : 99_999)
  const entries = [...images, ...takeEntries].sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'image' ? -1 : 1) || order(a) - order(b))

  if (input.imageWork) {
    const failed = input.imageWork.phase === 'failed'
    const message = failed ? (input.imageWork as { message?: string | null }).message?.split('\n')[0].trim() : ''
    entries.push({
      kind: 'image-pending',
      id: 'image-pending',
      phase: input.imageWork.phase,
      at: Number.MAX_SAFE_INTEGER,
      used: false,
      summary: [
        failed
          ? message ? { key: 'Remake failed: {reason}', params: { reason: message } } : { key: 'Remake failed' }
          : input.imageWork.phase === 'waiting' ? { key: 'Waiting to generate image' } : { key: 'Drawing the image' },
      ],
    })
  }
  if (typeof input.videoLine === 'number' && input.videoLine >= 0) {
    entries.push({
      kind: 'video-pending',
      id: 'video-pending',
      position: input.videoLine,
      at: Number.MAX_SAFE_INTEGER,
      used: false,
      summary: [{ key: 'Waiting in line · #{n}', params: { n: input.videoLine + 1 } }],
    })
  }
  return entries
}

/** 판 카드에서 할 수 있는 일 — 지금 그림이 아닌 그림 판은 되돌리기(Take 0), 완성 Take 는 ★ 고르기 · 풀기(샷 상세 ★ 단추와 같은 규칙). */
export function historyActions(entry: HistoryEntry): HistoryAction[] {
  if (entry.kind === 'image') return entry.current ? [] : ['useImage']
  if (entry.kind === 'take') {
    if (entry.phase !== 'done') return []
    return entry.final === 'manual' ? ['unsetFinal'] : ['setFinal']
  }
  return []
}

/** 샷 줄 왼쪽의 대사 — 화자는 Writer 인물 이름(콘티 대사 탭과 같은 규칙), 화자가 없으면 V.O. */
export function dialogueRowLines(lines: readonly Pick<DialogueLine, 'characterId' | 'text'>[], nameById: ReadonlyMap<string, string>): { speaker: string; text: string }[] {
  return lines
    .filter((line) => typeof line.text === 'string' && line.text.trim())
    .map((line) => ({ speaker: line.characterId ? nameById.get(line.characterId) ?? line.characterId : 'V.O.', text: line.text.trim() }))
}

/** ★ 최종 Take(사람이 고른 것, 없으면 가장 새 완성 — 자동)의 대사가 바뀌었다 — 샷 줄에도 한 줄을 보인다(오너 E3). */
export function finalTakeDialogueChanged(entries: readonly HistoryEntry[]): boolean {
  return entries.some((entry) => entry.kind === 'take' && entry.final !== null && entry.dialogueChanged)
}
