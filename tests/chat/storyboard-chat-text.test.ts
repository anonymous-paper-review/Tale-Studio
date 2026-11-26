// Storyboard 채팅은 실사 그림만 다시 그리고 씬 · 샷 · 대사 글은 고치지 않으며 글 부탁은 Writer 콘티로 안내하는지, 콘티 채팅은 지금처럼 글을 고치는지 채팅 서버로 검사한다 (오너 2026-11-27 N3)
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
// 표마다 돌려줄 행 — 이 시험을 위해 지은 프로젝트(인물 하나 · 샷 둘, 하나만 실사가 있다).
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

const TEXT_EDIT = { type: 'updateShot', id: 'sh_01_02', patch: { dialogueLines: [{ characterId: 'mina', text: '잘 가' }] } }
const IMAGE = { type: 'generateImage', id: 'sh_01_02' }
const fenced = (reply: string, updates: unknown[]) => `${reply}\n\n\`\`\`json\n${JSON.stringify({ updates })}\n\`\`\``
const TOOLS = { chatTools: true, chatWorkflow: true, chatDomain: true, toolMessages: [] }

async function ask(body: Record<string, unknown>) {
  const res = await POST(new Request('http://localhost/api/writer/chat', { method: 'POST', body: JSON.stringify({ message: "@샷 2 대사를 '잘 가'로 바꾸고 다시 그려 줘", projectId: 'p1', ...body }) }))
  return { status: res.status, json: (await res.json()) as { updates?: unknown[]; reply?: string } }
}
const systemOf = () => (mocks.chat.mock.calls[0] as [string])[0]
const toolNamesOf = () => ((mocks.chat.mock.calls[0] as unknown[])[5] as { appTools?: { tools: Array<{ name: string }> } }).appTools?.tools.map((tool) => tool.name) ?? []

beforeEach(() => {
  mocks.chat.mockReset().mockResolvedValue(fenced('샷 2 대사를 바꾸고 다시 그릴게요.', [TEXT_EDIT, IMAGE]))
})

describe('Storyboard 채팅은 실사 고치기만 한다', () => {
  // 왜(오너 N3 "추천대로" — 실사 고치기만 하고 글은 콘티로 안내): 콘티가 이야기 · 대사를 맡는다. Storyboard AI 가 고치기 동작을 알고 있으면
  //   Storyboard 에서 씬 · 샷 · 대사가 바뀌어 콘티와 두 곳에서 같은 글을 고치게 된다.
  it('Storyboard 채팅 AI 안내에는 씬 · 샷 · 대사 고치기 동작이 없고, 글을 고쳐 달라면 Writer 콘티(대사는 대사 탭에서도)로 안내하라고 한다', async () => {
    await ask({ storyboardImages: true })
    const system = systemOf()
    for (const action of ['addScene', 'addShot', 'updateScene', 'updateShot', 'deleteShot', 'deleteScene']) expect(system).not.toContain(`"type":"${action}"`)
    expect(system).toContain('<live-action-images>')
    expect(system).toMatch(/rough storyboard/i)
    expect(system).toMatch(/Dialogue tab/)
    // 샷 이름 규칙(보드 전체 번호)은 그대로 — 그림 부탁도 "샷 8"로 온다.
    expect(system).toContain('Shot numbers count across the whole board')
  })

  // 왜(오너 N3): 안내를 어기고 모델이 글 고치기를 내도 Storyboard 에서 글이 바뀌면 안 된다(architecture §3 받을 모양만 받는다) —
  //   모델이 "바꿨어요"라고 해도 사람이 사실을 알게 답 끝에 고정 안내를 붙인다(혼자 정한 것 c).
  it('Storyboard 채팅 답에 글 고치기가 섞여 와도 서버는 그림 요청만 화면에 넘기고, 글은 바꾸지 않았다는 안내를 답 끝에 붙인다', async () => {
    const { status, json } = await ask({ storyboardImages: true })
    expect(status).toBe(200)
    expect(json.updates).toEqual([IMAGE])
    expect(json.reply).toContain('샷 2 대사를 바꾸고 다시 그릴게요.')
    expect(json.reply).toContain('Storyboard에서는 글을 바꾸지 않아')
    expect(json.reply).toContain('Writer 콘티')
  })

  // 왜(정상 경로 고정): 어느 샷을 다시 그릴지 모를 때 되묻는 것은 글 고치기가 아니다 — 질문은 그대로 넘기고 안내는 붙이지 않는다.
  it('Storyboard 채팅이 어느 샷인지 되물으면 그 질문은 그대로 화면에 넘긴다', async () => {
    const clarify = { type: 'clarify', question: '어느 샷을 다시 그릴까요?', candidates: ['샷 1', '샷 2'] }
    mocks.chat.mockResolvedValue(fenced('어느 샷인지 알려 주세요.', [clarify]))
    const { json } = await ask({ storyboardImages: true })
    expect(json.updates).toEqual([clarify])
    expect(json.reply).not.toContain('Storyboard에서는 글을 바꾸지 않아')
  })

  // 왜(오너 N3): 고치기 도구(edit_project)가 있으면 모델이 도구로 씬 · 샷 · 대사를 저장한다 — 읽기 도구(묻는 말에 답하기)만 준다.
  it('Storyboard 채팅에는 고치기 도구를 주지 않고 읽기 도구만 준다', async () => {
    await ask({ storyboardImages: true, ...TOOLS })
    const names = toolNamesOf()
    expect(names).toContain('read_project')
    expect(names).not.toContain('edit_project')
    expect(systemOf()).toMatch(/no edit_project/i)
  })
})

describe('콘티 채팅은 그대로 글을 고친다', () => {
  // 왜(정상 경로 고정 — 오너 N3 "콘티 채팅은 지금 그대로"): 글 고치기는 콘티로 옮겨 간 것이지 없어진 것이 아니다.
  it('콘티 채팅은 지금처럼 씬 · 샷 · 대사 고치기 동작과 고치기 도구를 받고, 글 고치기 답을 화면에 넘긴다', async () => {
    mocks.chat.mockResolvedValue(fenced('샷 2 대사를 바꿨어요.', [TEXT_EDIT]))
    const { json } = await ask({ ...TOOLS })
    expect(systemOf()).toContain('"type":"updateShot"')
    expect(systemOf()).not.toContain('<live-action-images>')
    expect(toolNamesOf()).toContain('edit_project')
    expect(json.updates).toEqual([TEXT_EDIT])
    expect(json.reply).not.toContain('Storyboard에서는 글을 바꾸지 않아')
  })
})
