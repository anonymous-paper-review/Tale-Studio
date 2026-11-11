// POST /api/produce/comic-script — 만화 원고 쪽들을 읽어 대본으로 옮긴다 (2026-10-09 오너 "그대로 영상화").
//
// 쪽 순서 = 본문 pages 순서(클라이언트가 파일 이름 숫자 순으로 정렬해 보낸다). 대사 · 글자는 원문 그대로, 칸마다 지문 →
//   대사(src/lib/producer/comic-script.ts 지시문). 답이 대본 해석기로 읽히지 않으면 한 번 다시 쓰게 하고, 그래도 안 되면 502.
//   그림 주소는 분석 모델이 직접 가져가므로 우리 저장소 주소만 받는다(produce/chat 첨부와 같은 규칙).
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { userOwnsProject } from '@/lib/generation-jobs'
import { isOwnMediaUrl, MAX_ATTACHMENT_IMAGES } from '@/lib/upload/attachment'
import { MAX_COMIC_PAGES } from '@/lib/producer/comic-intake'
import type { ComicActionLanguage } from '@/lib/producer/comic-script'
import { runComicScript } from '@/lib/producer/comic-script-run'

export const runtime = 'nodejs'
export const maxDuration = 300

interface PageInput {
  name?: unknown
  urls?: unknown
}

function readPages(raw: unknown): string[][] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_COMIC_PAGES) return null
  const pages: string[][] = []
  for (const page of raw as PageInput[]) {
    if (!page || !Array.isArray(page.urls) || page.urls.length === 0) return null
    const urls = page.urls.filter((u): u is string => typeof u === 'string')
    if (urls.length !== page.urls.length || !urls.every(isOwnMediaUrl)) return null
    pages.push(urls)
  }
  return pages
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { projectId?: unknown; pages?: unknown; actionLanguage?: unknown } | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
  if (!projectId) return NextResponse.json({ error: 'Invalid request: projectId is required' }, { status: 400 })
  const pages = readPages(body?.pages)
  const imageUrls = pages?.flat() ?? []
  if (!pages || imageUrls.length > MAX_ATTACHMENT_IMAGES) {
    return NextResponse.json({ error: 'invalid_pages', maxPages: MAX_COMIC_PAGES }, { status: 400 })
  }
  if (!(await userOwnsProject(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const actionLanguage: ComicActionLanguage =
    body?.actionLanguage === 'en' || body?.actionLanguage === 'ja' ? body.actionLanguage : 'ko'
  // 옮기기 한 번(다시 쓰기 한 번 포함)은 시작 화면의 그대로 시작과 같은 길이다(comic-script-run).
  const run = await runComicScript(imageUrls, { pageCount: pages.length, actionLanguage })
  if (run.ok) return NextResponse.json({ script: run.script, stats: run.stats, attempts: run.attempts })
  return NextResponse.json({ error: 'comic_script_failed', reason: run.reason }, { status: 502 })
}
