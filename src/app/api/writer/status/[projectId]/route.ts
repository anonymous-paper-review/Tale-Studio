// writer-pipeline 진행상황 조회 (폴링용)
//   - _progress.jsonl 읽어 stage별 timeline
//   - 주요 산출물 (S3, L4, L5, L6, L7) 존재 여부
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

// stage 파일 → 라벨 매핑 (UI에서 진행 표시). axis: Story / Visual / Check / Render
const STAGE_FILES: Array<{ file: string; stage: string; axis: 'Story' | 'Check' | 'Visual' | 'Render' | 'Assets' }> = [
  { file: '02_genre.json', stage: 'genre', axis: 'Story' },
  { file: '03_narrativeStructure.json', stage: 'narrativeStructure', axis: 'Story' },
  { file: '04_characters.json', stage: 'characters', axis: 'Story' },
  { file: '05_scenes.json', stage: 'scenes', axis: 'Story' },
  { file: '06_storyCheck.json', stage: 'storyCheck', axis: 'Check' },
  { file: '07_midPreview.json', stage: 'midPreview', axis: 'Visual' },
  { file: '08_renderFormat_artDirection.json', stage: 'renderFormat_artDirection', axis: 'Visual' },
  { file: '09_productionDesign.json', stage: 'productionDesign', axis: 'Visual' },
  { file: '10_sceneCinematography.json', stage: 'sceneCinematography', axis: 'Visual' },
  { file: '10_sceneCinematography_inferred.json', stage: 'sceneCinematography (compact)', axis: 'Visual' },
  { file: '11_shotDesign.json', stage: 'shotDesign', axis: 'Visual' },
  { file: '12_shotCheck.json', stage: 'shotCheck', axis: 'Check' },
  { file: '13_shotSequence.json', stage: 'shotSequence', axis: 'Check' },
  { file: '14_renderPrompts.json', stage: 'renderPrompts', axis: 'Render' },
  { file: '14b_assets.json', stage: 'assets', axis: 'Assets' },
  { file: '15_shotImages.json', stage: 'shotImages', axis: 'Render' },
  { file: '16_shotVideos.json', stage: 'shotVideos', axis: 'Render' },
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

    // 진행률: 텍스트 자동 파이프라인(genre~renderPrompts) 산출물 기준. shotImages/shotVideos/assets는 별도 트리거라 제외.
    // 분모는 STAGE_FILES 실제 개수로 계산 (하드코딩 12 → 라벨 추가/삭제에 자동 추종).
    const EXCLUDED_STAGES = new Set(['shotImages', 'shotVideos', 'assets']);
    const countableStages = STAGE_FILES.filter((s) => !EXCLUDED_STAGES.has(s.stage));
    const totalWriterStages = countableStages.length;
    const completedStages = countableStages.filter((s) => available[s.stage]).length;

    // 완료 판정: PIPELINE/completed 마커 OR 최종 산출물(renderPrompts) 존재.
    // 디버그/부분 실행이 마커를 안 남겨도 renderPrompts가 나왔으면 자동 파이프라인은 끝난 것 →
    // 폴링 무한 반복 + 스피너 83% 정체 해소.
    const pipelineCompleted =
      timeline.some((e) => e.stage === 'PIPELINE' && e.status === 'completed') ||
      available['renderPrompts'] === true;

    const progressPercent = pipelineCompleted
      ? 100
      : Math.min(100, Math.round((completedStages / totalWriterStages) * 100));

    // ── 구간 시간측정 (ms) ──────────────────────────────────────────────
    // PIPELINE/started 를 t0 로 잡고 주요 마일스톤까지의 경과를 계산.
    //   assets_ready_ms = artist 가 언블록되어 이미지 생성을 시작할 수 있는 시점 (Tier 1 persist 완료).
    //   shots_ready_ms  = director 콘티가 채워지는 시점 (Tier 2 persist 완료).
    //   total_ms        = 전체 텍스트 파이프라인 완료.
    const tsOf = (stage: string, status: ProgressEntry['status']): number | null => {
      const e = timeline.find((x) => x.stage === stage && x.status === status);
      return e ? Date.parse(e.timestamp) : null;
    };
    const startedMs = tsOf('PIPELINE', 'started');
    const since = (ms: number | null) =>
      startedMs != null && ms != null ? ms - startedMs : null;
    const timings = {
      pipeline_started_at: startedMs != null ? new Date(startedMs).toISOString() : null,
      assets_ready_ms: since(tsOf('persistAssets', 'completed')),
      shots_ready_ms: since(tsOf('persistShots', 'completed')),
      total_ms: since(tsOf('PIPELINE', 'completed')),
    };

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
      timings,
      available,
      timeline,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
