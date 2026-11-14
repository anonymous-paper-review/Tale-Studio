// 필요한 자료가 준비되지 않으면 안내하고, 준비될 때까지 기다렸다가 자동으로 작업을 이어간다 (#ref-gate 2026-09-02, 오너 결정 1번)
import { describe, it, expect, vi, beforeEach } from 'vitest'

// #ref-gate(2026-09-02, 오너 결정 1번): 선행조건 409 → 안내 → DB 폴링 → 자동 재개의 순수 부분.
//   브라우저 전용 의존(toast·store·supabase 클라)은 모킹 — 판정과 대기 루프만 검증한다.
const mocks = vi.hoisted(() => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  notifyActionError: vi.fn(),
  notifyIssue: vi.fn(),
  locale: 'en' as 'en' | 'ko',
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))
vi.mock('@/stores/locale-store', () => ({ useLocaleStore: { getState: () => ({ locale: mocks.locale }) } }))
vi.mock('@/stores/global-chat-store', () => ({ useGlobalChatStore: { getState: () => ({ notifyActionError: mocks.notifyActionError, notifyIssue: mocks.notifyIssue }) } }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => { throw new Error('not used in unit tests') } }))

import {
  isPrerequisiteMissing,
  prerequisiteLabel,
  prerequisiteSatisfied,
  notifyPrerequisiteTimeout,
  notifyPrerequisiteWaiting,
  waitForPrerequisite,
  type PrerequisiteState,
} from '@/lib/generation-prerequisite-toast'
import { useWriterStore } from '@/stores/writer-store'

const SHEETS = { code: 'missing_character_sheets' as const, missing: [{ characterId: 'char_3', appearanceKey: 'current', name: '수인 수장' }] }
const ROUGH = { code: 'missing_rough_storyboard' as const, shotId: 'sh_01_24' }
const REAL = { code: 'missing_storyboard' as const, shotId: 'sh_01_27' }

beforeEach(() => {
  mocks.toast.info.mockReset()
  mocks.toast.error.mockReset()
  mocks.notifyActionError.mockReset()
  mocks.notifyIssue.mockReset()
  mocks.locale = 'en'
  useWriterStore.setState({ sceneManifest: null, shots: [] })
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

  it('대기 안내는 화면 알림과 채팅 둘 다에 남기고, 채팅 줄은 "시작하지 못했어요" 틀 없이 고정 문장이다', () => {
    // 왜: 대기 안내가 "Couldn't start Generation generation: …"(한국어 "생성 생성을 시작하지 못했어요")로 남아 같은 낱말이 겹치고, 실패가 아닌 기다림을 실패처럼 말했다(2026-11-14 오너).
    notifyPrerequisiteWaiting('director', SHEETS)
    expect(mocks.toast.info).toHaveBeenCalledTimes(1)
    expect(String(mocks.toast.info.mock.calls[0][0])).toContain('character sheets for 수인 수장')
    expect(mocks.notifyIssue).toHaveBeenCalledTimes(1)
    expect(mocks.notifyIssue).toHaveBeenCalledWith('director', '⚠ Waiting for character sheets for 수인 수장. Generation resumes automatically when it is ready.')
    expect(mocks.notifyActionError).not.toHaveBeenCalled()
  })

  it('20분을 기다려도 준비되지 않아 멈추면 채팅에 같은 꼴의 고정 문장으로 남긴다', () => {
    // 왜: 시간 초과 안내도 같은 틀(Generation generation)을 탔다.
    notifyPrerequisiteTimeout('director', ROUGH)
    expect(mocks.toast.error).toHaveBeenCalledTimes(1)
    expect(mocks.notifyIssue).toHaveBeenCalledWith('director', '⚠ Stopped waiting for the rough storyboard of sh_01_24 after 20 minutes. Generate it, then retry manually.')
    expect(mocks.notifyActionError).not.toHaveBeenCalled()
  })

  it('한국어 채팅에서도 "생성 생성"처럼 같은 낱말이 겹치지 않는다', () => {
    // 왜: 한국어 화면은 "{label} 생성을 시작하지 못했어요"에 label "생성"이 들어가 "생성 생성을 시작하지 못했어요"가 됐다.
    mocks.locale = 'ko'
    notifyPrerequisiteWaiting('director', SHEETS)
    notifyPrerequisiteTimeout('director', ROUGH)

    const chat = mocks.notifyIssue.mock.calls.map((call) => String(call[1]))
    expect(chat).toEqual([
      '⚠ 수인 수장의 인물 시트을(를) 기다리는 중입니다. 준비되면 자동으로 이어서 생성합니다.',
      '⚠ sh_01_24의 러프 스토리보드을(를) 20분 동안 기다렸지만 오지 않아 대기를 멈췄습니다. 먼저 만든 뒤 다시 눌러 주세요.',
    ])
    for (const line of chat) expect(line).not.toMatch(/생성 생성|시작하지 못했/)
  })

  it('기다리는 샷은 채팅과 알림에 보드 이름("샷 3")으로 부르고, 보드를 모르면 지금처럼 샷 id 로 부른다', () => {
    // 왜: 새 고정 문장에 sh_01_24 같은 내부 번호가 그대로 나오면 오너 전역 규칙(씬 · 샷 이름, 답 7)과 어긋난다.
    useWriterStore.setState({
      sceneManifest: { characters: [], locations: [], scenes: [{ sceneId: 'sc_01' }] } as never,
      shots: [{ shotId: 'sh_01_23', sceneId: 'sc_01' }, { shotId: 'sh_01_24', sceneId: 'sc_01' }] as never,
    })
    mocks.locale = 'ko'
    expect(prerequisiteLabel(ROUGH)).toBe('샷 2의 러프 스토리보드')
    mocks.locale = 'en'
    expect(prerequisiteLabel(ROUGH)).toBe('the rough storyboard of Shot 2')
    // 보드에 없는 샷은 번호를 지어내지 않고 지금 그대로.
    expect(prerequisiteLabel(REAL)).toBe('the live-action storyboard of sh_01_27')
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
