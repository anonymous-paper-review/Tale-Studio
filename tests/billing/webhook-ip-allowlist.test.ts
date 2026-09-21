// Paddle 이 아닌 곳에서 온 웹훅은 서명 검증 전에 막는다 (#payments-phase-3).
//   Paddle 라이브 온보딩 프롬프트 5절: "fetch Paddle's current live IPs from https://api.paddle.com/ips
//   and allowlist them on my webhook server, and reject anything else. Don't hard-code the list —
//   the endpoint is the source of truth and can change."
//   서명 검증이 이미 위조를 막지만, IP 로 먼저 거르면 서명 검증 자체를 시도할 필요가 없다(비용·로그 노이즈).
import { describe, expect, it } from 'vitest'

import { isPaddleIp, clientIpFrom } from '@/lib/billing/paddle-ips'

const LIVE = ['34.232.58.13/32', '34.195.105.136/32', '34.237.3.244/32']

describe('Paddle IP 판정', () => {
  // 왜: 정상 경로 고정. 목록에 있는 주소는 통과해야 한다.
  it('목록에 있는 주소는 통과한다', () => {
    expect(isPaddleIp('34.232.58.13', LIVE)).toBe(true)
  })

  // 왜: 위조 웹훅의 대부분은 아무 데서나 온다. 서명 검증까지 안 가고 여기서 끝난다.
  it('목록에 없는 주소는 막는다', () => {
    expect(isPaddleIp('1.2.3.4', LIVE)).toBe(false)
  })

  // 왜: 목록을 못 받아왔을 때(Paddle 응답 실패) 전부 막으면 진짜 결제 알림까지 잃는다. 그때는 서명 검증에 맡긴다.
  it('목록이 비어 있으면 막지 않는다', () => {
    expect(isPaddleIp('1.2.3.4', [])).toBe(true)
  })

  // 왜: 주소를 못 읽으면(프록시 헤더 없음) 막지 않는다 — 로컬·테스트 환경에서 웹훅이 통째로 죽는다.
  it('주소를 모르면 막지 않는다', () => {
    expect(isPaddleIp(null, LIVE)).toBe(true)
  })

  // 왜: Vercel 은 x-forwarded-for 에 "클라이언트, 프록시1, 프록시2" 로 쌓는다. 맨 앞이 진짜 발신자다.
  it('x-forwarded-for 에서 맨 앞 주소를 읽는다', () => {
    const h = new Headers({ 'x-forwarded-for': '34.232.58.13, 10.0.0.1, 10.0.0.2' })
    expect(clientIpFrom(h)).toBe('34.232.58.13')
  })

  it('헤더가 없으면 주소를 모른다고 답한다', () => {
    expect(clientIpFrom(new Headers())).toBeNull()
  })
})
