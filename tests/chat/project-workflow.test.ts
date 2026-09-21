// 상태 조회와 화면 이동은 생성을 구분하고 미완료 수정·승인·실행 결과를 보존한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectWorkflow, type ProjectWorkflowSnapshot } from '@/lib/chat-tools/project-workflow'
import type { ToolOutcome } from '@/lib/chat-tools/protocol'
const snapshot = (): ProjectWorkflowSnapshot => ({ projectId: 'p', currentStage: 'producer', reachedStage: 'artist', allowedStages: ['producer', 'writer', 'artist'], producer: { canHandoff: true, blockers: [] }, writer: { started: true, status: 'completed' }, artist: { images_ready: true } })
let state: ProjectWorkflowSnapshot
let outcomes: ToolOutcome[]
let current: boolean
let deps: Parameters<typeof createProjectWorkflow>[0]
beforeEach(() => {
  state = snapshot();outcomes = [];current = true
  deps = { read: vi.fn(async () => state), refresh: vi.fn(async () => {}), navigate: vi.fn(async target => ({ status: 'navigation_requested', targetStage: target })), handoff: vi.fn(async () => ({ status: 'approval_required' })), resume: vi.fn(async () => ({ status: 'queued' })), authorized: () => true, isCurrent: () => current, outcomes: () => outcomes, requiresEdit: false }
})
const call = (action: string, targetStage?: string) => ({ type: 'tool_use' as const, id: 'workflow', name: 'project_workflow', input: { action, ...(targetStage ? { targetStage } : {}) } })
const edit = (status: string): ToolOutcome => ({ call: { type: 'tool_use', id: status, name: 'edit_project', input: { resource: 'shots', id: 'shot1', patch: { durationSeconds: 9 } } }, result: { status } })
describe('공통 프로젝트 작업', () => {
  it('상태만 물으면 저장하거나 실행을 재개하거나 화면을 이동하지 않는다', async () => {
    // 왜: 상태 확인 질문 자체가 비용이나 수정으로 이어지면 안 된다.
    expect((await createProjectWorkflow(deps)(call('status'))).status).toBe('ok')
    for (const fn of [deps.refresh, deps.navigate, deps.handoff, deps.resume]) expect(fn).not.toHaveBeenCalled()
  })
  it('화면 상태를 다시 불러오는 복구로 새 생성을 시작하지 않는다', async () => {
    // 왜: 서버는 완료인데 화면만 늦은 경우 기존 결과를 다시 조회하면 충분하다.
    await createProjectWorkflow(deps)(call('refresh'))
    expect(deps.refresh).toHaveBeenCalledOnce()
    expect(deps.handoff).not.toHaveBeenCalled();expect(deps.resume).not.toHaveBeenCalled()
  })
  it('이미 실행한 Writer를 열 때 원천을 다시 저장하거나 Writer를 새로 시작하지 않는다', async () => {
    // 왜: 단순한 화면 이동이 전체 재생성과 원천 덮어쓰기를 일으키면 안 된다.
    const run = createProjectWorkflow(deps)
    expect((await run(call('handoff', 'writer'))).status).toBe('navigation_requested')
    await run({ ...call('handoff', 'writer'), id: 'second-id' })
    expect(deps.navigate).toHaveBeenCalledOnce();expect(deps.handoff).not.toHaveBeenCalled()
  })
  it('아직 준비되지 않은 Artist 화면은 열렸다고 안내하지 않는다', async () => {
    // 왜: 채팅과 실제 화면 진입 조건이 달라 Producer로 되돌아오는 경우를 막는다.
    state.allowedStages = ['producer', 'writer'];state.artist = { images_ready: false }
    expect((await createProjectWorkflow(deps)(call('open', 'artist'))).status).toBe('blocked')
    expect(deps.navigate).not.toHaveBeenCalled()
  })
  it.each(['approval_required', 'failed', 'unknown_result'])('수정 결과가 %s이면 이동하지 않고 남은 작업을 보존한다', async status => {
    // 왜: 고치고 이동해 달라는 복합 요청에서 수정 실패나 승인 대기를 건너뛰면 안 된다.
    outcomes.push(edit(status));deps.requiresEdit = true
    expect((await createProjectWorkflow(deps)(call('open', 'artist'))).status).toBe('blocked')
    expect(deps.navigate).not.toHaveBeenCalled()
  })
  it('수정이 빠진 복합 요청은 먼저 수정하도록 돌려주고 저장된 뒤에는 이동한다', async () => {
    // 왜: 이동 도구를 먼저 선택한 모델도 원래 수정 요청을 생략할 수 없어야 한다.
    deps.requiresEdit = true;const run = createProjectWorkflow(deps)
    expect((await run(call('open', 'artist'))).status).toBe('blocked')
    outcomes.push(edit('ok'))
    expect((await run(call('open', 'artist'))).status).toBe('navigation_requested')
  })
  it('상태를 읽지 못하면 정보가 없다고 확정하거나 이동하지 않는다', async () => {
    // 왜: 조회 실패를 빈 프로젝트로 오인해 재생성하거나 단계를 열면 안 된다.
    vi.mocked(deps.read).mockRejectedValue(new Error('query failed'))
    expect((await createProjectWorkflow(deps)(call('open', 'artist'))).status).toBe('read_failed')
    expect(deps.navigate).not.toHaveBeenCalled()
  })
  it('새 Writer 시작은 기존 승인 경로를 거치며 준비 조건을 우회하지 않는다', async () => {
    // 왜: 모델이 도구를 골랐다는 이유만으로 생성 동의가 생기지 않는다.
    state.writer = { started: false, status: null };state.allowedStages = ['producer']
    state.producer = { canHandoff: false, blockers: ['그림체'] }
    const run = createProjectWorkflow(deps)
    expect((await run(call('handoff', 'writer'))).status).toBe('blocked')
    state.producer = { canHandoff: true, blockers: [] }
    expect((await run(call('handoff', 'writer'))).status).toBe('approval_required')
    expect(deps.handoff).toHaveBeenCalledOnce()
  })
  it('승인 대기 중인 Writer를 재개했다고 안내하지 않는다', async () => {
    // 왜: Writer resume의 noop 응답을 완료나 재개로 표시하면 승인 상태를 잃는다.
    state.writer = { started: true, status: 'awaiting_confirmation' }
    expect((await createProjectWorkflow(deps)(call('resume'))).status).toBe('blocked')
    expect(deps.resume).not.toHaveBeenCalled()
  })
  it('요청하지 않은 실행 재개와 다른 프로젝트에 도착한 응답은 실행하지 않는다', async () => {
    // 왜: 과거 제안이나 늦은 상태 응답이 현재 프로젝트의 실행 허락이 되어서는 안 된다.
    deps.authorized = () => false
    expect((await createProjectWorkflow(deps)(call('resume'))).status).toBe('blocked')
    current = false
    await expect(createProjectWorkflow(deps)(call('status'))).rejects.toMatchObject({ name: 'AbortError' })
    expect(deps.resume).not.toHaveBeenCalled()
  })
})
