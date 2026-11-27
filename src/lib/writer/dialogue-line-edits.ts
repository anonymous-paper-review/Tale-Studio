// 대사 줄 바로 고치기 한 벌 — 대사 탭(2026-11-02 오너 "탭 안에서 바로 고치기")과 Storyboard 샷 팝업 · Director 샷 상세(2026-11-27 오너 Q1 "추천대로")가 같이 쓴다.
//   고치는 줄은 하나, 저장 중 · 실패한 줄은 따로 센다(저장을 기다리지 않고 다음 줄을 고친다). 무엇을 저장할지는 dialogue-line-edit(commitLineEdit ·
//   revertLineEdit)가 정하고, 여기는 고치는 차례(시작 · 글 바꾸기 · 끝내기 · 취소 · 다시 저장 · 되돌리기)만 맡는다. 화면은 상태를 받아 그리기만 한다
//   (features/writer/use-dialogue-line-edits). 끝내기는 상태를 곧바로 비운다 — Enter 뒤 칸이 사라지며 오는 바깥 누르기가 같은 고침을 두 번 저장하지 않게.
//   약속: tests/writer/dialogue-line-edits.test.ts · dialogue-tab-flow.test.ts
import { commitLineEdit, revertLineEdit } from '@/lib/writer/dialogue-line-edit'
import type { DialogueLine } from '@/types'

export type LineKey = string
export const lineKey = (shotId: string, index: number): LineKey => `${shotId}#${index}`

export interface LineDraft {
  key: LineKey
  shotId: string
  index: number
  /** 고치기 시작할 때의 그 줄 — 그새 바뀌었는지 볼 때와 [되돌리기]에 쓴다. */
  original: DialogueLine
  /** 고치는 글 — 저장된 글 그대로에서 시작한다(샷 고치기 창의 대사 칸과 같다, 리뷰 R8). */
  draft: string
}
export interface LineSave extends LineDraft {
  status: 'saving' | 'failed'
  /** 저장하려던 글(한 줄로 다듬은 글). */
  saved: string
}
export interface LineEditsState {
  editing: LineDraft | null
  saves: Readonly<Record<LineKey, LineSave>>
}
export const NO_LINE_EDITS: LineEditsState = { editing: null, saves: {} }

export interface LineEditDeps {
  /** 지금 화면에 있는 그 샷의 대사 목록(없으면 null) — 끝낼 때 이것으로 고칠 목록을 만든다(그새 바뀐 줄을 덮어쓰지 않게). */
  lines: (shotId: string) => DialogueLine[] | null
  /** 그 샷의 대사 목록을 저장한다 — 실패하면 던진다. */
  save: (shotId: string, lines: DialogueLine[]) => Promise<void>
  /** 저장하지 않은 까닭을 사람에게 — empty(다 지움) · conflict(고치는 사이 그 줄이 바뀜). */
  notify: (reason: 'empty' | 'conflict') => void
}

export type DialogueLineView =
  | { kind: 'idle' }
  | { kind: 'editing'; draft: string }
  | { kind: 'saving'; draft: string }
  | { kind: 'failed'; draft: string }

/** 줄 하나의 모습 — 저장 중 · 실패한 줄도 보기처럼 display(인물 id → 이름 등)로 바꿔 보인다(저장값은 그대로). */
export function lineStateOf(state: LineEditsState, key: LineKey, display: (text: string) => string): DialogueLineView {
  if (state.editing?.key === key) return { kind: 'editing', draft: state.editing.draft }
  const entry = state.saves[key]
  if (entry) return { kind: entry.status, draft: display(entry.saved) }
  return { kind: 'idle' }
}

/** 줄을 다 지웠을 때 알림(키) — 화면마다 줄을 지우는 곳이 다르다(오너 Q1 — Storyboard 대사 탭의 틀린 안내 바로잡기).
 *  Writer 콘티의 연필은 줄을 지울 수 있는 샷 고치기 창을 연다. Storyboard 의 연필은 대사 글만 고치는 샷 팝업을 열고, Director 도 그 팝업과 같다 — 채팅이나 Writer 콘티. */
export function emptyLineNoticeKey(screen: 'conti' | 'storyboard' | 'director'): string {
  return screen === 'conti'
    ? 'Empty lines are not saved. To delete a line, open the shot editor with the pencil button.'
    : "Empty lines are not saved. To delete a line, use the chat or Writer's rough storyboard."
}

export type LineEdits = ReturnType<typeof createLineEdits>

/** deps 는 부를 때마다 읽는다(화면 말이 바뀌어도 새 알림 글을 쓰게). onChange 는 상태가 바뀔 때마다 새 상태로 부른다. */
export function createLineEdits(deps: () => LineEditDeps, onChange: (state: LineEditsState) => void) {
  let state: LineEditsState = NO_LINE_EDITS
  const set = (next: LineEditsState) => {
    state = next
    onChange(next)
  }
  const dropSave = (key: LineKey) => {
    if (!(key in state.saves)) return
    const saves = { ...state.saves }
    delete saves[key]
    set({ ...state, saves })
  }
  const runSave = (entry: LineSave, lines: DialogueLine[]) => {
    set({ ...state, saves: { ...state.saves, [entry.key]: { ...entry, status: 'saving' } } })
    deps().save(entry.shotId, lines).then(
      () => dropSave(entry.key),
      () => {
        const current = state.saves[entry.key]
        if (current) set({ ...state, saves: { ...state.saves, [entry.key]: { ...current, status: 'failed' } } })
      },
    )
  }
  return {
    get state() {
      return state
    },
    /** 그 줄을 고치기 시작한다 — 저장 중 · 실패한 줄은 먼저 끝내야 한다([다시 저장] · [되돌리기]). 시작했으면 true. */
    start(shotId: string, index: number, line: DialogueLine): boolean {
      const key = lineKey(shotId, index)
      if (state.saves[key]) return false
      set({ ...state, editing: { key, shotId, index, original: line, draft: line.text } })
      return true
    },
    setDraft(key: LineKey, draft: string) {
      if (state.editing?.key === key) set({ ...state, editing: { ...state.editing, draft } })
    },
    /** 끝내기(Enter · 바깥 누르기) — 고친 글로 그 샷 대사를 저장한다. 끝낸 줄(고치던 줄이 없으면 null). */
    commit(): LineKey | null {
      const current = state.editing
      if (!current) return null
      set({ ...state, editing: null })
      const result = commitLineEdit({ lines: deps().lines(current.shotId) ?? [], index: current.index, original: current.original, draft: current.draft })
      if (result.kind === 'empty' || result.kind === 'conflict') deps().notify(result.kind)
      else if (result.kind === 'save') runSave({ ...current, status: 'saving', saved: result.lines[current.index].text }, result.lines)
      return current.key
    },
    /** 취소(Esc) — 저장하지 않는다. 고치던 줄(없으면 null). */
    cancel(): LineKey | null {
      const current = state.editing
      if (!current) return null
      set({ ...state, editing: null })
      return current.key
    },
    /** [다시 저장] — 화면에 남은 고친 글로 그 샷 대사를 다시 저장한다. 그새 그 줄이 바뀌었으면 덮어쓰지 않고 알린다. */
    retry(key: LineKey) {
      const entry = state.saves[key]
      const lines = entry ? deps().lines(entry.shotId) : null
      if (!entry || entry.status !== 'failed' || !lines) return
      if (lines[entry.index]?.text !== entry.saved) {
        dropSave(key)
        deps().notify('conflict')
        return
      }
      runSave(entry, lines)
    },
    /** [되돌리기] — 저장하지 못한 고침을 버리고 고치기 전 글로 돌린다(화면 값도 같은 길로 다시 저장). */
    revert(key: LineKey) {
      const entry = state.saves[key]
      if (!entry) return
      dropSave(key)
      const reverted = revertLineEdit({ lines: deps().lines(entry.shotId) ?? [], index: entry.index, original: entry.original, saved: entry.saved })
      if (reverted) void deps().save(entry.shotId, reverted).catch(() => {})
    },
  }
}
