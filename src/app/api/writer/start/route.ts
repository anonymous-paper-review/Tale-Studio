// writer-pipeline 시작 (서버리스 웹훅 체이닝).
//   Producer "Complete your story" 버튼에서 호출.
//   writer_runs 행을 만들고 첫 step(/api/writer/step)을 after()로 트리거한다.
//   이후 각 step 이 한 stage 실행 → state 체크포인트 → 다음 step self-trigger (자가 체이닝).
//   genre~renderPrompts (텍스트/프롬프트 단계)까지만 자동. 이미지/영상은 별도 트리거.
import { NextRequest, NextResponse, after } from 'next/server';
import { getUser } from '@/lib/supabase/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createRun, getActiveRun } from '@/lib/writer/run-store';
import { WRITER_TOTAL_UNITS, triggerWriterStep } from '@/lib/writer/pipeline/steps';
import type { PipelineInput, Genre, CastContract } from '@/lib/writer/types/pipeline';

export const runtime = 'nodejs';
// 시작만 응답하고 첫 step 은 after()로 트리거. 짧게.
export const maxDuration = 60;

function normRole(role?: string): 'protagonist' | 'antagonist' | 'supporting' {
  return role === 'protagonist' || role === 'antagonist' ? role : 'supporting';
}

// producer-story-gate §3 step 1: 핸드오프 캐스트를 characters 테이블에 즉시 기록(origin='producer').
//   slug 기준 upsert — 미지정 컬럼(view_main 등 이미지)은 보존, writer-origin 행은 건드리지 않음.
async function upsertProducerCast(projectId: string, cast: CastContract): Promise<void> {
  if (!cast.characters.length) return;
  const rows = cast.characters.map((c) => ({
    project_id: projectId,
    character_id: c.character_id,
    name: c.name,
    role: normRole(c.role),
    entity_type: c.entity_type === 'object' ? 'object' : 'person',
    appearance: c.appearance,
    description: c.appearance, // 레거시 미러
    voice: c.voice ?? null,
    arc: c.arc ?? null,
    motivation: c.motivation ?? null,
    origin: 'producer',
  }));
  const { error } = await supabaseAdmin
    .from('characters')
    .upsert(rows, { onConflict: 'project_id,character_id' });
  if (error) throw new Error(`cast upsert failed: ${error.message}`);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      projectId: string;
      story: string;
      runtimeSeconds?: number;
      models?: PipelineInput['models'];
      genre?: Genre;
      cast?: CastContract;
    };
    const { projectId, story, runtimeSeconds, models, genre, cast } = body;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }
    if (!story || typeof story !== 'string') {
      return NextResponse.json({ error: 'story required' }, { status: 400 });
    }

    // 이미 실행 중이면 거부 (중복 시작 방지).
    const existing = await getActiveRun(projectId);
    if (existing && existing.status === 'running') {
      return NextResponse.json({ error: 'already running', projectId }, { status: 409 });
    }

    // 1. 캐스트 즉시 기록 (run 시작 전 — artist가 writer 완료를 안 기다리고 카드 작업 가능).
    if (cast?.characters?.length) {
      await upsertProducerCast(projectId, cast);
    }

    // 2. run 시작 (genre/cast seed → s0/s2 생략).
    const input: PipelineInput = { story, runtimeSeconds, models, genre, cast };
    const run = await createRun(projectId, input, WRITER_TOTAL_UNITS);

    // 첫 step 트리거 (응답 후 별도 서버리스 인스턴스에서 실행).
    after(async () => {
      await triggerWriterStep(req.nextUrl.origin, projectId);
    });

    return NextResponse.json({ projectId, runId: run.id, status: 'started' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/start]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
