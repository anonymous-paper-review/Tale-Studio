// writer-pipeline 시작 (서버리스 웹훅 체이닝).
//   Producer "Complete your story" 버튼에서 호출.
//   writer_runs 행을 만들고 첫 step(/api/writer/step)을 after()로 트리거한다.
//   이후 각 step 이 한 stage 실행 → state 체크포인트 → 다음 step self-trigger (자가 체이닝).
//   genre~renderPrompts (텍스트/프롬프트 단계)까지만 자동. 이미지/영상은 별도 트리거.
import { NextRequest, NextResponse, after } from 'next/server';
import { getUser } from '@/lib/supabase/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createRun, getActiveRun } from '@/lib/writer/run-store';
import {
  WRITER_TOTAL_UNITS,
  WRITER_V2_TOTAL_UNITS,
  triggerWriterStep,
} from '@/lib/writer/pipeline/steps';
import type {
  PipelineInput,
  Genre,
  CastContract,
  WriterRerunContext,
} from '@/lib/writer/types/pipeline';
import { isAdminOwnedProject } from '@/lib/admin';
import { isWriterEngine, type WriterEngine } from '@/lib/writer/engine';
import { applyProducerI18n } from '@/lib/writer/i18n/derive-en';
import { resolveOutputLocale } from '@/lib/locale';
import { assessContentSafetyRisk } from '@/lib/writer/content-safety-hint';
import { parseCustomStyleAnchor } from '@/lib/style-anchor';

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

// 영어 원문 = i18n 키(#i18n-s5) — 표시는 클라이언트(producer-store)가 프로젝트 locale 로 완역한다.
//   409 body 의 consentText 는 현재 표시 소비자가 없는 참고 필드라 base 그대로 보낸다.
export const WRITER_RERUN_CONSENT_TEXT =
  'Shall I ask Writer again for a story and direction plan based on the chat so far? Your changes will be reflected naturally, but it may take a long time again.';

interface RerunSceneRow {
  scene_id: string;
  narrative_summary: string | null;
  original_text_quote: string | null;
  location: string | null;
  time_of_day: string | null;
  mood: string | null;
  characters_present: string[] | null;
  estimated_duration_seconds: number | null;
}

interface RerunShotRow {
  shot_id: string;
  scene_id: string;
  action_description: string | null;
  shot_type: string;
  characters: string[] | null;
  location_ids: string[] | null;
  duration_seconds: number | null;
  dialogue_lines: unknown;
  camera_config: unknown;
  lighting_config: unknown;
  prompt: string | null;
}

interface RerunMessageRow {
  stage: string;
  role: string;
  content: string;
  created_at: string | null;
}

export function buildRerunContext(
  previousRunId: string,
  scenes: RerunSceneRow[],
  shots: RerunShotRow[],
  messages: RerunMessageRow[],
  producerDecisions: WriterRerunContext['producerDecisions'],
): WriterRerunContext {
  return {
    previousRunId,
    scenes: scenes.map((scene) => ({
      sceneId: scene.scene_id,
      story: scene.narrative_summary ?? '',
      originalTextQuote: scene.original_text_quote,
      location: scene.location,
      timeOfDay: scene.time_of_day,
      mood: scene.mood,
      charactersPresent: Array.isArray(scene.characters_present)
        ? scene.characters_present.filter((id): id is string => typeof id === 'string')
        : [],
      estimatedDurationSeconds: scene.estimated_duration_seconds,
    })),
    shots: shots.map((shot) => ({
      shotId: shot.shot_id,
      sceneId: shot.scene_id,
      story: shot.action_description ?? '',
      shotType: shot.shot_type,
      characters: Array.isArray(shot.characters)
        ? shot.characters.filter((id): id is string => typeof id === 'string')
        : [],
      locationIds: Array.isArray(shot.location_ids)
        ? shot.location_ids.filter((id): id is string => typeof id === 'string')
        : [],
      durationSeconds: shot.duration_seconds,
      dialogueLines: shot.dialogue_lines,
      cameraConfig: shot.camera_config,
      lightingConfig: shot.lighting_config,
      prompt: shot.prompt,
    })),
    chatHistory: messages.map((message) => ({
      stage: message.stage,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    })),
    producerDecisions,
  };
}

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
      rerun?: boolean;
      writerEngine?: unknown;
      runtimeSeconds?: number;
      models?: PipelineInput['models'];
      genre?: Genre;
      cast?: CastContract;
      backgrounds?: ProducerBackgrounds;
      chatHistory?: RerunMessageRow[];
    };
    const { projectId, story, runtimeSeconds, models, genre, cast, backgrounds } = body;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }
    if (!story || typeof story !== 'string') {
      return NextResponse.json({ error: 'story required' }, { status: 400 });
    }

    const writerEngine: WriterEngine = isWriterEngine(body.writerEngine)
      ? body.writerEngine
      : 'v1';
    if (writerEngine === 'v2' && !(await isAdminOwnedProject(user, projectId))) {
      return NextResponse.json({ error: 'Writer V2 is admin-only' }, { status: 403 });
    }

    // 0.5 콘텐츠 안전 힌트(인지용, 비차단): 미성년+위해(피·폭력) 조합은 Gemini PROHIBITED_CONTENT
    //   차단을 유발하기 쉽다. 막지 않고 경고만 남겨 작성자가 사전에 우회(예: 피→검은 액체 심볼릭)하게 한다.
    try {
      const hintText = [
        story,
        ...(cast?.characters ?? []).map(
          (c) => `${c.appearance ?? ''} ${JSON.stringify(c.arc ?? '')} ${JSON.stringify(c.motivation ?? '')}`,
        ),
        ...(backgrounds?.locations ?? []).map((b) => b.visual_description ?? ''),
      ].join(' ');
      const hint = assessContentSafetyRisk(hintText);
      if (hint.risky) {
        console.warn(
          // 운영자(오너)용 서버 로그 — 유저 UI 가 아니라 한국어 유지. // i18n-ok
          `[writer/start] ⚠️ content-safety-hint(${projectId}): 미성년+위해 조합 감지 — Gemini 차단 위험. ` + // i18n-ok
            `minor=[${hint.minorTerms.join(', ')}] harm=[${hint.harmTerms.join(', ')}]. ` +
            `차단 시 해당 표현을 심볼릭(예: 피→검은 액체)으로 우회 권장.`, // i18n-ok
        );
      }
    } catch {
      // 힌트는 best-effort — 절대 핸드오프를 막지 않는다.
    }

    // 이미 실행 중이거나 씬 게이트 대기 중이면 거부 (중복 시작 방지 — 게이트는 확정/수정으로만 진행).
    const existing = await getActiveRun(projectId);
    if (existing?.status === 'running') {
      return NextResponse.json(
        { error: 'already running', code: 'writer_run_active', projectId, status: existing.status },
        { status: 409 },
      );
    }
    if (existing?.status === 'awaiting_confirmation') {
      return NextResponse.json(
        {
          error: 'writer scene gate is awaiting confirmation',
          code: 'writer_gate_pending',
          projectId,
          status: existing.status,
          message: '현재 씬 스토리 초안이 준비됐어요. Writer 화면에서 확정하거나 수정 요청으로 다시 실행할지 선택해 주세요.',
        },
        { status: 409 },
      );
    }
    // 완료 run은 같은 입력으로 조용히 새 run을 만들지 않는다. 클라이언트가 이 409를
    // 동의 제안으로 바꾼 뒤 `rerun: true`를 명시한 두 번째 요청만 허용한다.
    if (existing?.status === 'completed' && body.rerun !== true) {
      return NextResponse.json(
        {
          error: 'writer rerun confirmation required',
          code: 'writer_rerun_confirmation_required',
          projectId,
          status: existing.status,
          consentText: WRITER_RERUN_CONSENT_TEXT,
        },
        { status: 409 },
      );
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

    // 1.6 언어 경계(S4→S5): projects.locale 확정 + 파이프라인 출력 언어로 전달 (#i18n-s5).
    //   신규 프로젝트는 생성 시 사용자 설정으로 잠겨 온다(project/new). 잠긴 값이 곧 출력 언어.
    //   레거시(unlocked) 첫 핸드오프는 종전대로 스토리 감지로 잠그며, 감지값을 출력 언어로 쓰면
    //   "스토리 언어 추종"이던 종전 산출과 동일하다 — 행동 보존. best-effort(실패 시 미주입 = 종전 관례).
    let outputLocale: PipelineInput['outputLocale'];
    try {
      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('locale, locale_locked')
        .eq('id', projectId)
        .maybeSingle();
      const resolved = resolveOutputLocale(proj, story);
      outputLocale = resolved.outputLocale;
      if (resolved.lockTo) {
        await supabaseAdmin
          .from('projects')
          .update({ locale: resolved.lockTo, locale_locked: true })
          .eq('id', projectId);
      }
    } catch (e) {
      console.error('[writer/start] locale resolve failed (proceeding):', e);
    }

    // 1.7 스타일 앵커 seed (2026-07-14): producer "스타일&톤"에서 고른 그림체 견본을 v0 에 연결 —
    //   v0 가 장르에서 매체를 발명(예: dark_cinematic_realism)해 앵커와 충돌하는 것을 근본 차단.
    //   best-effort: 미선택/비활성/조회 실패면 undefined → 기존 동작(장르 기반 추론) 그대로.
    let styleAnchor: PipelineInput['styleAnchor'];
    try {
      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('style_anchor_key, custom_style_anchor')
        .eq('id', projectId)
        .maybeSingle();
      // 유저 업로드 앵커는 style_anchors 에 행이 없다 — label/medium 을 프로젝트 행이 들고 있다.
      //   여기서 medium 을 안 채우면 v0 가 장르에서 매체를 발명해(dark_cinematic_realism 등)
      //   이미지 쪽 앵커와 충돌한다. 이 분기가 있는 이유가 그것이다.
      const custom = parseCustomStyleAnchor(proj?.custom_style_anchor);
      if (custom) {
        styleAnchor = {
          key: proj?.style_anchor_key ?? 'custom',
          label: custom.label ?? undefined,
          medium: custom.medium ?? undefined,
        };
      } else if (proj?.style_anchor_key) {
        const { data: row } = await supabaseAdmin
          .from('style_anchors')
          .select('key, label, medium, is_active')
          .eq('key', proj.style_anchor_key)
          .maybeSingle();
        if (row?.is_active) {
          styleAnchor = { key: row.key, label: row.label ?? undefined, medium: row.medium ?? undefined };
        }
      }
    } catch (e) {
      console.error('[writer/start] style anchor resolve failed (proceeding):', e);
    }

    // 2. run 시작 (genre/cast seed → s0/s2 생략).
    const input: PipelineInput = {
      story,
      writerEngine,
      runtimeSeconds,
      styleAnchor,
      models,
      outputLocale,
      // #s3-gate: UI 핸드오프는 씬 스토리 확정 게이트를 켠다 — storyCheck 후 유저 검토·확정.
      // V2는 의미 단위 결과와 자체 검토 메타를 한 번에 만들므로 기존 씬 확인 게이트를
      // 중복 적용하지 않는다. V1은 기존 사용자 씬 검토 흐름을 그대로 유지한다.
      sceneGate: writerEngine === 'v1',
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
    if (existing?.status === 'completed' && body.rerun === true) {
      const [sceneResult, shotResult, messageResult, projectResult] = await Promise.all([
        supabaseAdmin
          .from('scenes')
          .select(
            'scene_id,narrative_summary,original_text_quote,location,time_of_day,mood,characters_present,estimated_duration_seconds',
          )
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('shots')
          .select(
            'shot_id,scene_id,action_description,shot_type,characters,location_ids,duration_seconds,dialogue_lines,camera_config,lighting_config,prompt',
          )
          .eq('project_id', projectId)
          .order('sort_order', { ascending: true }),
        supabaseAdmin
          .from('messages')
          .select('stage,role,content,created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true })
          .limit(200),
        supabaseAdmin.from('projects').select('settings').eq('id', projectId).maybeSingle(),
      ]);
      if (sceneResult.error) throw new Error(`rerun scenes load failed: ${sceneResult.error.message}`);
      if (shotResult.error) throw new Error(`rerun shots load failed: ${shotResult.error.message}`);
      if (messageResult.error) throw new Error(`rerun chat load failed: ${messageResult.error.message}`);
      if (projectResult.error) throw new Error(`rerun producer decisions load failed: ${projectResult.error.message}`);

      const previousInput = existing.state.input as PipelineInput;
      input.genre = input.genre ?? previousInput.genre;
      input.cast = input.cast ?? previousInput.cast;
      input.background = input.background ?? previousInput.background;
      input.styleAnchor = input.styleAnchor ?? previousInput.styleAnchor;
      const requestedChatHistory = Array.isArray(body.chatHistory)
        ? body.chatHistory.filter(
            (message) =>
              !!message &&
              typeof message.stage === 'string' &&
              typeof message.role === 'string' &&
              typeof message.content === 'string',
          )
        : [];
      input.rerunContext = buildRerunContext(
        existing.id,
        (sceneResult.data ?? []) as RerunSceneRow[],
        (shotResult.data ?? []) as RerunShotRow[],
        (requestedChatHistory.length ? requestedChatHistory : messageResult.data ?? []) as RerunMessageRow[],
        {
          story,
          settings: projectResult.data?.settings ?? null,
          genre: genre ?? previousInput.genre ?? null,
          cast: cast ?? previousInput.cast ?? null,
          background:
            input.background ??
            previousInput.background ??
            null,
          styleAnchor: styleAnchor ?? previousInput.styleAnchor ?? null,
        },
      );
    }
    // 동의 버튼의 중복 요청이 context 조회 중 끼어들어도, 최신 run이 기존 completed 행인지
    // 다시 확인한다. 첫 요청이 먼저 새 run을 만들었으면 두 번째는 409로 양보한다.
    if (existing?.status === 'completed' && body.rerun === true) {
      const latest = await getActiveRun(projectId);
      if (!latest || latest.id !== existing.id || latest.status !== 'completed') {
        return NextResponse.json(
          {
            error: 'writer rerun already started',
            code: 'writer_run_active',
            projectId,
            status: latest?.status ?? null,
        },
          { status: 409 },
      );
    }
    }
    const run = await createRun(
      projectId,
      input,
      writerEngine === 'v2' ? WRITER_V2_TOTAL_UNITS : WRITER_TOTAL_UNITS,
    );

    // 응답 후 별도 서버리스 인스턴스에서 첫 writer step 실행.
    //   Artist 이미지 초안은 writer v2Design post-persist hook 에서 look+anchor 확정 후 submit 한다.
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
