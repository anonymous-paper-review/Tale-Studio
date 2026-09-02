// Next.js instrumentation — 서버 시작 시 1회 실행(nodejs 런타임) + 요청 오류 후크.
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

  // outbound fetch 병렬화(#fetch-pool 2026-08-09) — 기본 디스패처가 origin당 요청을 사실상
  //   직렬화하던 실측(동시 4콜이 8→17→26→34s 계단, undici Agent 교체로 8~9s 완전 병렬)의 픽스.
  //   씬 병렬(#scene-parallel)·이미지 제출 등 모든 외부 API 호출의 전제 조건. 64는 씬 동시
  //   4~8 + 웹훅/폴링 트래픽에 충분하고 리소스 부담 미미. Vercel 런타임에서도 동일 적용되는지
  //   배포 후 v2 재실측으로 검증할 것.
  try {
    const { Agent, setGlobalDispatcher } = await import('undici')
    setGlobalDispatcher(new Agent({ connections: 64 }))
  } catch (e) {
    console.warn('[instrumentation] fetch dispatcher tuning failed:', e)
  }

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

// 서버 500 무흔적 해소(#C, 2026-09-02 observability-audit) — Next.js onRequestError 훅.
//
// 왜 필요한가: 429(쿼터 거절) 관측은 quotaRejectionResponse 에서 잡히지만, 라우트 핸들러 밖에서
//   터지는 예외(미들웨어·서버 컴포넌트·프레임워크 레벨 오류)는 어떤 이벤트도 남기지 않고 500으로
//   끝난다 — 관문 이전(429 판정 전) 500도 이 사각지대에 들어간다. onRequestError 는 Next.js가
//   요청 처리 중 잡히지 않은 오류를 렌더링하기 직전에 부르는 유일한 전역 후크라, 여기 하나로
//   그 사각지대를 커버한다.
//
// 진단은 제품을 막지 않는다(#writer-observability 원칙과 동일) — insert 실패는 삼킨다.
// Edge 런타임은 DB 클라이언트가 없어 이 훅이 nodejs 런타임에서만 기록하도록 가드한다.

interface RequestErrorContext {
  routerKind: 'Pages Router' | 'App Router'
  routePath: string
  routeType: 'render' | 'route' | 'action' | 'proxy'
  renderSource?: string
  revalidateReason?: 'on-demand' | 'stale'
  runtime: 'nodejs' | 'edge'
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: RequestErrorContext,
): Promise<void> {
  // Edge 런타임엔 service-role Supabase 클라이언트가 없다(Node 전용 API 의존) — nodejs 런타임만 기록.
  if (context.runtime !== 'nodejs') return
  try {
    const { supabaseAdmin } = await import('@/lib/supabase/admin')
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack ?? null : null
    const { error } = await supabaseAdmin.from('server_errors').insert({
      path: request.path,
      method: request.method,
      message: message.slice(0, 500),
      stack: stack ? stack.slice(0, 1000) : null,
    })
    if (error) throw error
  } catch (persistErr) {
    // 진단 실패가 제품을 막으면 안 된다(best-effort) — 콘솔에만 남긴다.
    console.warn(
      '[instrumentation] server_errors persistence failed:',
      persistErr instanceof Error ? persistErr.message : String(persistErr),
    )
  }
}
