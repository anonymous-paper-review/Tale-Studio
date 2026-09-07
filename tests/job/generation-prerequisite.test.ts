// 필요한 자료가 준비되지 않으면 안내하고, 준비될 때까지 기다렸다가 자동으로 작업을 이어간다 (#ref-gate 2026-09-02, 오너 결정 1번)
import { describe, it, expect, vi, beforeEach } from 'vitest'

// #ref-gate(2026-09-02, 오너 결정 1번): 선행조건 409 → 안내 → DB 폴링 → 자동 재개의 순수 부분.
//   브라우저 전용 의존(toast·store·supabase 클라)은 모킹 — 판정과 대기 루프만 검증한다.
const mocks = vi.hoisted(() => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  notifyActionError: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: { getState: () => ({ locale: 'en' }) } }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: { getState: () => ({ notifyActionError: mocks.notifyActionError }) } }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => { throw new Error('not used in unit tests') } }))

import {
  isPrerequisiteMissing,
  prerequisiteLabel,
  prerequisiteSatisfied,
  notifyPrerequisiteWaiting,
  waitForPrerequisite,
  type PrerequisiteState,
} from '@/lib/generation-prerequisite-toast'

const SHEETS = { code: 'missing_character_sheets' as const, missing: [{ characterId: 'char_3', appearanceKey: 'current', name: '수인 수장' }] }
const ROUGH = { code: 'missing_rough_storyboard' as const, shotId: 'sh_01_24' }
const REAL = { code: 'missing_storyboard' as const, shotId: 'sh_01_27' }

beforeEach(() => {
  mocks.toast.info.mockReset()
  mocks.notifyActionError.mockReset()
})

describe('isPrerequisiteMissing', () => {
  it('선행 자료가 빠졌다는 충돌 응답이면 준비되지 않은 것으로 판단한다', () => {
    expect(isPrerequisiteMissing(409, SHEETS)).toBe(true)
    expect(isPrerequisiteMissing(409, ROUGH)).toBe(true)
    expect(isPrerequisiteMissing(409, REAL)).toBe(true)
    expect(isPrerequisiteMissing(409, { code: 'something_else' })).toBe(false)
    expect(isPrerequisiteMissing(200, SHEETS)).toBe(false)
    expect(isPrerequisiteMissing(409, null)).toBe(false)
  })
})

describe('prerequisiteLabel / notify', () => {
  it('무엇을 기다리는지 사람 말로 — 시트는 이름, 스토리보드는 샷', () => {
    expect(prerequisiteLabel(SHEETS)).toBe('character sheets for 수인 수장')
    expect(prerequisiteLabel(ROUGH)).toBe('the rough storyboard of sh_01_24')
    expect(prerequisiteLabel(REAL)).toBe('the live-action storyboard of sh_01_27')
  })

  it('대기 안내는 화면 알림과 채팅 둘 다에 남긴다', () => {
    notifyPrerequisiteWaiting('director', SHEETS)
    expect(mocks.toast.info).toHaveBeenCalledTimes(1)
    expect(String(mocks.toast.info.mock.calls[0][0])).toContain('character sheets for 수인 수장')
    expect(mocks.notifyActionError).toHaveBeenCalledWith('director', 'Generation', expect.stringContaining('resumes automatically'))
  })
})

describe('prerequisiteSatisfied', () => {
  it('시트: 빠졌던 모든 인물과 모습에 그림 주소가 생기면 준비된 것으로 본다', () => {
    expect(prerequisiteSatisfied(SHEETS, { sheets: [] })).toBe(false)
    expect(prerequisiteSatisfied(SHEETS, { sheets: [{ character_id: 'char_3', appearance_key: 'current', sheet_url: null }] })).toBe(false)
    expect(prerequisiteSatisfied(SHEETS, { sheets: [{ character_id: 'char_3', appearance_key: 'young', sheet_url: 'https://x/y.png' }] })).toBe(false) // 다른 모습
    expect(prerequisiteSatisfied(SHEETS, { sheets: [{ character_id: 'char_3', appearance_key: 'current', sheet_url: 'https://x/s.png' }] })).toBe(true)
  })

  it('러프: 시작·방향·끝 세 장면이 모두 있으면 준비된 것으로 본다', () => {
    expect(prerequisiteSatisfied(ROUGH, { shot: { rough_storyboard: null } })).toBe(false)
    expect(prerequisiteSatisfied(ROUGH, { shot: { rough_storyboard: { frames: { start: 'a', direction: 'b' } } } })).toBe(false)
    expect(prerequisiteSatisfied(ROUGH, { shot: { rough_storyboard: { frames: { start: 'a', direction: 'b', end: 'c' } } } })).toBe(true)
  })

  it('실사: 스토리보드 그림이 있으면 준비된 것으로 본다', () => {
    expect(prerequisiteSatisfied(REAL, { shot: { storyboard_image: null } })).toBe(false)
    expect(prerequisiteSatisfied(REAL, { shot: { storyboard_image: '  ' } })).toBe(false)
    expect(prerequisiteSatisfied(REAL, { shot: { storyboard_image: 'https://x/real.png' } })).toBe(true)
  })

  it('실사: 작업이 끝난 그림만 준비된 것으로 보고, 만드는 중이거나 실패한 그림은 제외한다', () => {
    const completed = { url: 'https://x/s.png', frames: { start: 'https://x/s.png', direction: 'https://x/d.png', end: 'https://x/e.png' }, status: 'completed' }
    expect(prerequisiteSatisfied(REAL, { shot: { storyboard_image: completed } })).toBe(true)
    expect(prerequisiteSatisfied(REAL, { shot: { storyboard_image: { url: 'https://x/single.png', status: 'completed' } } })).toBe(true)
    expect(prerequisiteSatisfied(REAL, { shot: { storyboard_image: { url: '', status: 'generating' } } })).toBe(false)
    expect(prerequisiteSatisfied(REAL, { shot: { storyboard_image: { url: 'https://x/s.png', status: 'failed' } } })).toBe(false)
  })
})

describe('waitForPrerequisite', () => {
  const sleep = async () => {}

  it('확인 결과 자료가 준비되면 끝내고, 그전에는 일정한 간격으로 다시 확인한다', async () => {
    let n = 0
    const fetchState = async (): Promise<PrerequisiteState> => (++n < 3 ? { shot: { storyboard_image: null } } : { shot: { storyboard_image: 'https://x/r.png' } })
    const outcome = await waitForPrerequisite('p1', REAL, { fetchState, sleep, intervalMs: 1 })
    expect(outcome).toBe('ready')
    expect(n).toBe(3)
  })

  it('기다릴 수 있는 시간이 지나면 시간 초과로 끝낸다', async () => {
    const fetchState = async (): Promise<PrerequisiteState> => ({ shot: { storyboard_image: null } })
    const outcome = await waitForPrerequisite('p1', REAL, { fetchState, sleep, intervalMs: 1, timeoutMs: 0 })
    expect(outcome).toBe('timeout')
  })

  it('사용자가 취소하면 취소된 상태로 끝낸다', async () => {
    const fetchState = async (): Promise<PrerequisiteState> => ({ shot: { storyboard_image: null } })
    const outcome = await waitForPrerequisite('p1', REAL, { fetchState, sleep, intervalMs: 1, isCancelled: () => true })
    expect(outcome).toBe('cancelled')
  })

  it('확인에 실패해도 기다림을 끝내지 않고 다음 간격에 다시 시도한다', async () => {
    let n = 0
    const fetchState = async (): Promise<PrerequisiteState> => {
      n += 1
      if (n === 1) throw new Error('transient')
      return { shot: { rough_storyboard: { frames: { start: 'a', direction: 'b', end: 'c' } } } }
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const outcome = await waitForPrerequisite('p1', ROUGH, { fetchState, sleep, intervalMs: 1 })
    warn.mockRestore()
    expect(outcome).toBe('ready')
    expect(n).toBe(2)
  })

  it('같은 자료를 새로 기다리기 시작하면 이전 기다림은 취소한다', async () => {
    let release: (() => void) | null = null
    const gate = new Promise<void>((r) => { release = r })
    const slowFetch = async (): Promise<PrerequisiteState> => { await gate; return { shot: { storyboard_image: null } } }
    const first = waitForPrerequisite('p1', REAL, { fetchState: slowFetch, sleep, intervalMs: 1 })
    const second = waitForPrerequisite('p1', REAL, { fetchState: async () => ({ shot: { storyboard_image: 'https://x/r.png' } }), sleep, intervalMs: 1 })
    expect(await second).toBe('ready')
    release!()
    expect(await first).toBe('cancelled')
  })
})
