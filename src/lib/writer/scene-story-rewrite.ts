// 트리트먼트 다시 쓰기(2026-10-02 오너 — 시안 v04 "앞단이 3번 돌게 됨"). 고른 정도로 세 가지 안을 한꺼번에 만들고,
//   안 하나가 끝날 때마다 최신 실행을 다시 읽어 그 칸만 저장한다. 본문(scenes)과 원문 버전은 건드리지 않는다 —
//   적용 · 버리기는 scene-gate 라우트가 한다. 버렸거나 바뀐 수정안의 늦은 결과는 되살리지 않는다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getActiveRun } from '@/lib/writer/run-store'
import { sceneStoryProposalExpired, type SceneStoryProposal } from '@/lib/producer/scene-story-proposal'
import { rewriteStatus, type SceneStoryRewriteVariant } from '@/lib/producer/scene-story-rewrite'
import { mergeOpenCast, mergeOpenWorld, runScenes } from '@/lib/writer/pipeline/stages/s3_scenes'
import { runDramaturgySafe } from '@/lib/writer/pipeline/stages/s0_dramaturgy'
import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure'
import { rethinkStory, rewriteNote } from '@/lib/writer/pipeline/rewrite/instructions'
import { castContractToCharacters } from '@/lib/writer/cast-contract'
import { resolveModels } from '@/lib/writer/pipeline'
import { PipelineLogger } from '@/lib/writer/logger'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'

type VariantResult = Pick<SceneStoryRewriteVariant, 'status' | 'scenes' | 'dramaturgy' | 'narrativeStructure' | 'characters' | 'world' | 'error'>

const SAVE_ATTEMPTS = 8

async function writeVariant(state: WriterRunState, proposal: SceneStoryProposal, variant: SceneStoryRewriteVariant, logger: PipelineLogger): Promise<VariantResult> {
  const model = resolveModels(state.input).S
  if (!state.genre) throw new Error('Missing scene generation context')
  if (proposal.level === 'rethink') {
    // 처음 아이디어로 — Producer 가 넘긴 인물 · 배경만 들고 이야기 엔진 · 구조 · 씬을 새로 돈다. 앞선 수정 요청은 지난 초안의 것이라 싣지 않는다.
    const input = { ...state.input, story: rethinkStory(state.input.story, proposal.baseScenes, variant.direction) }
    const seedCharacters = castContractToCharacters(state.input.cast ?? { characters: [] })
    const dramaturgy = await runDramaturgySafe(input, state.genre, seedCharacters, logger, model)
    const narrativeStructure = await runNarrativeStructure(input, state.genre, logger, model, dramaturgy)
    const scenes = await runScenes(input, state.genre, narrativeStructure, seedCharacters, state.input.background, logger, model, [rewriteNote('rethink', variant.direction)], dramaturgy, undefined)
    return {
      status: 'ready',
      scenes,
      dramaturgy,
      narrativeStructure,
      characters: mergeOpenCast(seedCharacters, scenes),
      world: mergeOpenWorld(state.input.background, scenes, dramaturgy?.world_inventory),
    }
  }
  if (!state.narrativeStructure || !state.characters) throw new Error('Missing scene generation context')
  const scenes = await runScenes(
    state.input, state.genre, state.narrativeStructure, state.characters, state.world, logger, model,
    [...(state._sceneRevisionNotes ?? []), rewriteNote(proposal.level ?? 'reword', variant.direction)],
    state.dramaturgy ?? null, proposal.baseScenes,
  )
  return { status: 'ready', scenes }
}

/** 최신 실행에 안 하나의 결과만 얹는다. 같은 수정안 · 같은 실행 · 아직 만드는 중인 칸일 때만. */
async function saveVariant(projectId: string, runId: string, proposalId: string, variantId: string, result: VariantResult): Promise<void> {
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
    const latest = await getActiveRun(projectId)
    if (!latest || latest.id !== runId || latest.status !== 'awaiting_confirmation') return
    const current = latest.state as WriterRunState
    const pending = current._sceneStoryProposal
    const slot = pending?.variants?.find((variant) => variant.id === variantId)
    if (!pending || pending.id !== proposalId || !slot || slot.status !== 'generating' || sceneStoryProposalExpired(pending)) return
    const variants = pending.variants!.map((variant) => (variant.id === variantId ? { ...variant, ...result } : variant))
    const next: SceneStoryProposal = { ...pending, variants, status: rewriteStatus(variants) }
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(latest.updated_at) + 1)).toISOString()
    const { data, error } = await supabaseAdmin.from('writer_runs')
      .update({ state: { ...current, _sceneStoryProposal: next }, updated_at: updatedAt })
      .eq('id', runId).eq('status', 'awaiting_confirmation').eq('updated_at', latest.updated_at).select('id')
    if (error) throw new Error(error.message)
    if (data?.length) return
    // 세 안이 동시에 끝나면 저장이 겹친다 — 조금 쉬었다가 최신 상태로 다시 얹는다.
    await new Promise((resolve) => setTimeout(resolve, 40 + Math.floor(Math.random() * 120)))
  }
  console.warn('[writer/scene-story-rewrite] concurrent writes prevented saving variant', proposalId, variantId)
}

/** variantId 를 주면 그 안 하나만 만든다(scene-story-rewrite 라우트 — 안마다 따로 요청). 없으면 세 안을 한꺼번에. */
export async function generateSceneStoryRewrite(projectId: string, runId: string, proposalId: string, variantId?: string): Promise<void> {
  const run = await getActiveRun(projectId)
  if (!run || run.id !== runId || run.status !== 'awaiting_confirmation') return
  const state = run.state as WriterRunState
  const proposal = state._sceneStoryProposal
  if (!proposal || proposal.id !== proposalId || !proposal.variants?.length || proposal.status !== 'generating' || sceneStoryProposalExpired(proposal)) return
  const targets = proposal.variants.filter((variant) => (variantId ? variant.id === variantId : true) && variant.status === 'generating')
  if (!targets.length) return
  const logger = new PipelineLogger(projectId)
  try {
    await logger.init()
    await Promise.all(targets.map(async (variant) => {
      let result: VariantResult
      try {
        result = await writeVariant(state, proposal, variant, logger)
      } catch (error) {
        console.error('[writer/scene-story-rewrite]', variant.id, error)
        result = { status: 'failed', error: 'scene_story_rewrite_failed' }
      }
      await saveVariant(projectId, runId, proposalId, variant.id, result)
    }))
  } finally {
    // 세 안의 호출 기록은 한 프로세스에 섞여 쌓인다 — 한 번에 같은 이름으로 내보낸다.
    await logger.flushRawLlm('scene-story-rewrite')
  }
}

/** 안 하나를 만드는 서버 안쪽 요청 — writer/step 과 같은 비밀 열쇠. 실패해도 그 안은 만료 시간이 지나면 실패로 보인다. */
export async function triggerSceneStoryRewrite(origin: string, input: { projectId: string; runId: string; proposalId: string; variantId: string }): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const secret = process.env.WRITER_STEP_SECRET
  if (secret) headers['x-writer-secret'] = secret
  try {
    await fetch(new URL('/api/writer/scene-story-rewrite', origin), { method: 'POST', headers, body: JSON.stringify(input) })
  } catch (error) {
    console.error('[writer/scene-story-rewrite] trigger failed', input.variantId, error)
  }
}
