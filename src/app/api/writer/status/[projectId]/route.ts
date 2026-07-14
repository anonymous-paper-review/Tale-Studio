// writer-pipeline 진행상황 조회 (폴링용).
//   writer_runs 행에서 읽는다 (파일시스템 참조 제거). 무거운 state 블롭은 SELECT 안 함
//   (getRunStatusLight 가 경량 컬럼만 조회). 반환 shape 은 기존 WriterStatus 와 동일하게 유지.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { STALE_QUEUED_MS } from '@/lib/generation-jobs';
import {
  estimateRunTotalMs,
  getRunStatusLight,
  type RunEtaEstimate,
  type StageTiming,
} from '@/lib/writer/run-store';


export const runtime = 'nodejs';
interface WriterStatusAssets {
  chars_ready: number;
  chars_total: number;
  worlds_ready: number;
  worlds_total: number;
  queued_count: number;
  failed_count: number;
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

async function computeAssets(
  projectId: string,
  pipelineCompleted: boolean,
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
      failedJobs,
      staleQueuedJobs,
      candidateResult,
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
      countRows(
        supabaseAdmin
          .from('generation_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .in('kind', ['character_view', 'world_shot'])
          .in('status', ['failed', 'errored']),
      ),
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
    ]);

    if (projectResult.error) throw new Error(projectResult.error.message ?? 'project query failed');
    if (candidateResult.error) throw new Error(candidateResult.error.message ?? 'candidate query failed');

    const candidateIds = [
      ...new Set(
        ((candidateResult.data ?? []) as Array<{ character_id?: unknown }>)
          .map((row) => row.character_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    const charsReadyFromCandidates = candidateIds.length
      ? await countRows(
          supabaseAdmin
            .from('characters')
            .select('character_id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .eq('origin', 'producer')
            .in('character_id', candidateIds)
            .is('view_main', null),
        )
      : 0;

    const charsReady = Math.min(charsTotal, charsWithImage + charsReadyFromCandidates);
    const failedCount = failedJobs + staleQueuedJobs;
    const imagesReady = charsReady === charsTotal && worldsReady === worldsTotal;
    const designTokensPresent = projectResult.data?.design_tokens != null;

    return {
      chars_ready: charsReady,
      chars_total: charsTotal,
      worlds_ready: worldsReady,
      worlds_total: worldsTotal,
      queued_count: queuedCount,
      failed_count: failedCount,
      stalled: (designTokensPresent || pipelineCompleted) && !imagesReady && queuedCount === 0,
      images_ready: imagesReady,
    };
  } catch (e) {
    console.warn('[writer/status] assets query failed:', e instanceof Error ? e.message : e);
    return emptyAssets();
  }
}


// ETA 추정은 폴링(3s)마다 다시 계산할 필요가 없다 — 인스턴스 로컬 60초 캐시(#c4).
const ETA_CACHE_TTL_MS = 60_000;
const etaCache = new Map<string, { at: number; value: RunEtaEstimate | null }>();

async function cachedEta(projectId: string): Promise<RunEtaEstimate | null> {
  const hit = etaCache.get(projectId);
  if (hit && Date.now() - hit.at < ETA_CACHE_TTL_MS) return hit.value;
  const value = await estimateRunTotalMs(projectId).catch(() => null);
  etaCache.set(projectId, { at: Date.now(), value });
  return value;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
      return NextResponse.json({ error: 'invalid projectId' }, { status: 400 });
    }

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

    // 진행 중일 때만 예상 총 소요시간을 동봉 — 기록 없으면 null(UI가 숨김)(#c4).
    const runningNow = !!row && row.status !== 'completed' && row.status !== 'failed';
    const eta = runningNow ? await cachedEta(projectId) : null;

    const body: {
      projectId: string;
      started: boolean;
      pipeline_completed: boolean;
      pipeline_failed: boolean;
      progress_percent: number;
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
    } = {
      projectId,
      started: !!row,
      pipeline_completed: row?.status === 'completed',
      pipeline_failed: row?.status === 'failed',
      progress_percent: progressPercent,
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
      eta_total_ms: eta?.totalMs ?? null,
      eta_based_on_runs: eta?.basedOnRuns ?? 0,
      available: {},
      timeline,
    };

    if (new URL(req.url).searchParams.get('assets') === '1') {
      body.assets = await computeAssets(projectId, body.pipeline_completed);
    }

    return NextResponse.json(body);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
