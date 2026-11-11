// POST /api/produce/entry/start — Producer 시작 (리뉴얼 1차 2026-10-19, 프로토타입 E4 [예, 시작] · EB7 [Writer에게 써 달라고 하기]).
//   검사: 재료(20자 이상 글 또는 글이 담긴 파일) · 고른 값 넷 · "그대로"는 지킬 원문이 있을 때만 · 아직 시작 전 · 시작 화면 단계.
//   저장(한 번에): 이야기(story_text) · 설정(settings: 길이 · 장르 · 화면 형식 · 대사 언어 = 프로젝트 언어, 그대로는 원고 언어) · Producer 카드 초안
//   (producer_draft, Writer 화면이 읽는다) · 단계 producer(= Writer) · 시작 시각(화면 비율 잠금) · 제목 없음이면 AI 임시 제목.
//   시리즈 다음 화(2026-10-26)는 projects.series 를 같이 읽어 이어받은 인물 · 배경 카드와 앞 화 대사 언어를 카드 초안에 싣는다.
//   돌려주는 writerStart 를 클라이언트가 그대로 /api/writer/start 에 보낸다(산문 초안).
//   만화 쪽 그대로(2026-11-11 오너 결정 3): 그림 파일을 그대로로 시작하면 채팅 길과 같은 만화 대본 옮기기로 옮긴 대본을 이야기로 삼는다 —
//   글자 읽기 글(말풍선 글만)을 이야기로 삼으면 Writer 가 화자를 짐작하고 말을 고쳤다. 만화가 아니라는 답(사진 찍은 대본 · 메모)이면
//   지금처럼 읽은 글을 쓰고, 옮기기에 실패하면 시작하지 않는다(다시 시도). 옮기기는 30~60초 걸린다.
//   약속: tests/producer/entry-routes.test.ts · tests/producer/entry-start-plan.test.ts · tests/producer/entry-comic-keep.test.ts
import { NextResponse } from 'next/server'
import { entryDraftFor, type EntryDraft } from '@/lib/entry/draft'
import { planEntryStart, withComicScript } from '@/lib/entry/start-plan'
import { parseAppLocale } from '@/lib/locale'
import { runComicScript } from '@/lib/producer/comic-script-run'
import { parseSeries } from '@/lib/series/snapshot'
import { mediaPublicUrl } from '@/lib/storage/media'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { authorizeEntry, isEntryStage, loadEntryProject, serverError } from '../entry-access'

export const runtime = 'nodejs'
// 만화 쪽 그대로 시작은 만화 대본 옮기기(다시 쓰기 한 번 포함)를 기다린다 — produce/comic-script 와 같은 한도.
export const maxDuration = 300

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { projectId?: unknown } | null
  const access = await authorizeEntry(req, body?.projectId, { write: true })
  if (!access.ok) return access.response
  const projectId = body!.projectId as string

  try {
    const row = await loadEntryProject(projectId, 'title, locale, current_stage, entry_draft, story_text, series')
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = entryDraftFor({ entryDraft: row.entry_draft, storyText: row.story_text, stage: row.current_stage })
    if (draft.startedAt) return NextResponse.json({ error: 'already_started' }, { status: 409 })
    if (!isEntryStage(row.current_stage)) return NextResponse.json({ error: 'wrong_stage' }, { status: 409 })

    const locale = parseAppLocale(row.locale) ?? 'en'
    const series = parseSeries(row.series)
    let plan = planEntryStart({ projectId, draft, locale, currentTitle: row.title ?? '', series })
    if (!plan.ok) return NextResponse.json({ error: plan.code }, { status: 400 })

    // 만화 쪽 그대로 — 옮긴 대본을 파일의 글 대신 이야기로 삼는다(초안의 읽은 글은 그대로 둔다). 지문은 프로젝트 언어(채팅 길과 같은 규칙).
    const file = draft.file
    const pagePaths = file?.kind === 'image' ? (file.slicePaths?.length ? file.slicePaths : file.storagePath ? [file.storagePath] : []) : []
    if (plan.changeLevel === 'keep' && pagePaths.length) {
      const run = await runComicScript(pagePaths.map(mediaPublicUrl), { pageCount: 1, actionLanguage: locale === 'en' ? 'en' : 'ko', notComic: true })
      if (run.ok) {
        plan = planEntryStart({ projectId, draft: withComicScript(draft, run.script), locale, currentTitle: row.title ?? '', series })
        if (!plan.ok) return NextResponse.json({ error: plan.code }, { status: 400 })
      } else if (run.reason !== 'not_comic') {
        return NextResponse.json({ error: 'comic_script_failed', reason: run.reason }, { status: 502 })
      }
    }

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
      // 읽은 뒤 다른 요청이 단계를 옮겼으면 덮어쓰지 않는다 — 읽은 단계 그대로일 때만 저장한다. 시작은 단계를 producer 로 옮기므로,
      //   함께 누른 두 시작 중 늦게 끝난 쪽은 여기서 0행(wrong_stage)이 된다. 예전처럼 시작 단계 둘(entry · producer) 중 아무거나로 거르면
      //   늦은 쪽이 먼저 쪽 이야기를 덮었다 — 만화 대본은 옮길 때마다 조금씩 달라 화면과 산문 초안이 어긋났다(2026-11-11 결정 3 확인).
      .eq('current_stage', row.current_stage)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data?.length) return NextResponse.json({ error: 'wrong_stage' }, { status: 409 })

    return NextResponse.json({ ok: true, writerStart: plan.writerStart, title: plan.title ?? row.title ?? 'Untitled', draft: started })
  } catch (error) {
    return serverError('/start', error)
  }
}
