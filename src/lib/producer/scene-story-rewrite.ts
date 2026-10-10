// 트리트먼트 다시 쓰기(2026-10-02 오너 — tale-proto-v04 "다시 쓰기 · v1 v2 v3"). 얼마나 바꿀지 세 가지 중 하나를 고르면
//   Writer 앞단이 세 번 돌아 세 가지 안을 만든다. 안 하나하나는 원문과 떨어진 수정안(SceneStoryProposal)의 칸이라,
//   적용하기 전까지 트리트먼트는 그대로다. 미리 보기는 바뀐 문단만 이전 글(취소선)과 새 글(초록 바탕)을 함께 보인다.
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'
import type { BackgroundContract, Characters, Dramaturgy, NarrativeStructure, Scenes } from '@/lib/writer/types/pipeline'
import type { SceneStoryProposal } from '@/lib/producer/scene-story-proposal'

export type RewriteLevel = 'polish' | 'reword' | 'rethink'
export type RewriteDirection = 'tidy' | 'warmer' | 'tense' | 'brisk'
export type RewriteVariantId = 'v1' | 'v2' | 'v3'

/** 채팅 선택지와 같은 문구(영어 원문 = 사전 키). label 은 버튼, utterance 는 고른 뒤 채팅에 남는 말. */
export const REWRITE_LEVELS: ReadonlyArray<{ level: RewriteLevel; label: string; utterance: string }> = [
  { level: 'polish', label: 'Light polish', utterance: 'Keep the scene story content and only polish the sentences.' },
  { level: 'reword', label: 'Fresh wording', utterance: 'Keep the story flow and rewrite the wording.' },
  { level: 'rethink', label: 'Rethink the idea', utterance: 'Rework the scene story, including its events and ending.' },
]

/** 안마다 보이는 꼬리표(시안 v04 tag 그대로). */
export const REWRITE_DIRECTION_LABELS: Record<RewriteDirection, string> = {
  tidy: 'Sentences polished only',
  warmer: 'A little warmer',
  tense: 'More tension',
  brisk: 'Shorter and quicker',
}

// 시안 v04 RW_LEVELS 의 reqs 순서 그대로 — v1 · v2 · v3 이 서로 다른 쪽으로 가게 한다.
const LEVEL_DIRECTIONS: Record<RewriteLevel, [RewriteDirection, RewriteDirection, RewriteDirection]> = {
  polish: ['tidy', 'warmer', 'brisk'],
  reword: ['warmer', 'tense', 'brisk'],
  rethink: ['tense', 'warmer', 'brisk'],
}

export function rewriteDirections(level: RewriteLevel): RewriteDirection[] {
  return [...LEVEL_DIRECTIONS[level]]
}

/** 선택지 버튼 이름이나 그 말(영어 원문 또는 지금 언어)을 정도로 알아듣는다. 다른 말이면 null — 그건 수정안 하나로 간다. */
export function rewriteLevelOf(text: string, locale: AppLocale): RewriteLevel | null {
  const said = text.trim()
  if (!said) return null
  for (const option of REWRITE_LEVELS) {
    const forms = [option.label, option.utterance, translate(locale, option.label), translate(locale, option.utterance)]
    if (forms.some((form) => form.trim() === said)) return option.level
  }
  return null
}

export interface SceneStoryRewriteVariant {
  id: RewriteVariantId
  direction: RewriteDirection
  status: 'generating' | 'ready' | 'failed'
  scenes?: Scenes
  /** 아이디어부터 다시만 — 이 안을 적용하면 이야기 엔진과 구조도 함께 바뀐다. */
  dramaturgy?: Dramaturgy | null
  narrativeStructure?: NarrativeStructure
  characters?: Characters
  world?: BackgroundContract
  error?: string
}

export function newRewriteProposal(input: {
  id: string
  level: RewriteLevel
  feedback: string
  baseScenes: Scenes
  createdAt: string
}): SceneStoryProposal {
  const ids: RewriteVariantId[] = ['v1', 'v2', 'v3']
  return {
    id: input.id,
    status: 'generating',
    feedback: input.feedback,
    createdAt: input.createdAt,
    baseScenes: input.baseScenes,
    level: input.level,
    variants: LEVEL_DIRECTIONS[input.level].map((direction, index) => ({ id: ids[index], direction, status: 'generating' })),
  }
}

/** 안 하나를 수정안 한 벌처럼 다룬다 — 적용 · 충돌 판정은 수정안과 같은 규칙(mergeSceneStoryProposal)을 쓴다. */
export function variantProposal(proposal: SceneStoryProposal, variantId: string): SceneStoryProposal | null {
  const variant = proposal.variants?.find((item) => item.id === variantId)
  if (!variant || variant.status !== 'ready' || !variant.scenes) return null
  return { ...proposal, status: 'ready', scenes: variant.scenes, variants: undefined }
}

/** 안들의 상태 → 수정안 전체 상태. 하나라도 만드는 중이면 만드는 중, 하나라도 나왔으면 고를 수 있다. */
export function rewriteStatus(variants: readonly SceneStoryRewriteVariant[]): SceneStoryProposal['status'] {
  if (variants.some((variant) => variant.status === 'generating')) return 'generating'
  return variants.some((variant) => variant.status === 'ready') ? 'ready' : 'failed'
}

export type TreatmentDiffRow =
  | { kind: 'same'; number: number; after: string }
  | { kind: 'changed'; number: number; before: string; after: string }
  | { kind: 'added'; number: number; after: string }
  | { kind: 'removed'; number: null; before: string }

/** 씬(문단) 단위 비교 — 같은 씬끼리 짝짓고, 새 순서대로 늘어놓는다. 없어진 씬은 원래 자리 근처에 이전 글만 남긴다. */
export function treatmentDiff(
  before: ReadonlyArray<{ sceneId: string; text: string }>,
  after: ReadonlyArray<{ sceneId: string; text: string }>,
): TreatmentDiffRow[] {
  const beforeIndex = new Map(before.map((scene, index) => [scene.sceneId, index]))
  const matched = new Set<number>()
  for (const scene of after) {
    const index = beforeIndex.get(scene.sceneId)
    if (index !== undefined) matched.add(index)
  }
  const rows: TreatmentDiffRow[] = []
  let cursor = 0
  const flushRemoved = (until: number) => {
    for (; cursor < until; cursor++) {
      if (!matched.has(cursor)) rows.push({ kind: 'removed', number: null, before: before[cursor].text })
    }
  }
  after.forEach((scene, position) => {
    const number = position + 1
    const index = beforeIndex.get(scene.sceneId)
    if (index === undefined) {
      rows.push({ kind: 'added', number, after: scene.text })
      return
    }
    flushRemoved(index)
    cursor = Math.max(cursor, index + 1)
    const previous = before[index].text
    rows.push(previous === scene.text ? { kind: 'same', number, after: scene.text } : { kind: 'changed', number, before: previous, after: scene.text })
  })
  flushRemoved(before.length)
  return rows
}
