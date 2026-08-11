// 프로젝트 로그 파일 조회
//   GET /api/writer/logs/:projectId           → 파일 목록
//   GET /api/writer/logs/:projectId?file=X    → 파일 내용 (.json → {data}, else {text})
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireProjectAccess } from '@/lib/api/guard';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    // 소유자 전용 — 공유 티켓은 불가(서버 파일시스템 열람이라 열람권 범위 밖).
    //   감사 전에는 무인증이었고 에러 응답에 서버 절대경로가 그대로 실려 나갔다(2026-08-11).
    const access = await requireProjectAccess(req, projectId);
    if (!access.ok) return access.response;

    const dir = path.resolve(process.cwd(), 'logs', projectId);

    const file = req.nextUrl.searchParams.get('file');
    if (!file) {
      const entries = await fs.readdir(dir).catch(() => []);
      return NextResponse.json({ files: entries });
    }

    // path traversal 방지
    if (file.includes('..') || file.includes('/') || file.includes('\\')) {
      return NextResponse.json({ error: 'invalid file path' }, { status: 400 });
    }

    const filepath = path.join(dir, file);
    const text = await fs.readFile(filepath, 'utf8');
    if (file.endsWith('.json')) {
      try {
        return NextResponse.json({ data: JSON.parse(text) });
      } catch {
        return NextResponse.json({ text });
      }
    }
    return NextResponse.json({ text });
  } catch (e: unknown) {
    // 원문에는 서버 절대경로(ENOENT … '/Users/…/logs/…')가 실린다 — 서버 로그에만 남긴다.
    console.error('[writer/logs]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
