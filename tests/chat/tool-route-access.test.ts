// Producer·Artist·Writer 도구 채팅은 소유한 프로젝트가 아니면 모델을 호출하지 않는다.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  ownsProject: vi.fn(),
  llmChat: vi.fn(),
  resolveLocale: vi.fn(),
  activity: vi.fn(),
  adminFrom: vi.fn(),
  persistTrace: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.ownsProject }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llmChat }))
vi.mock('@/lib/chat-format', () => ({
  CHAT_OUTPUT_FORMAT_GUIDE: '',
  CHAT_UPDATES_BATCH_GUIDE: '',
  resolveChatLocale: mocks.resolveLocale,
  responseLanguageDirective: () => '',
}))
vi.mock('@/lib/style-anchor', () => ({
  listStyleAnchorCatalog: async () => [],
  listStyleAnchorMediums: async () => [],
}))
vi.mock('@/lib/reference-import', () => ({
  getProjectReferenceId: async () => null,
  buildReferenceDigest: async () => '',
}))
vi.mock('@/lib/artist/chat-context', () => ({ buildArtistActivityContext: mocks.activity }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: mocks.persistTrace }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.adminFrom } }))

import { POST as producerPost } from '@/app/api/produce/chat/route'
import { POST as artistPost } from '@/app/api/artist/chat/route'
import { POST as writerPost } from '@/app/api/writer/chat/route'

const routes = [
  { stage: 'Producer', path: 'produce', post: producerPost },
  { stage: 'Artist', path: 'artist', post: artistPost },
  { stage: 'Writer', path: 'writer', post: writerPost },
]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'owner', user_metadata: { locale: 'ko' } })
  mocks.ownsProject.mockResolvedValue(false)
  mocks.llmChat.mockResolvedValue('변경하지 않았습니다.')
  mocks.resolveLocale.mockResolvedValue({ locale: 'ko', switched: null })
  mocks.activity.mockResolvedValue('')
  mocks.adminFrom.mockImplementation(() => { throw new Error('접근 거절 전에 DB를 조회하면 안 됩니다.') })
})

describe.each(routes)('$stage 도구 채팅 접근 제한', ({ path, post }) => {
  it('프로젝트가 없는 도구 요청은 거절하고 모델을 호출하지 않는다', async () => {
    // 왜: 작업 대상의 소유권을 확인할 수 없는 요청에 앱 도구를 제공하면 안 된다.
    const response = await post(new Request(`http://localhost/api/${path}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '설정을 바꿔줘', chatTools: true, toolMessages: [] }),
    }))

    expect(response.status).toBe(403)
    expect(mocks.llmChat).not.toHaveBeenCalled()
    expect(mocks.ownsProject).not.toHaveBeenCalled()
    expect(mocks.resolveLocale).not.toHaveBeenCalled()
    expect(mocks.adminFrom).not.toHaveBeenCalled()
    expect(mocks.persistTrace).not.toHaveBeenCalled()
  })

  it('다른 사람의 프로젝트를 지정한 도구 요청은 거절하고 모델을 호출하지 않는다', async () => {
    // 왜: 클라이언트가 프로젝트 번호나 이전 도구 결과를 바꿔도 타인의 작업에 접근하면 안 된다.
    const response = await post(new Request(`http://localhost/api/${path}/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'foreign-project', message: '설정을 바꿔줘', chatTools: true,
        toolMessages: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'old-call', content: '{"status":"ok"}' }] }],
      }),
    }))

    expect(response.status).toBe(403)
    expect(mocks.ownsProject).toHaveBeenCalledWith('foreign-project', 'owner')
    expect(mocks.llmChat).not.toHaveBeenCalled()
    expect(mocks.resolveLocale).not.toHaveBeenCalled()
    expect(mocks.activity).not.toHaveBeenCalled()
    expect(mocks.adminFrom).not.toHaveBeenCalled()
    expect(mocks.persistTrace).not.toHaveBeenCalled()
  })
})
