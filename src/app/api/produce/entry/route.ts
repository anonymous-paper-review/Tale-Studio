// GET · PATCH /api/produce/entry — Producer 시작 화면 초안(projects.entry_draft) 읽기 · 고치기 (리뉴얼 1차 2026-10-19).
//   화면에서 고르기 · 채팅으로 만들기 두 탭이 같은 초안을 쓴다. 고칠 수 있는 칸: 아이디어 글 · 고른 값 · 채팅 진행 · 파일 빼기.
//   시작한 뒤(entry_draft.startedAt)에는 고치지 않는다(409) — 화면 비율이 잠겼고 Producer 는 완료 화면이다.
//   약속: tests/producer/entry-routes.test.ts
import { NextRequest, NextResponse } from 'next/server'
import { applyEntryPatch, normalizeEntryDraft } from '@/lib/entry/draft'
import { planEntryStart } from '@/lib/entry/start-plan'
import { parseAppLocale } from '@/lib/locale'
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
    const row = await loadEntryProject(id, 'title, locale, current_stage, entry_draft, settings')
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = normalizeEntryDraft(row.entry_draft)
    const locale = parseAppLocale(row.locale) ?? 'en'
    const run = await getRunStatusLight(id).catch(() => null)
    // 시작한 프로젝트는 같은 값으로 Writer 시작을 다시 할 수 있게 요청을 돌려준다(초안 쓰기가 실패했을 때).
    const plan = draft.startedAt ? planEntryStart({ projectId: id, draft, locale, currentTitle: row.title ?? '' }) : null
    return NextResponse.json({
      draft,
      title: row.title ?? 'Untitled',
      startedAt: draft.startedAt,
      locale,
      stage: row.current_stage ?? null,
      format: parseProjectFormat(row.settings?.format),
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
    const row = await loadEntryProject(projectId, 'current_stage, entry_draft')
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = normalizeEntryDraft(row.entry_draft)
    if (draft.startedAt) return NextResponse.json({ error: 'already_started' }, { status: 409 })
    const next = applyEntryPatch(draft, body?.patch)
    await saveEntryDraft(projectId, next)
    return NextResponse.json({ ok: true, draft: next })
  } catch (error) {
    return serverError('', error)
  }
}
