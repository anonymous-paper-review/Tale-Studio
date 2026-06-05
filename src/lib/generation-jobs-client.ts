// 클라이언트용 generation_jobs polling 헬퍼 (webhook 비동기 전환).
//
// 생성 submit 라우트가 jobId를 반환하면, 인증된 /api/generation-jobs/[id]를 완료까지 polling한다.
// 라우트가 queued면 FAL을 직접 reconcile하므로 webhook이 없어도(로컬 터널 없음) 결과를 받는다.
// 여러 store가 공유 (store 간 import 금지 규칙 회피 — 공용 lib).

export async function pollGenerationJob(
  jobId: string,
  {
    intervalMs = 3000,
    timeoutMs = 300_000,
  }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<string> {
  const started = Date.now()
  while (true) {
    if (Date.now() - started > timeoutMs) throw new Error('생성 타임아웃 (5분)')
    const res = await fetch(`/api/generation-jobs/${encodeURIComponent(jobId)}`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
    }
    const { data } = (await res.json()) as {
      data: { status: string; resultUrl: string | null; error: string | null }
    }
    if (data.status === 'completed') {
      if (!data.resultUrl) throw new Error('완료됐지만 결과 URL이 없음')
      return data.resultUrl
    }
    if (data.status === 'failed') throw new Error(data.error ?? '생성 실패')
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
