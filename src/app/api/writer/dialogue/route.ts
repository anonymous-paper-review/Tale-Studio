// POST /api/writer/dialogue — 샷 단위 대사 (재)생성 (#dialogue-v4 2026-07-23).
//
// 완료된 writer run 의 state(scenes+decoupage)를 입력으로 V4 대사 스테이지를 다시 돌려
// shots.dialogue_lines 를 갱신한다. 파이프라인을 재실행하지 않고 대사만 다시 쓰는 경로 —
// 대사탭의 "대사 생성/재생성" 버튼이 호출한다.
//
// 얇은 라우트(architecture §2): 인증·zod 검증·소유 확인·위임. 생성 본체는 stages/dialogue.ts 공용.
// 씬 순차(메모리 캐리)라 한 호출에서 전 씬을 돌고(3~8씬 ≈ 1~2분), 완료 후 일괄 UPDATE.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { getActiveRun } from '@/lib/writer/run-store'
import { runDialogue } from '@/lib/writer/pipeline/stages/dialogue'
import { resolveModels } from '@/lib/writer/pipeline'
import { PipelineLogger } from '@/lib/writer/logger'
import { writerShotIdToMain } from '@/lib/writer/adapters'
import type { WriterRunState } from '@/lib/writer/pipeline/steps'
import type { DialogueLine } from '@/types'

export const maxDuration = 300 // 씬 순차 LLM 호출 — generate/images 와 동일 한도

const BodySchema = z.object({
  projectId: z.string().uuid(),
})

export async function POST(req: Request) {
  try {
    const demoBlocked = demoWriteBlock(req)
    if (demoBlocked) return demoBlocked

    const user = await getUser()
    if (!user)
      return NextResponse.json(
        { ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } },
        { status: 401 },
      )

    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success)
      return NextResponse.json(
        { ok: false, error: { code: 'bad_request', message: parsed.error.message } },
        { status: 400 },
      )
    const { projectId } = parsed.data

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle()
    if (!project)
      return NextResponse.json(
        { ok: false, error: { code: 'not_found', message: 'project not found' } },
        { status: 404 },
      )

    // 완료된 run 의 state 가 대사 입력의 진실 (scenes 감정/목적 + decoupage 샷 스토리·duration).
    const run = await getActiveRun(projectId)
    const state = run?.state as WriterRunState | undefined
    if (!run || run.status === 'running')
      return NextResponse.json(
        { ok: false, error: { code: 'run_active', message: 'writer가 아직 실행 중입니다. 완료 후 다시 시도하세요.' } },
        { status: 409 },
      )
    if (!state?.scenes || !state.decoupage || !state.genre || !state.characters || !state.input?.story)
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'no_run_state', message: '완료된 writer 실행 기록이 없어 대사를 생성할 수 없습니다.' },
        },
        { status: 422 },
      )

    const models = resolveModels(state.input)
    const logger = new PipelineLogger(projectId)
    await logger.init()

    const result = await runDialogue(
      state.input.story,
      state.genre,
      state.characters,
      state.scenes,
      state.decoupage,
      logger,
      models.S,
    )

    // shots.dialogue_lines 갱신 — persist_manifest 와 동일 매핑(화자 명시, 내레이션은 characterId null).
    let updatedShots = 0
    let lineCount = 0
    for (const sc of result.scenes) {
      for (const sh of sc.shots) {
        const mainId = writerShotIdToMain(sh.shot_id, sc.scene_id)
        const lines: DialogueLine[] = [
          ...sh.dialogue.map((l) => ({
            characterId: l.character_id,
            text: l.line,
            emotion: '',
            delivery: l.delivery ?? '',
            durationHint: 0,
          })),
          ...(sh.narration
            ? [{ characterId: null, text: sh.narration, emotion: '', delivery: 'V.O.', durationHint: 0 }]
            : []),
        ]
        lineCount += sh.dialogue.length
        const { error } = await supabaseAdmin
          .from('shots')
          .update({ dialogue_lines: lines })
          .eq('project_id', projectId)
          .eq('shot_id', mainId)
        if (!error) updatedShots += 1
      }
    }

    return NextResponse.json({
      ok: true,
      sceneCount: result.scenes.length,
      updatedShots,
      lineCount,
      profiles: result.profiles.map((p) => ({ character_id: p.character_id, name: p.name, speech_style: p.speech_style })),
    })
  } catch (e) {
    console.error('[writer/dialogue] failed:', e)
    return NextResponse.json(
      { ok: false, error: { code: 'internal', message: e instanceof Error ? e.message : 'internal error' } },
      { status: 500 },
    )
  }
}
