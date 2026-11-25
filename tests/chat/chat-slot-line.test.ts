// 채팅 입력창 바로 위 줄은 개발용 토큰 수가 아니라 학생이 지금 쓸 수 있는 동시 생성 자리를 보인다 (2026-11-25)
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Slot { used: number; limit: number | null }
const shared = vi.hoisted(() => ({ slots: null as null | { image: Slot; video: Slot } }))
vi.mock('@/lib/generation-queue', () => ({ useGenerationSlots: () => shared.slots }))
// 서버 렌더(renderToStaticMarkup)는 스토어의 처음 언어(en)를 읽는다 — 한국어 화면 문구로 확인하려고 t 만 한국어로 고정한다.
vi.mock('@/lib/i18n', async (original) => {
  const actual = await original<typeof import('@/lib/i18n')>()
  return { ...actual, useT: () => (text: string, params?: Record<string, string | number>) => actual.translate('ko', text, params) }
})

import { ChatSlotLine } from '@/components/layout/chat-slot-line'

const render = () => renderToStaticMarkup(createElement(ChatSlotLine, { projectId: 'slot-line-project' }))
const CHAT = 'src/components/layout/global-chat.tsx'

beforeEach(() => {
  shared.slots = null
})

describe('채팅 입력창 위의 내 자리 줄', () => {
  it('자리 수를 모르면 아무것도 그리지 않는다', () => {
    // 왜: 받기 전에 "0 / 6"을 보이면 그리는 중인 자리를 비었다고 잘못 읽는다.
    expect(render()).toBe('')
  })

  it('그림 자리가 꽉 차면 그 숫자를 경고색으로 보인다', () => {
    // 왜: 꽉 찬 자리를 눌러도 429 로 거절된다 — 누르기 전에 색으로 먼저 보인다. 남은 영상 자리는 평상 색이다.
    shared.slots = { image: { used: 6, limit: 6 }, video: { used: 0, limit: 3 } }

    const html = render()

    expect(html).toContain('그림 6 / 6')
    expect(html).toContain('영상 0 / 3')
    expect(html).toMatch(/text-warning[^>]*>그림 6 \/ 6</)
    expect(html).not.toMatch(/text-warning[^>]*>영상 0 \/ 3</)
  })

  it('상한이 없으면 쓴 수만 보인다', () => {
    // 왜: 관리자 계정은 개인 상한이 없다 — "/ 6"을 붙이면 없는 한도를 만들어 보여 준다.
    shared.slots = { image: { used: 2, limit: null }, video: { used: 1, limit: null } }

    const html = render()

    expect(html).toContain('그림 2 · 상한 없음')
    expect(html).toContain('영상 1 · 상한 없음')
    expect(html).not.toContain('그림 2 /')
  })

  it('채팅 입력창 위에 토큰 수는 더 보이지 않는다', () => {
    // 왜: 토큰 · 컨텍스트 수는 개발용 숫자라 학생에게 읽을 거리가 아니다 — 그 자리를 자리 줄이 받는다.
    const chat = readFileSync(CHAT, 'utf8')

    expect(chat).not.toContain('ChatTraceFooter')
    expect(chat).not.toContain('Context {tokens}')
    expect(chat).not.toContain('formatTraceNumber')
    expect(chat).toContain('<ChatSlotLine projectId={projectId} />')
    // 대화 기록(lastTrace)은 다른 곳이 쓰므로 그대로 둔다.
    expect(readFileSync('src/stores/global-chat-store.ts', 'utf8')).toContain('lastTrace')
  })
})
