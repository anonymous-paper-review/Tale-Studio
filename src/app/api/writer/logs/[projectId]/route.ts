// 프로젝트 로그 파일 조회
//   GET /api/svc/logs/:projectId           → 파일 목록
//   GET /api/svc/logs/:projectId?file=X    → 파일 내용 (.json → {data}, else {text})
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
      return NextResponse.json({ error: 'invalid projectId' }, { status: 400 });
    }
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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}
