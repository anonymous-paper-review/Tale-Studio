// Editor 조언 서버(/api/editor/chat)가 글만 돌려주고 작업물을 바꾸는 도구 · 내용을 내지 않으며, 바꿔 달라는 말에는 직접 하는 방법을 알려 주라고 지시하는지 검사한다 (오너 2026-11-14 10번)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  owns: vi.fn(),
  llmChat: vi.fn(),
  locale: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.owns }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llmChat }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: vi.fn() }))
vi.mock('@/lib/chat-format', async (original) => ({
  ...await original<typeof import('@/lib/chat-format')>(),
  resolveChatLocale: mocks.locale,
}))

import { POST } from '@/app/api/editor/chat/route'
import { EDITOR_FEATURES, EDITOR_NOT_AVAILABLE, editorFeaturesPrompt } from '@/lib/editor/editor-features'

const post = (body: Record<string, unknown>) => POST(new Request('http://localhost/api/editor/chat', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1', user_metadata: {} })
  mocks.owns.mockResolvedValue(true)
  mocks.locale.mockResolvedValue({ locale: 'en', switched: null })
})

describe('Editor 조언 서버', () => {
  // 왜: 오너 10번 "작업물에는 터치 못 하게" — 모델이 바꾸는 내용(JSON)을 내도 서버는 글만 돌려준다. 바꾸는 도구는 받지도 넘기지도 않는다.
  it('Editor 조언 서버는 글만 돌려주고, 모델이 바꾸는 내용을 내도 싣지 않는다', async () => {
    mocks.llmChat.mockResolvedValue('Drag the edge of the cut to shorten it.\n\n```json\n{"updates":[{"type":"deleteClip","shotId":"sh-1"}]}\n```')
    const res = await post({ message: 'Shorten cut 2', projectId: 'proj-e', timelineContext: 'Cuts on the timeline: 2', chatTools: true, toolMessages: [{ role: 'tool' }] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reply).toBe('Drag the edge of the cut to shorten it.')
    expect(Object.keys(body).sort()).toEqual(['contentLocale', 'localeSwitched', 'reply', 'trace'])
    // 모델에는 도구를 넘기지 않는다 — llmChat 다섯째 인자에 도구가 없다.
    const options = mocks.llmChat.mock.calls[0][5] as Record<string, unknown> | undefined
    expect(options?.tools).toBeUndefined()
  })

  // 왜: 바꿔 달라는 말에 "바꿨어요"라고 거짓말하지 않고, 사용자가 Editor 에서 직접 하는 방법을 알려 준다.
  it('Editor 조언 서버는 바꿔 달라는 말에 바꾸지 않고 직접 하는 방법을 알려 주라고 모델에 지시하고, 지금 타임라인 요약을 함께 보낸다', async () => {
    mocks.llmChat.mockResolvedValue('You can do it yourself.')
    await post({ message: 'Delete the first cut', projectId: 'proj-e', timelineContext: 'Cuts on the timeline: 2' })
    const [system, , user] = mocks.llmChat.mock.calls[0] as [string, unknown, string]
    expect(system).toContain('You cannot change the timeline')
    expect(system).toContain('explain how the user can do it in the Editor')
    expect(user).toContain('Cuts on the timeline: 2')
    expect(user).toContain('Delete the first cut')
  })

  // 왜: 영어 재점검(qa-golden d20304a6) B2 — 조언이 없는 기능("open the transitions panel … fade-out", "right-click the leftover part and delete it")을 하라고 했다.
  //   기능 목록은 한 곳(lib/editor/editor-features)에만 있고 서버는 거기서 읽는다. 모델 답이 목록을 지키는지는 시험으로 못 본다 — 목록 · 규칙이 실리는지만 본다.
  it('Editor 조언에는 지금 Editor 에 있는 기능 목록과 "목록 밖 기능은 말하지 말 것"이 실린다 — 없는 기능(전환 패널 · 남은 부분 지우기 메뉴 등)을 하라고 하지 않게', async () => {
    mocks.llmChat.mockResolvedValue('Right-click the clip and choose Dissolve (dip to black).')
    await post({ message: 'How do I fade out at the end?', projectId: 'proj-e', timelineContext: 'Cuts on the timeline: 2' })
    const [system] = mocks.llmChat.mock.calls[0] as [string]
    expect(system).toContain(editorFeaturesPrompt())
    for (const line of [...EDITOR_FEATURES, ...EDITOR_NOT_AVAILABLE]) expect(system).toContain(line)
    expect(system).toContain('Only suggest controls listed in <editor_features>')
    // 이번에 실제로 지어낸 두 가지는 "없는 것"에 적혀 있다.
    expect(EDITOR_NOT_AVAILABLE.some((line) => line.includes('a transitions panel'))).toBe(true)
    expect(EDITOR_NOT_AVAILABLE.some((line) => line.includes("a delete item in a clip's right-click menu"))).toBe(true)
  })

  // 왜: 로그인 · 빈 메시지 검사는 다른 채팅 길과 같다 — 로그인하지 않은 사람은 조언 모델을 부르지 못한다.
  it('Editor 조언 서버는 로그인하지 않으면 401, 메시지가 없으면 400 이다', async () => {
    mocks.getUser.mockResolvedValue(null)
    expect((await post({ message: 'Hi' })).status).toBe(401)
    mocks.getUser.mockResolvedValue({ id: 'user-1', user_metadata: {} })
    expect((await post({})).status).toBe(400)
  })
})
