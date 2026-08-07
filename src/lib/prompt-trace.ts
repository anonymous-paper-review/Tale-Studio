// 프롬프트 트레이스 선택 로직(#debug-prompts 확장, 2026-08-07) — 순수 함수(테스트 대상).
//   generation_jobs.input_snapshot 에는 모델로 실제 전송된 최종 프롬프트가 남는다
//   (영상: full_prompt(모션 계약 포함) + prompt(소스), 이미지: prompt = 최종 그 자체).
//   최신순 잡 목록에서 샷에 해당하는 잡을 kind 별 최신 1건씩 고른다.

export const PROMPT_TRACE_KINDS = [
  'shot_video',
  'shot_storyboard',
  'storyboard_real_grid',
  'shot_rough_storyboard',
] as const
export type PromptTraceKind = (typeof PROMPT_TRACE_KINDS)[number]

export interface PromptTraceJobRow {
  kind: string
  status: string
  created_at: string | null
  input_snapshot: unknown
  target: unknown
}

export interface PromptTraceItem {
  kind: PromptTraceKind
  status: string
  createdAt: string | null
  /** 모델로 실제 전송된 최종 프롬프트 (영상=full_prompt, 이미지=prompt) */
  finalPrompt: string
  /** 영상만: 조립 전 소스 프롬프트(input_snapshot.prompt) */
  sourcePrompt?: string
  /** 영상만: 모션 계약 부분(prompt_parts.motionContract) — 최종본에 포함돼 있지만 따로도 노출 */
  motionContract?: string
}

function rec(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}

/** 이 잡이 해당 샷의 것인가 — target.writerShotId / target.writerShotIds[] / snapshot.shotIds[] 셋 중 하나. */
function jobMatchesShot(row: PromptTraceJobRow, shotId: string): boolean {
  const t = rec(row.target)
  if (t?.writerShotId === shotId) return true
  if (Array.isArray(t?.writerShotIds) && (t.writerShotIds as unknown[]).includes(shotId)) return true
  const s = rec(row.input_snapshot)
  if (Array.isArray(s?.shotIds) && (s.shotIds as unknown[]).includes(shotId)) return true
  return false
}

/** 최신순(created_at desc) rows 에서 kind 별 최신 1건씩 트레이스 아이템으로. */
export function selectPromptTrace(rows: PromptTraceJobRow[], shotId: string): PromptTraceItem[] {
  const out: PromptTraceItem[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (seen.has(row.kind)) continue
    if (!(PROMPT_TRACE_KINDS as readonly string[]).includes(row.kind)) continue
    if (!jobMatchesShot(row, shotId)) continue
    const snap = rec(row.input_snapshot)
    if (!snap) continue
    const finalPrompt =
      (typeof snap.full_prompt === 'string' && snap.full_prompt) ||
      (typeof snap.prompt === 'string' ? snap.prompt : '')
    if (!finalPrompt) continue
    seen.add(row.kind)
    const parts = rec(snap.prompt_parts)
    out.push({
      kind: row.kind as PromptTraceKind,
      status: row.status,
      createdAt: row.created_at,
      finalPrompt,
      ...(row.kind === 'shot_video' && typeof snap.prompt === 'string' && snap.full_prompt
        ? { sourcePrompt: snap.prompt }
        : {}),
      ...(typeof parts?.motionContract === 'string' && parts.motionContract
        ? { motionContract: parts.motionContract }
        : {}),
    })
  }
  return out
}
