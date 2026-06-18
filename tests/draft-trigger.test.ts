import { describe, it, expect, vi, beforeEach } from 'vitest'

// 의존성 mock — vi.hoisted 로 호이스팅 안전하게 스파이 정의.
const { createGenerationJob, hasQueuedCharacterViewJob, falImageSubmit } = vi.hoisted(() => ({
  createGenerationJob: vi.fn(async (..._a: unknown[]) => ({})),
  hasQueuedCharacterViewJob: vi.fn(async (..._a: unknown[]) => false),
  falImageSubmit: vi.fn(async (..._a: unknown[]) => ({ request_id: 'req-1', model: 'openai/gpt-image-2' })),
}))

// chainable + thenable 빌더: await builder / .maybeSingle() / .limit() 모두 result 로 해석.
function tableBuilder(result: unknown) {
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    limit: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (res: (v: unknown) => void) => res(result),
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'characters')
        return tableBuilder({
          data: [
            { character_id: 'char_hero', name: '카이', role: 'protagonist', appearance: '은발 검사', costume: null, view_main: null },
          ],
        })
      if (table === 'projects') return tableBuilder({ data: { workspace_id: 'ws-1', design_tokens: null } })
      if (table === 'character_image_candidates') return tableBuilder({ data: [] })
      return tableBuilder({ data: null })
    },
  },
}))
vi.mock('@/lib/writer/llm/fal', () => ({ falImageSubmit: (...a: unknown[]) => falImageSubmit(...a) }))
vi.mock('@/lib/generation-jobs', () => ({
  createGenerationJob: (...a: unknown[]) => createGenerationJob(...a),
  hasQueuedCharacterViewJob: (...a: unknown[]) => hasQueuedCharacterViewJob(...a),
}))
vi.mock('@/lib/fal/webhook-url', () => ({ resolveWebhookUrl: () => undefined }))

import { triggerCharacterDrafts } from '@/lib/artist/draft-trigger'

beforeEach(() => {
  createGenerationJob.mockClear()
  hasQueuedCharacterViewJob.mockClear()
  falImageSubmit.mockClear()
})

describe('triggerCharacterDrafts — C1 서버 초안 (회귀: target.workspaceId)', () => {
  // 실 e2e 에서 발견된 회귀: target 에 workspaceId 누락 → webhook 도착 시 finalize 가
  //   "character_view job target missing workspaceId/characterId/column" 으로 실패 → 후보가 절대 생성 안 됨.
  it('createGenerationJob 의 target 에 workspaceId/characterId/view 를 채운다', async () => {
    const res = await triggerCharacterDrafts('proj-1')
    expect(createGenerationJob).toHaveBeenCalledTimes(1)
    const arg = createGenerationJob.mock.calls[0][0] as {
      kind: string
      target: { workspaceId?: string; characterId?: string; view?: string; column?: string }
    }
    expect(arg.kind).toBe('character_view')
    expect(arg.target.workspaceId).toBe('ws-1')
    expect(arg.target.characterId).toBe('char_hero')
    expect(arg.target.view).toBe('main')
    expect(arg.target.column).toBeTruthy()
    expect(res.submitted).toBe(1)
  })
})
