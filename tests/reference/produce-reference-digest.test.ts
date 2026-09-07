// Producer 대화에 참고 작품을 안전하게 활용하되, 현재 작품 내용과 권한을 지킨다
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  // D12: 카탈로그 블록은 이 테스트 관심사 밖 — 빈 목록이면 컨텍스트에 안 실린다.
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
  mocks.sanitizeAttachmentUrls.mockReturnValue({
    urls: [],
    truncated: false,
  })
  mocks.listStyleAnchorMediums.mockResolvedValue([])
  mocks.getProjectReferenceId.mockResolvedValue('source')
})

describe('Producer 대화에 참고 작품 정보를 안전하게 덧붙인다', () => {
  it('대화 결과에 사용량을 기록하되 실제 이야기 내용은 노출하지 않는다', async () => {
    mocks.llmChat.mockImplementationOnce(async (...args: unknown[]) => {
      const options = args[5] as {
        onUsage?: (usage: {
          model: string
          durationMs: number
          inputTokens: number
          outputTokens: number
          cacheReadInputTokens: number
          cacheCreationInputTokens: number
          stopReason: string | null
        }) => void
      }
      options.onUsage?.({
        model: 'claude-sonnet-4-6',
        durationMs: 42,
        inputTokens: 100,
        outputTokens: 12,
        cacheReadInputTokens: 80,
        cacheCreationInputTokens: 0,
        stopReason: 'end_turn',
      })
      return 'plain reply'
    })

    const response = await POST(
      request({
        projectId: 'current',
        message: 'Continue the story',
        storyText: 'Current story',
      }),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.trace).toMatchObject({
      stage: 'producer',
      route: 'produce/chat',
      historyCount: 0,
      contextChars: expect.any(Number),
      inputTokens: 100,
      outputTokens: 12,
      cacheReadInputTokens: 80,
      stopReason: 'end_turn',
    })
    expect(JSON.stringify(body.trace)).not.toContain('Current story')
  })

  it('현재 작품 설정 뒤에 참고 작품 정보를 읽기 전용으로 덧붙인다', async () => {
    mocks.buildReferenceDigest.mockResolvedValue(
      `[Referenced Project: Episode One] (read-only background from a referenced project — not the current project's cards)\n\nCast:\n- Mina`,
    )

    const response = await POST(
      request({
        projectId: 'current',
        message: 'Continue the story',
        storyText: 'Current story',
        currentSettings: { tone: 'quiet' },
      }),
    )

    expect(response.status).toBe(200)
    const prompt = mocks.llmChat.mock.calls[0][2] as string
    expect(prompt).toContain('[Current Story Text]\nCurrent story')
    expect(prompt).toContain('[Current Project Settings]')
    expect(prompt).toContain('[Referenced Project: Episode One]')
    expect(prompt.indexOf('[Current Project Settings]')).toBeLessThan(
      prompt.indexOf('[Referenced Project: Episode One]'),
    )
    expect(mocks.buildReferenceDigest).toHaveBeenCalledWith('source', 'owner')
  })

  it('참고 작품이 없거나 권한이 없으면 해당 정보를 조용히 제외한다', async () => {
    mocks.buildReferenceDigest.mockResolvedValue(null)

    const response = await POST(
      request({
        projectId: 'current',
        message: 'Continue the story',
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.llmChat.mock.calls[0][2]).not.toContain('[Referenced Project:')
  })

  it('참고 작품을 불러오지 못해도 대화는 계속 제공한다', async () => {
    mocks.buildReferenceDigest.mockRejectedValue(new Error('digest query failed'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await POST(
      request({
        projectId: 'current',
        message: 'Continue the story',
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.llmChat).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      '[produce/chat] reference digest skipped:',
      'digest query failed',
    )
    warn.mockRestore()
  })
})

function request(body: unknown): Request {
  return new Request('http://localhost/api/produce/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
