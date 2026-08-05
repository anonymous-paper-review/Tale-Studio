// 모더레이션 폴백(#moderation-fallback 2026-08-05) 회귀 — 실측 2d47b311: gemini 하드 필터
// (PROHIBITED_CONTENT)가 v4 씬 병렬 콜 1개를 죽여 런 전체가 실패하던 것.
//
// 계약:
//   1. gemini 가 PROHIBITED_CONTENT 로 죽으면 그 콜만 C축 기본(claude)으로 1회 재시도 —
//      대형 JSON 절단 방지를 위해 maxTokens 바닥 16k.
//   2. 그 외 오류는 폴백 없이 그대로 표면화 (일시 오류는 래퍼 재시도가 담당).
//   3. gemini 외 프로바이더 오류엔 폴백하지 않는다 (무한 루프/의미 왜곡 방지).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  gemini: vi.fn(),
  claude: vi.fn(),
  openai: vi.fn(),
  local: vi.fn(),
}))
vi.mock('@/lib/writer/llm/gemini', () => ({ geminiGenerateJson: mocks.gemini }))
vi.mock('@/lib/writer/llm/claude', () => ({ claudeGenerateJson: mocks.claude }))
vi.mock('@/lib/writer/llm/openai', () => ({ openaiGenerateJson: mocks.openai }))
vi.mock('@/lib/writer/llm/local', () => ({ localGenerateJson: mocks.local }))

import { generateJson, DEFAULT_MODELS } from '@/lib/writer/llm/dispatch'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('generateJson 모더레이션 폴백', () => {
  it('gemini PROHIBITED_CONTENT → claude 로 같은 콜 재시도 (maxTokens 바닥 16k)', async () => {
    mocks.gemini.mockRejectedValueOnce(new Error('Gemini stopped abnormally: PROHIBITED_CONTENT'))
    mocks.claude.mockResolvedValueOnce({ ok: true })

    const r = await generateJson('p', { provider: 'gemini', model: 'gemini-3-flash-preview' }, { maxTokens: 4096 })
    expect(r).toEqual({ ok: true })
    expect(mocks.claude).toHaveBeenCalledTimes(1)
    const claudeOpts = mocks.claude.mock.calls[0][1]
    expect(claudeOpts.model).toBe(DEFAULT_MODELS.C.model)
    expect(claudeOpts.maxTokens).toBe(16000)
  })

  it('gemini 의 다른 오류는 폴백 없이 그대로 던진다', async () => {
    mocks.gemini.mockRejectedValueOnce(new Error('Gemini stopped abnormally: MAX_TOKENS'))
    await expect(
      generateJson('p', { provider: 'gemini' }),
    ).rejects.toThrow('MAX_TOKENS')
    expect(mocks.claude).not.toHaveBeenCalled()
  })

  it('claude 프로바이더 오류엔 폴백하지 않는다', async () => {
    mocks.claude.mockRejectedValueOnce(new Error('PROHIBITED_CONTENT 비슷한 무언가'))
    await expect(
      generateJson('p', { provider: 'claude' }),
    ).rejects.toThrow()
    expect(mocks.claude).toHaveBeenCalledTimes(1)
    expect(mocks.gemini).not.toHaveBeenCalled()
  })
})
