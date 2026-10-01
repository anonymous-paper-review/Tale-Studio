// 씬 스토리 게이트(#s3-gate 2026-08-05) — storyCheck 후 awaiting_confirmation 으로 멈춘 run 의
//   확정 / 직접 저장 / 원문과 분리된 AI 수정안 생성·적용·버리기.
import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'
import { getActiveRun } from '@/lib/writer/run-store'
import { triggerWriterStep } from '@/lib/writer/pipeline/steps'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'
import { mergeSceneStoryProposal, sceneStoryProposalExpired } from '@/lib/producer/scene-story-proposal'

export const runtime = 'nodejs'
export const maxDuration = 300

const requestSchema = z.discriminatedUnion('action', [
  z.object({ projectId: z.string().min(1), action: z.literal('confirm') }),
  z.object({ projectId: z.string().min(1), action: z.literal('revise'), feedback: z.string().trim().min(1).max(10_000) }),
  z.object({ projectId: z.string().min(1), action: z.literal('apply'), proposalId: z.string().min(1) }),
  z.object({ projectId: z.string().min(1), action: z.literal('discard'), proposalId: z.string().min(1) }),
  z.object({
    projectId: z.string().min(1),
    action: z.literal('save'),
    expectedUpdatedAt: z.string().min(1).max(100).optional(),
    expectedStoryVersion: z.string().min(1).max(100).optional(),
    scenes: z.array(z.object({
      sceneId: z.string().min(1).max(200),
      beats: z.array(z.string().max(10_000).refine((beat) => beat.trim().length > 0)).min(1).max(200),
    })).min(1).refine((scenes) => scenes.reduce((total, scene) => total + scene.beats.reduce((sum, beat) => sum + beat.length, 0), 0) <= 200_000),
  }),
]).refine((body) => body.action !== 'save' || !!(body.expectedStoryVersion || body.expectedUpdatedAt))

const changed = () => NextResponse.json({ error: 'Scene story changed; request a new proposal or reload before saving', code: 'scene_story_changed' }, { status: 409 })

export async function POST(req: NextRequest) {
  try {
    const parsed = requestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid scene gate request' }, { status: 400 })
    }
    const body = parsed.data
    const { projectId, action } = body

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    for (let attempt = 0; attempt < 3; attempt++) {
      const run = await getActiveRun(access.projectId)
      if (!run || run.status !== 'awaiting_confirmation') {
        return NextResponse.json({ error: 'No awaiting run', status: run?.status ?? null }, { status: 409 })
      }

      const state = { ...(run.state as WriterRunState) }
      const updatedAt = new Date(Math.max(Date.now(), new Date(run.updated_at).getTime() + 1)).toISOString()
      const storyVersion = state._sceneStoryVersion ?? run.updated_at
      const preserved = state.input.preserveScript === true || state.scenes?.scenes.some((scene) => scene.provenance?.source === 'script')
      if (preserved && (action === 'save' || action === 'revise' || action === 'apply')) {
        return NextResponse.json({ error: 'Preserved script scenes cannot be changed', code: 'preserved_script' }, { status: 409 })
      }
      if (body.action === 'save') {
        if (body.expectedStoryVersion ? body.expectedStoryVersion !== storyVersion : body.expectedUpdatedAt !== run.updated_at) return changed()
        const current = state.scenes
        const edits = new Map(body.scenes.map((scene) => [scene.sceneId, scene.beats]))
        if (!current || current.scenes.length !== body.scenes.length || edits.size !== body.scenes.length || current.scenes.some((scene) => !edits.has(scene.scene_id))) {
          return NextResponse.json({ error: 'Scenes must match the current scene story' }, { status: 400 })
        }
        state.scenes = {
          ...current,
          scenes: current.scenes.map((scene) => ({ ...scene, scene_actions: edits.get(scene.scene_id)! })),
        }
        state._sceneStoryVersion = updatedAt
        delete state.storyCheck
      } else if (body.action === 'confirm') {
        if (state._sceneStoryProposal) {
          return NextResponse.json({ error: 'Apply or discard the scene story proposal first', code: 'scene_story_proposal_pending' }, { status: 409 })
        }
        state._gateConfirmed = true
      } else if (body.action === 'revise') {
        if (!state.scenes) return changed()
        if (state._sceneStoryProposal?.status === 'generating' && !sceneStoryProposalExpired(state._sceneStoryProposal)) {
          return NextResponse.json({ error: 'A scene story proposal is already generating', code: 'scene_story_proposal_pending' }, { status: 409 })
        }
        state._sceneStoryVersion = storyVersion
        state._sceneStoryProposal = {
          id: crypto.randomUUID(), status: 'generating', feedback: body.feedback,
          baseScenes: state.scenes, createdAt: updatedAt,
        }
      } else {
        const proposal = state._sceneStoryProposal
        if (!proposal || proposal.id !== body.proposalId) return changed()
        state._sceneStoryVersion = storyVersion
        if (body.action === 'apply') {
          const merged = state.scenes && mergeSceneStoryProposal(proposal, state.scenes)
          if (!merged) return changed()
          state.scenes = merged
          // 새 인물·장소도 적용 시에만 확정한다. 버린 수정안은 캐스트에 흔적을 남기지 않는다.
          const { mergeOpenCast, mergeOpenWorld } = await import('@/lib/writer/pipeline/stages/s3_scenes')
          if (state.characters) state.characters = mergeOpenCast(state.characters, merged)
          if (state.world || merged.scenes.some((scene) => scene.location)) state.world = mergeOpenWorld(state.world, merged, state.dramaturgy?.world_inventory)
          state._sceneRevisionNotes = [...(state._sceneRevisionNotes ?? []), proposal.feedback]
          state._sceneStoryVersion = updatedAt
          delete state.storyCheck
        }
        delete state._sceneStoryProposal
      }

      // 직접 저장은 상태를 유지하므로 본문을 읽은 시점도 비교해야 저장/확정 간 덮어쓰기를 막는다.
      const { data, error } = await supabaseAdmin
        .from('writer_runs')
        .update({ state, status: action === 'confirm' ? 'running' : 'awaiting_confirmation', updated_at: updatedAt })
        .eq('id', run.id)
        .eq('status', 'awaiting_confirmation')
        .eq('updated_at', run.updated_at)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data?.length) continue
      if (action === 'confirm') after(async () => { await triggerWriterStep(req.nextUrl.origin, access.projectId) })
      if (action === 'revise') {
        const proposalId = state._sceneStoryProposal!.id
        after(async () => {
          const { generateSceneStoryProposal } = await import('@/lib/writer/scene-story-proposal')
          await generateSceneStoryProposal(access.projectId, run.id, proposalId)
        })
        return NextResponse.json({ ok: true, action, updatedAt, storyVersion: state._sceneStoryVersion, proposalId })
      }
      return NextResponse.json({ ok: true, action, updatedAt, storyVersion: state._sceneStoryVersion })
    }
    return changed()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/scene-gate]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
