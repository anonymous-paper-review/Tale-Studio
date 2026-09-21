// Paddle 발신 IP 허용목록 (#payments-phase-3). 약속: tests/billing/webhook-ip-allowlist.test.ts.
//
//   Paddle 라이브 온보딩이 요구하는 것: api.paddle.com/ips 에서 현재 목록을 받아 허용하고 나머지는 거절한다.
//   **하드코딩 금지** — 그 엔드포인트가 진실원이고 주소는 바뀔 수 있다. 그래서 받아서 1시간 캐시한다.
//
//   서명 검증이 이미 위조를 막는다. IP 는 그 앞단이라, 못 받아왔거나 주소를 못 읽으면 **막지 않는다** —
//   여기서 닫아버리면 Paddle 이 목록 주소를 바꿨을 때 진짜 결제 알림을 통째로 잃는다(서명이 최후 방어다).

const CACHE_MS = 60 * 60 * 1000
let cache: { ips: string[]; at: number } | null = null

/** x-forwarded-for 는 "클라이언트, 프록시1, …" 로 쌓인다. 맨 앞이 진짜 발신자다(Vercel 이 그렇게 넣는다). */
export function clientIpFrom(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || null
}

/** 목록이 비었거나 주소를 모르면 통과시킨다(서명 검증에 맡긴다). */
export function isPaddleIp(ip: string | null, cidrs: readonly string[]): boolean {
  if (!ip || cidrs.length === 0) return true
  // Paddle 이 주는 것은 전부 /32(단일 주소)라 문자열 비교로 충분하다.
  return cidrs.some((c) => c.replace('/32', '') === ip)
}

export async function fetchPaddleIps(): Promise<string[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.ips
  try {
    const res = await fetch('https://api.paddle.com/ips', { signal: AbortSignal.timeout(3000) })
    const body = (await res.json()) as { data?: { ipv4_cidrs?: string[] } }
    const ips = body.data?.ipv4_cidrs ?? []
    if (ips.length > 0) cache = { ips, at: Date.now() }
    return ips
  } catch {
    // 못 받아오면 빈 목록 = 막지 않음. 서명 검증이 받는다.
    return cache?.ips ?? []
  }
}
