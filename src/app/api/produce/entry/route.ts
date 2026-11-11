// GET · PATCH /api/produce/entry — Producer 시작 화면 초안(projects.entry_draft) 읽기 · 고치기 (리뉴얼 1차 2026-10-19).
//   화면에서 고르기 · 채팅으로 만들기 두 탭이 같은 초안을 쓴다. 고칠 수 있는 칸: 아이디어 글 · 고른 값 · 채팅 진행 · 파일 빼기.
//   시작한 뒤(entry_draft.startedAt)에는 고치지 않는다(409) — 화면 비율이 잠겼고 Producer 는 완료 화면이다.
//   시리즈 다음 화(2026-10-26)는 앞 화 비율 · 대사 언어 · 이어받은 개수를 series 로 같이 돌려준다(설정 화면 · 확인 창이 쓴다).
//   약속: tests/producer/entry-routes.test.ts · tests/producer/entry-series.test.ts
import { NextRequest, NextResponse } from 'next/server'
import { entrySeriesOf } from '@/features/entry/series'
import { applyEntryPatch, entryDraftFor } from '@/lib/entry/draft'
import { planEntryStart, withComicScript } from '@/lib/entry/start-plan'
import { parseAppLocale } from '@/lib/locale'
import { parseSeries } from '@/lib/series/snapshot'
import { getRunStatusLight } from '@/lib/writer/run-store'
import { parseProjectFormat } from '@/types/project'
import { authorizeEntry, authorizeEntryOwner, authorizeEntrySignedIn, loadEntryProject, saveEntryDraft, serverError } from './entry-access'

export const runtime = 'nodejs'

/** 시작 화면이 읽는 것 — 초안 칸 · Writer 진행(시작했는지 · 산문 초안을 쓰는 중인지). */
function readEntry(id: string) {
  return Promise.all([
    loadEntryProject(id, 'title, locale, current_stage, entry_draft, story_text, settings, series'),
    getRunStatusLight(id).catch(() => null),
  ])
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')
  // 로그인 확인 → (주인 확인 ‖ 자료 읽기). 차례로 하면 데이터베이스 왕복 다섯 번이 쌓여 Producer 탭이 늦게 떴다(QA 2026-11-03).
  //   로그인 확인을 먼저 해도 시간은 같다 — 주인 확인(왕복 두 번)하는 동안 자료 읽기(한 번)가 끝난다. 익명 요청은 데이터베이스를 읽지 않는다(검토 11/3).
  //   확인 규칙은 PATCH 와 같은 entry-access 도우미 둘(로그인 · 번호 → 주인) — 거절 순서 · 답도 같다(401 → 400 → 403).
  //   주인이 아니면 읽은 것은 버리고 기다리지 않는다. 약속: tests/producer/entry-read-speed.test.ts
  const signedIn = await authorizeEntrySignedIn(req, projectId, { write: false })
  if (!signedIn.ok) return signedIn.response
  const reads = readEntry(signedIn.projectId)
  // 거절로 끝나 기다리지 않게 된 읽기의 실패가 처리 안 된 거절로 새지 않게.
  reads.catch(() => null)
  const owner = await authorizeEntryOwner(signedIn)
  if (!owner.ok) return owner.response
  const id = signedIn.projectId
  try {
    const [row, run] = await reads
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = entryDraftFor({ entryDraft: row.entry_draft, storyText: row.story_text, stage: row.current_stage })
    const locale = parseAppLocale(row.locale) ?? 'en'
    // 시작한 프로젝트는 같은 값으로 Writer 시작을 다시 할 수 있게 요청을 돌려준다(초안 쓰기가 실패했을 때).
    //   만화 쪽 그대로는 시작 때 옮긴 대본(저장한 이야기)으로 — 초안의 읽은 글로 다시 짜면 화면(대본)과 산문이 어긋난다(2026-11-11 결정 3).
    const series = parseSeries(row.series)
    const plan = draft.startedAt ? planEntryStart({ projectId: id, draft: withComicScript(draft, row.story_text), locale, currentTitle: row.title ?? '', series }) : null
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
