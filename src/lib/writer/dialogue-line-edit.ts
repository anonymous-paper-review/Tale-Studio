// Storyboard 대사(Dialogue) 탭에서 대사 한 줄을 그 자리에서 고치는 규칙(2026-11-02 오너 "탭 안에서 바로 고치기").
//   어떤 키로 끝내는지 · 끝낼 때 저장할지 · 저장할 대사 목록은 여기서 정하고, 화면(dialogue-view)은 보이기만 한다.
//   저장 길은 샷 고치기 팝업과 같다(writer-store updateShot → flushShotSave). 러프는 대사를 읽지 않아 다시 그리지 않는다.
//   약속: tests/writer/dialogue-tab-edit.test.ts
import type { DialogueLine } from '@/types'

export type LineEditKey = 'save' | 'cancel' | null

/** 고치는 칸에서 누른 키 — Enter(Shift 와 함께여도 줄을 바꾸지 않는다) = 저장, Esc = 취소. 한글을 조합하는 중의 Enter 는 글자를 마치는 키라 저장하지 않는다. */
export function lineEditKey(event: { key: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number }): LineEditKey {
  // keyCode 229 = 조합 중인 키(조합 표시가 없는 브라우저도 이 값으로 알린다).
  if (event.isComposing || event.keyCode === 229) return null
  if (event.key === 'Enter') return 'save'
  if (event.key === 'Escape') return 'cancel'
  return null
}

/** 대사 글을 한 줄로 — 줄바꿈과 앞뒤 빈칸을 덜어 낸다. 대사 한 줄은 한 줄로 저장된다(팝업의 대사 칸도 한 줄). */
export function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').trim()
}

export type LineCommit =
  | { kind: 'unchanged' }
  /** 다 지웠다 — 저장하지 않고 원래 글로 둔다. 줄 지우기는 샷 고치기 창에서 한다. */
  | { kind: 'empty' }
  /** 고치는 동안 그 줄이 바뀌었다(채팅 고치기 · 다른 창) — 덮어쓰지 않는다. */
  | { kind: 'conflict' }
  | { kind: 'save'; lines: DialogueLine[] }

/** 끝낼 때 — 고친 글로 그 샷의 대사 목록을 만든다. 고치기 전 글과 같으면 그대로, 비면 저장하지 않는다.
 *  고치는 칸은 저장된 글 그대로에서 시작한다(샷 고치기 창의 대사 칸과 같다, 2026-11-02 리뷰 R8) — 화면에서 이름으로 바꿔 보인 것은 저장하지 않는다.
 *  고친 줄의 화자 · 감정 · 말투 · 길이는 그대로 둔다(글만 바꾼다). */
export function commitLineEdit(input: {
  lines: readonly DialogueLine[]
  index: number
  /** 고치기 시작할 때의 그 줄. */
  original: Pick<DialogueLine, 'characterId' | 'text'>
  draft: string
}): LineCommit {
  const text = oneLine(input.draft)
  if (!text) return { kind: 'empty' }
  if (text === oneLine(input.original.text)) return { kind: 'unchanged' }
  const current = input.lines[input.index]
  if (!current || current.text !== input.original.text || current.characterId !== input.original.characterId) return { kind: 'conflict' }
  return { kind: 'save', lines: input.lines.map((line, i) => (i === input.index ? { ...line, text } : line)) }
}

/** 저장하지 못한 고침의 [되돌리기] — 그 줄이 아직 고친 글이면 고치기 전 글로 돌린 목록, 그새 바뀌었으면 null(손대지 않는다). */
export function revertLineEdit(input: {
  lines: readonly DialogueLine[]
  index: number
  original: Pick<DialogueLine, 'text'>
  saved: string
}): DialogueLine[] | null {
  const current = input.lines[input.index]
  if (!current || current.text !== input.saved) return null
  return input.lines.map((line, i) => (i === input.index ? { ...line, text: input.original.text } : line))
}
