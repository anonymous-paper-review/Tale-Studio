// 실행 기록과 저장 산출물을 구분하고 실제 화면 진입 상태를 함께 갱신한다
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ countError: false, reached: 'producer', writes: 0, concurrentStage: '', failStageWrite: false }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: (table: string) => {
  let patch: { current_stage?: string } | undefined
  const filters: Record<string, unknown> = {}
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query }, update: (value: { current_stage?: string }) => { patch = value; return query },
    maybeSingle: async () => {
      if (patch) {
        db.writes++
        if (db.failStageWrite) return { data: null, error: { message: 'save failed' } }
        if (db.concurrentStage) db.reached = db.concurrentStage
        if (filters.current_stage !== db.reached) return { data: null, error: null }
        db.reached = patch.current_stage!
      }
      return { data: { id: 'p', current_stage: db.reached, producer_draft: null, story_text: 'saved story', settings: {}, style_anchor_key: 'watercolor' }, error: null }
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: table === 'scenes' ? 1 : 2, error: db.countError ? { message: 'count failed' } : null }).then(resolve),
  };return query
} }) }))
import { createStudioWorkflow } from '@/stores/chat-workflow-bindings'
import { useProjectStore as project } from '@/stores/project-store'
const assets = { images_ready: true, chars_ready: 1, chars_total: 1, worlds_ready: 1, worlds_total: 1, queued_count: 0, failed_count: 0, stalled: false }
beforeEach(() => { db.countError = false;db.reached = 'producer';db.writes = 0;db.concurrentStage = '';db.failStageWrite = false;project.getState().resetProject();project.setState({ projectId: 'p' });vi.stubGlobal('fetch', vi.fn(async () => Response.json({ started: false, current_status: null, assets }))) })
afterEach(() => vi.unstubAllGlobals())
const options = () => ({ projectId: 'p', stage: 'writer', message: 'Writer 화면 열어줘', signal: new AbortController().signal, isCurrent: () => true, requiresEdit: false, outcomes: () => [], navigate: vi.fn(async () => ({ status: 'navigation_requested' })), handoff: vi.fn(async () => ({ status: 'approval_required' })) })
it('실행 기록이 없어도 저장된 씬과 샷의 개수를 반환한다', async () => {
  // 왜: DEV 복제 프로젝트에서 실행 기록이 없다는 이유로 대본도 없다고 답했던 실측 오류.
  const result = await createStudioWorkflow(options())({ type: 'tool_use', id: 's', name: 'project_workflow', input: { action: 'status' } })
  expect(result).toMatchObject({ status: 'ok', state: { writer: { started: false, savedScenes: 1, savedShots: 2 } } })
})
it('저장 산출물 개수를 조회하지 못하면 0개로 바꾸지 않는다', async () => {
  // 왜: 조회 실패는 산출물이 없다는 증거가 아니다.
  db.countError = true
  expect((await createStudioWorkflow(options())({ type: 'tool_use', id: 's', name: 'project_workflow', input: { action: 'status' } })).status).toBe('read_failed')
})
it('기존 실행을 조회한 뒤 새로고침하면 실제 Writer 화면 잠금도 풀린다', async () => {
  // 왜: 상태 도구는 열 수 있다고 하는데 화면 게이트는 되돌리는 상태를 막는다.
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ started: true, current_status: 'completed', assets })))
  await createStudioWorkflow({ ...options(), message: '상태를 새로고침해줘' })({ type: 'tool_use', id: 'r', name: 'project_workflow', input: { action: 'refresh' } })
  expect(project.getState().canNavigateTo('writer')).toBe(true)
  expect(db.writes).toBe(0)
})
it.each(['', 'director'])('기존 실행을 열 때 단계 저장을 복구하되 다른 세션의 더 뒤 단계를 낮추지 않는다: %s', concurrent => {
  // 왜: 시작 접수 뒤 단계 저장만 실패했어도 새로고침 때 다시 잠기면 안 된다.
  db.concurrentStage = concurrent
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ started: true, current_status: 'completed', assets })))
  return createStudioWorkflow(options())({ type: 'tool_use', id: 'o', name: 'project_workflow', input: { action: 'open', targetStage: 'writer' } }).then(result => {
    expect(result.status).toBe('navigation_requested')
    expect(db.reached).toBe(concurrent || 'writer')
    expect(db.writes).toBe(1)
  })
})
it('단계 복구 저장이 실패하면 화면 도착을 요청하지 않는다', async () => {
  // 왜: 저장되지 않은 잠금 해제를 성공처럼 안내하면 새로고침 뒤 원상복귀된다.
  db.failStageWrite = true
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ started: true, current_status: 'completed', assets })))
  const opts = options()
  const result = await createStudioWorkflow(opts)({ type: 'tool_use', id: 'o', name: 'project_workflow', input: { action: 'open', targetStage: 'writer' } })
  expect(result.status).toBe('failed')
  expect(opts.navigate).not.toHaveBeenCalled()
})
