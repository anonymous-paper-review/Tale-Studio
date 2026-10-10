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
import {
  buildComicScriptPrompt,
  checkComicScript,
  comicScriptRetryNote,
  extractComicScript,
  type ComicActionLanguage,
} from '@/lib/producer/comic-script'
import { transcribeComic } from '@/lib/producer/comic-script-llm'

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
  const prompt = buildComicScriptPrompt({ pageCount: pages.length, actionLanguage })
  let lastReason: string = 'not_script'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await transcribeComic(imageUrls, attempt === 0 ? prompt : prompt + comicScriptRetryNote(lastReason as 'empty' | 'not_script' | 'no_scenes'))
      const script = extractComicScript(out.text)
      const check = checkComicScript(script)
      if (check.ok) return NextResponse.json({ script, stats: check.stats, attempts: attempt + 1 })
      lastReason = check.reason
    } catch (error) {
      console.error('[comic-script] transcription failed:', error)
      lastReason = 'model_error'
    }
  }
  return NextResponse.json({ error: 'comic_script_failed', reason: lastReason }, { status: 502 })
}
