// writer-pipeline 진행상황 조회 (폴링용).
//   writer_runs 행에서 읽는다 (파일시스템 참조 제거). 무거운 state 블롭은 SELECT 안 함
//   (getRunStatusLight 가 경량 컬럼만 조회). 반환 shape 은 기존 WriterStatus 와 동일하게 유지.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireProjectAccess } from '@/lib/api/guard';
import { isAdminUserId } from '@/lib/quota-exempt-server';
import { STALE_QUEUED_MS } from '@/lib/generation-jobs';
import { artistImagesStarted } from '@/lib/artist/images-started';
import {
  getRunStatusLight,
  type StageTiming,
} from '@/lib/writer/run-store';


export const runtime = 'nodejs';
interface WriterStatusAssets {
  chars_ready: number;
  chars_total: number;
  worlds_ready: number;
  worlds_total: number;
  queued_count: number;
  /** 실패한 작업만 센다 — 10분 넘게 멈춘 대기 작업은 여기 섞지 않는다(stale_count). 대상마다 가장 최근 작업이 실패이고 그 그림이 지금 없을 때만(지난 실패는 빼고 — 검토 rev-flow 리드 3). */
  failed_count: number;
  /** 10분 넘게 대기로 멈춘 작업 수 — 실패도 대기도 아니다. 웹훅을 놓친 유령 · 접수 확인이 안 된 예약(2026-11-14 오너 — 현황이 멈춘 작업을 따로 말하게).
   *  Lumi 가 이 키를 "멈춘 작업 N개"로 말한다(chat-tools/protocol.ts 안내). */
  stale_count: number;
  stalled: boolean;
  images_ready: boolean;
}

function emptyAssets(): WriterStatusAssets {
  return {
    chars_ready: 0,
    chars_total: 0,
    worlds_ready: 0,
    worlds_total: 0,
    queued_count: 0,
    failed_count: 0,
    stale_count: 0,
    stalled: false,
    images_ready: false,
  };
}

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message?: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(error.message ?? 'asset count query failed');
  return count ?? 0;
}

interface ArtistJobRow { kind: string; status: string; target: unknown; created_at: string }
const FAILED_JOB = new Set(['failed', 'errored']);

/** 지금 다시 그려야 할 실패 수(검토 rev-flow 리드 3) — 대상(인물 · 배경)마다 가장 최근 작업이 실패이고 그 그림이 지금 없을 때만 센다.
 *  같은 대상을 다시 그려 그림이 생겼거나 다시 맡긴 작업이 더 최근이면 지난 실패는 세지 않는다. 대상을 모르는 옛 실패 작업은 지금처럼 센다.
 *  그림이 있는가는 위 준비 판정과 같은 기준(인물: 대표 그림 · 후보 · 대표 모습 시트, 배경: wide_shot). */
async function currentArtistFailures(projectId: string, rows: readonly ArtistJobRow[], charReadyWithoutViewMain: ReadonlySet<string>): Promise<number> {
  const latest = new Map<string, { status: string; at: string }>();
  let untargeted = 0;
  for (const row of rows) {
    const target = (row.target && typeof row.target === 'object' ? row.target : {}) as { characterId?: unknown; locationId?: unknown };
    const key = row.kind === 'character_view' && typeof target.characterId === 'string' && target.characterId
      ? `char:${target.characterId}`
      : row.kind === 'world_shot' && typeof target.locationId === 'string' && target.locationId
        ? `loc:${target.locationId}`
        : null;
    if (!key) {
      if (FAILED_JOB.has(row.status)) untargeted += 1;
      continue;
    }
    const at = String(row.created_at ?? '');
    const prev = latest.get(key);
    if (!prev || at >= prev.at) latest.set(key, { status: row.status, at });
  }
  const failedIds = (prefix: string) => [...latest].filter(([key, job]) => key.startsWith(prefix) && FAILED_JOB.has(job.status)).map(([key]) => key.slice(prefix.length));
  const failedCharacters = failedIds('char:');
  const failedLocations = failedIds('loc:');
  let missing = 0;
  if (failedCharacters.length) {
    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('character_id, view_main')
      .eq('project_id', projectId)
      .eq('origin', 'producer')
      .in('character_id', failedCharacters);
    if (error) throw new Error(error.message ?? 'failed character query failed');
    missing += ((data ?? []) as Array<{ character_id: string; view_main: unknown }>).filter((row) => row.view_main == null && !charReadyWithoutViewMain.has(row.character_id)).length;
  }
  if (failedLocations.length) {
    const { data, error } = await supabaseAdmin
      .from('locations')
      .select('location_id, wide_shot')
      .eq('project_id', projectId)
      .in('location_id', failedLocations);
    if (error) throw new Error(error.message ?? 'failed location query failed');
    missing += ((data ?? []) as Array<{ location_id: string; wide_shot: unknown }>).filter((row) => row.wide_shot == null).length;
  }
  return untargeted + missing;
}

async function computeAssets(
  projectId: string,
  pipelineCompleted: boolean,
  strict = false,
): Promise<WriterStatusAssets> {
  try {
    const cutoff = new Date(Date.now() - STALE_QUEUED_MS).toISOString();

    const [
      projectResult,
      charsTotal,
      charsWithImage,
      worldsTotal,
      worldsReady,
      queuedCount,
      artistJobsResult,
      staleQueuedJobs,
      candidateResult,
      sheetResult,
      shotCount,
      imagesStarted,
    ] = await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('design_tokens')
        .eq('id', projectId)
        .maybeSingle(),
      countRows(
        supabaseAdmin
          .from('characters')
          .select('character_id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('origin', 'producer'),
      ),
      countRows(
        supabaseAdmin
          .from('characters')
          .select('character_id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .eq('origin', 'producer')
          .not('view_main', 'is', null),
      ),
      countRows(
        supabaseAdmin
          .from('locations')
          .select('location_id', { count: 'exact', head: true })
          .eq('project_id', projectId),
      ),
      countRows(
        supabaseAdmin
          .from('locations')
          .select('location_id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .not('wide_shot', 'is', null),
      ),
      countRows(
        supabaseAdmin
          .from('generation_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('kind', ['character_view', 'world_shot'])
          .eq('status', 'queued')
          .gte('created_at', cutoff),
      ),
      // 인물 · 배경 그림 작업 — 대상마다 가장 최근 작업을 보고 지금 실패인지 가린다(검토 rev-flow 리드 3, 아래 currentArtistFailures).
      supabaseAdmin
        .from('generation_jobs')
        .select('kind, status, target, created_at')
        .eq('project_id', projectId)
        .in('kind', ['character_view', 'world_shot']),
      countRows(
        supabaseAdmin
          .from('generation_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('kind', ['character_view', 'world_shot'])
          .eq('status', 'queued')
          .lt('created_at', cutoff),
      ),
      supabaseAdmin
        .from('character_image_candidates')
        .select('character_id')
        .eq('project_id', projectId)
        .eq('view', 'main'),
      // 대표 모습에 시트가 있는 인물(올린 그림 포함) — 초안 그리기 · Artist [완료하기]가 그린 것으로 보는 기준(오너 2026-11-27 N7).
      supabaseAdmin
        .from('character_appearances')
        .select('character_id')
        .eq('project_id', projectId)
        .eq('is_default', true)
        .not('sheet_url', 'is', null),
      // 새 흐름(m1126 O1)은 씬 · 샷을 먼저 나누고 Artist [이미지 만들기]로 그린다 — 샷이 있고 그림 작업이 한 번도 없으면 아직 시작 전이다.
      countRows(
        supabaseAdmin
          .from('shots')
          .select('shot_id', { count: 'exact', head: true })
          .eq('project_id', projectId),
      ),
      artistImagesStarted(projectId),
    ]);

    if (projectResult.error) throw new Error(projectResult.error.message ?? 'project query failed');
    if (candidateResult.error) throw new Error(candidateResult.error.message ?? 'candidate query failed');
    if (sheetResult.error) throw new Error(sheetResult.error.message ?? 'appearance sheet query failed');
    if (artistJobsResult.error) throw new Error(artistJobsResult.error.message ?? 'artist job query failed');

    const idsOf = (rows: unknown) => ((rows ?? []) as Array<{ character_id?: unknown }>)
      .map((row) => row.character_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    // 대표 그림 칸(view_main)이 비었어도 후보 그림이나 대표 모습 시트(올린 그림 포함)가 있으면 그린 인물이다.
    //   시트를 안 세면 올린 그림 프로젝트가 늘 "오래 걸림"이었다(2026-11-27 시험 복사본 실측 — 레일 Artist 칸이 다시 시도 칸으로 굳음).
    const readyWithoutViewMain = [...new Set([...idsOf(candidateResult.data), ...idsOf(sheetResult.data)])];
    const charsReadyFromCandidates = readyWithoutViewMain.length
      ? await countRows(
          supabaseAdmin
            .from('characters')
            .select('character_id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .eq('origin', 'producer')
            .in('character_id', readyWithoutViewMain)
            .is('view_main', null),
        )
      : 0;

    const charsReady = Math.min(charsTotal, charsWithImage + charsReadyFromCandidates);
    const failedJobs = await currentArtistFailures(projectId, (artistJobsResult.data ?? []) as ArtistJobRow[], new Set(readyWithoutViewMain));
    // 멈춘 대기 작업은 실패로 합치지 않고 따로 센다 — 합치면 AI 가 "마지막 시도가 실패했어요"라고 DB(대기 그대로)와 다르게 말했다.
    const imagesReady = charsReady === charsTotal && worldsReady === worldsTotal;
    const designTokensPresent = projectResult.data?.design_tokens != null;
    // [이미지 만들기] 전(새 흐름: 샷이 먼저 있고 Artist 그림 작업이 한 번도 없음)은 멈춘 것이 아니다 — 작업 기록을 못 읽으면(null) 지금처럼 본다.
    const waitingForMakeImages = shotCount > 0 && imagesStarted === false;

    return {
      chars_ready: charsReady,
      chars_total: charsTotal,
      worlds_ready: worldsReady,
      worlds_total: worldsTotal,
      queued_count: queuedCount,
      failed_count: failedJobs,
      stale_count: staleQueuedJobs,
      stalled: (designTokensPresent || pipelineCompleted) && !imagesReady && queuedCount === 0 && !waitingForMakeImages,
      images_ready: imagesReady,
    };
  } catch (e) {
    if (strict) throw e;
    console.warn('[writer/status] assets query failed:', e instanceof Error ? e.message : e);
    return emptyAssets();
  }
}


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    // 소유자 또는 유효한 공유 티켓만 (2026-08-11 보안 감사).
    //   클라 폴러(project-store·use-artist-lock-poll·use-writer-status)는 !r.ok 를
    //   이미 정상 처리하므로 401/403 이 UI 를 깨지 않는다.
    const access = await requireProjectAccess(req, projectId, { allowShare: true });
    if (!access.ok) return access.response;

    const row = await getRunStatusLight(projectId);

    const progressPercent = row
      ? row.status === 'completed'
        ? 100
        : row.total_units > 0
          ? Math.round((row.completed_units / row.total_units) * 100)
          : 0
      : 0;

    // 단계별 소요시간 (timing pipeline) — state._timings 를 평탄화해 타임라인으로.
    const stageTimings: Record<string, StageTiming> = row?.timings ?? {};
    const timeline = Object.entries(stageTimings).map(([stage, t]) => ({
      stage,
      ms: t.ms,
      seconds: +(t.ms / 1000).toFixed(1),
      attempts: t.attempts,
      ended_at: t.endedAt,
    }));
    const totalMs = timeline.reduce((sum, s) => sum + s.ms, 0);
    const stagesMs: Record<string, number> = {};
    for (const s of timeline) stagesMs[s.stage] = s.ms;

    const body: {
      projectId: string;
      engine: 'v1' | 'v2';
      started: boolean;
      /** 새 프로젝트의 트리트먼트 초안 — 아직 Writer 로 넘기지 않은 실행(Producer 는 잠기지 않는다). */
      draft: boolean;
      /** 새 Writer 에서 산문을 확정한 실행 — 샷이 먼저 생겨도 [완료하기] 전에는 Storyboard 를 열지 않는다(stage-gate). */
      prose_locked: boolean;
      pipeline_completed: boolean;
      pipeline_failed: boolean;
      progress_percent: number;
      // 유닛 원값 노출(#chat-progress-pin 2026-08-07) — percent 축약으로 버려지던 DB 컬럼.
      //   "몇 단계 중 몇 단계"를 클라가 그대로 표시할 수 있게 한다 (새 진실 아님).
      completed_units: number;
      total_units: number;
      current_stage: string | null;
      current_status: string | null;
      last_timestamp: string | null;
      error: string | null;
      timings: { pipeline_started_at: string; total_ms: number; stages: Record<string, number> } | null;
      eta_total_ms: number | null;
      eta_based_on_runs: number;
      available: Record<string, never>;
      timeline: Array<{ stage: string; ms: number; seconds: number; attempts: number; ended_at: string }>;
      assets?: WriterStatusAssets;
      // #coverage-first(2026-09-02 오너): shotCheck 의 결정론 연출 점검(커버리지·감정 연쇄·급전환)을
      //   영상 생성 전에 사람에게 보여준다 — "영상 만들고 나서야 안다"의 조기 캐치 채널.
      directing_issues?: Array<{ severity: string; location: string; message: string; suggestion: string | null }>;
      directing_issue_count?: number;
    } = {
      projectId,
      engine: row?.engine ?? 'v1',
      started: !!row,
      draft: row?.draft === 'true',
      prose_locked: row?.prose_locked === 'true',
      pipeline_completed: row?.status === 'completed',
      pipeline_failed: row?.status === 'failed',
      progress_percent: progressPercent,
      completed_units: row?.completed_units ?? 0,
      total_units: row?.total_units ?? 0,
      current_stage: row?.current_stage ?? null,
      current_status: row?.status ?? null,
      last_timestamp: row?.updated_at ?? null,
      error: row?.error ?? null,
      timings: row
        ? {
            pipeline_started_at: row.created_at,
            total_ms: totalMs,
            stages: stagesMs,
          }
        : null,
      // 전체 경과에는 검토 대기가, 단계별 기록에는 마지막 실행 조각만 들어갈 수 있다.
      // 둘 다 남은 시간의 근거로 쓰지 않는다. 구 클라이언트와의 응답 형식만 유지한다.
      eta_total_ms: null,
      eta_based_on_runs: 0,
      available: {},
      timeline,
    };

    if (new URL(req.url).searchParams.get('assets') === '1') {
      body.assets = await computeAssets(projectId, body.pipeline_completed, new URL(req.url).searchParams.get('strict') === '1');
    }
    // 2026-11-03 오너 "Directing Check는 관리자 계정 아니면 안 보이게": 연출 점검은 관리자 계정에게만 보낸다.
    //   화면은 이 칸이 있을 때만 띠를 그린다. 공유 보기(userId 없음) · 계정 읽기 실패는 관리자가 아닌 것으로 본다.
    if (body.pipeline_completed && Array.isArray(row?.shot_issues) && access.userId && (await isAdminUserId(access.userId))) {
      const all = row.shot_issues
        .filter((i) => (i.category === 'cinematography' || i.category === 'continuity') && (i.severity === 'WARNING' || i.severity === 'CRITICAL'))
        .map((i) => ({ severity: String(i.severity), location: String(i.location ?? ''), message: String(i.message ?? ''), suggestion: i.suggestion ? String(i.suggestion) : null }));
      body.directing_issue_count = all.length;
      body.directing_issues = all.slice(0, 40);
    }

    return NextResponse.json(body);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
