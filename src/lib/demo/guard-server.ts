// project-share-demo-mode — 서버측 데모 쓰기 가드(defense-in-depth 백스톱).
// 생성·쓰기 라우트 상단에서 호출: demo_share 쿠키 요청이면 403 으로 끊어 fal/Claude 예산·DB 오염 방지.
//   클라 seam 을 우회해 라우트에 직접 도달해도 여기서 막힌다.
//   적용(각 라우트 배선)은 통합 단계 — 헬퍼는 web Request/Response 라 NextRequest 에도 그대로 동작.

import { DEMO_SHARE_COOKIE } from './context'

export function hasDemoCookie(req: Request): boolean {
  const cookie = req.headers.get('cookie') ?? ''
  return cookie
    .split('; ')
    .some((c) => c.startsWith(`${DEMO_SHARE_COOKIE}=`))
}

/** 데모 요청이면 403 Response, 아니면 null(정상 진행). */
export function demoWriteBlock(req: Request): Response | null {
  if (!hasDemoCookie(req)) return null
  return new Response(JSON.stringify({ error: 'Demo mode is read-only' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}
