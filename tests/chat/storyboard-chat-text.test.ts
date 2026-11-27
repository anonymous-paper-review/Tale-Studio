// Storyboard 채팅은 실사 그림을 다시 그리고 대사(글 · 말하는 사람 · 줄 더하기 · 빼기)만 대사 도구로 고치며 이야기 · 샷 글은 고치지 않고 Writer 콘티로 안내하는지, 콘티 채팅은 지금처럼 글을 고치는지 채팅 서버로 검사한다 (오너 2026-11-27 N3 · Q1 "대사 수정 기능을 채팅창에서도" · 리드 결정 "도구 하나로")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ chat: vi.fn(), settings: {} as Record<string, unknown> }))
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
    get projects() { return { settings: mocks.settings } },
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
const toolsOf = () => ((mocks.chat.mock.calls[0] as unknown[])[5] as { appTools?: { tools: Array<{ name: string; input_schema?: unknown }> } }).appTools?.tools ?? []
const toolNamesOf = () => toolsOf().map((tool) => tool.name)
const workflowActionsOf = () => ((toolsOf().find((tool) => tool.name === 'project_workflow')?.input_schema as { properties: { action: { enum: string[] } } } | undefined)?.properties.action.enum ?? [])

const STORY_NOTICE = 'Storyboard에서는 이야기 · 샷을 바꾸지 않아요'
const DIALOGUE_NOT_SAVED = '이번 대사 고침은 저장하지 않았어요. 다시 부탁해 주세요.'

beforeEach(() => {
  mocks.settings = {}
  mocks.chat.mockReset().mockResolvedValue(fenced('샷 2 대사를 바꾸고 다시 그릴게요.', [TEXT_EDIT, IMAGE]))
})

describe('Storyboard 채팅은 실사 고치기만 한다', () => {
  // 왜(오너 N3 "추천대로" — 이야기 · 샷은 콘티 · Q1 "대사 수정 기능을 채팅창에서도" · 리드 "도구 하나로"): 콘티가 이야기 · 샷을 맡는다. Storyboard AI 가 씬 · 샷 고치기 동작을 알고 있으면
  //   Storyboard 에서 이야기 · 샷이 바뀌어 콘티와 두 곳에서 같은 글을 고치게 된다. 대사만은 여기서도 Director 채팅과 같은 대사 도구로 고친다(답의 JSON 으로는 고치지 않는다).
  //   (2026-11-27 이름 바꿈 · 오너 Q1 — 옛 이름 'Storyboard 채팅 AI 안내에는 씬 · 샷 · 대사 고치기 동작이 없고, 글을 고쳐 달라면 Writer 콘티(대사는 대사 탭에서도)로 안내하라고 한다')
  it('Storyboard 채팅 AI 안내에는 씬 · 샷 고치기 동작이 없고 대사는 대사 도구(dialogue 자원)로만 고치라고 하며, 이야기 · 샷을 고쳐 달라면 Writer 콘티로 안내하라고 한다', async () => {
    await ask({ storyboardImages: true })
    const system = systemOf()
    for (const action of ['addScene', 'addShot', 'updateScene', 'updateShot', 'deleteShot', 'deleteScene', 'updateDialogue']) expect(system).not.toContain(`"type":"${action}"`)
    expect(system).toContain('<live-action-images>')
    expect(system).toContain('<dialogue-tool>')
    expect(system).toMatch(/read_project with resource "dialogue", then edit_project/)
    expect(system).toMatch(/rough storyboard/i)
    // 샷 이름 규칙(보드 전체 번호)은 그대로 — 그림 부탁도 "샷 8"로 온다.
    expect(system).toContain('Shot numbers count across the whole board')
  })

  // 왜(오너 N3 · Q1 · 리드 "도구 하나로"): 안내를 어기고 모델이 답의 JSON 으로 글 고치기를 내도 Storyboard 에서 글이 바뀌면 안 된다(architecture §3 받을 모양만 받는다) —
  //   대사는 대사 도구로만 고친다. 사람이 사실을 알게 답 끝에 고정 안내를 붙인다(혼자 정한 것 c).
  //   안내는 이야기 · 샷만 아니라고 한다 — 같은 답이 대사 도구로 대사를 고치거나 그림을 다시 그리면 "아무것도 고치지 않았다"는 틀린 말이다(검토 rev-flow 리드 4).
  //   (2026-11-27 이름 바꿈 · 오너 Q1 — 옛 이름 'Storyboard 채팅 답에 글 고치기가 섞여 와도 서버는 그림 요청만 화면에 넘기고, 글은 Storyboard 에서 바꾸지 않는다는 안내를 답 끝에 붙인다')
  it('Storyboard 채팅 답에 글 고치기(JSON)가 섞여 와도 서버는 그림 요청만 화면에 넘기고, 이야기 · 샷은 Storyboard 에서 바꾸지 않는다는 안내를 답 끝에 붙인다', async () => {
    const mixed = { type: 'updateShot', id: 'sh_01_02', patch: { actionDescription: '새 이야기', shotType: 'CU', dialogueLines: [{ characterId: 'mina', text: '잘 가' }] } }
    const added = { type: 'addShot', sceneId: 'sc_01', shotType: 'MS', actionDescription: '새 샷' }
    mocks.chat.mockResolvedValue(fenced('샷 2 대사를 바꾸고 다시 그릴게요.', [mixed, added, TEXT_EDIT, IMAGE]))
    const { status, json } = await ask({ storyboardImages: true })
    expect(status).toBe(200)
    expect(json.updates).toEqual([IMAGE])
    expect(json.reply).toContain('샷 2 대사를 바꾸고 다시 그릴게요.')
    expect(json.reply).toContain(STORY_NOTICE)
    expect(json.reply).toContain('Writer 콘티')
    expect(json.reply).not.toContain('아무것도')
  })

  // 왜(정상 경로 고정): 어느 샷을 다시 그릴지 모를 때 되묻는 것은 글 고치기가 아니다 — 질문은 그대로 넘기고 안내는 붙이지 않는다.
  it('Storyboard 채팅이 어느 샷인지 되물으면 그 질문은 그대로 화면에 넘긴다', async () => {
    const clarify = { type: 'clarify', question: '어느 샷을 다시 그릴까요?', candidates: ['샷 1', '샷 2'] }
    mocks.chat.mockResolvedValue(fenced('어느 샷인지 알려 주세요.', [clarify]))
    const { json } = await ask({ storyboardImages: true })
    expect(json.updates).toEqual([clarify])
    expect(json.reply).not.toContain(STORY_NOTICE)
  })

  // 왜(오너 N3 · Q1 · 리드 "도구 하나로"): 고치기 도구가 씬 · 샷까지 고칠 수 있으면 Storyboard 에서 이야기 · 샷이 바뀐다 — 고치기 도구는 대사 자원만 고친다(Director 채팅과 같다).
  //   묻는 말에 답하는 도구 · 화면 열기는 그대로 둔다.
  //   (2026-11-27 이름 바꿈 · 오너 Q1 — 옛 이름 'Storyboard 채팅에는 고치기 도구(edit_project)를 주지 않고 AI 안내에도 싣지 않는다 — 묻는 말에 답하는 도구 · 화면 열기는 그대로')
  it('Storyboard 채팅에는 고치기 도구(edit_project)를 대사 자원(dialogue)만 고치게 준다 — 묻는 말에 답하는 도구 · 화면 열기는 그대로', async () => {
    await ask({ storyboardImages: true, ...TOOLS })
    const names = toolNamesOf()
    expect(names).toContain('read_project')
    expect(names).toContain('project_workflow')
    expect(names).toContain('edit_project')
    const editResources = (toolsOf().find((tool) => tool.name === 'edit_project')?.input_schema as { properties: { resource: { enum: string[] } } }).properties.resource.enum
    expect(editResources).toEqual(['dialogue'])
  })

  // 왜(검토 rev-flow 리드 7 · 오너 N3 "실사 고치기만"): 씬 · 샷을 다시 나누는 Writer 실행 다시 돌리기는 콘티의 일이다.
  it('Storyboard 채팅 요청의 화면 도구에는 Writer 실행 다시 돌리기(resume)가 없고, 콘티 채팅 요청에는 지금처럼 있다', async () => {
    await ask({ storyboardImages: true, ...TOOLS })
    expect(workflowActionsOf()).not.toContain('resume')
    mocks.chat.mockClear()
    await ask({ ...TOOLS })
    expect(workflowActionsOf()).toContain('resume')
  })

  // 왜(검토 rev-flow 리드 6): 글 부탁에 "Writer 콘티에서 고쳐요"라고 안내한다 — 사람이 가자고 하면 채팅이 그 화면을 연다는 것을 AI 가 알아야 한다.
  it('Storyboard 채팅 AI 안내는 사람이 부탁하면 Writer 콘티 화면을 열 수 있다고 한다', async () => {
    await ask({ storyboardImages: true })
    expect(systemOf()).toMatch(/targetStage "?conti"?/)
  })

  // 왜(검토 rev-flow 리드 2 · architecture §3 모델 출력 무검증 실행 금지 · 오너 Q1): 모델이 대사 말고 다른 자원을 고치는 호출을 내면 서버가 거절 목록에 담는다 — 화면은 그 호출을 실행하지 않는다.
  //   대사 자원 고치기 호출은 넘긴다(대사 도구로 고친다).
  //   (2026-11-27 이름 바꿈 · 오너 Q1 — 옛 이름 'Storyboard 채팅 모델이 주지 않은 고치기 도구를 부르면 서버는 그 호출을 거절 목록에 담아 넘긴다')
  it('Storyboard 채팅 모델이 대사 말고 다른 자원(샷 · 씬)을 고치는 도구 호출을 내면 서버는 그 호출을 거절 목록에 담아 넘기고, 대사 고치기 호출은 넘긴다', async () => {
    mocks.chat.mockImplementation(async (...args: unknown[]) => {
      const opts = args[5] as { appTools?: { turn?: unknown } }
      if (opts.appTools) opts.appTools.turn = { stopReason: 'tool_use', content: [
        { type: 'tool_use', id: 'edit-1', name: 'edit_project', input: { resource: 'dialogue', id: 'sh_01_02', revision: 'r', patch: {} } },
        { type: 'tool_use', id: 'edit-2', name: 'edit_project', input: { resource: 'shots', id: 'sh_01_02', revision: 'r', patch: { actionDescription: 'x' } } },
        { type: 'tool_use', id: 'read-1', name: 'read_project', input: { resource: 'shots' } },
      ] }
      return ''
    })
    const res = await POST(new Request('http://localhost/api/writer/chat', { method: 'POST', body: JSON.stringify({ message: "@샷 2 대사를 '잘 가'로 바꿔 줘", projectId: 'p1', storyboardImages: true, ...TOOLS }) }))
    const json = (await res.json()) as { toolTurn?: unknown; rejectedToolCalls?: string[] }
    expect(json.toolTurn).toBeDefined()
    expect(json.rejectedToolCalls).toEqual(['edit-2'])
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
    expect(json.reply).not.toContain(STORY_NOTICE)
  })
})

describe('Storyboard 채팅은 대사를 고친다', () => {
  // 왜(검토 rev-flow-2-4 낮음 4): 모델이 대사 고침을 대사 도구 대신 답의 JSON 으로 내면 서버가 버린다 — "이야기 · 샷은 바꾸지 않아요"만으로는
  //   모델 답이 "대사를 바꿨어요"라고 해도 대사가 저장되지 않은 줄 모른다. 버린 고침에 대사가 있으면 그 말을 하고, 이야기 · 샷이 섞였으면 둘 다 말한다.
  it('Storyboard 채팅 답의 JSON 에 대사 고침이 섞여 와 버려지면 대사는 저장하지 않았다고 답 끝에 알리고, 이야기 · 샷 고침도 섞였으면 그 안내도 함께 붙인다', async () => {
    mocks.chat.mockResolvedValue(fenced('샷 2 대사를 바꿨어요.', [TEXT_EDIT]))
    const only = (await ask({ storyboardImages: true })).json
    expect(only.updates).toEqual([])
    expect(only.reply).toContain(DIALOGUE_NOT_SAVED)
    expect(only.reply).not.toContain(STORY_NOTICE)
    const mixed = { type: 'updateShot', id: 'sh_01_02', patch: { actionDescription: '새 이야기', dialogueLines: [{ characterId: 'mina', text: '잘 가' }] } }
    mocks.chat.mockResolvedValue(fenced('샷 2 이야기와 대사를 바꿨어요.', [mixed]))
    const both = (await ask({ storyboardImages: true })).json
    expect(both.reply).toContain(DIALOGUE_NOT_SAVED)
    expect(both.reply).toContain(STORY_NOTICE)
  })

  // 왜(#dialogue-language-chat): 콘티 채팅처럼 프로젝트 대사 언어로 대사를 쓴다 — 사람이 그 메시지에서 다른 말을 요구할 때만 그 말로.
  it('Storyboard 채팅 AI 안내도 프로젝트 대사 언어로 대사를 쓰라고 한다', async () => {
    mocks.settings = { dialogueLanguage: 'ko' }
    await ask({ storyboardImages: true })
    expect(systemOf()).toContain('[대사 언어]')
  })
})
