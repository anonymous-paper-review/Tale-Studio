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
import { triggerCharacterDrafts } from '@/lib/artist/draft-trigger';
import { applyProducerI18n } from '@/lib/writer/i18n/derive-en';
import { detectLocaleFromText } from '@/lib/locale';

// producer 핸드오프 배경 페이로드(원천 rich shape). writer 내부 BackgroundContract 와 분리 —
//   locations 테이블엔 full 필드로 즉시 upsert 하고, 파이프라인엔 BackgroundContract 로 매핑해 전달한다.
interface ProducerBackgrounds {
  locations: Array<{
    location_id: string;
    name: string;
    visual_description: string;
    purpose?: string;
    user_edited?: boolean;
  }>;
}

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
    arc: c.arc ?? null,
    motivation: c.motivation ?? null,
    origin: 'producer',
  }));
  const { error } = await supabaseAdmin
    .from('characters')
    .upsert(rows, { onConflict: 'project_id,character_id' });
  if (error) throw new Error(`cast upsert failed: ${error.message}`);
}

async function upsertProducerBackgrounds(projectId: string, backgrounds: ProducerBackgrounds): Promise<void> {
  if (!backgrounds.locations.length) return;

  const { data: existing, error: selectError } = await supabaseAdmin
    .from('locations')
    .select('location_id')
    .eq('project_id', projectId);
  if (selectError) throw new Error(`background select failed: ${selectError.message}`);

  const existingIds = new Set((existing ?? []).map((row) => row.location_id as string));
  for (const background of backgrounds.locations) {
    const row = {
      project_id: projectId,
      location_id: background.location_id,
      name: background.name,
      visual_description: background.visual_description,
      style_description: background.visual_description,
      purpose: background.purpose,
      origin: 'producer',
      user_edited: background.user_edited === true,
    };

    const query = existingIds.has(background.location_id)
      ? supabaseAdmin
          .from('locations')
          .update(row)
          .eq('project_id', projectId)
          .eq('location_id', background.location_id)
      : supabaseAdmin.from('locations').insert(row);

    const { error } = await query;
    if (error) throw new Error(`background upsert failed: ${error.message}`);
  }
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
      backgrounds?: ProducerBackgrounds;
    };
    const { projectId, story, runtimeSeconds, models, genre, cast, backgrounds } = body;

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
    if (backgrounds?.locations?.length) {
      await upsertProducerBackgrounds(projectId, backgrounds);
    }

    // 1.5 언어 경계(S1a): producer native 자유서술(외형·배경)을 영어 base 로 파생 → DB 주 컬럼(EN) + `_native` 보존.
    //   동기 실행(Hobby `after()` 죽음 회피) + best-effort(실패해도 핸드오프 진행, 주 컬럼=native 유지).
    //   drafts/step 트리거보다 먼저 await → 캐릭터 초안 이미지가 EN appearance 를 사용. (표시→`_native` 재배선은 S2)
    if (cast?.characters?.length || backgrounds?.locations?.length) {
      const n = await applyProducerI18n(projectId, cast, backgrounds).catch((e) => {
        console.error('[writer/start] i18n derive failed (proceeding):', e);
        return { characters: 0, locations: 0 };
      });
      console.log(`[writer/start] i18n EN base: chars=${n.characters} locs=${n.locations}`);
    }

    // 1.6 언어 경계(S4): 표시 locale 확정 — 스토리(유저 입력) 언어를 rule-base 감지 → projects.locale.
    //   기본 'en'(S0) → 첫 콘텐츠(handoff)에서 확정. locale_locked 면 보존(재핸드오프 덮어쓰기 방지). SSO 힌트는 후속.
    //   소비자(표시 전환·UI i18n)는 S5 — 지금은 값만 기록. best-effort.
    try {
      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('locale_locked')
        .eq('id', projectId)
        .maybeSingle();
      if (!proj?.locale_locked) {
        await supabaseAdmin
          .from('projects')
          .update({ locale: detectLocaleFromText(story), locale_locked: true })
          .eq('id', projectId);
      }
    } catch (e) {
      console.error('[writer/start] locale resolve failed (proceeding):', e);
    }

    // 2. run 시작 (genre/cast seed → s0/s2 생략).
    const input: PipelineInput = {
      story,
      runtimeSeconds,
      models,
      genre,
      cast,
      background: backgrounds?.locations?.length
        ? {
            locations: backgrounds.locations.map((b) => ({
              id: b.location_id,
              name: b.name,
              description: b.visual_description,
            })),
          }
        : undefined,
    };
    const run = await createRun(projectId, input, WRITER_TOTAL_UNITS);

    // 응답 후 별도 서버리스 인스턴스에서 실행: (1) artist 초안(대표 main) 병렬 생성, (2) 첫 writer step.
    //   초안 트리거는 멱등(차 있으면 skip)·실패 흡수라 writer 체이닝과 독립적으로 안전하다(C1).
    after(async () => {
      await triggerCharacterDrafts(projectId);
      await triggerWriterStep(req.nextUrl.origin, projectId);
    });

    return NextResponse.json({ projectId, runId: run.id, status: 'started' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/start]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
