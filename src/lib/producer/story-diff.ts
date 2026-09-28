// 산문 변경 검토(그룹1 P4) — 확정된 산문을 채팅이 바꾸면 보드가 "어느 문단이 바뀌었나"를 보여준다.
//   문단 단위로만 견준다: 글자 단위 비교는 산문에서 읽을 수 없는 얼룩이 되고, 글 전체를 노랗게
//   칠하면 무엇이 바뀌었는지 사라진다. 여기는 순수 함수만 둔다.

export type StoryParagraphDiffKind = 'same' | 'added' | 'removed'

export interface StoryParagraphDiff {
  kind: StoryParagraphDiffKind
  text: string
}

/** 승인 카드에 실리는 산문 검토 자료 — 되돌리기는 prev 를 그대로 두는 것으로 끝난다. */
export interface StoryReview {
  prev: string
  next: string
}

/** 빈 줄로 문단을 나눈다. 앞뒤 공백은 비교에서 제외한다(들여쓰기 차이는 변경이 아니다). */
function splitParagraphs(text: string): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

/**
 * 두 산문을 문단 단위로 견준다. 같은 문단은 same, 새 글에만 있으면 added,
 * 옛 글에만 있으면 removed 를 그 자리 **뒤에** 둔다 — 보드에서 "무엇으로 바뀌었나"가 위에 온다.
 */
export function diffStoryParagraphs(prev: string, next: string): StoryParagraphDiff[] {
  const before = splitParagraphs(prev)
  const after = splitParagraphs(next)
  const n = before.length
  const m = after.length

  // 가장 긴 공통 문단열 길이표 — 산문의 문단 수는 수십 단위라 단순 표로 충분하다.
  const common: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i][j] =
        before[i] === after[j]
          ? common[i + 1][j + 1] + 1
          : Math.max(common[i + 1][j], common[i][j + 1])
    }
  }

  const parts: StoryParagraphDiff[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      parts.push({ kind: 'same', text: before[i] })
      i += 1
      j += 1
    } else if (common[i][j + 1] >= common[i + 1][j]) {
      parts.push({ kind: 'added', text: after[j] })
      j += 1
    } else {
      parts.push({ kind: 'removed', text: before[i] })
      i += 1
    }
  }
  while (j < m) parts.push({ kind: 'added', text: after[j++] })
  while (i < n) parts.push({ kind: 'removed', text: before[i++] })
  return parts
}

/** 승인 카드 payload 에서 산문 검토 자료를 읽는다. 형태가 안 맞으면 null(일반 제안 카드). */
export function readStoryReview(payload: unknown): StoryReview | null {
  if (!payload || typeof payload !== 'object') return null
  const review = (payload as { storyReview?: unknown }).storyReview
  if (!review || typeof review !== 'object') return null
  const { prev, next } = review as { prev?: unknown; next?: unknown }
  if (typeof prev !== 'string' || typeof next !== 'string') return null
  return { prev, next }
}
