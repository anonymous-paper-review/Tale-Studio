import type { Scenes } from '@/lib/writer/types/pipeline'

export interface SceneStoryProposal {
  id: string
  status: 'generating' | 'ready' | 'failed'
  feedback: string
  createdAt: string
  baseScenes: Scenes
  scenes?: Scenes
  error?: string
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
}

export const SCENE_STORY_PROPOSAL_TIMEOUT_MS = 300_000

export function sceneStoryProposalExpired(proposal: SceneStoryProposal, now = Date.now()): boolean {
  return proposal.status === 'generating' && now - Date.parse(proposal.createdAt) >= SCENE_STORY_PROPOSAL_TIMEOUT_MS
}

const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
const sceneIds = (scenes: Scenes) => scenes.scenes.map((scene) => scene.scene_id)

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
  const scenes = (value: Scenes | undefined) => (value?.scenes ?? []).map((scene, index) => ({
    sceneId: scene.scene_id, index, beats: scene.scene_actions,
  }))
  return {
    id: proposal.id,
    status: expired ? 'failed' : proposal.status,
    feedback: proposal.feedback,
    createdAt: proposal.createdAt,
    before: scenes(proposal.baseScenes),
    after: scenes(proposal.scenes),
    stale: !current || (proposal.status === 'ready'
      ? mergeSceneStoryProposal(proposal, current) === null
      : !equal(proposal.baseScenes, current)),
    ...(expired ? { error: 'scene_story_proposal_timed_out' } : proposal.error ? { error: proposal.error } : {}),
  }
}
