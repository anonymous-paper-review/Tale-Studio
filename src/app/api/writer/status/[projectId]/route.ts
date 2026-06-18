// writer-pipeline 진행상황 조회 (폴링용).
//   writer_runs 행에서 읽는다 (파일시스템 참조 제거). 무거운 state 블롭은 SELECT 안 함
//   (getRunStatusLight 가 경량 컬럼만 조회). 반환 shape 은 기존 WriterStatus 와 동일하게 유지.
import { NextRequest, NextResponse } from 'next/server';
import { getRunStatusLight, type StageTiming } from '@/lib/writer/run-store';

export const runtime = 'nodejs';

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
      available: {},
      timeline,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
