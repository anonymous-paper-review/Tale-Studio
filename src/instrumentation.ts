// Next.js instrumentation — 서버 시작 시 1회 실행(nodejs 런타임).
//
// writer 파이프라인 keepalive: writer 작업은 단계별 서버리스 step 자가-체이닝(/api/writer/step)으로
//   진행되는데, 한 step 이 비정상 종료(긴 단계 + maxDuration kill, 인스턴스 다운 등)하면 다음 step
//   트리거가 끊겨 정체된다. 기존엔 "작가 탭"이 열려 있을 때만 클라 watchdog 이 재발사했다.
//   이 keepalive 는 탭/브라우저를 닫아도(서버 프로세스가 살아있는 한) 정체된 run 을 서버측에서
//   주기적으로 재발사해 끝까지 완성시킨다.
//
//   안전: STALE_MS 를 step maxDuration(300s)보다 크게 잡아 "아직 살아있는 step" 을 동시 재발사하지
//   않는다(같은 단계 동시 재진입 → MAX_STAGE_ATTEMPTS 실패 회피). 클라 watchdog(180s)이 탭-열림
//   빠른 경로를 먼저 처리하고, keepalive 는 탭-닫힘 느린 안전망이다.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // 중복 인터벌 방지(dev HMR / 다중 등록).
  const g = globalThis as typeof globalThis & { __writerKeepalive?: ReturnType<typeof setInterval> }
  if (g.__writerKeepalive) return

  const INTERVAL_MS = 60_000
  const STALE_MS = 330_000 // > step maxDuration(300s): 이전 인스턴스가 확실히 끝난 뒤에만 재발사.
  const origin =
    process.env.WRITER_KEEPALIVE_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`

  g.__writerKeepalive = setInterval(() => {
    void (async () => {
      try {
        const { listStalledRunningProjects } = await import('@/lib/writer/run-store')
        const { triggerWriterStep } = await import('@/lib/writer/pipeline/steps')
        const stalled = await listStalledRunningProjects(STALE_MS)
        for (const projectId of stalled) {
          console.log(`[writer keepalive] 정체 run 재발사: ${projectId}`)
          await triggerWriterStep(origin, projectId)
        }
      } catch (e) {
        console.error('[writer keepalive] scan failed:', e instanceof Error ? e.message : e)
      }
    })()
  }, INTERVAL_MS)

  // 프로세스 종료를 막지 않도록(있으면).
  g.__writerKeepalive.unref?.()
  console.log('[writer keepalive] started — server-side stalled-run re-trigger')
}
