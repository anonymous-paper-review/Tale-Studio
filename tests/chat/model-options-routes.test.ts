// 세 단계 채팅은 선택한 모델 설정을 전달하고 잘못된 선택은 호출 전에 거절한다
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ chat: vi.fn() }))
vi.mock('@/lib/supabase/auth', () => ({ getUser: async () => ({ id: 'owner', user_metadata: { locale: 'ko' } }) }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: async () => false }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.chat }))
vi.mock('@/lib/chat-format', () => ({ CHAT_OUTPUT_FORMAT_GUIDE: '', CHAT_UPDATES_BATCH_GUIDE: '', resolveChatLocale: vi.fn(), responseLanguageDirective: () => '' }))
vi.mock('@/lib/style-anchor', () => ({ listStyleAnchorCatalog: async () => [], listStyleAnchorMediums: async () => [] }))
vi.mock('@/lib/reference-import', () => ({ getProjectReferenceId: async () => null, buildReferenceDigest: async () => '' }))
vi.mock('@/lib/artist/chat-context', () => ({ buildArtistActivityContext: async () => '' }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))
import { POST as producer } from '@/app/api/produce/chat/route'
import { POST as writer } from '@/app/api/writer/chat/route'
import { POST as artist } from '@/app/api/artist/chat/route'

beforeEach(() => { mocks.chat.mockReset().mockResolvedValue('{"reply":"안녕하세요."}') })
describe.each([['Producer', producer], ['Writer', writer], ['Artist', artist]] as const)('%s 모델 옵션', (_stage, post) => {
  it('선택한 모델과 사고 설정을 채팅 호출에 전달한다', async () => {
    // 왜: 화면에 선택값만 보이고 실제 모델은 바뀌지 않는 경우를 막는다.
    const modelSettings = { model: 'claude-opus-4-6', effort: 'medium', thinking: 'adaptive' }
    const result = await post(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ message: '안녕', modelSettings }) }))
    expect(result.status).toBe(200)
    expect(mocks.chat.mock.calls[0][5]).toMatchObject({ modelSettings })
  })
  it.each([null, { model: 'unknown', effort: 'high', thinking: 'off' }, { model: 'claude-sonnet-4-6', effort: 4, thinking: false }])('지원하지 않는 옵션이면 모델을 호출하지 않는다 (%j)', async modelSettings => {
    // 왜: 잘못된 클라이언트 입력을 비용이 발생하는 공급자에게 넘기지 않는다.
    const result = await post(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ message: '안녕', modelSettings }) }))
    expect(result.status).toBe(400)
    expect(mocks.chat).not.toHaveBeenCalled()
  })
})
