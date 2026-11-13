// 넘기기 고르기가 화면에서 멈춘 Take 를 빼도록 Take 줄에 멈춘 때를 붙인다(오너 2026-11-14 7번 · 리드 C) — Editor 로 넘기기 · 내보내기가 같이 쓴다.
//   멈춤은 그 Take 의 마지막 작업에 적혀 있다(director_job_cancellations — 읽기는 작업 공간 주인, video_clips 와 같은 범위).
//   읽지 못하면 그대로 돌려준다(종전 동작). 약속: tests/director/job-cancel-handoff.test.ts
type CancellationQuery = { select: (columns: string) => { in: (column: string, values: string[]) => PromiseLike<{ data: unknown; error: unknown }> } }

const lastJobOf = (clip: object): string => {
  const id = (clip as { last_attempt_job_id?: unknown }).last_attempt_job_id
  return typeof id === 'string' ? id : ''
}

export async function withCancelledTakes<T extends object>(
  // 브라우저 · 서버 Supabase 손잡이 무엇이든 — from(표).select(…).in(…) 만 쓴다.
  client: { from: (table: string) => unknown },
  clips: readonly T[],
): Promise<Array<T & { cancelled_at?: string }>> {
  const ids = [...new Set(clips.map(lastJobOf).filter(Boolean))]
  if (!ids.length) return [...clips]
  try {
    const query = client.from('director_job_cancellations') as CancellationQuery
    const { data, error } = await query.select('job_id, cancelled_at').in('job_id', ids)
    if (error || !Array.isArray(data)) return [...clips]
    const stoppedAt = new Map((data as Array<{ job_id: string; cancelled_at: string }>).map((row) => [row.job_id, row.cancelled_at]))
    return clips.map((clip) => {
      const at = stoppedAt.get(lastJobOf(clip))
      return at ? { ...clip, cancelled_at: at } : clip
    })
  } catch {
    return [...clips]
  }
}
