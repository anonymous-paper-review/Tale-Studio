// 대화 줄은 부른 차례대로 저장되어, 바로 답하는 한 턴(빠른 칩)도 다시 열면 내 말이 Lumi 답 위에 있는지 검사한다 (2026-11-22 fb-camera 찾음 · 리드 지시)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveChatMessage } from '@/lib/chat-persistence'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { useProjectStore } from '@/stores/project-store'
import { useLocaleStore } from '@/stores/locale-store'

let rows: Array<{ role: string; content: string }>

/** 서버에 닿는 차례를 흉내 낸다 — 먼저 보낸 저장이 늦게 닿을 수 있다(첫 저장은 40ms 뒤에 넣고, 나머지는 바로 넣는다). 넣은 차례 = 다시 열 때 보이는 차례. */
function arrivalFetch() {
  let saves = 0
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).endsWith('/messages') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { role: string; content: string }
      const delay = saves++ === 0 ? 40 : 0
      await new Promise((resolve) => setTimeout(resolve, delay))
      rows.push({ role: body.role, content: body.content })
      return Response.json({ ok: true })
    }
    return Response.json({})
  })
}

beforeEach(() => {
  rows = []
  useGlobalChatStore.getState().reset()
  useLocaleStore.setState({ locale: 'en' })
})
afterEach(() => {
  useGlobalChatStore.getState().reset()
  vi.unstubAllGlobals()
})

describe('대화 줄 저장 차례', () => {
  it('먼저 부른 저장이 서버에 늦게 닿을 수 있어도 같은 프로젝트의 대화 줄은 부른 차례대로 저장된다', async () => {
    // 왜: 저장은 줄마다 따로 보낸다 — 거의 동시에 보내면 늦게 닿은 쪽이 나중 시각을 받아 다시 열 때 차례가 뒤집혔다.
    vi.stubGlobal('fetch', arrivalFetch())
    saveChatMessage('p-order', 'camera', 'user', 'How far along is it?')
    saveChatMessage('p-order', 'camera', 'model', 'Images 25/25')
    await vi.waitFor(() => expect(rows).toHaveLength(2))
    expect(rows.map((row) => row.role)).toEqual(['user', 'model'])
  })

  it('빠른 칩처럼 바로 답하는 한 턴도 다시 열면 내 말이 Lumi 답 위에 있다', async () => {
    // 왜: 2026-11-22 시험 프로젝트에서 Lumi 답이 0.1초 먼저 저장돼 다시 열면 답이 질문 위에 보였다(Director 빠른 칩도 같은 길).
    vi.stubGlobal('fetch', arrivalFetch())
    useProjectStore.setState({ projectId: 'p-chip', currentStage: 'camera', reachedStage: 'camera', projectLocale: 'en', projectLocaleLocked: true })
    await useGlobalChatStore.getState().sendMessage('How far along is it?')
    await vi.waitFor(() => expect(rows.length).toBeGreaterThanOrEqual(2))
    expect(rows[0]).toEqual({ role: 'user', content: 'How far along is it?' })
    expect(rows[1]?.role).toBe('model')
  })
})
