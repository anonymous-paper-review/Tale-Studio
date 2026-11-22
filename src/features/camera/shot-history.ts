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
    }
  | {
      /** 다시 그리는 중이거나 다시 그리기가 실패한 자리 — 판이 아니라 줄 끝의 알림 자리다(지금 그림은 그대로). */
      kind: 'image-pending'
      id: 'image-pending'
      phase: 'drawing' | 'failed'
      at: number
      used: false
      summary: HistoryPhrase[]
    }

export type HistoryAction = 'useImage' | 'setFinal' | 'unsetFinal'

/** 그 샷의 그림 일 — 그리는 중(또는 일괄 차례를 기다림)이거나 다시 그리기가 실패했다. 화면이 생성 상태 훅으로 정해 넘긴다. */
export type ImageWork = { phase: 'drawing' } | { phase: 'failed'; message?: string | null }

const ms = (value: string | null | undefined): number => {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function imageSummary(version: StoryboardImageVersion, previous: StoryboardImageVersion | null): HistoryPhrase[] {
  if (version.source === 'upload') return [{ key: 'Uploaded image' }]
  if (version.cancelled) return [{ key: 'Finished after it was stopped' }]
  if (!previous) return [{ key: 'First image' }]
  const roughChanged = typeof version.roughGeneratedAt === 'number' && typeof previous.roughGeneratedAt === 'number' && version.roughGeneratedAt !== previous.roughGeneratedAt
  return [{ key: roughChanged ? 'Redrawn after the rough changed' : 'Drawn again' }]
}

/** 그 Take 의 사실 — 모델 · 실제 해상도 · 쓴 그림 판(시작 그림 기준). */
function takeFacts(shot: Pick<ShotNodeData, 'provider'>, image: StoryboardImage | null | undefined, take: ShotDetailTake) {
  const setup = takeSettings(shot, take.data)
  return {
    model: VIDEO_MODELS[setup.model].label,
    resolution: take.data.videoResolution ?? effectiveVideoResolution(setup.model, setup.resolution),
    imageVersion: takeImageVersions(image, take.data)?.start ?? null,
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
  const note = ((take.data.override ?? {}) as VideoOverride).changeNote?.trim() ?? ''
  const out: HistoryPhrase[] = []
  const state = phasePhrase(take, phase)
  if (state) out.push(state)
  if (!previous) {
    out.push({ key: 'First video' }, { key: facts.model }, { key: facts.resolution })
    if (facts.imageVersion !== null) out.push({ key: 'Image v{n}', params: { n: facts.imageVersion } })
  } else {
    const before = takeFacts(shot, image, previous)
    if (facts.model !== before.model) out.push({ key: facts.model })
    if (facts.resolution !== before.resolution) out.push({ key: facts.resolution })
    if (facts.imageVersion !== null && facts.imageVersion !== before.imageVersion) out.push({ key: 'Image v{n}', params: { n: facts.imageVersion } })
  }
  if (take.data.videoChainInputId) out.push({ key: 'Continued from the previous video' })
  if (note) out.push({ key: 'Change: {note}', params: { note } })
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
  imageWork?: ImageWork | null
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
      summary: [failed ? (message ? { key: 'Remake failed: {reason}', params: { reason: message } } : { key: 'Remake failed' }) : { key: 'Drawing the image' }],
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
