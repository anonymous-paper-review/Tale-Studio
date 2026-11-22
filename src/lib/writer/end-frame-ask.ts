// 가운데 장(연출 화살표)을 저장한 뒤 끝 장도 다시 그릴지 묻기(D10 · 2026-11-22 리드 Q2 "저장할 때마다 묻기").
//   약속 I(2026-09-04 "러프 세 장은 서로 저절로 안 바뀐다")는 그대로다 — 묻고, [다시 그리기]를 골라야만 끝 장을 다시 그린다.
//   요청은 [이 장만 다시 만들기](끝)와 같다 — 끝 장을 그리는 방식은 서버 한 곳(directing-edit.ts END_FRAME_METHOD)이 정한다.
//   ②(오너 Q1 · Q3): 물음 창은 읽는 AI 가 읽은 한 줄을 화면 말로 보이고 고칠 수 있게 한다. 끝 장은 작업으로 그려(1분 넘게) 작업이 끝날 때까지 기다린다.
//   화면 쪽(물음 창 · 알림)은 features/writer/unsaved-arrows-confirm.tsx. 약속: tests/writer/end-frame-ask.test.ts
import type { AppLocale } from '@/lib/locale'
import type { DirectionRead } from '@/lib/writer/direction-read'

export type EndAskChoice = 'redraw' | 'keep'
export type RoughFrameName = 'start' | 'direction' | 'end'

/** 사람이 고친 줄 — 화면 말(lang)로 적은 글. 서버가 한국어면 영어로 옮겨 싣는다. */
export interface EditedEndLine {
  text: string
  lang: 'ko' | 'en'
}

/** 저장한 뒤 물을지 — 저장 전에 그린 것(펜 · 지우개 · 전부 지우기 · 원본 복원)이 있었을 때만 묻는다. */
export function endAskAfterSave(hadStrokes: boolean): 'ask' | 'skip' {
  return hadStrokes ? 'ask' : 'skip'
}

/** 러프 한 장 다시 그리기 요청 본문 — [이 장만 다시 만들기](rough-frames-still.tsx)가 보내는 것과 같은 모양. 고친 줄이 있으면 덧붙인다. */
export function roughFrameRedrawBody(projectId: string, shotId: string, frame: RoughFrameName, line?: EditedEndLine | null) {
  return { action: 'regenerate-frame' as const, projectId, shotId, frame, ...(line ? { line } : {}) }
}
export type RoughFrameRedrawBody = ReturnType<typeof roughFrameRedrawBody>

/** 물음에서 고른 것 — [다시 그리기]만 끝 장을 다시 그린다. 그리기는 기다리지 않는다(창은 바로 닫혀도 된다). 그리기를 시작했으면 true. */
export function resolveEndAsk(choice: EndAskChoice, redraw: () => void): boolean {
  if (choice !== 'redraw') return false
  redraw()
  return true
}

/** 물음 창에 보일 줄 — 화면 말로(한국어 화면 = 한국어 줄, 없으면 영어 줄). 못 읽었으면 빈 줄. */
export function askLineText(read: Pick<DirectionRead, 'en' | 'ko'> | null, locale: AppLocale): string {
  if (!read) return ''
  return locale === 'ko' ? (read.ko ?? read.en) : read.en
}

/** [다시 그리기]를 누를 수 있는지 — 읽는 동안이나 줄이 비었으면 못 그린다(줄 없이 그리면 ② 가 아니다). */
export function canRedrawEnd(state: { reading: boolean; text: string }): boolean {
  return !state.reading && state.text.trim().length > 0
}

/** 보낼 고친 줄 — 읽은 줄 그대로면 null(서버가 남은 읽은 줄을 쓴다), 고쳤거나 직접 적었으면 그 글과 화면 말. */
export function editedLinePayload(read: Pick<DirectionRead, 'en' | 'ko'> | null, text: string, locale: AppLocale): EditedEndLine | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (read && trimmed === askLineText(read, locale).trim()) return null
  return { text: trimmed, lang: locale === 'ko' ? 'ko' : 'en' }
}

export interface EndRedrawDeps {
  /** 끝 장 작업 내기 — 작업 번호를 받으면 ok. 못 그리는 까닭은 code(direction_unreadable · direction_translate_failed). */
  post: (body: RoughFrameRedrawBody) => Promise<{ ok: boolean; jobId?: string | null; error?: string | null; code?: string | null }>
  /** 작업이 끝날 때까지 기다린다(작업이 실패하면 던진다). */
  waitJob: (jobId: string) => Promise<unknown>
  /** 다시 그린 뒤 샷 목록을 새로 읽는다 — 안 읽으면 카드 · 팝업에 옛 끝 장이 남는다(rough-frame-refresh.ts). */
  reload: () => Promise<void>
  notify: {
    info: (message: string) => void
    success: (message: string) => void
    /** 실패 알림 — retry 는 같은 끝 장 다시 그리기를 한 번 더 한다. detail 은 서버가 준 까닭(없으면 null). */
    error: (message: string, retry: () => void, detail: string | null) => void
  }
  messages: { drawing: string; done: string; failed: string; unreadable: string; translateFailed: string }
}

/** 끝 장 한 장만 다시 그린다 — 작업을 내고 끝날 때까지 기다린다. 실패하면 끝 장은 그대로라고 알리고 [다시 시도]를 단다. 그렸으면 true. */
export async function redrawEndFrame(projectId: string, shotId: string, deps: EndRedrawDeps, line?: EditedEndLine | null): Promise<boolean> {
  const retry = () => void redrawEndFrame(projectId, shotId, deps, line)
  deps.notify.info(deps.messages.drawing)
  let result: Awaited<ReturnType<EndRedrawDeps['post']>>
  try {
    result = await deps.post(roughFrameRedrawBody(projectId, shotId, 'end', line))
  } catch {
    result = { ok: false, error: null }
  }
  if (!result.ok || !result.jobId) {
    const message =
      result.code === 'direction_unreadable' ? deps.messages.unreadable
        : result.code === 'direction_translate_failed' ? deps.messages.translateFailed
          : deps.messages.failed
    deps.notify.error(message, retry, result.error ?? null)
    return false
  }
  try {
    await deps.waitJob(result.jobId)
  } catch (err) {
    deps.notify.error(deps.messages.failed, retry, err instanceof Error ? err.message : null)
    return false
  }
  await deps.reload()
  deps.notify.success(deps.messages.done)
  return true
}
