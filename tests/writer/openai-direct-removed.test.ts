// 글 파이프라인은 OpenAI 로 직접 요청을 보내지 않는다 (개인정보처리방침이 적은 외부 업체 목록에 OpenAI 가 없다)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const mocks = vi.hoisted(() => ({ gemini: vi.fn(), claude: vi.fn(), local: vi.fn() }))
vi.mock('@/lib/writer/llm/gemini', () => ({ geminiGenerateJson: mocks.gemini }))
vi.mock('@/lib/writer/llm/claude', () => ({ claudeGenerateJson: mocks.claude }))
vi.mock('@/lib/writer/llm/local', () => ({ localGenerateJson: mocks.local }))

import { generateJson, DEFAULT_MODELS, type LlmProvider } from '@/lib/writer/llm/dispatch'

const LLM_DIR = path.join(process.cwd(), 'src/lib/writer/llm')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('글 파이프라인의 외부 업체', () => {
  it('OpenAI 로는 요청을 보내지 않는다', async () => {
    // 왜: 예전 요청 본문(models)이나 옛 스크립트가 'openai' 를 흘려 넣어도 서버가 조용히 api.openai.com 으로 원고를 보내면 안 된다.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      await expect(
        generateJson('프롬프트', { provider: 'openai' as unknown as LlmProvider, model: 'gpt-5-mini' }),
      ).rejects.toThrow(/openai/)
    } finally {
      vi.unstubAllGlobals()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mocks.gemini).not.toHaveBeenCalled()
    expect(mocks.claude).not.toHaveBeenCalled()
    expect(mocks.local).not.toHaveBeenCalled()
  })

  it('서버 기본 모델은 Gemini 와 Claude 뿐이다', () => {
    // 왜: 기본값에 OpenAI 가 들어오면 아무 요청에서나 방침에 없는 업체로 원고가 나간다.
    expect(Object.values(DEFAULT_MODELS).map((m) => m.provider).sort()).toEqual(['claude', 'gemini', 'gemini'])
  })

  it('OpenAI 를 직접 부르는 글 모듈이 없다', () => {
    // 왜: 파일이 다시 생기면 타입·분기와 무관하게 누군가 직접 임포트해 쓸 수 있다.
    const files = fs.readdirSync(LLM_DIR).filter((f) => f.endsWith('.ts'))
    expect(files).not.toContain('openai.ts')
    const offenders = files.filter((f) => fs.readFileSync(path.join(LLM_DIR, f), 'utf8').includes('api.openai.com'))
    expect(offenders).toEqual([])
  })
})
