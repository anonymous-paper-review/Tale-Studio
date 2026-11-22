// 가운데 장(연출 화살표)을 저장한 뒤 끝 장도 다시 그릴지 묻기(D10 · 2026-11-22 리드 Q2 "저장할 때마다 묻기").
//   약속 I(2026-09-04 "러프 세 장은 서로 저절로 안 바뀐다")는 그대로다 — 묻고, [다시 그리기]를 골라야만 끝 장을 다시 그린다.
//   요청은 [이 장만 다시 만들기](끝)와 같다 — 끝 장을 그리는 방식은 서버 한 곳(directing-edit.ts END_FRAME_METHOD)이 정한다.
//   화면 쪽(물음 창 · 알림)은 features/writer/unsaved-arrows-confirm.tsx. 약속: tests/writer/end-frame-ask.test.ts
export type EndAskChoice = 'redraw' | 'keep'
export type RoughFrameName = 'start' | 'direction' | 'end'

/** 저장한 뒤 물을지 — 저장 전에 그린 것(펜 · 지우개 · 전부 지우기 · 원본 복원)이 있었을 때만 묻는다. */
export function endAskAfterSave(hadStrokes: boolean): 'ask' | 'skip' {
  return hadStrokes ? 'ask' : 'skip'
}

/** 러프 한 장 다시 그리기 요청 본문 — [이 장만 다시 만들기](rough-frames-still.tsx)가 보내는 것과 같은 모양. */
export function roughFrameRedrawBody(projectId: string, shotId: string, frame: RoughFrameName) {
  return { action: 'regenerate-frame' as const, projectId, shotId, frame }
}
export type RoughFrameRedrawBody = ReturnType<typeof roughFrameRedrawBody>

/** 물음에서 고른 것 — [다시 그리기]만 끝 장을 다시 그린다. 그리기는 기다리지 않는다(창은 바로 닫혀도 된다). 그리기를 시작했으면 true. */
export function resolveEndAsk(choice: EndAskChoice, redraw: () => void): boolean {
  if (choice !== 'redraw') return false
  redraw()
  return true
}

export interface EndRedrawDeps {
  post: (body: RoughFrameRedrawBody) => Promise<{ ok: boolean; error?: string | null }>
  /** 다시 그린 뒤 샷 목록을 새로 읽는다 — 안 읽으면 카드 · 팝업에 옛 끝 장이 남는다(rough-frame-refresh.ts). */
  reload: () => Promise<void>
  notify: {
    info: (message: string) => void
    success: (message: string) => void
    /** 실패 알림 — retry 는 같은 끝 장 다시 그리기를 한 번 더 한다. detail 은 서버가 준 까닭(없으면 null). */
    error: (message: string, retry: () => void, detail: string | null) => void
  }
  messages: { drawing: string; done: string; failed: string }
}

/** 끝 장 한 장만 다시 그린다 — 실패하면 서버가 끝 장을 바꾸지 않았으니 그대로라고 알리고 [다시 시도]를 단다. 그렸으면 true. */
export async function redrawEndFrame(projectId: string, shotId: string, deps: EndRedrawDeps): Promise<boolean> {
  deps.notify.info(deps.messages.drawing)
  let result: { ok: boolean; error?: string | null }
  try {
    result = await deps.post(roughFrameRedrawBody(projectId, shotId, 'end'))
  } catch {
    result = { ok: false, error: null }
  }
  if (!result.ok) {
    deps.notify.error(deps.messages.failed, () => void redrawEndFrame(projectId, shotId, deps), result.error ?? null)
    return false
  }
  await deps.reload()
  deps.notify.success(deps.messages.done)
  return true
}
