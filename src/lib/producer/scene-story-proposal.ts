import type { Scenes } from '@/lib/writer/types/pipeline'
import { rewriteStatus, type RewriteLevel, type SceneStoryRewriteVariant } from '@/lib/producer/scene-story-rewrite'

export interface SceneStoryProposal {
  id: string
  status: 'generating' | 'ready' | 'failed'
  feedback: string
  createdAt: string
  baseScenes: Scenes
  scenes?: Scenes
  error?: string
  /** 다시 쓰기(2026-10-02 시안 v04) — 정도 하나에 세 가지 안. 있으면 scenes 대신 안마다 결과가 있다. */
  level?: RewriteLevel
  variants?: SceneStoryRewriteVariant[]
  /** 조건으로 다시 쓰기(리뉴얼 1차 2026-10-19) — 세 안이 쓰인 러닝타임 · 장르·분위기 · 소재. 안을 적용할 때 지금 산문의 조건이 된다. */
  conditions?: import('@/lib/writer/prose-conditions').ProseConditions
}

export interface SceneStoryProposalView {
  id: string
  status: SceneStoryProposal['status']
  feedback: string
  createdAt: string
  before: Array<{ sceneId: string; index: number; beats: string[] }>
  after: Array<{ sceneId: string; index: number; beats: string[] }>
  stale: boolean
  error?: string
  level?: RewriteLevel
  /** 조건으로 다시 쓴 세 안이면 그 조건(리뉴얼 1차). */
  conditions?: SceneStoryProposal['conditions']
  variants?: Array<{
    id: SceneStoryRewriteVariant['id']
    direction: SceneStoryRewriteVariant['direction']
    status: SceneStoryRewriteVariant['status']
    after: Array<{ sceneId: string; index: number; beats: string[] }>
    stale: boolean
    error?: string
  }>
}

export const SCENE_STORY_PROPOSAL_TIMEOUT_MS = 300_000

export function sceneStoryProposalExpired(proposal: SceneStoryProposal, now = Date.now()): boolean {
  return proposal.status === 'generating' && now - Date.parse(proposal.createdAt) >= SCENE_STORY_PROPOSAL_TIMEOUT_MS
}

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const sceneIds = (scenes: Scenes) => scenes.scenes.map((scene) => scene.scene_id)

type SceneRow = SceneStoryProposalView['before'][number]
const sceneRows = (value: Scenes | undefined): SceneRow[] => (value?.scenes ?? []).map((scene, index) => ({
  sceneId: scene.scene_id, index, beats: scene.scene_actions,
}))

/** 수정안 카드의 비교 줄 — 같은 자리 · 같은 글인 씬은 빼고 바뀐 씬만 남긴다. */
export function changedSceneRows(before: SceneRow[], after: SceneRow[]): Array<{ id: string; before?: SceneRow; after?: SceneRow }> {
  return [...new Set([...before, ...after].map((scene) => scene.sceneId))].flatMap((id) => {
    const was = before.find((scene) => scene.sceneId === id)
    const now = after.find((scene) => scene.sceneId === id)
    return was?.index === now?.index && equal(was?.beats, now?.beats) ? [] : [{ id, before: was, after: now }]
  })
}

/** 고친 결과가 지금 산문과 한 글자도 다르지 않다(씬 · 순서 · 글이 모두 같다) — 카드로 보일 수정안이 아니다(디자이너 QA 1차 #01). */
export function sceneStoryUnchanged(base: Scenes, after: Scenes): boolean {
  return changedSceneRows(sceneRows(base), sceneRows(after)).length === 0
}

/** 적용 · 버리기를 마친 수정안은 미리 보기를 다시 읽기 전이라도 카드에서 내린다(디자이너 QA 1차 관찰 26).
 *  resolved = 이 프로젝트에서 마지막으로 정한 수정안. 새로 오는 다른 수정안은 그대로 보인다. */
export function unresolvedSceneStoryProposal<T extends { id: string }>(
  proposal: T | null | undefined,
  resolved: { projectId: string; id: string } | null | undefined,
  projectId: string | null | undefined,
): T | null {
  if (!proposal) return null
  return resolved && resolved.projectId === projectId && resolved.id === proposal.id ? null : proposal
}

/** AI가 바꾼 씬만 적용한다. 구성 변경은 초안 전체가 그대로일 때만 허용한다. */
export function mergeSceneStoryProposal(proposal: SceneStoryProposal, current: Scenes): Scenes | null {
  const { baseScenes: base, scenes: after } = proposal
  if (!after || proposal.status !== 'ready') return null
  if (!after.scenes.length || new Set(sceneIds(after)).size !== after.scenes.length) return null
  if (!equal(sceneIds(base), sceneIds(current))) return null
  if (!equal(sceneIds(base), sceneIds(after))) return equal(base, current) ? after : null

  const merged = []
  for (let index = 0; index < base.scenes.length; index++) {
    const before = base.scenes[index]
    const next = after.scenes[index]
    const latest = current.scenes[index]
    if (equal(before, next)) merged.push(latest)
    else {
      if (!equal(before, latest)) return null
      merged.push(next)
    }
  }
  return { ...after, scenes: merged }
}

export function sceneStoryProposalView(
  proposal: SceneStoryProposal | null | undefined,
  current: Scenes | undefined,
  now = Date.now(),
): SceneStoryProposalView | null {
  if (!proposal) return null
  const expired = sceneStoryProposalExpired(proposal, now)
  if (proposal.variants?.length) {
    // 오래 걸려 끝나지 않은 안은 실패로 본다 — 나온 안은 그대로 고를 수 있다.
    const variants = proposal.variants.map((variant) => {
      const status = expired && variant.status === 'generating' ? 'failed' as const : variant.status
      const asProposal = status === 'ready' && variant.scenes ? { ...proposal, status, scenes: variant.scenes, variants: undefined } : null
      return {
        id: variant.id,
        direction: variant.direction,
        status,
        after: sceneRows(variant.scenes),
        stale: !current || (asProposal ? mergeSceneStoryProposal(asProposal, current) === null : !equal(proposal.baseScenes, current)),
        ...(status === 'failed' ? { error: variant.error ?? 'scene_story_rewrite_timed_out' } : {}),
      }
    })
    const status = rewriteStatus(variants)
    return {
      id: proposal.id,
      status,
      feedback: proposal.feedback,
      createdAt: proposal.createdAt,
      before: sceneRows(proposal.baseScenes),
      after: [],
      stale: !current || !equal(proposal.baseScenes, current),
      level: proposal.level,
      ...(proposal.conditions ? { conditions: proposal.conditions } : {}),
      variants,
    }
  }
  return {
    id: proposal.id,
    status: expired ? 'failed' : proposal.status,
    feedback: proposal.feedback,
    createdAt: proposal.createdAt,
    before: sceneRows(proposal.baseScenes),
    after: sceneRows(proposal.scenes),
    stale: !current || (proposal.status === 'ready'
      ? mergeSceneStoryProposal(proposal, current) === null
      : !equal(proposal.baseScenes, current)),
    ...(expired ? { error: 'scene_story_proposal_timed_out' } : proposal.error ? { error: proposal.error } : {}),
  }
}
