// Producer 채팅은 공용 채팅 언어 규칙(v2)이 정한 언어로 답하고, 바뀐 언어를 화면에 알린다 (#chat-locale-follow v2, 2026-09-08 오너 결정)
//   왜: 종전(2026-08-31) 라우트 안의 한국어 한쪽 규칙을 네 라우트 공용 규칙(chat-format.resolveChatLocale)으로 바꿨다 —
//   결정 자체의 약속은 tests/chat/chat-locale-follow.test.ts 에 있고, 여기는 라우트가 그 결정을 쓰는지 잠근다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  userOwnsProject: vi.fn(),
  llmChat: vi.fn(),
  buildProducerSystem: vi.fn(),
  parseExtractedSettings: vi.fn(),
  parseChatChoices: vi.fn(),
  resolveChatLocale: vi.fn(),
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
  resolveChatLocale: mocks.resolveChatLocale,
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

function request(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/produce/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'owner', user_metadata: { locale: 'ko' } })
  mocks.userOwnsProject.mockResolvedValue(true)
  mocks.llmChat.mockResolvedValue('plain reply')
  mocks.buildProducerSystem.mockReturnValue('producer system')
  mocks.parseExtractedSettings.mockReturnValue({ reply: 'plain reply', extractedSettings: null })
  mocks.parseChatChoices.mockReturnValue({ reply: 'plain reply', choices: [] })
  mocks.resolveChatLocale.mockResolvedValue({ locale: 'ko', switched: null, reason: null })
  mocks.responseLanguageDirective.mockReturnValue('')
  mocks.sanitizeAttachmentUrls.mockReturnValue({ urls: [], truncated: false })
  mocks.listStyleAnchorMediums.mockResolvedValue([])
  mocks.getProjectReferenceId.mockResolvedValue(null)
})

describe('Producer 채팅과 언어 규칙', () => {
  it('채팅이 언어를 바꿨으면 그 턴의 지시서와 답변 언어부터 새 언어이고, 응답에 바뀐 언어를 실어 화면이 따라온다', async () => {
    // 왜: 다음 턴이 아니라 이번 턴부터 — 한 대화창에 두 언어가 섞이면 안 된다.
    mocks.resolveChatLocale.mockResolvedValue({ locale: 'en', switched: 'en', reason: 'explicit' })
    const response = await POST(request({ projectId: 'p1', message: '영어로 말해줘' }))
    expect(response.status).toBe(200)
    expect(mocks.buildProducerSystem).toHaveBeenCalledWith('en')
    expect(mocks.responseLanguageDirective).toHaveBeenCalledWith('en')
    const body = await response.json()
    expect(body.contentLocale).toBe('en')
    expect(body.localeSwitched).toBe('en')
  })

  it('바뀌지 않았으면 프로젝트 언어로 답하고 바뀐 언어 칸은 비어 있다', async () => {
    // 왜: 정상 경로 고정 — 안 바뀐 턴에 화면이 안내 줄을 남기면 안 된다.
    const response = await POST(request({ projectId: 'p1', message: '더 어둡게' }))
    expect(response.status).toBe(200)
    expect(mocks.responseLanguageDirective).toHaveBeenCalledWith('ko')
    const body = await response.json()
    expect(body.contentLocale).toBe('ko')
    expect(body.localeSwitched).toBeNull()
  })

  it('라우트는 지금 말·대화 기록·웹페이지 언어(없으면 계정 설정)를 언어 규칙에 넘긴다', async () => {
    // 왜: 규칙이 세 번 연속과 상속을 판단하려면 기록과 웹페이지 언어가 필요하다.
    await POST(request({ projectId: 'p1', message: 'hello there', history: [{ role: 'user', content: 'hi' }], uiLocale: 'en' }))
    expect(mocks.resolveChatLocale).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', message: 'hello there', history: [{ role: 'user', content: 'hi' }], uiLocale: 'en' }),
    )
    mocks.resolveChatLocale.mockClear()
    await POST(request({ projectId: 'p1', message: 'hello there' }))
    expect(mocks.resolveChatLocale).toHaveBeenCalledWith(expect.objectContaining({ uiLocale: 'ko' }))
  })

  it('내 프로젝트가 아니면 언어 규칙을 돌리지 않고 종전대로(미주입) 답한다', async () => {
    // 왜: 소유 확인 실패에서 남의 프로젝트 언어를 바꾸면 안 된다.
    mocks.userOwnsProject.mockResolvedValue(false)
    const response = await POST(request({ projectId: 'p1', message: 'hello there' }))
    expect(response.status).toBe(200)
    expect(mocks.resolveChatLocale).not.toHaveBeenCalled()
    const body = await response.json()
    expect(body.contentLocale).toBeNull()
  })
})
