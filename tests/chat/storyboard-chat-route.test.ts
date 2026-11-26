// Storyboard 단계 채팅 요청에만 실사 그림 도구(안내 · 샷마다 실사 상태 · 그림 요청 받기)가 실리고, 콘티 등 다른 요청에는 없는지 채팅 서버로 검사한다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ chat: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: 'owner', user_metadata: { locale: 'ko' } }) }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: async () => true }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.chat }))
vi.mock('@/lib/chat-format', () => ({
  CHAT_OUTPUT_FORMAT_GUIDE: '',
  CHAT_UPDATES_BATCH_GUIDE: '',
  resolveChatLocale: async () => ({ locale: 'ko', switched: null }),
  responseLanguageDirective: () => '',
}))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: vi.fn() }))
// 표마다 돌려줄 행 — 이 시험을 위해 지은 프로젝트(샷 둘, 하나만 실사가 있다).
vi.mock('@/lib/supabase/admin', () => {
  const rows: Record<string, unknown> = {
    characters: [{ character_id: 'mina' }],
    projects: { settings: {} },
    locations: [],
    shots: [
      { shot_id: 'sh_01_01', storyboard_image: { url: 'u', status: 'completed', generatedAt: 1 } },
      { shot_id: 'sh_01_02', storyboard_image: null },
    ],
  }
  const chain = (table: string) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order', 'in', 'is', 'not']) c[m] = () => c
    c.maybeSingle = async () => ({ data: rows[table] ?? null, error: null })
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve)
    return c
  }
  return { supabaseAdmin: { from: (table: string) => chain(table) } }
})

import { POST } from '@/app/api/writer/chat/route'

const REPLY = '샷 2 표정을 더 슬프게 다시 그릴게요.\n\n```json\n{"updates":[{"type":"generateImage","id":"sh_01_02","change":"Make her expression sadder"}]}\n```'

async function ask(body: Record<string, unknown>) {
  const res = await POST(new Request('http://localhost/api/writer/chat', { method: 'POST', body: JSON.stringify({ message: '@샷 2 표정을 더 슬프게', projectId: 'p1', ...body }) }))
  return { status: res.status, json: (await res.json()) as { updates?: unknown[] } }
}

beforeEach(() => {
  mocks.chat.mockReset().mockResolvedValue(REPLY)
})

describe('Storyboard 채팅 서버의 실사 그림 도구', () => {
  // 왜(오너 O7): Storyboard 채팅이 고칠 글을 받으면 그 샷 실사를 다시 그린다 — 도구 안내와 샷마다 실사가 있는지(지금 판)를 AI 가 봐야 한다.
  it('Storyboard 단계 채팅 요청이면 AI 안내에 실사 그림 도구가, 문맥에 샷마다 실사 상태가 실린다', async () => {
    await ask({ storyboardImages: true })
    const [system, , userPrompt] = mocks.chat.mock.calls[0] as [string, unknown, string]
    expect(system).toContain('<live-action-images>')
    expect(userPrompt).toContain('## Live-action images (Storyboard)')
    expect(userPrompt).toContain('- sh_01_02: no live-action image yet')
  })

  // 왜(오너 O7): 모델이 낸 그림 요청이 화면까지 가야 그 카드를 다시 그린다.
  it('Storyboard 단계 채팅 요청이면 모델이 낸 실사 그림 요청을 화면에 넘긴다', async () => {
    const { status, json } = await ask({ storyboardImages: true })
    expect(status).toBe(200)
    expect(json.updates).toEqual([{ type: 'generateImage', id: 'sh_01_02', change: 'Make her expression sadder' }])
  })

  // 왜(혼자 정한 것 j): 콘티 채팅은 Artist 앞이라 인물 시트가 없어 실사를 못 그린다 — 도구를 알리지도 받지도 않는다.
  it('Storyboard 단계가 아닌 채팅 요청에는 실사 그림 도구가 없고 그림 요청도 받지 않는다', async () => {
    const { json } = await ask({})
    const [system, , userPrompt] = mocks.chat.mock.calls[0] as [string, unknown, string]
    expect(system).not.toContain('<live-action-images>')
    expect(userPrompt).not.toContain('## Live-action images')
    expect(json.updates).toEqual([])
  })
})
