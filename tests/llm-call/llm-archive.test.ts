// 인공지능 요청 내용을 안전하게 남기되, 기록에 실패해도 작업은 계속 진행한다 (#llm-archive 2026-08-10)
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

describe('archiveRawCalls가 AI 요청을 기록하는 약속', () => {
  it('인공지능이 주고받은 내용과 걸린 시간을 그대로 기록한다', async () => {
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

  it('프로젝트로 확인되지 않는 실행은 기록하지 않는다', async () => {
    const n = await archiveRawCalls('2026-08-10_local_run', 'scenes', [call()])
    expect(n).toBe(0)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('기록을 끄는 설정값이 켜지면 아무것도 기록하지 않는다', async () => {
    process.env.LLM_ARCHIVE_DISABLED = '1'
    expect(llmArchiveEnabled()).toBe(false)
    expect(await archiveRawCalls(PROJECT, 'scenes', [call()])).toBe(0)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('너무 긴 응답은 정해진 길이까지만 남기고 잘렸음을 표시한다', async () => {
    const huge = 'x'.repeat(250_000)
    await archiveRawCalls(PROJECT, 'scenes', [call({ response: huge })])
    const [rows] = mocks.insert.mock.calls[0]
    expect(rows[0].response.length).toBeLessThan(huge.length)
    expect(rows[0].response).toContain('[truncated 50000 chars]')
  })

  it('기록에 실패해도 작업을 중단하지 않는다', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'relation does not exist' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(archiveRawCalls(PROJECT, 'scenes', [call()])).resolves.toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('기록할 내용이 없으면 저장 요청을 보내지 않는다', async () => {
    expect(await archiveRawCalls(PROJECT, 'scenes', [])).toBe(0)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
