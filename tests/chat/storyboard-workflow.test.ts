// 채팅 화면 열기 도구가 Writer 콘티를 열 수 있고, Artist 는 레일과 같은 기준(연 단계)으로 열며, Storyboard 채팅은 Writer 실행을 다시 돌리지 않는지 검사한다 (오너 2026-11-27 N3 · N7 · O1, 검토 rev-flow 리드 결정 6 · 7 · 9)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ reached: 'writer' }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: (table: string) => {
  const query: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'update']) query[m] = () => query
  query.maybeSingle = async () => ({ data: { id: 'p', current_stage: db.reached, producer_draft: null, story_text: 'saved story', settings: {}, style_anchor_key: 'real' }, error: null })
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ count: table === 'scenes' ? 1 : 2, error: null }).then(resolve)
  return query
} }) }))
import { createStudioWorkflow } from '@/stores/chat-workflow-bindings'
import { useProjectStore as project } from '@/stores/project-store'

// 그림이 아직 하나도 없는 프로젝트(새 흐름 — 그림은 Artist [이미지 만들기]로 만든다).
const noPictures = { images_ready: false, chars_ready: 0, chars_total: 1, worlds_ready: 0, worlds_total: 1, queued_count: 0, failed_count: 0, stalled: false }
let runStatus = 'completed'
const fetchMock = vi.fn()
beforeEach(() => {
  db.reached = 'writer'
  runStatus = 'completed'
  project.getState().resetProject()
  project.setState({ projectId: 'p' })
  fetchMock.mockReset().mockImplementation(async (url: string) =>
    String(url).startsWith('/api/writer/resume')
      ? Response.json({ data: { action: 'resumed' } })
      : Response.json({ started: true, current_status: runStatus, assets: noPictures }),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const workflow = (stage: string, message: string) => {
  const navigate = vi.fn(async (target: string) => ({ status: 'navigation_requested', targetStage: target }))
  const run = createStudioWorkflow({ projectId: 'p', stage, message, signal: new AbortController().signal, isCurrent: () => true, requiresEdit: false, outcomes: () => [], navigate, handoff: vi.fn(async () => ({ status: 'approval_required' })) })
  return { run, navigate }
}
const call = (action: string, targetStage?: string) => ({ type: 'tool_use' as const, id: `${action}-${targetStage ?? ''}`, name: 'project_workflow', input: { action, ...(targetStage ? { targetStage } : {}) } })

describe('채팅 화면 열기 — Writer 콘티', () => {
  // 왜(리드 결정 6 · 오너 N3): Storyboard 채팅이 "글은 Writer 콘티에서 고쳐요"라고 안내한다 — 사람이 "콘티 열어줘"라고 하면 채팅이 그 화면을 연다.
  it('콘티를 연 프로젝트에서 "콘티 열어줘"라고 하면 채팅이 Writer 콘티 화면을 연다', async () => {
    const { run, navigate } = workflow('writer', '콘티 열어줘')
    const result = await run(call('open', 'conti'))
    expect(result.status).toBe('navigation_requested')
    expect(navigate).toHaveBeenCalledWith('conti')
  })

  // 왜(정상 경로 고정): 아직 열지 않은 화면은 채팅으로도 열지 않는다(레일 · 다음 단추와 같은 순서).
  it('콘티를 아직 열지 않은 프로젝트는 채팅이 콘티를 열지 않는다', async () => {
    db.reached = 'producer'
    const { run, navigate } = workflow('producer', '콘티 열어줘')
    const result = await run(call('open', 'conti'))
    expect(result.status).toBe('blocked')
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('채팅 화면 열기 — Artist 는 레일과 같은 기준', () => {
  // 왜(리드 결정 9 · 오너 N7 · O1): 새 흐름은 그림을 Artist 에서 만든다 — 그림이 다 있어야만 채팅이 Artist 를 열면, 레일로는 열리는 Artist 를 채팅은 못 연다.
  it('Artist 를 연 프로젝트면 그림이 아직 없어도 채팅이 Artist 를 연다', async () => {
    db.reached = 'artist'
    const { run, navigate } = workflow('conti', 'Artist 열어줘')
    const status = await run(call('status'))
    expect((status as { state?: { allowedStages?: string[] } }).state?.allowedStages).toContain('artist')
    const result = await run(call('open', 'artist'))
    expect(result.status).toBe('navigation_requested')
    expect(navigate).toHaveBeenCalledWith('artist')
  })
})

describe('Storyboard 채팅은 Writer 실행을 다시 돌리지 않는다', () => {
  // 왜(리드 결정 7 · 오너 N3 "실사 고치기만"): 씬 · 샷을 다시 나누는 Writer 실행은 콘티의 일이다 — Storyboard 채팅이 다시 돌리면 보고 있는 샷이 바뀐다.
  it('Storyboard 채팅에서 실행을 재개해 달라고 해도 다시 돌리지 않고 Writer 콘티에서 하라고 알린다', async () => {
    runStatus = 'failed'
    const { run } = workflow('writer', '실행 재개해줘')
    const result = await run(call('resume'))
    expect(result.status).toBe('unsupported')
    expect(String(result.message)).toMatch(/rough storyboard/i)
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/writer/resume'))).toBe(false)
  })

  // 왜(정상 경로 고정): 콘티 채팅은 지금처럼 멈춘 실행을 다시 돌릴 수 있다.
  it('콘티 채팅은 지금처럼 멈춘 Writer 실행을 다시 돌린다', async () => {
    runStatus = 'failed'
    const { run } = workflow('conti', '실행 재개해줘')
    await run(call('resume'))
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/writer/resume'))).toBe(true)
  })
})
