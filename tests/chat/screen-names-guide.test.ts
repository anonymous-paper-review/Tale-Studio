// 채팅 AI 에게 주는 지시문 · 도구 안내 · 현황 스냅샷은 사용자가 보는 화면 이름과 순서(Producer 시작 → Writer 산문 → Artist → Storyboard → Director → Editor)로 말한다 (리드 2026-11-14 D · H-3)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: { id: 'p', current_stage: 'artist', producer_draft: null, story_text: 'saved story', settings: {}, style_anchor_key: 'watercolor' }, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: table === 'scenes' ? 0 : 0, error: null }).then(resolve),
      }
      return query
    },
  }),
}))

import { readFileSync } from 'node:fs'
import { lockedProducerDirective, treatmentDraftDirective } from '@/app/api/produce/chat/preserve-context'
import { CHAT_AGENT_GUIDE } from '@/lib/chat-harness'
import { CHAT_TOOL_GUIDE, prepareChatTools } from '@/lib/chat-tools/protocol'
import { createStudioWorkflow } from '@/stores/chat-workflow-bindings'
import { useProjectStore } from '@/stores/project-store'

const assets = { images_ready: true, chars_ready: 1, chars_total: 1, worlds_ready: 1, worlds_total: 1, queued_count: 0, failed_count: 0, stalled: false }

beforeEach(() => {
  useProjectStore.getState().resetProject()
  useProjectStore.setState({ projectId: 'p' })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ started: false, current_status: null, assets })))
})
afterEach(() => vi.unstubAllGlobals())

const options = () => ({ projectId: 'p', stage: 'artist', message: '상태 알려줘', signal: new AbortController().signal, isCurrent: () => true, requiresEdit: false, outcomes: () => [], navigate: vi.fn(async () => ({ status: 'navigation_requested' })), handoff: vi.fn(async () => ({ status: 'approval_required' })) })

describe('지시문 · 도구 안내', () => {
  it('Producer · Writer · Storyboard · Artist 채팅이 함께 받는 지시문에 화면 순서가 적히고 Artist 다음은 Storyboard 다', () => {
    // 왜: Artist 채팅이 "다음은 Director"라고 안내하고 "Writer 단계가 아직 시작되지 않았다"고 말했다(11/14 채팅 점검 D · H). 화면 이름과 순서를 모르는 채 옛 이름으로 답했다.
    expect(CHAT_AGENT_GUIDE).toContain('Producer (the start screen), Writer (the prose), Artist, Storyboard (scenes and shots), Director, Editor')
    expect(CHAT_AGENT_GUIDE).toContain('After Artist the next screen is Storyboard, never Director.')
    for (const route of ['produce', 'writer', 'artist']) {
      expect(readFileSync(`src/app/api/${route}/chat/route.ts`, 'utf8')).toContain('CHAT_AGENT_GUIDE')
    }
  })

  it('도구 안내가 도구 대상 이름과 화면 이름의 짝을 적고 Artist 다음은 Storyboard 라고 적는다', () => {
    // 왜: 도구는 producer · writer 라는 옛 이름을 쓴다 — producer 는 Writer 산문 화면, writer 는 Storyboard 화면이다.
    expect(CHAT_TOOL_GUIDE).toContain('targetStage "producer" is the Writer screen (the prose)')
    expect(CHAT_TOOL_GUIDE).toContain('"writer" is the Storyboard screen (scenes and shots)')
    expect(CHAT_TOOL_GUIDE).toContain('The next screen after Artist is Storyboard, not Director.')
    const tool = prepareChatTools('artist', true, [], true)?.tools.find((t) => t.name === 'project_workflow')
    expect(tool?.description).toContain('Storyboard')
  })

  it('잠긴 산문 지시문은 "Writer 로 넘겼다"가 아니라 산문을 확정했다고 지금 화면 이름으로 말한다', () => {
    // 왜: 옛 말 "handed over to Writer"가 그대로 답으로 나가 "Producer 가 잠겼다"가 되었다. 지금은 산문(Writer 화면)을 확정하면 잠기고 Artist 가 열린다.
    const directive = lockedProducerDirective(true)!
    expect(directive).toContain('[Locked Producer]')
    expect(directive).not.toContain('handed over to Writer')
    expect(directive).toContain('confirmed the prose on the Writer screen')
    expect(directive).toContain('Artist screen')
    expect(directive).toContain('Storyboard screen')
    expect(lockedProducerDirective(false)).toBeNull()
  })

  it('산문 초안 지시문은 지금 Writer 화면의 길(채팅 · Rewrite · 직접 고치기 · Run breakdown)로 말한다', () => {
    // 왜: "Producer 화면 아래 · Hand over to Writer 단추"는 옛 화면이다.
    const directive = treatmentDraftDirective(true)!
    expect(directive).not.toContain('Hand over to Writer')
    expect(directive).toContain('Writer screen')
    expect(directive).toContain('Run breakdown')
    expect(directive).toContain('Rewrite')
    expect(directive).toContain('Edit it myself')
  })

  it('프롬프트 산문에 소문자 단계 이름이 없다', () => {
    // 왜: 약속 A6 — AI 에게 주는 안내문 안의 단계 이름은 대문자로 쓴다(코드 식별자는 따옴표 안).
    const lowercase = /(^|[^A-Za-z0-9_./:='"`@[-])(writer|producer|artist|director)(?=$|[^A-Za-z0-9_./:='"`@\]-])/
    for (const text of [lockedProducerDirective(true)!, treatmentDraftDirective(true)!]) {
      for (const line of text.split('\n')) expect(line, line).not.toMatch(lowercase)
    }
  })
})

describe('현황 스냅샷', () => {
  it('현황 스냅샷에 화면 이름 표가 붙고 기존 키는 그대로다', async () => {
    // 왜: 스냅샷의 writer 는 Storyboard 의 씬 · 샷 실행인데 이름이 writer 라 AI 가 "Writer 단계가 시작되지 않았다"고 말했다. 키는 시험이 못 박아 그대로 두고 화면 이름을 덧붙인다.
    const result = await createStudioWorkflow(options())({ type: 'tool_use', id: 's', name: 'project_workflow', input: { action: 'status' } })

    expect(result).toMatchObject({
      status: 'ok',
      state: {
        writer: { started: false, savedScenes: 0, savedShots: 0 },
        screens: {
          order: 'Producer (start) > Writer (prose) > Artist > Storyboard (scenes and shots) > Director > Editor',
          producer: 'Writer screen (prose)',
          writer: 'Storyboard screen (scenes and shots)',
          artist: 'Artist screen',
        },
      },
    })
    expect((result as unknown as { state: { writer: { note: string } } }).state.writer.note).toContain('Storyboard')
  })
})
