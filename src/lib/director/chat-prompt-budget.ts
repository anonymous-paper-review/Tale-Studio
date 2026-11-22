// 채팅(Lumi)에게 보내는 보드 요약에 샷 프롬프트를 얼마나 다 싣나(리드 2026-11-23 D③ — 오너 D2~D5 "채팅 · 단추로 고침").
//   고칠 샷의 프롬프트는 처음부터 끝까지 보고 고친다. 한 턴에 싣는 글자에는 상한이 있어(큰 프로젝트), 넘으면
//   이번 말에서 부른 샷 → 고른 샷 → 지금 보는 씬의 샷 → 나머지 보드 차례로 먼저 싣는다.
//   다 싣지 못한 프롬프트는 앞 60자와 "몇 자 중 앞 60자" 표시만 싣고, 그 턴에 그 샷의 프롬프트 고침은 [적용] 카드에 넣지 않는다.
//   잰 값(개발 DB 2026-11-23): 가장 긴 샷 프롬프트 894자 · 99% 475자, 가장 큰 프로젝트 164샷 42,288자(다 실으면 한 턴에 약 8천 토큰 더).
//   약속: tests/chat/full-prompt.test.ts

/** 한 샷의 프롬프트를 다 싣는 상한(글자). 넘으면 앞 60자만 싣고, 채팅으로는 고칠 수 없다고 말한다. */
export const CHAT_PROMPT_SHOT_CAP = 2000
/** 한 턴의 보드 요약에 다 싣는 샷 프롬프트 글자 합의 상한(영어 프롬프트 기준 약 4천 토큰). */
export const CHAT_PROMPT_TOTAL_CAP = 16000
/** 다 싣지 못한 프롬프트에 남기는 앞부분 글자 수(예전 요약과 같은 60자). */
export const CHAT_PROMPT_SNIPPET = 60

export interface PromptBudgetShot {
  /** 캔버스 노드 id. */
  id: string
  /** 지금 쓰이는 프롬프트(사람이 고친 글이 있으면 그 글). */
  prompt: string
  /** 그 샷의 씬 노드 id(씬 밖 샷은 null). */
  sceneNodeId: string | null
}

/** 이 턴에 프롬프트를 다 싣는 샷(노드 id). shots 는 보드 차례. 60자 이하는 자를 것이 없어 늘 다 싣는다. */
export function fullPromptShotIds(input: {
  shots: readonly PromptBudgetShot[]
  /** 이번 말에서 번호 · @멘션으로 부른 샷. */
  named: ReadonlySet<string>
  /** 고른 노드(Director 노드 보기). */
  selected: string | null
  /** 지금 보는 씬 노드. */
  currentScene: string | null
}): Set<string> {
  const full = new Set<string>()
  let used = 0
  const order = [
    ...input.shots.filter((shot) => input.named.has(shot.id)),
    ...input.shots.filter((shot) => shot.id === input.selected),
    ...input.shots.filter((shot) => input.currentScene !== null && shot.sceneNodeId === input.currentScene),
    ...input.shots,
  ]
  for (const shot of order) {
    if (full.has(shot.id)) continue
    if (shot.prompt.length <= CHAT_PROMPT_SNIPPET) {
      full.add(shot.id)
      continue
    }
    if (shot.prompt.length > CHAT_PROMPT_SHOT_CAP || used + shot.prompt.length > CHAT_PROMPT_TOTAL_CAP) continue
    used += shot.prompt.length
    full.add(shot.id)
  }
  return full
}

/** 보드 요약에 싣는 샷 프롬프트 — 다 싣거나, 앞 60자와 잘렸다는 표시(AI 가 전체로 알고 다시 쓰지 않게). */
export function promptForContext(prompt: string, full: boolean): string {
  if (full || prompt.length <= CHAT_PROMPT_SNIPPET) return prompt
  return `${prompt.slice(0, CHAT_PROMPT_SNIPPET)}… (prompt cut: first ${CHAT_PROMPT_SNIPPET} of ${prompt.length} characters)`
}

/** 이 턴에 다 싣지 못한 샷 — 노드 id → 프롬프트 글자 수. */
export function cutPromptShots(shots: readonly PromptBudgetShot[], full: ReadonlySet<string>): Map<string, number> {
  return new Map(shots.filter((shot) => !full.has(shot.id) && shot.prompt.length > CHAT_PROMPT_SNIPPET).map((shot) => [shot.id, shot.prompt.length]))
}

/** 일부만 본 프롬프트의 고침을 뺀다 — 뺀 샷은 한 샷 상한을 넘었는지와 함께 돌려준다(말할 까닭이 다르다). */
export function guardCutPromptEdits<E extends { kind: string; nodeId: string; field: string }>(
  edits: readonly E[],
  cut: ReadonlyMap<string, number>,
): { kept: E[]; dropped: Array<{ nodeId: string; tooLong: boolean }> } {
  const kept: E[] = []
  const dropped: Array<{ nodeId: string; tooLong: boolean }> = []
  for (const edit of edits) {
    const length = edit.kind === 'shot' && edit.field === 'prompt' ? cut.get(edit.nodeId) : undefined
    if (length === undefined) {
      kept.push(edit)
      continue
    }
    if (!dropped.some((entry) => entry.nodeId === edit.nodeId)) dropped.push({ nodeId: edit.nodeId, tooLong: length > CHAT_PROMPT_SHOT_CAP })
  }
  return { kept, dropped }
}

/** 뺀 까닭(영어 원문 = i18n 키). */
export const PROMPT_CUT_TEXT = {
  partial: "I only saw the start of {shot}'s prompt, so I left that change out. Mention the shot (@) and ask again.",
  tooLong: "{shot}'s prompt is too long to change in chat. Change it in the shot details.",
} as const
