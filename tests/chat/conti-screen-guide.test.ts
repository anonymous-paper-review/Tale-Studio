// 채팅 AI 에게 주는 지시문 · 현황 스냅샷이 O1 흐름(산문 확정 → 콘티에서 씬 · 샷 나누기 · 고치기 → Artist → Storyboard)으로 화면을 말하는지 검사한다 (오너 2026-11-26 O1, 리드 구조 C)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { id: 'p', current_stage: 'conti', producer_draft: null, story_text: 'saved story', settings: {}, style_anchor_key: 'watercolor' }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: table === 'scenes' ? 0 : 0, error: null }).then(resolve),
      }
      return query
    },
  }),
}))

import { lockedProducerDirective } from '@/app/api/produce/chat/preserve-context'
import { CHAT_AGENT_GUIDE } from '@/lib/chat-harness'
import { createStudioWorkflow } from '@/stores/chat-workflow-bindings'
import { useProjectStore } from '@/stores/project-store'

const assets = { images_ready: true, chars_ready: 0, chars_total: 0, worlds_ready: 0, worlds_total: 0, queued_count: 0, failed_count: 0, stalled: false }

beforeEach(() => {
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'p' })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ started: true, current_status: 'running', assets })))
})
afterEach(() => vi.unstubAllGlobals())

describe('콘티 화면 안내', () => {
  // 왜: O1 — 산문을 확정하면 Artist 가 아니라 콘티(Writer 화면의 두 번째 칸)에서 씬 · 샷을 나누고 고친다. AI 가 옛 순서로 "Artist 로 가세요"라고 하면 틀린 길을 알려 준다.
  it('채팅 지시문은 산문을 확정하면 씬 · 샷을 바로 나누고 콘티에서 고친 뒤 Artist 로 간다고 말한다', () => {
    expect(CHAT_AGENT_GUIDE).toContain('Producer (the start screen), Writer (the prose, then the rough storyboard), Artist, Storyboard (scenes and shots), Director, Editor')
    expect(CHAT_AGENT_GUIDE).toContain('When the user confirms the prose on the Writer screen, the prose is locked and the scenes and shots are split right away on the rough storyboard')
    expect(CHAT_AGENT_GUIDE).toContain('The next screen after the rough storyboard is Artist')
    // 한국어로 답할 때 부를 화면 이름(오너 W2 "콘티").
    expect(CHAT_AGENT_GUIDE).toContain('"콘티"')
    expect(CHAT_AGENT_GUIDE).not.toContain('the prose is locked and Artist opens')
  })

  // 왜(혼자 정한 것): 확정 뒤 씬 스토리 채팅이 "씬 · 샷은 Storyboard 가 열리면 고칠 수 있다"고 하면 콘티를 건너뛰게 한다.
  it('산문을 확정한 뒤의 씬 스토리 채팅 지시문은 씬 · 샷 · 대사를 Writer 화면의 콘티에서 고친다고 말한다', () => {
    const directive = lockedProducerDirective(true) ?? ''
    expect(directive).toContain('scenes, shots and dialogue can still be edited on the rough storyboard of the Writer screen')
    expect(directive).not.toContain('edited on the Storyboard screen once it opens')
  })

  // 왜(혼자 정한 것): 저장 단계가 conti 인 프로젝트의 현황을 읽은 AI 가 그 이름을 화면 이름으로 바꿔 말해야 한다.
  it('현황 스냅샷의 화면 이름 표에 콘티가 있고 순서가 O1 흐름이다', async () => {
    const workflow = createStudioWorkflow({ projectId: 'p', stage: 'conti', message: '상태 알려줘', signal: new AbortController().signal, isCurrent: () => true, requiresEdit: false, outcomes: () => [], navigate: vi.fn(async () => ({ status: 'navigation_requested' })), handoff: vi.fn(async () => ({ status: 'ok' })) } as never)
    const result = await workflow({ type: 'tool_use', id: 's', name: 'project_workflow', input: { action: 'status' } })
    expect(result).toMatchObject({
      status: 'ok',
      state: {
        reachedStage: 'conti',
        screens: {
          order: 'Producer (start) > Writer (prose, then rough storyboard) > Artist > Storyboard (scenes and shots) > Director > Editor',
          conti: 'Writer screen (rough storyboard: scenes, shots and rough sketches)',
        },
      },
    })
  })
})
