// 감독 채팅이 바꿀 수 있는 영상 모델은 결제 심사 문서가 밝힌 처리 업체(fal) 카탈로그 모델뿐이다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  llmChat: vi.fn(),
  persistTrace: vi.fn(),
  userOwnsProject: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llmChat }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: mocks.persistTrace }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))

import { POST } from '@/app/api/director/chat/route'

function llmReply(updates: unknown[]): string {
  return `모델을 바꿨습니다.\n\n\`\`\`json\n${JSON.stringify({ updates })}\n\`\`\``
}

function chatRequest() {
  return new Request('http://test/api/director/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // canvasContext 가 있으면 캔버스 편집(agentic) 경로 — updates 화이트리스트가 돈다.
    body: JSON.stringify({ message: '이 샷 영상 모델 바꿔줘', canvasContext: 'Scene_01 > shot-1' }),
  })
}

async function updatesOf(updates: unknown[]): Promise<Array<{ type: string; patch?: Record<string, unknown> }>> {
  mocks.llmChat.mockResolvedValue(llmReply(updates))
  const response = await POST(chatRequest())
  expect(response.status).toBe(200)
  const body = await response.json() as { updates: Array<{ type: string; patch?: Record<string, unknown> }> }
  return body.updates
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(false)
  mocks.persistTrace.mockResolvedValue(undefined)
})

describe('감독 채팅의 영상 모델 변경', () => {
  // 왜: 2026-10-11 에 자체 호스팅(로컬) 영상 경로를 지웠다 — 채팅이 그 모델로 돌려놓을 수 있으면
  //   사용자 글이 심사 문서 밖 처리처로 나가는 길이 다시 열린다.
  it('감독 채팅이 로컬 영상 모델로 바꾸라고 해도 받아들이지 않는다', async () => {
    const updates = await updatesOf([
      { type: 'updateShot', id: 'dn_shot_1', patch: { label: 'river_gaze', provider: 'local' } },
    ])

    expect(updates).toHaveLength(1)
    expect(updates[0]!.patch).toEqual({ label: 'river_gaze' })
  })

  // 왜: 정상 경로 고정 — fal 카탈로그 모델 변경은 그대로 받아들여야 한다.
  it('감독 채팅이 fal 카탈로그 영상 모델로 바꾸라고 하면 받아들인다', async () => {
    const updates = await updatesOf([
      { type: 'updateShot', id: 'dn_shot_1', patch: { label: 'river_gaze', provider: 'kling' } },
    ])

    expect(updates[0]!.patch).toEqual({ label: 'river_gaze', provider: 'kling-o3' })
  })
})
