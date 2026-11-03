// Writer 산문 문단 붙이기 규칙(v3 W1, 오너 2026-11-03 결정 7). 문단을 누르면 그 문단이 채팅 입력칸 위에 붙고,
//   붙은 채로 보낸 말은 그 문단만 고쳐 달라는 수정 요청이 된다. 한 번에 한 문단, 직접 고칠 수 있을 때만 붙는다.
//   약속: tests/writer/prose-paragraph.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'

/** 채팅에 붙인 문단 — 화면 순서(S1 = 0)와 누를 때의 글. */
export interface ParagraphPick {
  projectId: string
  index: number
  text: string
}

/** 화면의 문단 번호(S1 · S2 …). */
export function paragraphLabel(index: number): string {
  return `S${index + 1}`
}

const EXCERPT_CHARS = 30

/** 요청 · 칩에 싣는 문단 앞부분 — 글자 30개까지, 넘치면 말줄임. */
export function paragraphExcerpt(text: string): string {
  const chars = Array.from(text.trim())
  if (chars.length <= EXCERPT_CHARS) return chars.join('')
  return `${chars.slice(0, EXCERPT_CHARS).join('').trimEnd()}…`
}

/** 문단을 눌렀을 때 붙어 있을 문단. 붙일 수 없으면 그대로 두고, 같은 문단이면 떨어지고, 다른 문단이면 그 문단으로 바뀐다. */
export function nextParagraphPick(current: ParagraphPick | null, clicked: ParagraphPick, pickable: boolean): ParagraphPick | null {
  if (!pickable) return current
  if (current && current.projectId === clicked.projectId && current.index === clicked.index) return null
  return clicked
}

/** 문단을 누른 것이 붙이기인가 — 글을 끌어 골랐으면(고른 글이 있으면) 붙이지 않는다(검토 A L2). */
export function paragraphClickPicks(selectedText: string): boolean {
  return selectedText.trim().length === 0
}

/** 이 문단 안에서 고른 글 — 고른 글이 다른 곳(다른 문단 · 채팅)에만 있으면 빈 글이다(검토 C: 다른 곳에 고른 글이 남아 문단을 못 붙였다). */
export function selectedTextWithin(
  container: { contains(node: Node | null): boolean },
  selection: { isCollapsed: boolean; anchorNode: Node | null; focusNode: Node | null; toString(): string } | null,
): string {
  if (!selection || selection.isCollapsed) return ''
  return container.contains(selection.anchorNode) || container.contains(selection.focusNode) ? selection.toString() : ''
}

/** 키보드로 문단을 누르는 키 — 단추와 같은 Enter · 스페이스. */
export function paragraphKeyPicks(key: string): boolean {
  return key === 'Enter' || key === ' '
}

/** 화면이 바뀐 뒤에도 붙어 있을 문단 — 붙일 수 없게 됐거나(확정 · AI 작업 · 직접 작성 창), 다른 프로젝트이거나, 그 문단 글이 바뀌었으면 뗀다. */
export function keptParagraphPick(
  current: ParagraphPick | null,
  now: { projectId: string | null; pickable: boolean; paragraphs: readonly string[] },
): ParagraphPick | null {
  if (!current) return null
  if (!now.pickable || current.projectId !== now.projectId) return null
  return now.paragraphs[current.index] === current.text ? current : null
}

/** 붙은 문단으로 보내는 수정 요청 — 문단 번호와 앞부분을 먼저 싣고 그 문단만 고치라고 한 뒤 보낸 말을 잇는다.
 *  사람이 보낸 말로 남으므로 화면 언어를 따른다(채팅의 첨부 기본 문장과 같다). */
export function paragraphRequest(pick: ParagraphPick, request: string, locale: AppLocale): string {
  const head = translate(locale, 'Please change only paragraph {label}. "{excerpt}"', { label: paragraphLabel(pick.index), excerpt: paragraphExcerpt(pick.text) })
  return `${head}\n${request.trim()}`
}
