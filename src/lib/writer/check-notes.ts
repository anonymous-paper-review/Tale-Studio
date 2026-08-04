// shotCheck 채널1(#p2-wiring 2026-08-04) — shots.check_notes(jsonb)에서 생성 프롬프트에 첨부할
//   제약 문장을 안전하게 꺼낸다. DB 값은 신뢰 경계 밖(구 행/수동 조작 가능성) — 형태 검증 후만 통과.
//   소비처: 러프보드 셀(START 서술 꼬리), director 실사 스토리보드 프롬프트(서버 최종 방어선).

/** shots.check_notes(jsonb, unknown) → 명령형 EN 제약 문장 배열. 형태가 어긋나면 빈 배열. */
export function parseCheckConstraints(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const constraint = (item as { constraint?: unknown }).constraint
    if (typeof constraint === 'string' && constraint.trim()) out.push(constraint.trim())
  }
  return out
}

/** 프롬프트 꼬리에 제약 줄 첨부 — 제약이 없으면 원문 그대로. */
export function appendCheckConstraints(prompt: string, value: unknown): string {
  const constraints = parseCheckConstraints(value)
  if (!constraints.length) return prompt
  return `${prompt}\nContinuity constraints: ${constraints.join('; ')}`
}
