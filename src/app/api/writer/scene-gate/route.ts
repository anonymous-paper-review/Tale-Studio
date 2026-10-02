// 씬 스토리 게이트(#s3-gate 2026-08-05) — storyCheck 후 awaiting_confirmation 으로 멈춘 run 의
//   확정 / 직접 저장 / 원문과 분리된 AI 수정안 생성·적용·버리기.
//   다시 쓰기(2026-10-02 시안 v04): 정도 하나에 세 가지 안 → 안 하나 적용 → 적용 직전 트리트먼트로 되돌리기 · 그대로 두기.
import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireProjectAccess } from '@/lib/api/guard'
import { getActiveRun } from '@/lib/writer/run-store'
import { triggerWriterStep } from '@/lib/writer/pipeline/steps'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'
import { mergeSceneStoryProposal, sceneStoryProposalExpired } from '@/lib/producer/scene-story-proposal'
import { newRewriteProposal, variantProposal } from '@/lib/producer/scene-story-rewrite'

export const runtime = 'nodejs'
export const maxDuration = 300

const requestSchema = z.discriminatedUnion('action', [
  z.object({ projectId: z.string().min(1), action: z.literal('confirm') }),
  z.object({ projectId: z.string().min(1), action: z.literal('revise'), feedback: z.string().trim().min(1).max(10_000) }),
  z.object({ projectId: z.string().min(1), action: z.literal('apply'), proposalId: z.string().min(1), variantId: z.enum(['v1', 'v2', 'v3']).optional() }),
  z.object({ projectId: z.string().min(1), action: z.literal('rewrite'), level: z.enum(['polish', 'reword', 'rethink']) }),
  z.object({ projectId: z.string().min(1), action: z.literal('undo'), undoId: z.string().min(1) }),
  z.object({ projectId: z.string().min(1), action: z.literal('keep'), undoId: z.string().min(1) }),
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
      if (preserved && (action === 'save' || action === 'revise' || action === 'apply' || action === 'rewrite')) {
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
        // 직접 고친 뒤에는 "적용 전으로 되돌리기"가 고친 글까지 지운다 — 되돌리기를 거둔다.
        delete state._sceneStoryUndo
      } else if (body.action === 'confirm') {
        if (state._sceneStoryProposal) {
          return NextResponse.json({ error: 'Apply or discard the scene story proposal first', code: 'scene_story_proposal_pending' }, { status: 409 })
        }
        // 넘기기 전 트리트먼트 초안(2026-10-02 시안 v04)은 Writer 로 넘길 때(writer/start continueDraft) 확정한다 —
        //   여기서 확정하면 Producer 값이 실리지 않고 Producer 도 잠기지 않는다.
        if (state.input?.treatmentDraft === true) {
          return NextResponse.json({ error: 'Hand over to Writer to confirm the treatment draft', code: 'treatment_draft_handoff_required' }, { status: 409 })
        }
        state._gateConfirmed = true
        delete state._sceneStoryUndo
      } else if (body.action === 'rewrite') {
        if (!state.scenes) return changed()
        if (state._sceneStoryProposal?.status === 'generating' && !sceneStoryProposalExpired(state._sceneStoryProposal)) {
          return NextResponse.json({ error: 'A scene story proposal is already generating', code: 'scene_story_proposal_pending' }, { status: 409 })
        }
        state._sceneStoryVersion = storyVersion
        state._sceneStoryProposal = newRewriteProposal({
          id: crypto.randomUUID(), level: body.level, feedback: body.level, baseScenes: state.scenes, createdAt: updatedAt,
        })
      } else if (body.action === 'undo' || body.action === 'keep') {
        const undo = state._sceneStoryUndo
        if (!undo || undo.id !== body.undoId) return changed()
        if (body.action === 'undo') {
          // 적용 뒤 직접 고쳤으면 되돌리지 않는다 — 고친 글이 사라진다.
          if (undo.storyVersion !== storyVersion || state._sceneStoryProposal) return changed()
          state.scenes = undo.scenes
          if ('dramaturgy' in undo) state.dramaturgy = undo.dramaturgy ?? undefined
          if (undo.narrativeStructure) state.narrativeStructure = undo.narrativeStructure
          if (undo.characters) state.characters = undo.characters
          if ('world' in undo) state.world = undo.world
          if (undo.revisionNotes) state._sceneRevisionNotes = undo.revisionNotes
          state._sceneStoryVersion = updatedAt
          delete state.storyCheck
        }
        delete state._sceneStoryUndo
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
        if (body.action === 'apply' && proposal.variants?.length) {
          // 다시 쓰기 — 고른 안 하나만. 아직 나오지 않았거나 실패한 안은 적용하지 않는다.
          const variant = proposal.variants.find((item) => item.id === body.variantId)
          const chosen = body.variantId ? variantProposal(proposal, body.variantId) : null
          const merged = chosen && state.scenes && mergeSceneStoryProposal(chosen, state.scenes)
          if (!variant || !merged) return changed()
          state._sceneStoryUndo = {
            id: crypto.randomUUID(), label: variant.id, storyVersion: updatedAt, scenes: state.scenes!,
            dramaturgy: state.dramaturgy ?? null, narrativeStructure: state.narrativeStructure,
            characters: state.characters, world: state.world, revisionNotes: state._sceneRevisionNotes ?? [],
          }
          state.scenes = merged
          if (proposal.level === 'rethink') {
            // 아이디어부터 다시 — 그 안의 이야기 엔진 · 구조 · 인물 · 장소로 바꾼다. 지난 초안의 수정 요청은 더 이상 맞지 않는다.
            state.dramaturgy = variant.dramaturgy ?? undefined
            if (variant.narrativeStructure) state.narrativeStructure = variant.narrativeStructure
            if (variant.characters) state.characters = variant.characters
            state.world = variant.world
            state._sceneRevisionNotes = []
          } else {
            const { mergeOpenCast, mergeOpenWorld } = await import('@/lib/writer/pipeline/stages/s3_scenes')
            if (state.characters) state.characters = mergeOpenCast(state.characters, merged)
            if (state.world || merged.scenes.some((scene) => scene.location)) state.world = mergeOpenWorld(state.world, merged, state.dramaturgy?.world_inventory)
          }
          state._sceneStoryVersion = updatedAt
          delete state.storyCheck
        } else if (body.action === 'apply') {
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
          delete state._sceneStoryUndo
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
      if (action === 'rewrite') {
        const proposal = state._sceneStoryProposal!
        // 안마다 따로 요청한다 — 각 안이 자기 시간을 쓴다(한 요청에 세 안을 몰면 아이디어부터 다시가 시간을 넘긴다).
        after(async () => {
          const { triggerSceneStoryRewrite } = await import('@/lib/writer/scene-story-rewrite')
          await Promise.all((proposal.variants ?? []).map((variant) => triggerSceneStoryRewrite(req.nextUrl.origin, {
            projectId: access.projectId, runId: run.id, proposalId: proposal.id, variantId: variant.id,
          })))
        })
        return NextResponse.json({ ok: true, action, updatedAt, storyVersion: state._sceneStoryVersion, proposalId: proposal.id })
      }
      if (action === 'apply' && state._sceneStoryUndo) {
        return NextResponse.json({ ok: true, action, updatedAt, storyVersion: state._sceneStoryVersion, undo: { id: state._sceneStoryUndo.id, label: state._sceneStoryUndo.label } })
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
