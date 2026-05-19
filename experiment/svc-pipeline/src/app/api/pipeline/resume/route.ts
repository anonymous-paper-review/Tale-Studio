// 중단된 프로젝트 이어서 진행
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runPipeline } from '@/lib/pipeline';
import { PipelineLogger } from '@/lib/logger';
import type { PipelineInput } from '@/lib/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 600;

async function loadOriginalInput(projectId: string): Promise<PipelineInput | null> {
  const logger = new PipelineLogger(projectId);

  // 1순위: 00_input.json (새 파이프라인부터 저장됨)
  const fromJson = await logger.loadStage<PipelineInput>('00_input.json');
  if (fromJson && typeof fromJson.story === 'string') return fromJson;

  // 2순위 (backwards compat): 00_input_story.md의 ```json``` 블록 파싱
  try {
    const root = path.resolve(process.cwd(), 'logs', projectId);
    const md = await fs.readFile(path.join(root, '00_input_story.md'), 'utf8');
    const m = /```json\s*([\s\S]*?)```/.exec(md);
    if (m) {
      const parsed = JSON.parse(m[1]) as PipelineInput;
      if (parsed && typeof parsed.story === 'string') return parsed;
    }
  } catch {}

  // 3순위 (오래된 run): INTEGRATED.json.input
  const integrated = await logger.loadStage<{ input?: PipelineInput }>('INTEGRATED.json');
  if (integrated?.input && typeof integrated.input.story === 'string') return integrated.input;

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { projectId?: string; models?: PipelineInput['models'] };
    const projectId = body.projectId;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'projectId (string) is required' }, { status: 400 });
    }

    // 디렉토리 존재 확인
    const dir = path.resolve(process.cwd(), 'logs', projectId);
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) {
        return NextResponse.json({ error: 'projectId is not a directory' }, { status: 404 });
      }
    } catch {
      return NextResponse.json({ error: 'project not found' }, { status: 404 });
    }

    const input = await loadOriginalInput(projectId);
    if (!input) {
      return NextResponse.json(
        { error: 'cannot recover original input for project (00_input.json / 00_input_story.md / INTEGRATED.json 모두 없음)' },
        { status: 400 },
      );
    }

    // UI에서 모델 오버라이드 전달했으면 적용 (저장된 input의 models보다 우선)
    const mergedInput: PipelineInput = body.models ? { ...input, models: body.models } : input;
    const result = await runPipeline(mergedInput, projectId);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error('[pipeline/resume] error:', msg, stack);
    return NextResponse.json({ error: msg, stack }, { status: 500 });
  }
}
