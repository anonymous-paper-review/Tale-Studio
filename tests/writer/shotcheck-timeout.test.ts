// 샷 점검이 시간 예산을 넘겨 끊기거나 샷이 80개를 넘으면 지금처럼 "점검 생략" 경고를 남기고 샷을 나누지 않은 채 이어 간다(검토 b · 오너 2026-11-11)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@/lib/writer/llm/dispatch', () => ({ generateJson: m.generate, describeAxisConfig: () => 'claude/claude-sonnet-4-6' }))

import { runShotCheck } from '@/lib/writer/pipeline/stages/c_application_2'

// 이 시험을 위해 지은 샷 설계 하나와 씬 하나.
const DESIGN = {
  intent: { shot_id: 'shot_1', scene_id: 'scene_1', duration_seconds: 4, dramatic_purpose: 'The cat reaches the boat.' },
  static_spec: { character_blocking: [], prop_placement: [], first_frame_prompt: 'A cat on wet rocks at dawn, reaching for a paper boat.' },
  dynamic_spec: { character_motion: [], camera_motion: { type: 'static' }, motion_prompt: 'The cat stretches its paw.' },
}
const SCENES = { scenes: [{ scene_id: 'scene_1', location: 'rocks', scene_actions: ['a cat walks'], characters_in_scene: [], purpose: 'setup', emotion_beat: { start: 'calm', end: 'tense' } }] }
const logger = { saveLlmCall: vi.fn(), saveStage: vi.fn(), markStage: vi.fn(), saveText: vi.fn() }

describe('샷 점검 — 시간 예산', () => {
  // 왜: 점검이 정한 때를 넘기면 끊긴다. 그때도 Writer 는 점검 없이(고치기 전과 같은 결과로) 끝까지 간다.
  it('샷 점검이 시간 예산을 넘겨 끊기면 지금처럼 "점검 생략" 경고를 남기고 샷을 나누지 않은 채 이어 간다', async () => {
    m.generate.mockRejectedValue(new Error('Claude call ran past its time budget — not waiting'))
    const deadlineMs = Date.now() + 120_000
    const result = await runShotCheck('p1', { depth_level: 'D1', runtime_seconds: 15 } as never, { characters: [] } as never, SCENES as never, { locations: [] } as never, [DESIGN] as never, null, [], logger as never, { provider: 'claude', model: 'claude-sonnet-4-6' } as never, 'en', [], { deadlineMs })
    expect(m.generate.mock.calls[0][2]).toMatchObject({ maxTokens: 32000, deadlineMs })
    expect(result.shotSequence.shots).toHaveLength(1)
    expect(result.report.issues.some((i) => i.location === 'shotCheck' && /time budget/.test(i.message))).toBe(true)
  })
})

describe('샷 점검 — 80샷 넘는 긴 작품', () => {
  const designs = (n: number) => Array.from({ length: n }, (_, i) => ({ ...DESIGN, intent: { ...DESIGN.intent, shot_id: `shot_${i + 1}` } }))
  const run = (n: number) =>
    runShotCheck('p1', { depth_level: 'D5', runtime_seconds: 1200 } as never, { characters: [] } as never, SCENES as never, { locations: [] } as never, designs(n) as never, null, [], logger as never, { provider: 'claude', model: 'claude-sonnet-4-6' } as never, 'en', [])
  beforeEach(() => {
    m.generate.mockReset()
    m.generate.mockResolvedValue({ shots_to_split: [], semantic_issues: [] })
  })

  // 왜: 오너 안 "그동안은 80샷이 넘으면 점검을 처음부터 건너뛴다" — 150샷쯤은 270초 안에 못 끝나 늘 생략되면서 4.5분 · Claude 약 $1을 썼다.
  it('샷이 80개를 넘는 작품은 샷 점검 AI 를 부르지 않고 지금과 같은 "점검 생략" 경고를 남긴다', async () => {
    const result = await run(81)
    expect(m.generate).not.toHaveBeenCalled()
    expect(result.shotSequence.shots).toHaveLength(81)
    const warning = result.report.issues.find((i) => i.location === 'shotCheck')
    expect(warning).toMatchObject({ category: 'action_budget', severity: 'WARNING' })
    expect(warning?.message).toMatch(/분할·점검 없이 진행됨/)
    expect(warning?.message).toMatch(/81/)
  })

  // 왜: 정상 경로 고정 — 80샷 이하는 지금처럼 점검을 받는다(재기한 46샷 이하 경우들).
  it('샷이 80개 이하면 지금처럼 샷 점검 AI 를 부른다', async () => {
    await run(80)
    expect(m.generate).toHaveBeenCalledTimes(1)
  })
})
