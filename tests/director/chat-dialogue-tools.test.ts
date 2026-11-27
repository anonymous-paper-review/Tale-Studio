// Director 채팅이 콘티 · Storyboard 채팅과 같은 앱 도구 길(대사 자원 — 같은 검사 · 같은 저장)로 그 Writer 샷의 대사만 읽고 고친다 (오너 2026-11-27 3차 "대사 수정 기능을 채팅창에서도")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  llmChat: vi.fn(),
  persistTrace: vi.fn(),
  userOwnsProject: vi.fn(),
  resolveChatLocale: vi.fn(),
  settings: { dialogueLanguage: 'ko' } as Record<string, unknown> | null,
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llmChat }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: mocks.persistTrace }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/chat-format', async (original) => ({ ...await original<object>(), resolveChatLocale: mocks.resolveChatLocale }))
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { settings: mocks.settings }, error: null }) }) }) }) },
}))

import { POST } from '@/app/api/director/chat/route'
import { prepareChatTools, toolResourcesForStage } from '@/lib/chat-tools/protocol'
import { requestsSupportedChatEdit } from '@/lib/chat-tools/receipt'

type Tool = { name: string; input_schema: { properties: { resource?: { enum?: string[] } } } }
type ToolOpts = { appTools?: { tools: Tool[]; turn?: unknown } }

function chatRequest(extra: Record<string, unknown> = {}) {
  return new Request('http://test/api/director/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: '샷 3 대사를 "가자"로 바꿔줘', canvasContext: 'Scene_01 > shot-1', projectId: 'p-dir', ...extra }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.persistTrace.mockResolvedValue(undefined)
  mocks.resolveChatLocale.mockResolvedValue({ locale: 'ko', switched: null })
  mocks.llmChat.mockResolvedValue('네.')
})

describe('같이 정한 것', () => {
  // 왜: 오너 3차 "대사 수정 기능을 채팅창에서도" — Director 채팅도 콘티 · Storyboard 채팅과 같은 대사 자원(같은 검사 · 같은 저장)으로 고친다.
  //   두 길로 나뉘면 한쪽만 규칙(빈 칸 · 인물 id · 줄 빼기 확인)이 바뀌는 날 대사가 갈라진다.
  it('Director 채팅에 앱 도구를 켜면 모델에 대사 읽기 · 고치기 도구만 주고, 그 도구가 고른 차례를 화면으로 돌려준다', async () => {
    mocks.llmChat.mockImplementation(async (_system: string, _history: unknown, _user: string, _t: number, _tag: string, opts: ToolOpts) => {
      if (opts.appTools) opts.appTools.turn = { stopReason: 'tool_use', content: [{ type: 'tool_use', id: 'read-1', name: 'read_project', input: { resource: 'dialogue' } }] }
      return ''
    })
    const response = await POST(chatRequest({ chatTools: true, chatWorkflow: true, chatDomain: false, toolMessages: [] }))
    expect(response.status).toBe(200)
    const opts = mocks.llmChat.mock.calls[0]![5] as ToolOpts
    expect(opts.appTools!.tools.map((tool) => tool.name)).toEqual(['read_project', 'edit_project'])
    for (const tool of opts.appTools!.tools) expect(tool.input_schema.properties.resource?.enum).toEqual(['dialogue'])
    const body = await response.json() as { toolTurn?: unknown; toolSupport?: boolean }
    expect(body).toMatchObject({ toolTurn: { stopReason: 'tool_use' }, toolSupport: true })
  })

  // 왜: 대사 고침은 영상 고치기의 "바꿀 점"과 섞이지 않는다(리드 3차) — 모델이 대사를 영상 바꿀 점 · 샷 글로 보내면 대사는 그대로이고 바꿀 점에 대사가 섞인다.
  //   고친 대사는 새로 만드는 영상(Take)부터 들어가고 이미 만든 Take 는 그대로다(오너 3차 같이 정한 것).
  it('Director 채팅은 대사를 앱 도구로만 고치고 영상 바꿀 점 · 샷 글에 싣지 않으며, 새로 만드는 영상부터 들어간다고 말하라고 모델에 적는다', async () => {
    await POST(chatRequest({ chatTools: true, toolMessages: [] }))
    const system = mocks.llmChat.mock.calls[0]![0] as string
    expect(system).toContain('<dialogue_tool>')
    expect(system).toContain('read_project with resource "dialogue"')
    expect(system).toContain('Never put a dialogue change in updateShot, or in the "change" of generateVideos or generateImage')
    expect(system).toContain('videos made from now on')
    // 채팅으로 고치는 대사도 프로젝트 대사 언어로 쓴다(#dialogue-language-chat — Writer 채팅과 같은 규칙).
    expect(system).toContain("Dialogue language: this project's dialogue is written in Korean.")
  })
})

describe('혼자 정한 것', () => {
  // 왜: Director 채팅이 고칠 수 있는 것은 대사뿐이다(리드 3차) — 씬 · 샷 글 · 인물 · 설정 도구나 화면 열기 · 실행 다시 돌리기를 주면 Director 에서 이야기를 고치는 길이 열린다.
  it('Director 채팅의 앱 도구는 대사 읽기 · 고치기뿐이고 화면 열기 · 들여다보기 도구는 주지 않는다', () => {
    expect(toolResourcesForStage('director')).toEqual(['dialogue'])
    const tools = prepareChatTools('director', true, [], true, true)!.tools.map((tool) => tool.name)
    expect(tools).toEqual(['read_project', 'edit_project'])
  })

  // 왜: 도구 없이 온 요청(옛 화면 · 도구를 끈 요청)은 지금처럼 캔버스 고치기만 한다 — 도구가 저절로 켜지지 않게.
  it('앱 도구를 켜지 않은 Director 채팅은 지금처럼 도구 없이 답한다', async () => {
    const response = await POST(chatRequest())
    expect(response.status).toBe(200)
    const opts = mocks.llmChat.mock.calls[0]![5] as ToolOpts
    expect(opts.appTools).toBeUndefined()
    expect(mocks.llmChat.mock.calls[0]![0]).not.toContain('<dialogue_tool>')
  })

  // 왜: 대사 저장은 화면에서 그 프로젝트 권한으로 하지만, 남의 프로젝트에서 도구를 여는 요청은 서버가 먼저 막는다(Writer 채팅과 같은 규칙).
  it('앱 도구를 켠 Director 채팅은 프로젝트 주인이 아니면 막는다', async () => {
    mocks.userOwnsProject.mockResolvedValue(false)
    const response = await POST(chatRequest({ chatTools: true, toolMessages: [] }))
    expect(response.status).toBe(403)
    expect(mocks.llmChat).not.toHaveBeenCalled()
  })

  // 왜: 대사를 고쳐 달라는 말에 고치기 결과 없이 끝나지 않게 한 번 더 묻는다(콘티 채팅과 같은 확인) — 영상 · 카메라 부탁에는 걸지 않는다.
  it('Director 채팅에서 대사 고치기 · 더하기 · 빼기를 부탁하면 고치기 결과를 기다리고, 영상 · 카메라 부탁이나 하지 말라는 말에는 기다리지 않는다', () => {
    for (const message of ['샷 3 대사를 "가자"로 바꿔줘', '샷 2 에 미나 대사 한 줄 더해줘', '샷 4 두 번째 대사 빼줘', 'Change the dialogue in Shot 3 to "Let\'s go".', 'Remove the narration line from Shot 2.']) {
      expect({ message, wait: requestsSupportedChatEdit('director', message) }).toEqual({ message, wait: true })
    }
    for (const message of ['샷 3 영상 다시 만들어줘', '샷 3 카메라를 왼쪽으로 바꿔줘', '대사는 바꾸지 마', "Don't change the dialogue."]) {
      expect({ message, wait: requestsSupportedChatEdit('director', message) }).toEqual({ message, wait: false })
    }
  })
})
