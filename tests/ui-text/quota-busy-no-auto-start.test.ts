// 생성 자리가 없다는 안내는 자동으로 이어진다고 말하지 않고 다시 눌러 달라고 말한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('sonner', () => ({ toast: { info: mocks.info, error: vi.fn(), success: vi.fn() } }))

import { notifyQuotaExceeded } from '@/lib/generation-quota-toast'
import { KO } from '@/lib/i18n/messages-ko'
import { useLocaleStore } from '@/stores/locale-store'

beforeEach(() => mocks.info.mockClear())

function shownMessage(): string {
  const first = mocks.info.mock.calls[0]
  expect(first).toBeDefined()
  return String(first[0])
}

describe('생성 자리가 모두 찼을 때의 안내 문구', () => {
  // 왜: 전역 자리가 찬 사용자에게 자동 시작을 약속하면 기다리기만 하다가 아무 일도 일어나지 않는다(2026-09-11 오너 결정 — 자동 재시도 없음).
  it('영어 안내는 자동으로 시작된다고 말하지 않고 다시 시도하라고 말한다', () => {
    useLocaleStore.setState({ locale: 'en' })
    notifyQuotaExceeded({ code: 'quota_exceeded', scope: 'global', category: 'image' })
    const message = shownMessage()
    expect(message).not.toMatch(/automatic/i)
    expect(message).toMatch(/try again/i)
  })

  // 왜: 한국어 화면도 같은 약속을 지켜야 한다(정상 경로 고정).
  it('한국어 안내는 자동으로 이어진다고 말하지 않고 다시 시도하라고 말한다', () => {
    useLocaleStore.setState({ locale: 'ko' })
    notifyQuotaExceeded({ code: 'quota_exceeded', scope: 'global', category: 'image' })
    const message = shownMessage()
    expect(message).not.toMatch(/자동/)
    expect(message).toMatch(/다시/)
  })

  // 왜: 러프 전체 생성이 자리 부족에서 재시도하던 시절의 "자동으로 이어서 진행" 문구가 사전에 남아 있으면 다른 화면이 다시 쓸 수 있다.
  //     선행 이미지를 기다리는 안내("Waiting for {what}")는 자리 부족이 아니므로 이 약속의 대상이 아니다.
  it('자리가 없다는(서버가 바쁘다는) 안내 어디에도 자동으로 이어간다는 문구가 남아 있지 않다', () => {
    const slotBusy = ([en]: [string, string]) => /busy|slots? (are|is)/i.test(en)
    const promisesAuto = ([en, ko]: [string, string]) => /automatic/i.test(en) || /자동으로/.test(ko)
    const leftovers = Object.entries(KO).filter((entry) => slotBusy(entry) && promisesAuto(entry))
    expect(leftovers).toEqual([])
  })
})
