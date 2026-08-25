import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  llmChat: vi.fn(),
  buildProducerSystem: vi.fn(),
  parseExtractedSettings: vi.fn(),
  parseChatChoices: vi.fn(),
  fetchProjectLocale: vi.fn(),
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
  fetchProjectLocale: mocks.fetchProjectLocale,
  responseLanguageDirective: mocks.responseLanguageDirective,
  CHAT_OUTPUT_FORMAT_GUIDE: '',
}))
vi.mock('@/lib/upload/attachment', () => ({
  sanitizeAttachmentUrls: mocks.sanitizeAttachmentUrls,
}))
vi.mock('@/lib/style-anchor', () => ({
  listStyleAnchorMediums: mocks.listStyleAnchorMediums,
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
  mocks.fetchProjectLocale.mockResolvedValue('en')
  mocks.responseLanguageDirective.mockReturnValue('')
  mocks.sanitizeAttachmentUrls.mockReturnValue({
    urls: [],
    truncated: false,
  })
  mocks.listStyleAnchorMediums.mockResolvedValue([])
  mocks.getProjectReferenceId.mockResolvedValue('source')
})

describe('POST /api/produce/chat — reference digest context', () => {
  it('appends a read-only reference block after current project context', async () => {
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

  it('silently omits a missing or unauthorized reference digest', async () => {
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

  it('warns on system digest failure but keeps chat available', async () => {
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
