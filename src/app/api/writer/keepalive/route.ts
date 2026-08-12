// writer-pipeline 브라우저 전용 자가복구 창구.
//   /api/writer/step 은 서버-투-서버 전용 라우트다(x-writer-secret 헤더 일치 요구) — 브라우저는
//   시크릿을 가질 수 없다(번들에 심으면 곧 유출). 그래서 useWriterStatus 의 폴링 훅이 멈춘 run 을
//   감지해도 브라우저가 /api/writer/step 을 직접 두드릴 방법이 없다.
//   이 라우트가 그 창구다: 브라우저는 로그인 세션(쿠키)으로 신원을 증명하고, 시크릿은 서버 안에서만
//   triggerWriterStep 이 헤더에 붙인다. 얇게 유지 — 인증·위임만(architecture.md §2).
import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/api/guard';
import { triggerWriterStep } from '@/lib/writer/pipeline/steps';

export const runtime = 'nodejs';
// triggerWriterStep 이 기다리는 /api/writer/step 자체의 예산(STEP_BUDGET_MS=240s)에 맞춘다.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { projectId } = (await req.json()) as { projectId?: string };
    // 소유자만 통과. allowShare 는 절대 켜지 않는다 — 공유 링크 열람자가 유료 파이프라인을 굴리면 안 된다.
    const access = await requireProjectAccess(req, projectId);
    if (!access.ok) return access.response;

    await triggerWriterStep(req.nextUrl.origin, access.projectId);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[writer/keepalive]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
