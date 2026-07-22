// v0 스타일 앵커 연결 (2026-07-14, docs/style-anchor-art-style-authority.md §9-2 후속)
//
// 계약:
//   - styleAnchor 있음 → v0 LLM 프롬프트에 앵커 제약 블록(매체 발명 금지 + key/medium)이 포함된다.
//   - styleAnchor 없음 → 프롬프트에 앵커 블록이 없다 (기존 동작, 장르 기반 추론 유지).
// 근거: 앵커 없이 장르에서 매체를 발명하면(post-apocalyptic → dark_cinematic_realism) 앵커와
//   충돌해 매체 전이가 깨진다 — d6208bba 실측(exp4).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
}))

vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: mocks.generateJson,
  describeAxisConfig: () => 'mock-model',
}))

import { runVisualIdentity } from '@/lib/writer/pipeline/stages/v0_visual'
import type { Genre, VisualIdentity } from '@/lib/writer/types/pipeline'
import type { PipelineLogger } from '@/lib/writer/logger'

const genre = { genre: 'action', subGenre: 'post-apocalyptic survival', tone: ['dread'] } as unknown as Genre
const axisConfig = { provider: 'gemini' } as never

const identity: VisualIdentity = {
  format: { medium: '2d_animation', resolution: { width: 1920, height: 1080 }, fps: 24, aspect_ratio: '16:9', rendering_method: 'cel_shaded' },
  style: { art_style: '2d_cartoon', shape_language: 'round', line_quality: 'clean', character_proportion: '6:1', texture_philosophy: 'flat' },
} as VisualIdentity

function stubLogger(): PipelineLogger {
  return {
    markStage: vi.fn(async () => {}),
    saveLlmCall: vi.fn(async () => {}),
    saveStage: vi.fn(async () => {}),
  } as unknown as PipelineLogger
}

beforeEach(() => {
  mocks.generateJson.mockReset()
  mocks.generateJson.mockResolvedValue(identity)
})

describe('v0 visualIdentity × style anchor', () => {
  it('앵커 있으면 프롬프트에 매체-고정 제약 블록이 들어간다', async () => {
    await runVisualIdentity(genre, stubLogger(), axisConfig, {
      key: 'us_cartoon',
      label: '미국 카툰',
      medium: '2d_cartoon',
    })

    const [userPrompt, , opts] = mocks.generateJson.mock.calls[0]
    expect(userPrompt).toContain('스타일 앵커')
    expect(userPrompt).toContain('"key":"us_cartoon"')
    expect(userPrompt).toContain('"medium":"2d_cartoon"')
    expect(userPrompt).toContain('매체 발명 금지')
    // 시스템 지시에도 앵커 우선 규칙이 존재.
    expect(opts.systemInstruction).toContain('스타일 앵커가 주어지면')
  })

  it('앵커 없으면 프롬프트에 앵커 블록이 없다 (기존 동작 보존)', async () => {
    await runVisualIdentity(genre, stubLogger(), axisConfig)

    const [userPrompt] = mocks.generateJson.mock.calls[0]
    expect(userPrompt).not.toContain('스타일 앵커')
    expect(userPrompt).toContain('[genre]')
  })
})
