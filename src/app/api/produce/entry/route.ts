// GET · PATCH /api/produce/entry — Producer 시작 화면 초안(projects.entry_draft) 읽기 · 고치기 (리뉴얼 1차 2026-10-19).
//   화면에서 고르기 · 채팅으로 만들기 두 탭이 같은 초안을 쓴다. 고칠 수 있는 칸: 아이디어 글 · 고른 값 · 채팅 진행 · 파일 빼기.
//   시작한 뒤(entry_draft.startedAt)에는 고치지 않는다(409) — 화면 비율이 잠겼고 Producer 는 완료 화면이다.
//   시리즈 다음 화(2026-10-26)는 앞 화 비율 · 대사 언어 · 이어받은 개수를 series 로 같이 돌려준다(설정 화면 · 확인 창이 쓴다).
//   약속: tests/producer/entry-routes.test.ts · tests/producer/entry-series.test.ts
import { NextRequest, NextResponse } from 'next/server'
import { entrySeriesOf } from '@/features/entry/series'
import { applyEntryPatch, entryDraftFor } from '@/lib/entry/draft'
import { planEntryStart } from '@/lib/entry/start-plan'
import { parseAppLocale } from '@/lib/locale'
import { parseSeries } from '@/lib/series/snapshot'
import { getRunStatusLight } from '@/lib/writer/run-store'
import { parseProjectFormat } from '@/types/project'
import { authorizeEntry, loadEntryProject, saveEntryDraft, serverError } from './entry-access'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  const access = await authorizeEntry(req, projectId, { write: false })
  if (!access.ok) return access.response
  const id = projectId as string
  try {
    const row = await loadEntryProject(id, 'title, locale, current_stage, entry_draft, story_text, settings, series')
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = entryDraftFor({ entryDraft: row.entry_draft, storyText: row.story_text, stage: row.current_stage })
    const locale = parseAppLocale(row.locale) ?? 'en'
    const run = await getRunStatusLight(id).catch(() => null)
    // 시작한 프로젝트는 같은 값으로 Writer 시작을 다시 할 수 있게 요청을 돌려준다(초안 쓰기가 실패했을 때).
    const series = parseSeries(row.series)
    const plan = draft.startedAt ? planEntryStart({ projectId: id, draft, locale, currentTitle: row.title ?? '', series }) : null
    return NextResponse.json({
      draft,
      title: row.title ?? 'Untitled',
      startedAt: draft.startedAt,
      locale,
      stage: row.current_stage ?? null,
      format: parseProjectFormat(row.settings?.format),
      series: entrySeriesOf(series),
      writer: { started: !!run, status: run?.status ?? null, draft: run?.draft === 'true' },
      writerStart: plan?.ok ? plan.writerStart : null,
    })
  } catch (error) {
    return serverError('', error)
  }
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { projectId?: unknown; patch?: unknown } | null
  const access = await authorizeEntry(req, body?.projectId, { write: true })
  if (!access.ok) return access.response
  const projectId = body!.projectId as string
  try {
    const row = await loadEntryProject(projectId, 'current_stage, entry_draft, story_text')
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = entryDraftFor({ entryDraft: row.entry_draft, storyText: row.story_text, stage: row.current_stage })
    if (draft.startedAt) return NextResponse.json({ error: 'already_started' }, { status: 409 })
    const next = applyEntryPatch(draft, body?.patch)
    await saveEntryDraft(projectId, next)
    return NextResponse.json({ ok: true, draft: next })
  } catch (error) {
    return serverError('', error)
  }
}
