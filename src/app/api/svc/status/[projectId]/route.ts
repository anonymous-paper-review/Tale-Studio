// svc-pipeline 진행상황 조회 (폴링용)
//   - _progress.jsonl 읽어 stage별 timeline
//   - 주요 산출물 (S3, L4, L5, L6, L7) 존재 여부
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

// stage 파일 → 라벨 매핑 (UI에서 진행 표시)
const STAGE_FILES: Array<{ file: string; stage: string; axis: 'S' | 'C' | 'V' | 'L5' | 'L6' | 'L7' | 'A' }> = [
  { file: '02_S0.json', stage: 'S0', axis: 'S' },
  { file: '03_S1.json', stage: 'S1', axis: 'S' },
  { file: '04_S2.json', stage: 'S2', axis: 'S' },
  { file: '05_S3.json', stage: 'S3', axis: 'S' },
  { file: '06_C_validation_1.json', stage: 'C1', axis: 'C' },
  { file: '07_mid_preview.json', stage: 'mid_preview', axis: 'V' },
  { file: '08_L0_L1.json', stage: 'L0_L1', axis: 'V' },
  { file: '09_L2.json', stage: 'L2', axis: 'V' },
  { file: '10_L3_scene_plans.json', stage: 'L3', axis: 'V' },
  { file: '10_L3_scene_plans_inferred.json', stage: 'L3 (compact)', axis: 'V' },
  { file: '11_L4_shots.json', stage: 'L4', axis: 'V' },
  { file: '12_C_application_2.json', stage: 'C2_report', axis: 'C' },
  { file: '13_shot_sequence.json', stage: 'C2/shot_sequence', axis: 'C' },
  { file: '14_final_prompts.json', stage: 'L5/final_prompts', axis: 'L5' },
  { file: '14b_assets.json', stage: 'assets', axis: 'A' },
  { file: '15_L6_images.json', stage: 'L6/images', axis: 'L6' },
  { file: '16_L7_videos.json', stage: 'L7/videos', axis: 'L7' },
];

interface ProgressEntry {
  stage: string;
  status: 'started' | 'completed' | 'failed';
  timestamp: string;
  extra?: unknown;
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
    const dir = path.resolve(process.cwd(), 'logs', projectId);

    // 디렉토리 존재 확인
    const exists = await fs.access(dir).then(() => true).catch(() => false);
    if (!exists) {
      return NextResponse.json({ projectId, started: false, stages: [], available: {} });
    }

    // _progress.jsonl 파싱
    let timeline: ProgressEntry[] = [];
    try {
      const text = await fs.readFile(path.join(dir, '_progress.jsonl'), 'utf8');
      timeline = text
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l) as ProgressEntry;
          } catch {
            return null;
          }
        })
        .filter((x): x is ProgressEntry => x !== null);
    } catch {}

    // 각 stage 파일 존재 여부
    const available: Record<string, boolean> = {};
    for (const { file, stage } of STAGE_FILES) {
      const ok = await fs.access(path.join(dir, file)).then(() => true).catch(() => false);
      if (ok) available[stage] = true;
    }
    // L6/L7 같은 라벨이 동일 stage에 매핑되는 경우 통합

    // 마지막 stage / 에러 추출
    const lastEntry = timeline[timeline.length - 1] ?? null;
    const failed = timeline.find((e) => e.status === 'failed') ?? null;
    const pipelineCompleted = timeline.some(
      (e) => e.stage === 'PIPELINE' && e.status === 'completed',
    );
    const pipelineFailed = timeline.some(
      (e) => e.stage === 'PIPELINE' && e.status === 'failed',
    );

    // 진행률 (S0~L5 = 14단계 기준, L6/L7은 별도)
    const totalSvcStages = 12; // S0,S1,S2,S3,C1,MidPrev,L0_L1,L2,L3,L4,C2(2개로 가산 X),L5
    const completedStages = Object.keys(available).filter(
      (s) => !['L6/images', 'L7/videos', 'assets'].includes(s),
    ).length;
    const progressPercent = Math.min(100, Math.round((completedStages / totalSvcStages) * 100));

    return NextResponse.json({
      projectId,
      started: true,
      pipeline_completed: pipelineCompleted,
      pipeline_failed: pipelineFailed,
      progress_percent: progressPercent,
      current_stage: lastEntry?.stage ?? null,
      current_status: lastEntry?.status ?? null,
      last_timestamp: lastEntry?.timestamp ?? null,
      error: failed
        ? (failed.extra as { error?: string } | undefined)?.error ??
          `failed at ${failed.stage}`
        : null,
      available,
      timeline,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
