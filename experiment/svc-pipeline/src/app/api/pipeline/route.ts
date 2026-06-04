import { NextRequest, NextResponse } from 'next/server';
import { runPipeline } from '@/lib/pipeline';
import type { PipelineInput } from '@/lib/types/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PipelineInput;

    if (!body.story || typeof body.story !== 'string') {
      return NextResponse.json({ error: 'story (string) is required' }, { status: 400 });
    }

    const result = await runPipeline(body);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    console.error('[pipeline] error:', msg, stack);
    return NextResponse.json({ error: msg, stack }, { status: 500 });
  }
}
