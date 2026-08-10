// LLM 호출 전문 아카이브(#llm-archive 2026-08-10) 회귀.
//   계약: DB UUID 프로젝트만 기록 / 킬 스위치 / 본문 상한 / 실패는 삼키고 파이프라인을 막지 않는다.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { RawLlmCall } from '@/lib/writer/llm/raw_collector'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))

import { archiveRawCalls, llmArchiveEnabled } from '@/lib/writer/llm/archive-calls'

const PROJECT = '9d6efa6d-3216-40b0-8a2c-184ab56f02ec'

function call(over: Partial<RawLlmCall> = {}): RawLlmCall {
  return {
    seq: 1,
    timestamp: '2026-08-10T12:00:00.000Z',
    provider: 'gemini',
    model: 'gemini-3-flash',
    systemInstruction: 'you are a director',
    prompt: 'design the shots',
    response: '{"shots":[]}',
    duration_ms: 1234.6,
    input_chars: 16,
    output_chars: 12,
    ...over,
  }
}

beforeEach(() => {
  mocks.insert.mockReset().mockResolvedValue({ error: null })
  mocks.from.mockReset().mockReturnValue({ insert: mocks.insert })
  delete process.env.LLM_ARCHIVE_DISABLED
})

describe('archiveRawCalls', () => {
  it('호출 전문(system/prompt/response)과 계측을 그대로 기록한다', async () => {
    const n = await archiveRawCalls(PROJECT, 'shotDesign', [call()])

    expect(n).toBe(1)
    expect(mocks.from).toHaveBeenCalledWith('llm_calls')
    const [rows] = mocks.insert.mock.calls[0]
    expect(rows[0]).toMatchObject({
      project_id: PROJECT,
      stage: 'shotDesign',
      seq: 1,
      provider: 'gemini',
      system_instruction: 'you are a director',
      prompt: 'design the shots',
      response: '{"shots":[]}',
      duration_ms: 1235, // 반올림
      called_at: '2026-08-10T12:00:00.000Z',
    })
  })

  it('DB 프로젝트가 아닌 run(로컬 하네스 id)은 기록하지 않는다', async () => {
    const n = await archiveRawCalls('2026-08-10_local_run', 'scenes', [call()])
    expect(n).toBe(0)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('킬 스위치가 켜지면 즉시 no-op', async () => {
    process.env.LLM_ARCHIVE_DISABLED = '1'
    expect(llmArchiveEnabled()).toBe(false)
    expect(await archiveRawCalls(PROJECT, 'scenes', [call()])).toBe(0)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('비정상적으로 큰 본문은 상한에서 자르고 잘렸음을 남긴다', async () => {
    const huge = 'x'.repeat(250_000)
    await archiveRawCalls(PROJECT, 'scenes', [call({ response: huge })])
    const [rows] = mocks.insert.mock.calls[0]
    expect(rows[0].response.length).toBeLessThan(huge.length)
    expect(rows[0].response).toContain('[truncated 50000 chars]')
  })

  it('DB 실패는 삼킨다 — 파이프라인을 죽이지 않는다', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'relation does not exist' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(archiveRawCalls(PROJECT, 'scenes', [call()])).resolves.toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('빈 배열은 호출하지 않는다', async () => {
    expect(await archiveRawCalls(PROJECT, 'scenes', [])).toBe(0)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
