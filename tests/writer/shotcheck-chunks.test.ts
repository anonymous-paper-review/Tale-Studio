// 샷이 80개를 넘는 긴 작품은 장면을 이어 붙인 묶음(40샷 안팎)마다 샷 점검을 하고, 결과를 합쳐 한 번에 나누고 번호를 다시 매긴다(오너 2026-11-11 "장면별로 나눠 점검한다")
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@/lib/writer/llm/dispatch', () => ({ generateJson: m.generate, describeAxisConfig: () => 'claude/claude-sonnet-4-6' }))

import { runShotCheck } from '@/lib/writer/pipeline/stages/c_application_2'

// 이 시험을 위해 지은 샷 설계 — 장면마다 샷 수를 정해 이어 붙인다(샷 번호는 1부터 전체로).
function build(sceneSizes: number[]) {
  const designs: unknown[] = []
  const scenes: unknown[] = []
  let n = 0
  sceneSizes.forEach((size, s) => {
    const sceneId = `scene_${s + 1}`
    scenes.push({ scene_id: sceneId, location: 'rocks', scene_actions: ['a cat walks'], characters_in_scene: [], purpose: 'setup', emotion_beat: { start: 'calm', end: 'tense' } })
    for (let k = 0; k < size; k++) {
      n += 1
      designs.push({
        intent: { shot_id: `shot_${n}`, scene_id: sceneId, duration_seconds: 4, dramatic_purpose: `Beat ${n}.` },
        static_spec: { character_blocking: [], prop_placement: [], first_frame_prompt: `A wide view of the rocks at dawn, beat ${n} of the story.` },
        dynamic_spec: { character_motion: [], camera_motion: { type: 'static' }, motion_prompt: `The cat moves, beat ${n}.` },
      })
    }
  })
  return { designs, scenes: { scenes } }
}
const logger = { saveLlmCall: vi.fn(), saveStage: vi.fn(), markStage: vi.fn(), saveText: vi.fn() }
const check = (sceneSizes: number[], opts?: Record<string, unknown>) => {
  const { designs, scenes } = build(sceneSizes)
  return runShotCheck('p1', { depth_level: 'D5', runtime_seconds: 1200 } as never, { characters: [] } as never, scenes as never, { locations: [] } as never, designs as never, null, [], logger as never, { provider: 'claude', model: 'claude-sonnet-4-6' } as never, 'en', [], opts as never)
}
/** 점검 부름 프롬프트에서 [샷 시퀀스] 안의 샷 번호만 뽑는다(앞 맥락은 뺀다). */
const checkedIds = (prompt: string) => {
  const body = prompt.slice(prompt.indexOf('[샷 시퀀스]'), prompt.indexOf('[출력 형식'))
  return [...body.matchAll(/"shot_id": "(shot_\d+)"/g)].map((x) => x[1])
}
const contextIds = (prompt: string) => {
  if (!prompt.includes('[앞 맥락')) return []
  const body = prompt.slice(prompt.indexOf('[앞 맥락'), prompt.indexOf('[샷 시퀀스]'))
  return [...body.matchAll(/"shot_id": "(shot_\d+)"/g)].map((x) => x[1])
}
const prompts = () => m.generate.mock.calls.map((c) => String(c[0]))
const split = (id: string) => ({ shot_id: id, reason: 'two actions', new_shots: [{ shot_id: `${id}a`, duration_seconds: 2 }, { shot_id: `${id}b`, duration_seconds: 2 }] })
const issue = (location: string, constraint: string) => ({ category: 'continuity', severity: 'WARNING', location, message: 'm', constraint_target: 'visual', constraint })

beforeEach(() => {
  m.generate.mockReset()
  m.generate.mockResolvedValue({ shots_to_split: [], semantic_issues: [] })
})
afterEach(() => {
  vi.useRealTimers()
})

// 묶음으로 나눠 점검하는 것 자체는 shotcheck-timeout.test.ts(오너 문장), 실행 상태에 저장하고 넘기는 것은 shotcheck-budget.test.ts 가 본다.
describe('긴 작품 샷 점검 — 장면별 묶음', () => {
  // 왜: 장면 사이 이어짐은 앞 묶음 끝을 봐야 알 수 있다 — 같은 샷을 두 번 점검하지는 않는다.
  it('묶음마다 앞 묶음의 끝 샷 2개를 읽기만 하는 맥락으로 붙이고, 그 두 샷은 나누거나 지적하지 않는다', async () => {
    m.generate.mockImplementation(async (prompt: string) => {
      const ctx = contextIds(prompt)
      if (!ctx.length) return { shots_to_split: [], semantic_issues: [] }
      // 모델이 지시를 어기고 맥락 샷을 나누고 지적해도 쓰지 않는다
      return { shots_to_split: [split(ctx[0])], semantic_issues: [issue(ctx[1], 'Context shot must change.'), issue(checkedIds(prompt)[0], 'First shot keeps the coat.')] }
    })
    const result = await check([20, 15, 10, 25, 20])
    expect(contextIds(prompts()[1])).toEqual(['shot_34', 'shot_35'])
    expect(contextIds(prompts()[2])).toEqual(['shot_69', 'shot_70'])
    expect(result.shotSequence.shots).toHaveLength(90)
    const notes = result.shotSequence.shots.flatMap((s) => ((s as { check_notes?: Array<{ constraint?: string }> }).check_notes ?? []).map((n) => n.constraint))
    expect(notes).not.toContain('Context shot must change.')
    expect(notes.filter((n) => n === 'First shot keeps the coat.')).toHaveLength(2)
  })

  // 왜: 장면 안의 이어짐을 끊지 않는다 — 큰 장면은 그 장면 하나가 한 묶음이다.
  it('한 장면이 40샷을 넘으면 그 장면 하나가 한 묶음이 되고, 장면은 쪼개지 않는다', async () => {
    await check([45, 40])
    expect(prompts().map((p) => checkedIds(p).length)).toEqual([45, 40])
  })

  // 왜: 묶음마다 따로 나누면 번호가 겹치거나 빠진다 — 다 모은 뒤 한 번에 적용하고 처음부터 다시 매긴다.
  it('모든 묶음이 끝나면 나누기를 한 번에 적용하고 샷 번호를 처음부터 다시 매긴다', async () => {
    m.generate.mockImplementation(async (prompt: string) => {
      const ids = checkedIds(prompt)
      return { shots_to_split: ids.includes('shot_5') ? [split('shot_5')] : ids.includes('shot_80') ? [split('shot_80')] : [], semantic_issues: [] }
    })
    const result = await check([20, 15, 10, 25, 20])
    expect(result.report.shots_split_count).toBe(2)
    expect(result.shotSequence.shots.map((s) => s.shot_id)).toEqual(Array.from({ length: 92 }, (_, i) => `shot_${i + 1}`))
  })

  // 왜: 한 묶음이 끊겨도 나머지 묶음의 점검까지 버리지 않는다.
  it('시간 예산에 끊긴 묶음은 그 묶음만 "점검 생략" 경고를 남기고 다른 묶음 결과는 쓴다', async () => {
    m.generate.mockImplementation(async (prompt: string) => {
      if (prompt.startsWith('[묶음 2/')) throw new Error('Claude call ran past its time budget — not waiting')
      const ids = checkedIds(prompt)
      return { shots_to_split: ids.includes('shot_5') ? [split('shot_5')] : [], semantic_issues: [] }
    })
    const result = await check([20, 15, 10, 25, 20])
    expect(result.report.shots_split_count).toBe(1)
    const warnings = result.report.issues.filter((i) => i.location === 'shotCheck')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toMatch(/묶음 2\/3/)
  })

  // 왜: 함수 수명(300초)에 잘리면 같은 유료 점검을 다시 산다 — 끝낸 묶음은 저장하고 다음 호출이 남은 묶음만 이어 간다.
  it('남은 시간이 다음 묶음에 모자라 넘긴 뒤에는, 다음 호출이 끝낸 묶음을 다시 점검하지 않고 남은 묶음만 점검한다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const t0 = new Date('2026-11-11T00:00:00Z').getTime()
    vi.setSystemTime(t0)
    m.generate.mockImplementation(async (prompt: string) => {
      vi.setSystemTime(Date.now() + 60_000) // 묶음 점검 하나에 1분
      const ids = checkedIds(prompt)
      return { shots_to_split: ids.includes('shot_80') ? [split('shot_80')] : [], semantic_issues: [] }
    })
    const first = await check([20, 15, 10, 25, 20], { softDeadlineMs: t0 + 240_000 })
    expect(first.partial).toBeDefined()
    expect(m.generate).toHaveBeenCalledTimes(2) // 두 묶음을 같이 · 남은 시간 < 다음 묶음 예상(160초)
    vi.setSystemTime(t0 + 300_000)
    const second = await check([20, 15, 10, 25, 20], { softDeadlineMs: Date.now() + 240_000, resume: first.partial })
    expect(m.generate).toHaveBeenCalledTimes(3)
    expect(prompts()[2].startsWith('[묶음 3/3')).toBe(true)
    expect(second.partial).toBeUndefined()
    expect(second.report.shots_split_count).toBe(1)
    expect(second.shotSequence.shots).toHaveLength(91)
  })

  // 왜: 정상 경로 고정 — 80샷 이하는 장면이 여럿이어도 지금과 같은 지시로 한 번에 점검한다(묶음 머리 · 앞 맥락 없음).
  it('샷이 80개 이하면 장면이 여럿이어도 묶지 않고 지금과 같은 점검 지시로 한 번에 점검한다', async () => {
    await check([40, 40])
    expect(m.generate).toHaveBeenCalledTimes(1)
    expect(prompts()[0].startsWith('[샷 시퀀스]')).toBe(true)
  })
})
