// POST /api/produce/entry/recommend — AI가 이야기 재료를 읽고 추천을 고른다 (리뉴얼 1차 2026-10-19, 프로토타입 E2).
//   이미지면 먼저 글자를 읽는다(그림 모델 한 번) — 글이 없으면 no_text(화면이 "다른 파일 올리기 / 파일 빼고 진행"을 고르게 한다).
//   그다음 모델 한 번으로 장르·분위기 · 길이 · 바꿈 정도 · 자료 종류 · 이유 두 줄 · 임시 제목을 받는다. 모델이 실패하면 규칙 추천.
//   추천과 읽은 글을 초안에 저장하고 고른 값을 추천으로 채운다(화면 비율은 이미 고른 값, 없으면 9:16 추천). 채팅 진행은 처음부터.
//   약속: tests/producer/entry-routes.test.ts
import { NextResponse } from 'next/server'
import { RECOMMENDED_RATIO, fileHasText, materialProblem } from '@/features/entry/options'
import { ENTRY_TEXT_MAX_BYTES, materialBasis, normalizeEntryDraft, type EntryDraft, type EntryFileMeta } from '@/lib/entry/draft'
import { resolveRecommendation } from '@/lib/entry/recommend'
import { ocrImageText, recommendWithLlm } from '@/lib/entry/recommend-llm'
import { parseAppLocale } from '@/lib/locale'
import { mediaPublicUrl } from '@/lib/storage/media'
import { clampTextBytes } from '@/lib/upload/limits'
import { authorizeEntry, loadEntryProject, saveEntryDraft, serverError } from '../entry-access'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { projectId?: unknown } | null
  const access = await authorizeEntry(req, body?.projectId, { write: true })
  if (!access.ok) return access.response
  const projectId = body!.projectId as string

  try {
    const row = await loadEntryProject(projectId, 'locale, current_stage, entry_draft')
    if (!row) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const draft = normalizeEntryDraft(row.entry_draft)
    if (draft.startedAt) return NextResponse.json({ error: 'already_started' }, { status: 409 })
    if (draft.file?.noText) return NextResponse.json({ error: 'no_text', draft }, { status: 422 })
    if (materialProblem(draft.idea, draft.file)) return NextResponse.json({ error: 'too_short' }, { status: 400 })

    // 이미지: 아직 글자를 안 읽었으면 읽는다(한 번 읽은 글은 파일의 글로 남겨 다시 읽지 않는다).
    let file: EntryFileMeta | null = draft.file
    if (file?.kind === 'image' && !fileHasText(file)) {
      const paths = file.slicePaths?.length ? file.slicePaths : file.storagePath ? [file.storagePath] : []
      let text = ''
      if (paths.length) {
        try {
          text = await ocrImageText(projectId, paths.map(mediaPublicUrl))
        } catch (error) {
          console.error('[produce/entry/recommend] ocr failed', error instanceof Error ? error.message : error)
          return NextResponse.json({ error: 'read_failed' }, { status: 502 })
        }
      }
      if (!text) {
        const marked: EntryDraft = { ...draft, file: { ...file, chars: 0, noText: true } }
        await saveEntryDraft(projectId, marked)
        return NextResponse.json({ error: 'no_text', draft: marked }, { status: 422 })
      }
      const clamped = clampTextBytes(text, ENTRY_TEXT_MAX_BYTES)
      file = { ...file, text: clamped.text, chars: Array.from(clamped.text).length, ...(clamped.truncated ? { truncated: true } : {}) }
    }

    const locale = parseAppLocale(row.locale) ?? 'en'
    const input = { idea: draft.idea, file, locale }
    let raw: unknown = null
    try {
      raw = await recommendWithLlm(projectId, input)
    } catch (error) {
      console.warn('[produce/entry/recommend] model failed, using rules', error instanceof Error ? error.message : error)
    }
    const core = resolveRecommendation(raw, input)
    const withFile: EntryDraft = { ...draft, file }
    const rec = { ...core, basis: materialBasis(withFile) }
    const next: EntryDraft = {
      ...withFile,
      rec,
      picks: { mood: rec.mood, runtime: rec.runtime, level: rec.level, ratio: draft.picks.ratio ?? RECOMMENDED_RATIO },
      chat: { answered: {}, pre: {} },
    }
    await saveEntryDraft(projectId, next)
    return NextResponse.json({ draft: next })
  } catch (error) {
    return serverError('/recommend', error)
  }
}
