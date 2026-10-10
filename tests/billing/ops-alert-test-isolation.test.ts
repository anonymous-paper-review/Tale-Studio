// 테스트를 돌리는 컴퓨터에 운영 알림 주소가 있어도 테스트는 디스코드로 알림을 보내지 않는다.
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('테스트 중 운영 알림 차단', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 왜: 2026-09-28~10-11 셸에 DISCORD_ALERT_WEBHOOK_URL 이 남은 채 pnpm test·커밋 전 검사를 돌릴 때마다
  // '[tale · local] 즉시 재조회로 결제를 복구했다'가 실제 #webhook 채널에 찍혔다.
  it('셸에 운영 알림 주소가 있어도 테스트를 돌리면 디스코드로 보내지 않는다', async () => {
    expect(process.env.DISCORD_ALERT_WEBHOOK_URL).toBeUndefined()
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const { sendOpsAlert } = await import('@/lib/ops-alert')
    await sendOpsAlert({ title: 't', body: 'b', level: 'warn' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
