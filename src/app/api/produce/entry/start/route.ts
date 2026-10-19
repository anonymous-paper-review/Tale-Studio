// POST /api/produce/entry/start — Producer 시작 (리뉴얼 1차 2026-10-19, 프로토타입 E4 [예, 시작] · EB7 [Writer에게 써 달라고 하기]).
//   검사: 재료(20자 이상 글 또는 글이 담긴 파일) · 고른 값 넷 · "그대로"는 지킬 원문이 있을 때만 · 아직 시작 전 · 시작 화면 단계.
//   저장(한 번에): 이야기(story_text) · 설정(settings: 길이 · 장르 · 화면 형식 · 대사 언어 = 프로젝트 언어) · Producer 카드 초안
//   (producer_draft, Writer 화면이 읽는다) · 단계 producer(= Writer) · 시작 시각(화면 비율 잠금) · 제목 없음이면 AI 임시 제목.
//   돌려주는 writerStart 를 클라이언트가 그대로 /api/writer/start 에 보낸다(산문 초안).
//   약속: tests/producer/entry-routes.test.ts · tests/producer/entry-start-plan.test.ts
import { NextResponse } from 'next/server'
import { entryDraftFor, type EntryDraft } from '@/lib/entry/draft'
import { planEntryStart } from '@/lib/entry/start-plan'
import { parseAppLocale } from '@/lib/locale'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ENTRY_STAGES, authorizeEntry, isEntryStage, loadEntryProject, serverError } from '../entry-access'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { projectId?: unknown } | null
  const access = await authorizeEntry(req, body?.projectId, { write: true })
  if (!access.ok) return access.response
  const projectId = body!.projectId as string

  try {
    const row = await loadEntryProject(projectId, 'title, locale, current_stage, entry_draft, story_text')
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = entryDraftFor({ entryDraft: row.entry_draft, storyText: row.story_text, stage: row.current_stage })
    if (draft.startedAt) return NextResponse.json({ error: 'already_started' }, { status: 409 })
    if (!isEntryStage(row.current_stage)) return NextResponse.json({ error: 'wrong_stage' }, { status: 409 })

    const locale = parseAppLocale(row.locale) ?? 'en'
    const plan = planEntryStart({ projectId, draft, locale, currentTitle: row.title ?? '' })
    if (!plan.ok) return NextResponse.json({ error: plan.code }, { status: 400 })

    const started: EntryDraft = { ...draft, startedAt: new Date().toISOString() }
    const { data, error } = await supabaseAdmin
      .from('projects')
      .update({
        story_text: plan.story,
        settings: plan.settings,
        producer_draft: plan.producerDraft,
        current_stage: 'producer',
        entry_draft: started,
        ...(plan.title ? { title: plan.title } : {}),
      })
      .eq('id', projectId)
      // 읽은 뒤 다른 요청이 단계를 옮겼으면 덮어쓰지 않는다.
      .in('current_stage', [...ENTRY_STAGES])
      .select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) return NextResponse.json({ error: 'wrong_stage' }, { status: 409 })

    return NextResponse.json({ ok: true, writerStart: plan.writerStart, title: plan.title ?? row.title ?? 'Untitled', draft: started })
  } catch (error) {
    return serverError('/start', error)
  }
}
