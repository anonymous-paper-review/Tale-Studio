// 생성이 내용 규칙으로 막히면 화면은 규칙 안내와 정책 링크를 주고, 검사 장애는 잠시 후 다시 시도라고 말한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 생성 진입점이 7곳이라 안내는 공용 헬퍼 하나에 모은다(#quota-toast 의 이유와 같다).
//   막힘은 "설명을 고쳐 다시"(다시 눌러도 같은 답), 장애는 "잠시 후 다시"(나중엔 통한다) — 두 문장이 섞이면
//   사용자가 할 일을 알 수 없다. 완화(safe) 재시도는 fal 입력 필터 거절에만 쓰는 버튼이라 여기서는 권하지 않는다.
const mocks = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast: mocks }))

import {
  isContentPolicyBlocked,
  isModerationUnavailable,
  notifyIfQuotaExceeded,
} from '@/lib/generation-quota-toast'
import { KO } from '@/lib/i18n/messages-ko'
import { useLocaleStore } from '@/stores/locale-store'

const BLOCKED_EN =
  'This request breaks the content rules, so nothing was generated. Edit the description and try again.'
const UNAVAILABLE_EN =
  'The content check is unavailable right now, so nothing was generated. Please try again in a moment.'

beforeEach(() => {
  vi.clearAllMocks()
  useLocaleStore.setState({ locale: 'en' })
})

describe('내용 규칙 차단 안내', () => {
  // 왜: 400 은 다른 이유로도 온다 — code 를 봐야 "내용 규칙" 안내를 엉뚱한 실패에 붙이지 않는다.
  it('내용 규칙 코드가 붙은 400 만 차단으로 읽는다', () => {
    expect(isContentPolicyBlocked(400, { code: 'content_policy_blocked' })).toBe(true)
    expect(isContentPolicyBlocked(400, { error: 'Project ID is required' })).toBe(false)
    expect(isContentPolicyBlocked(503, { code: 'content_policy_blocked' })).toBe(false)
  })

  // 왜: 어느 생성 입구에서 막혀도 같은 한 문장을 보여야 같은 상태가 7가지로 보이지 않는다.
  it('막힌 응답을 받으면 내용 규칙 안내와 정책 보기를 띄운다', () => {
    const handled = notifyIfQuotaExceeded(400, { code: 'content_policy_blocked', policyUrl: '/acceptable-use' })

    expect(handled).toBe(true)
    expect(mocks.error).toHaveBeenCalledTimes(1)
    expect(mocks.error.mock.calls[0][0]).toBe(BLOCKED_EN)
    expect(mocks.error.mock.calls[0][1]).toMatchObject({ action: { label: 'Content rules' } })
  })

  // 왜: 무엇이 금지인지는 콘텐츠 이용정책에 적혀 있다 — 토스트에 다 옮기지 않고 그 페이지로 보낸다.
  it('안내의 정책 보기는 콘텐츠 이용정책 페이지를 연다', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open } as unknown as Window)

    notifyIfQuotaExceeded(400, { code: 'content_policy_blocked', policyUrl: '/acceptable-use' })
    ;(mocks.error.mock.calls[0][1] as { action: { onClick: () => void } }).action.onClick()

    expect(open).toHaveBeenCalledWith('/acceptable-use', '_blank')
    vi.unstubAllGlobals()
  })

  // 왜: 한국어 화면에 영어가 섞이면 안내가 깨진 것처럼 보인다(i18n 사전 누락 게이트와 같은 이유).
  it('한국어 화면에서는 두 안내가 모두 한국어로 나온다', () => {
    expect(KO[BLOCKED_EN]).toBe('내용 규칙에 어긋나는 요청이어서 아무것도 만들지 않았어요. 설명을 고쳐 다시 시도해 주세요.')
    expect(KO[UNAVAILABLE_EN]).toBe('지금은 내용 검사를 할 수 없어서 아무것도 만들지 않았어요. 잠시 후 다시 시도해 주세요.')
    expect(KO['Content rules']).toBe('내용 규칙')
  })

  // 왜: 완화 재시도 버튼은 fal 입력 필터 거절 전용이다 — 내용 규칙 차단에 그 버튼을 권하면
  //   "문구만 부드럽게 하면 통과한다"는 잘못된 기대를 만든다(차단은 작업 행도 남기지 않아 버튼 조건이 애초에 안 켜진다).
  it('막힘 안내는 완화 재시도를 권하지 않는다', () => {
    notifyIfQuotaExceeded(400, { code: 'content_policy_blocked' })

    const shown = `${mocks.error.mock.calls[0][0]} ${JSON.stringify(mocks.error.mock.calls[0][1])}`
    expect(shown).not.toMatch(/softer prompt|safe|bypass/i)
    expect(KO['Retry with a softer prompt']).toBe('문구를 완화해 다시 만들기')
    expect(KO['Redo with bypass (safe)']).toBeUndefined()
  })
})

describe('검사 장애 안내', () => {
  // 왜: 장애는 사용자 잘못이 아니다 — 설명을 고치라고 하면 고쳐도 계속 막힌다.
  it('검사 장애 응답을 받으면 잠시 후 다시 시도 안내를 띄운다', () => {
    expect(isModerationUnavailable(503, { code: 'moderation_unavailable' })).toBe(true)

    const handled = notifyIfQuotaExceeded(503, { code: 'moderation_unavailable' })

    expect(handled).toBe(true)
    expect(mocks.error.mock.calls[0][0]).toBe(UNAVAILABLE_EN)
    expect(mocks.error.mock.calls[0][1]).not.toHaveProperty('action')
  })

  // 왜: 한도·잔액 안내는 그대로 살아 있어야 한다 — 코드 추가가 기존 분기를 가리면 안 된다.
  it('자리 부족과 잔액 부족 안내는 그대로 동작한다', () => {
    expect(notifyIfQuotaExceeded(429, { code: 'quota_exceeded', scope: 'global' })).toBe(true)
    expect(notifyIfQuotaExceeded(402, { error: 'insufficient_takes', required: 3, balance: 0 })).toBe(true)
    expect(notifyIfQuotaExceeded(500, { error: 'boom' })).toBe(false)
  })
})
