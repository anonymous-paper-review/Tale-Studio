// 새 프로젝트 두 번째 화면(자료 · 아이디어)의 입력 판정(2026-10-02 오너 — tale-proto-v04 0.1.2).
//   둘 중 하나만 있어도 시작한다. 제목은 묻지 않는다 — 아이디어 첫 줄, 없으면 첫 파일 이름이 임시 제목이 된다.

const TITLE_MAX = 30

export function newProjectInputError(input: { idea: string; fileCount: number }): 'empty' | null {
  return input.idea.trim() || input.fileCount > 0 ? null : 'empty'
}

export function newProjectTitle(idea: string, fileNames: readonly string[], fallback = 'Untitled'): string {
  const line = idea.split(/\r?\n/).map((part) => part.trim()).find(Boolean) ?? ''
  if (line) {
    if (line.length <= TITLE_MAX) return line
    const head = line.slice(0, TITLE_MAX)
    const cut = head.lastIndexOf(' ')
    return `${(cut > TITLE_MAX / 3 ? head.slice(0, cut) : head).trim()}…`
  }
  const file = fileNames.find((name) => name.trim())
  if (file) return file.trim().replace(/\.[^.]+$/, '').slice(0, 120) || fallback
  return fallback
}
