// 채팅 도구(프로젝트 진행)가 콘티를 포함한 단계 순서대로 화면을 열고 잠그는지 — 저장 단계가 콘티 · Artist 일 때 Storyboard 를 화면에서만 먼저 열지 않는지 검사한다 (검토 rev-flow 2026-11-26 2번)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 저장된 단계(projects.current_stage) — 도구가 읽고, 단계를 고칠 때만 쓴다.
const db = vi.hoisted(() => ({ stage: 'conti', writes: 0 }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      let patch: { current_stage?: string } | undefined
      const query = {
        select: () => query,
        eq: () => query,
        update: (value: { current_stage?: string }) => { patch = value; return query },
        maybeSingle: async () => {
          if (patch) { db.writes++; db.stage = patch.current_stage ?? db.stage }
          return { data: { id: 'p', current_stage: db.stage, producer_draft: null, story_text: 'saved story', settings: {}, style_anchor_key: 'watercolor' }, error: null }
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: table === 'scenes' ? 1 : 3, error: null }).then(resolve),
      }
      return query
    },
  }),
}))

import { createStudioWorkflow } from '@/stores/chat-workflow-bindings'
import { useProjectStore as project } from '@/stores/project-store'
import type { ToolCall } from '@/lib/chat-tools/protocol'

// 산문을 확정해 실행이 이어졌고(초안 아님) 씬 · 샷 나누기가 끝난 프로젝트 — 인물 · 배경 그림도 다 있다.
const assets = { images_ready: true, chars_ready: 1, chars_total: 1, worlds_ready: 1, worlds_total: 1, queued_count: 0, failed_count: 0, stalled: false }
const navigate = vi.fn(async () => ({ status: 'navigation_requested' as const }))
const workflow = (message: string) => createStudioWorkflow({
  projectId: 'p', stage: 'conti', message, signal: new AbortController().signal, isCurrent: () => true, requiresEdit: false, outcomes: () => [],
  navigate, handoff: vi.fn(async () => ({ status: 'approval_required' as const })),
})
const call = (input: Record<string, unknown>): ToolCall => ({ type: 'tool_use', id: `c-${String(input.action)}`, name: 'project_workflow', input })
/** 현황 결과의 "열 수 있는 화면" 목록. */
const allowedOf = (result: unknown) => (result as { state: { allowedStages: string[] } }).state.allowedStages

beforeEach(() => {
  db.stage = 'conti'
  db.writes = 0
  navigate.mockClear()
  project.getState().resetProject()
  project.setState({ projectId: 'p', currentStage: 'conti' })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ started: true, draft: false, current_status: 'completed', current_stage: 'persistShots', pipeline_completed: true, assets })))
})
afterEach(() => vi.unstubAllGlobals())

describe('콘티를 넣은 단계 순서', () => {
  // 왜: O1 — Storyboard 는 Artist [완료하기]가 연다. 콘티에서는 실행이 이어졌다는 것만으로 채팅 도구가 Storyboard 를 열 수 있다고 보고
  //   화면에서만 열어, 단계 저장 없이 Artist · Storyboard 가 열렸다(검토 rev-flow 2번).
  it('저장 단계가 콘티면 이어진 실행이 있어도 채팅 도구는 Storyboard 를 열 수 있다고 하지 않고, 열어 달라고 해도 열지 않는다', async () => {
    const status = await workflow('지금 상태 알려줘')(call({ action: 'status' }))
    expect(status).toMatchObject({ status: 'ok' })
    expect(allowedOf(status)).not.toContain('writer')

    const opened = await workflow('Storyboard 화면 열어줘')(call({ action: 'open', targetStage: 'writer' }))
    expect(opened.status).toBe('blocked')
    expect(navigate).not.toHaveBeenCalled()
    expect(db.writes).toBe(0)
  })

  // 왜: 같은 까닭 — 새로고침이 화면을 Storyboard 까지 열면 콘티의 [Artist로 가기]가 "이미 열렸다"며 단계를 저장하지 않았다(검토 rev-flow 2번).
  it('저장 단계가 콘티면 채팅 도구가 새로고침해도 화면은 콘티까지만 열린다', async () => {
    await workflow('상태를 새로고침해줘')(call({ action: 'refresh' }))
    expect(project.getState().canNavigateTo('conti')).toBe(true)
    expect(project.getState().canNavigateTo('artist')).toBe(false)
    expect(project.getState().canNavigateTo('writer')).toBe(false)
    expect(db.writes).toBe(0)
  })

  // 왜: Artist 는 콘티 다음, Storyboard 앞이다 — 저장 단계가 Artist 인데 Storyboard 를 열면 [완료하기]의 그림 확인을 건너뛴다.
  it('저장 단계가 Artist 면 채팅 도구는 Artist 는 열지만 Storyboard 는 열지 않는다', async () => {
    db.stage = 'artist'
    const status = await workflow('지금 상태 알려줘')(call({ action: 'status' }))
    const allowed = allowedOf(status)
    expect(allowed).toContain('artist')
    expect(allowed).not.toContain('writer')
  })

  // 왜(혼자 정한 것): 단계 순서표가 예전 순서(Storyboard 가 Artist 앞)라 Storyboard 에서 채팅으로 Artist 를 열 수 없었다 — 레일에서는 열리는 앞 단계다.
  it('저장 단계가 Storyboard 면 채팅 도구는 그 앞 단계인 Artist 도 연다', async () => {
    db.stage = 'writer'
    const status = await workflow('지금 상태 알려줘')(call({ action: 'status' }))
    const allowed = allowedOf(status)
    expect(allowed).toEqual(expect.arrayContaining(['producer', 'artist', 'writer']))
  })
})
