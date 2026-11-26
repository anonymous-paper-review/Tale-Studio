// 샷을 더한 뒤 서버에 빈 칸 채우기를 부탁한다(오너 2026-11-27 N2) — 화면(writer-store addShot)이 저장 끝에 부른다.
//   채우기는 덤이다: 실패 · 끊김은 조용히 넘긴다(지금처럼 빈 칸으로 그린다 — 러프 길이 그리기 직전에 같은 계산을 다시 한다).
//   돌려주는 값 = 카드 칩(앵글 · 색온도). 채운 것이 없으면 null, 서버가 답하지 못했으면 undefined. 약속: tests/writer/added-shot-fill-request.test.ts
import type { ShotStageDesign } from '@/types'

export async function requestAddedShotFill(projectId: string, shotId: string): Promise<ShotStageDesign | null | undefined> {
  try {
    const res = await fetch('/api/writer/added-shot-fill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, shotId }),
    })
    if (!res.ok) return undefined
    const body = (await res.json()) as { ok?: boolean; stageDesign?: ShotStageDesign | null }
    return body?.ok ? (body.stageDesign ?? null) : undefined
  } catch {
    return undefined
  }
}
