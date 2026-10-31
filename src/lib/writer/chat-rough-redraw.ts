// Storyboard 채팅 고치기 뒤 — 그림(러프)이 낡은 샷 고르기(2026-10-31 QA "채팅으로 고쳐도 그림이 안 바뀐다").
//   채팅 고치기는 글만 저장한다(그림 생성 없음 — 도구 계약). 러프는 스토리 · 샷 타입 · 등장인물로 그리므로, 이 칸을 고친 샷 중
//   러프가 다 그려진 샷만 [러프 다시 그리기] 후보다. 대사 · 길이는 그림에 보이지 않는다. 약속: tests/writer/chat-rough-redraw.test.ts
import type { ToolOutcome } from '@/lib/chat-tools/protocol'

export const ROUGH_VISIBLE_SHOT_FIELDS = ['actionDescription', 'shotType', 'characters'] as const

export function shotsToRedrawAfterChat(
  outcomes: ReadonlyArray<Pick<ToolOutcome, 'call' | 'result'>>,
  shots: ReadonlyArray<{ shotId: string; roughStoryboard?: { status?: string } | null }>,
): string[] {
  const picked: string[] = []
  for (const { call, result } of outcomes) {
    if (call.name !== 'edit_project' || result.status !== 'ok') continue
    const input = call.input as { resource?: unknown; id?: unknown; patch?: unknown }
    if (input.resource !== 'shots' || typeof input.id !== 'string' || !input.patch || typeof input.patch !== 'object') continue
    if (!ROUGH_VISIBLE_SHOT_FIELDS.some((field) => field in (input.patch as Record<string, unknown>))) continue
    const shot = shots.find((item) => item.shotId === input.id)
    if (shot?.roughStoryboard?.status !== 'completed' || picked.includes(shot.shotId)) continue
    picked.push(shot.shotId)
  }
  return picked
}
