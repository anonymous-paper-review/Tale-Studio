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
import { LossyRepairError, repairJsonStrict, repairJson } from '@/lib/writer/llm/json_repair'

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

// ── #p4-json-guard (2026-08-11) ────────────────────────────────────────────
// 손실 복구는 데이터를 버리고도 파싱을 성립시켜 "정상"으로 통과한다(무신호 손실).
//   실측: 2026-08-11 shotDesign 9런에서 238콜 중 5콜(약 2%)이 손실 복구로 통과했다.
//   처방은 "복구기가 신호를 올리고 → dispatch 가 한 번 다시 묻는다".

describe('repairJsonStrict — 손실 복구를 에러로 표면화', () => {
  it('무손실 복구(펜스 제거·잉여 문자 삭제)는 종전대로 값을 돌려준다', () => {
    expect(repairJsonStrict('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(repairJsonStrict('{"a":1,,"b":2}')).toEqual({ a: 1, b: 2 }) // 잉여 콤마 = punch
  })

  it('잘린 응답은 LossyRepairError 로 던지되 살아남은 값을 실어 보낸다', () => {
    let err: unknown
    try {
      repairJsonStrict('{"shots":[{"a":1},{"b":2},{"c":')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(LossyRepairError)
    const lossy = err as LossyRepairError
    expect(lossy.strategy).toBe('trim')
    expect(lossy.items).toBe(2) // 3개를 만들려다 2개만 살아남았다
    expect(lossy.value).toEqual({ shots: [{ a: 1 }, { b: 2 }] })
  })

  it('비-strict repairJson 의 계약은 그대로다 (기존 호출자 무영향)', () => {
    expect(repairJson('{"shots":[{"a":1},{"b":2},{"c":')).toEqual({ shots: [{ a: 1 }, { b: 2 }] })
  })
})

describe('generateJson — 손실 복구 재호출', () => {
  const lossy = () => new LossyRepairError({ shots: [{ a: 1 }] }, 'trim', 6192, 1)

  it('손실 복구가 감지되면 같은 질문을 한 번 다시 던진다', async () => {
    mocks.gemini.mockRejectedValueOnce(lossy()).mockResolvedValueOnce({ shots: [1, 2, 3] })

    const r = await generateJson('p', { provider: 'gemini' })
    expect(r).toEqual({ shots: [1, 2, 3] }) // 재호출 결과를 쓴다
    expect(mocks.gemini).toHaveBeenCalledTimes(2)
    expect(mocks.claude).not.toHaveBeenCalled() // 모더레이션 폴백과 섞이지 않는다
  })

  it('재호출도 잘리면 살아남은 값으로 진행한다 (종전과 동일한 최악치)', async () => {
    mocks.gemini.mockRejectedValueOnce(lossy()).mockRejectedValueOnce(lossy())

    const r = await generateJson('p', { provider: 'gemini' })
    expect(r).toEqual({ shots: [{ a: 1 }] })
    expect(mocks.gemini).toHaveBeenCalledTimes(2) // 재호출은 딱 한 번 — 무한 반복 없음
  })

  it('재호출이 다른 오류로 죽으면 그 오류를 표면화한다', async () => {
    mocks.gemini.mockRejectedValueOnce(lossy()).mockRejectedValueOnce(new Error('503 overloaded'))

    await expect(generateJson('p', { provider: 'gemini' })).rejects.toThrow('503 overloaded')
    expect(mocks.gemini).toHaveBeenCalledTimes(2)
  })

  it('손실 복구가 없으면 재호출하지 않는다', async () => {
    mocks.gemini.mockResolvedValueOnce({ ok: true })

    await generateJson('p', { provider: 'gemini' })
    expect(mocks.gemini).toHaveBeenCalledTimes(1)
  })
})
