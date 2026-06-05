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
    const pipelineFailed = timeline.some(
      (e) => e.stage === 'PIPELINE' && e.status === 'failed',
    );

    // 진행률: 텍스트 자동 파이프라인(S0~L5) 산출물 기준. L6/L7/assets는 별도 트리거라 제외.
    // 분모는 STAGE_FILES 실제 개수로 계산 (하드코딩 12 → 라벨 추가/삭제에 자동 추종).
    const EXCLUDED_STAGES = new Set(['L6/images', 'L7/videos', 'assets']);
    const countableStages = STAGE_FILES.filter((s) => !EXCLUDED_STAGES.has(s.stage));
    const totalSvcStages = countableStages.length;
    const completedStages = countableStages.filter((s) => available[s.stage]).length;

    // 완료 판정: PIPELINE/completed 마커 OR 최종 산출물(L5/final_prompts) 존재.
    // 디버그/부분 실행이 마커를 안 남겨도 L5가 나왔으면 자동 파이프라인은 끝난 것 →
    // 폴링 무한 반복 + 스피너 83% 정체 해소.
    const pipelineCompleted =
      timeline.some((e) => e.stage === 'PIPELINE' && e.status === 'completed') ||
      available['L5/final_prompts'] === true;

    const progressPercent = pipelineCompleted
      ? 100
      : Math.min(100, Math.round((completedStages / totalSvcStages) * 100));

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
