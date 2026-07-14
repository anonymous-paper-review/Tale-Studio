// writer-pipeline 진행상황 조회 (폴링용).
//   writer_runs 행에서 읽는다 (파일시스템 참조 제거). 무거운 state 블롭은 SELECT 안 함
//   (getRunStatusLight 가 경량 컬럼만 조회). 반환 shape 은 기존 WriterStatus 와 동일하게 유지.
import { NextRequest, NextResponse } from 'next/server';
import {
  estimateRunTotalMs,
  getRunStatusLight,
  type RunEtaEstimate,
  type StageTiming,
} from '@/lib/writer/run-store';

export const runtime = 'nodejs';

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
  _req: NextRequest,
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

    return NextResponse.json({
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
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
