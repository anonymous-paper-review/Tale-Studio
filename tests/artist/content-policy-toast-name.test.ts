// 내용 검사에 걸린 그림의 안내 토스트는 이름을 알고 있으면 어느 그림이 걸렸는지 말한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 왜(2026-11-25 오너): Creem 검사 거절에는 작업 행이 없어 카드에 배지가 남지 않는다. 안내가 "내용 검사에
//   걸렸어요" 한 문장이면, 인물 열 명을 한 번에 그리다 둘이 걸린 학생은 어느 둘인지 알 수 없다.
//   서버가 이름을 실어 주면 안내가 그 이름을 말하고, 걸린 그림마다 안내가 따로 보인다.
const mocks = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast: mocks }))

import { notifyContentPolicyBlocked, notifyIfQuotaExceeded } from '@/lib/generation-quota-toast'
import { useLocaleStore } from '@/stores/locale-store'

const BLOCKED_EN =
  'This request breaks the content rules, so nothing was generated. Edit the description and try again.'

beforeEach(() => {
  vi.clearAllMocks()
  useLocaleStore.setState({ locale: 'en' })
})

describe('내용 검사 거절 안내의 대상 이름', () => {
  // 왜: 이름이 있으면 학생이 고쳐야 할 칸(그 인물의 설명)을 바로 찾는다.
  it('거절 응답에 이름이 있으면 토스트에 그 이름이 보인다', () => {
    const handled = notifyIfQuotaExceeded(400, {
      code: 'content_policy_blocked',
      policyUrl: '/acceptable-use',
      target: { kind: 'character', name: '카이' },
    })

    expect(handled).toBe(true)
    expect(mocks.error).toHaveBeenCalledTimes(1)
    expect(mocks.error.mock.calls[0][0]).toBe(
      'The description for "카이" did not pass the content check, so it was not drawn. Edit the description and try again.',
    )
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ action: { label: 'Content rules' } })
  })

  // 왜: 이름을 모르는 경로(일반 이미지·러프 편집)도 그대로 안내돼야 한다 — 이름 추가가 기존 안내를 지우면 안 된다.
  it('이름이 없으면 예전 문구 그대로다', () => {
    notifyIfQuotaExceeded(400, { code: 'content_policy_blocked', policyUrl: '/acceptable-use' })

    expect(mocks.error.mock.calls[0][0]).toBe(BLOCKED_EN)
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ id: 'generation-content-policy' })
  })

  // 왜: 토스트 id 가 같으면 나중 안내가 앞 안내를 덮어 둘이 걸렸는데 하나만 보인다(이어 그리기에서 흔하다).
  it('인물 둘이 거절되면 토스트가 둘 다 보인다', () => {
    notifyContentPolicyBlocked({ code: 'content_policy_blocked', target: { kind: 'character', name: '카이' } })
    notifyContentPolicyBlocked({ code: 'content_policy_blocked', target: { kind: 'character', name: '옥화' } })

    expect(mocks.error).toHaveBeenCalledTimes(2)
    const ids = mocks.error.mock.calls.map((call) => (call[1] as { id: string }).id)
    expect(new Set(ids).size).toBe(2)
    expect(mocks.error.mock.calls[0][0]).toContain('카이')
    expect(mocks.error.mock.calls[1][0]).toContain('옥화')
  })
})
