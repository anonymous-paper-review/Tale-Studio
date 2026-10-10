// 씬 수정안은 최신 실행을 다시 읽고 저장한다. 원문·직접 편집·다른 수정안은 건드리지 않는다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getActiveRun } from '@/lib/writer/run-store'
import { sceneStoryProposalExpired } from '@/lib/producer/scene-story-proposal'
import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes'
import { resolveModels } from '@/lib/writer/pipeline'
import { PipelineLogger } from '@/lib/writer/logger'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'
import type { Scenes } from '@/lib/writer/types/pipeline'

export async function generateSceneStoryProposal(projectId: string, runId: string, proposalId: string): Promise<void> {
  const run = await getActiveRun(projectId)
  if (!run || run.id !== runId || run.status !== 'awaiting_confirmation') return
  const state = run.state as WriterRunState
  const proposal = state._sceneStoryProposal
  if (!proposal || proposal.id !== proposalId || proposal.status !== 'generating' || sceneStoryProposalExpired(proposal)) return
  const logger = new PipelineLogger(projectId)
  let result: { scenes: Scenes; status: 'ready' } | { error: string; status: 'failed' }
  try {
    if (!state.genre || !state.narrativeStructure || !state.characters) throw new Error('Missing scene generation context')
    await logger.init()
    const scenes = await runScenes(
      state.input, state.genre, state.narrativeStructure, state.characters, state.world,
      logger, resolveModels(state.input).S,
      [...(state._sceneRevisionNotes ?? []), proposal.feedback], state.dramaturgy ?? null, proposal.baseScenes,
    )
    result = { status: 'ready', scenes }
  } catch (error) {
    console.error('[writer/scene-story-proposal]', error)
    result = { status: 'failed', error: 'scene_story_proposal_failed' }
  } finally {
    // 기존 writer와 동일한 전문/사용량 수집 경로를 유지한다.
    await logger.flushRawLlm('scene-story-proposal')
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await getActiveRun(projectId)
    if (!latest || latest.id !== runId || latest.status !== 'awaiting_confirmation') return
    const current = latest.state as WriterRunState
    const pending = current._sceneStoryProposal
    // 버렸거나 교체했거나 만료된 결과는 나중에 도착해도 되살리지 않는다.
    if (!pending || pending.id !== proposalId || pending.status !== 'generating' || sceneStoryProposalExpired(pending)) return
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(latest.updated_at) + 1)).toISOString()
    const { data, error } = await supabaseAdmin.from('writer_runs')
      .update({ state: { ...current, _sceneStoryProposal: { ...pending, ...result } }, updated_at: updatedAt })
      .eq('id', runId).eq('status', 'awaiting_confirmation').eq('updated_at', latest.updated_at).select('id')
    if (error) throw new Error(error.message)
    if (data?.length) return
  }
  // 생성 결과 저장을 놓쳐도 preview의 만료 처리가 재시도/버리기를 열어 둔다.
  console.warn('[writer/scene-story-proposal] concurrent writes prevented saving proposal', proposalId)
}
