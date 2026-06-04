// 저장된 프로젝트 목록 조회
import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const logsDir = path.resolve(process.cwd(), 'logs');
    let entries: string[] = [];
    try {
      entries = await fs.readdir(logsDir);
    } catch {
      return NextResponse.json({ projects: [] });
    }

    const projects = [];
    for (const id of entries) {
      const dir = path.join(logsDir, id);
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) continue;

      // INTEGRATED.json 있으면 메타 같이 반환
      const integratedPath = path.join(dir, 'INTEGRATED.json');
      let meta: Record<string, unknown> | null = null;
      try {
        const text = await fs.readFile(integratedPath, 'utf8');
        const data = JSON.parse(text) as { S0?: { genre?: string }; metadata?: unknown; shot_sequence?: { total_shots?: number; total_duration_seconds?: number } };
        meta = {
          genre: data.S0?.genre,
          total_shots: data.shot_sequence?.total_shots,
          total_duration_seconds: data.shot_sequence?.total_duration_seconds,
          metadata: data.metadata,
        };
      } catch {
        // INTEGRATED.json 없음 (실패하거나 중간 단계)
      }

      // 완료 판정: L5(14_final_prompts.json) 존재 여부가 진짜 완료 시그널
      // (구 프로젝트는 INTEGRATED만 있고 L5 누락 — resumable로 처리해 L5만 추가 생성)
      const l5Exists = await fs.access(path.join(dir, '14_final_prompts.json')).then(() => true).catch(() => false);
      const completed = l5Exists;

      // 마지막 완료 stage 추정 (resume 표시용). 완료 아닐 때만 계산.
      let last_stage: string | null = null;
      let resumable = false;
      if (!completed) {
        const stageFiles: Array<{ file: string; stage: string }> = [
          { file: '02_S0.json', stage: 'S0' },
          { file: '03_S1.json', stage: 'S1' },
          { file: '04_S2.json', stage: 'S2' },
          { file: '05_S3.json', stage: 'S3' },
          { file: '06_C_validation_1.json', stage: 'C1' },
          { file: '07_mid_preview.json', stage: 'mid_preview' },
          { file: '08_L0_L1.json', stage: 'L0_L1' },
          { file: '09_L2.json', stage: 'L2' },
          { file: '10_L3_scene_plans.json', stage: 'L3' },
          { file: '10_L3_scene_plans_inferred.json', stage: 'L3 (compact)' },
          { file: '11_L4_shots.json', stage: 'L4' },
          { file: '13_shot_sequence.json', stage: 'C2/shot_sequence' },
          { file: '14_final_prompts.json', stage: 'L5/final_prompts' },
        ];
        for (const { file, stage } of stageFiles) {
          try {
            await fs.access(path.join(dir, file));
            last_stage = stage;
          } catch {}
        }
        const hasJson = await fs.access(path.join(dir, '00_input.json')).then(() => true).catch(() => false);
        const hasMd = await fs.access(path.join(dir, '00_input_story.md')).then(() => true).catch(() => false);
        resumable = hasJson || hasMd;
      }

      projects.push({
        project_id: id,
        created_at: stat.birthtime?.toISOString() ?? stat.mtime.toISOString(),
        meta,
        completed,
        last_stage,
        resumable,
      });
    }

    projects.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return NextResponse.json({ projects });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
