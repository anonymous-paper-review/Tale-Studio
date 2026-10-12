// 모델 글 한도에 맞추기(2026-10-12 오너 "고친다") — Grok Imagine 은 글을 8,000자까지만 받는데, 실사 그림체 인물 시트 요청은
//   그림체 조각까지 9,000자가 넘어 통째로 거절됐다. 넘치면 가장 긴 인물 규칙 줄을 뒤 문장부터 줄인다 — 그 첫 문장(어떤 인물인가),
//   표정 우선 문장(조각에 원래 있던 것 포함), 끝에 붙는 제품 문장(아이 · 노인은 제 비례, 표정 우선)은 남기고, 다른 줄(역할 문장 ·
//   그림체 핵심 · 본문 · 피할 것)은 그대로 둔다. 제품이 붙이는 인물 규칙 줄은 본문 뒤라 같은 머리의 줄이 여럿이면 마지막 줄이다.
//   인물 규칙이 없거나 줄여도 넘치면 마지막 수단으로 낱말 경계에서 자른다. 한도 안이면 한 글자도 바꾸지 않는다.
import {
  EXPRESSION_PRIORITY_RE,
  FACET_ADULT_PROPORTIONS,
  FACET_EXPRESSION_PRIORITY,
  FIGURE_RULES_PREFIX,
} from '@/lib/style-facets/figure-line'

const SENTENCE_BREAK = /(?<=[.!?])\s+/

export function fitPromptToLimit(prompt: string, max: number): string {
  if (prompt.length <= max) return prompt
  const lines = prompt.split('\n')
  const at = lines.findLastIndex((line) => line.startsWith(FIGURE_RULES_PREFIX))
  if (at >= 0) {
    let head = lines[at].slice(FIGURE_RULES_PREFIX.length)
    let tail = ''
    for (const fixed of [FACET_EXPRESSION_PRIORITY, FACET_ADULT_PROPORTIONS]) {
      if (head.endsWith(` ${fixed}`)) {
        tail = ` ${fixed}${tail}`
        head = head.slice(0, -(fixed.length + 1))
      }
    }
    const sentences = head.split(SENTENCE_BREAK).filter(Boolean)
    const keep = sentences.map((sentence, i) => i === 0 || EXPRESSION_PRIORITY_RE.test(sentence))
    const assemble = () =>
      [...lines.slice(0, at), `${FIGURE_RULES_PREFIX}${sentences.filter((_, i) => keep[i]).join(' ')}${tail}`, ...lines.slice(at + 1)].join('\n')
    // 지킬 문장 말고는 모두 남긴 상태에서 시작해 뒤에서부터 하나씩 뺀다.
    const dropOrder = sentences.map((_, i) => i).filter((i) => !keep[i]).reverse()
    for (const i of dropOrder) keep[i] = true
    for (const i of dropOrder) {
      keep[i] = false
      const next = assemble()
      if (next.length <= max) return next
    }
    lines.splice(0, lines.length, ...assemble().split('\n'))
  }
  const joined = lines.join('\n')
  if (joined.length <= max) return joined
  const cut = joined.slice(0, max)
  // 자르는 자리가 낱말 사이면 그 낱말까지 남는다. 낱말 중간이면 그 낱말을 뺀다 — 뺄 경계가 없으면(공백 없는 긴 글) 그냥 자른다.
  if (/\s/.test(joined[max])) return cut.trimEnd()
  const atBoundary = cut.replace(/\s+\S*$/, '')
  return atBoundary.trim() ? atBoundary : cut
}
