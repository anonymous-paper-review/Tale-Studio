// 사용자가 쓰는 언어를 따라 프로젝트와 답변 언어를 안전하게 맞춘다 (#chat-locale-follow 2026-08-31)
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 발화 언어 추종 (#chat-locale-follow 2026-08-31) — produce/chat 의 locale 채택 계약.
//
// 실사고: user_metadata.locale 미저장 계정의 프로젝트가 en 으로 박혀, 한국어로 말 거는
//   사용자에게 채팅 전체가 영어로 나갔다. 이 테스트는 그 수리의 세 가지 경계를 잠근다:
//   ① 한글 발화 + 비-ko 프로젝트 → ko 채택(저장 + 이번 턴 directive + contentLocale 응답)
//   ② 비대칭 — 영어 발화는 ko 프로젝트를 en 으로 강등하지 않는다(en 은 감지 폴백이라 약한 신호)
//   ③ writer 산출물이 있으면 채택하지 않는다(기존 콘텐츠와 언어가 섞이면 안 된다)

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  llmChat: vi.fn(),
  buildProducerSystem: vi.fn(),
  parseExtractedSettings: vi.fn(),
  parseChatChoices: vi.fn(),
  fetchProjectLocaleState: vi.fn(),
  updateProjectLocale: vi.fn(),
  responseLanguageDirective: vi.fn(),
  sanitizeAttachmentUrls: vi.fn(),
  listStyleAnchorMediums: vi.fn(),
  getProjectReferenceId: vi.fn(),
  buildReferenceDigest: vi.fn(),
}))

vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llmChat }))
vi.mock('@/app/api/produce/chat/system-prompt', () => ({
  buildProducerSystem: mocks.buildProducerSystem,
}))
vi.mock('@/lib/parse-extracted-settings', () => ({
  parseExtractedSettings: mocks.parseExtractedSettings,
}))
vi.mock('@/lib/chat-choices', () => ({ parseChatChoices: mocks.parseChatChoices }))
vi.mock('@/lib/chat-format', () => ({
  fetchProjectLocaleState: mocks.fetchProjectLocaleState,
  updateProjectLocale: mocks.updateProjectLocale,
  responseLanguageDirective: mocks.responseLanguageDirective,
  CHAT_OUTPUT_FORMAT_GUIDE: '',
}))
vi.mock('@/lib/upload/attachment', () => ({
  sanitizeAttachmentUrls: mocks.sanitizeAttachmentUrls,
}))
vi.mock('@/lib/style-anchor', () => ({
  listStyleAnchorMediums: mocks.listStyleAnchorMediums,
  listStyleAnchorCatalog: async () => [],
}))
vi.mock('@/lib/i18n/translate', () => ({ translate: (_locale: string, text: string) => text }))
vi.mock('@/lib/reference-import', () => ({
  getProjectReferenceId: mocks.getProjectReferenceId,
  buildReferenceDigest: mocks.buildReferenceDigest,
}))

import { POST } from '@/app/api/produce/chat/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'owner' })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.llmChat.mockResolvedValue('plain reply')
  mocks.buildProducerSystem.mockReturnValue('producer system')
  mocks.parseExtractedSettings.mockReturnValue({
    reply: 'plain reply',
    extractedSettings: null,
  })
  mocks.parseChatChoices.mockReturnValue({ reply: 'plain reply', choices: [] })
  mocks.fetchProjectLocaleState.mockResolvedValue({ locale: 'en', writerRan: false })
  mocks.updateProjectLocale.mockResolvedValue(true)
  mocks.responseLanguageDirective.mockReturnValue('')
  mocks.sanitizeAttachmentUrls.mockReturnValue({ urls: [], truncated: false })
  mocks.listStyleAnchorMediums.mockResolvedValue([])
  mocks.getProjectReferenceId.mockResolvedValue(null)
})

describe('대화 응답은 사용자가 쓰는 언어를 따른다', () => {
  it('한국어로 말하면 프로젝트 언어를 한국어로 바꾸고 바로 한국어로 답한다', async () => {
    const response = await POST(request({ projectId: 'p1', message: '한글로도 되나요?' }))

    expect(response.status).toBe(200)
    expect(mocks.updateProjectLocale).toHaveBeenCalledWith('p1', 'ko')
    // 이번 턴의 프롬프트·directive 가 이미 ko 로 구성된다 — 다음 턴이 아니라.
    expect(mocks.buildProducerSystem).toHaveBeenCalledWith('ko')
    expect(mocks.responseLanguageDirective).toHaveBeenCalledWith('ko')
    const body = await response.json()
    expect(body.contentLocale).toBe('ko')
  })

  it('영어로 말해도 이미 정한 한국어 응답을 영어로 바꾸지 않는다 (비대칭)', async () => {
    mocks.fetchProjectLocaleState.mockResolvedValue({ locale: 'ko', writerRan: false })

    const response = await POST(request({ projectId: 'p1', message: 'make it a thriller' }))

    expect(response.status).toBe(200)
    expect(mocks.updateProjectLocale).not.toHaveBeenCalled()
    expect(mocks.responseLanguageDirective).toHaveBeenCalledWith('ko')
    const body = await response.json()
    expect(body.contentLocale).toBe('ko')
  })

  it('영어로 말한 프로젝트는 한국어로 바꾸지 않고 영어로 답한다', async () => {
    const response = await POST(request({ projectId: 'p1', message: 'make it a thriller' }))

    expect(response.status).toBe(200)
    expect(mocks.updateProjectLocale).not.toHaveBeenCalled()
    const body = await response.json()
    expect(body.contentLocale).toBe('en')
  })

  it('이미 작성된 내용이 있는 프로젝트는 한국어로 말해도 응답 언어를 바꾸지 않는다', async () => {
    mocks.fetchProjectLocaleState.mockResolvedValue({ locale: 'en', writerRan: true })

    const response = await POST(request({ projectId: 'p1', message: '주인공을 더 어둡게 바꿔줘' }))

    expect(response.status).toBe(200)
    expect(mocks.updateProjectLocale).not.toHaveBeenCalled()
    expect(mocks.responseLanguageDirective).toHaveBeenCalledWith('en')
  })

  it('언어 저장에 실패하면 바뀐 언어로 답하지 않는다', async () => {
    mocks.updateProjectLocale.mockResolvedValue(false)

    const response = await POST(request({ projectId: 'p1', message: '한글로 해주세요' }))

    expect(response.status).toBe(200)
    expect(mocks.responseLanguageDirective).toHaveBeenCalledWith('en')
    const body = await response.json()
    expect(body.contentLocale).toBe('en')
  })

  it('내 프로젝트가 아니면 언어를 확인하거나 바꾸지 않는다', async () => {
    mocks.userOwnsProject.mockResolvedValue(false)

    const response = await POST(request({ projectId: 'p1', message: '한글로 해주세요' }))

    expect(response.status).toBe(200)
    expect(mocks.fetchProjectLocaleState).not.toHaveBeenCalled()
    expect(mocks.updateProjectLocale).not.toHaveBeenCalled()
  })
})

function request(body: unknown): Request {
  return new Request('http://localhost/api/produce/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
