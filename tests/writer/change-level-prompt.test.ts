// 리뉴얼 1차: Producer 시작 화면에서 고른 바꿈 정도(다듬기 · 새롭게 키우기)를 산문을 쓰는 단계 지시에 싣는다 (2026-10-19)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: mocks.generate,
  describeAxisConfig: () => 'test-model',
}))

import { changeLevelBlock } from '@/lib/writer/pipeline/change-level'
import { runNarrativeStructure } from '@/lib/writer/pipeline/stages/s1_structure'

const logger = { markStage: vi.fn(), saveLlmCall: vi.fn(), saveStage: vi.fn() }
const genre = { genre: '코미디', tone: [], targetEmotion: [], runtime_seconds: 60, depth_level: 'D2' as const, format: 'horizontal_16:9' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generate.mockResolvedValue({ acts: [{ act_id: 'act_1', proportion: 1 }] })
})

describe('바꿈 정도 지시', () => {
  // 왜: 프로토타입 2 다듬기 — "지켜요: 소재 · 인물 · 사건 흐름 · 결말 / 바꿔요: 문장 · 대사 · 씬 순서".
  it('다듬기로 시작한 산문은 아이디어의 인물 · 사건 흐름 · 결말을 지키라는 지시를 싣는다', () => {
    const block = changeLevelBlock({ changeLevel: 'polish' })
    expect(block).toContain('다듬기')
    expect(block).toContain('결말을 지킨다')
  })

  // 왜: 프로토타입 3 새롭게 키우기 — "지켜요: 소재 · 장르와 분위기 · 길이 / 바꿔요: 사건 · 인물 · 결말에 새 아이디어".
  it('새롭게 키우기로 시작한 산문은 사건 · 인물 · 결말을 새 아이디어로 키워도 된다는 지시를 싣는다', () => {
    const block = changeLevelBlock({ changeLevel: 'grow' })
    expect(block).toContain('새롭게 키우기')
    expect(block).toContain('새 아이디어로 키워도 된다')
  })

  // 왜: 정상 경로 고정 — 바꿈 정도가 없는 예전 실행 · 그대로(대본 보존)는 지시가 달라지지 않는다.
  it('바꿈 정도가 없거나 그대로면 지시를 싣지 않는다', () => {
    expect(changeLevelBlock({})).toBe('')
    expect(changeLevelBlock({ changeLevel: 'keep' })).toBe('')
  })

  // 왜: 이야기 구조를 잡는 단계가 실제로 그 지시를 받는다.
  it('이야기 구조를 잡을 때 고른 바꿈 정도 지시가 함께 간다', async () => {
    await runNarrativeStructure({ story: '자판기 앞에서 벌어진 일', changeLevel: 'grow' }, genre, logger as never, { provider: 'gemini' } as never)

    expect(String(mocks.generate.mock.calls[0][0])).toContain('[AI 바꿈 정도 · 새롭게 키우기]')
  })
})
