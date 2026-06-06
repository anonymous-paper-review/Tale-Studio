// writer-pipeline 진행상황 조회 (폴링용).
//   writer_runs 행에서 읽는다 (파일시스템 참조 제거). 무거운 state 블롭은 SELECT 안 함
//   (getRunStatusLight 가 경량 컬럼만 조회). 반환 shape 은 기존 WriterStatus 와 동일하게 유지.
import { NextRequest, NextResponse } from 'next/server';
import { getRunStatusLight } from '@/lib/writer/run-store';

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
      timings: null,
      available: {},
      timeline: [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
