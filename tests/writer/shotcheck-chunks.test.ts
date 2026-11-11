// 샷이 80개를 넘는 긴 작품은 장면을 이어 붙인 묶음(40샷 안팎)마다 샷 점검을 하고, 결과를 합쳐 한 번에 나누고 번호를 다시 매긴다. 나눈 새 샷은 다른 샷과 이름이 겹쳐도 섞이지 않는다(오너 2026-11-11 "장면별로 나눠 점검한다" · 검토 b)
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
/** 모델이 새 샷 이름을 직접 지은 나누기안 — 이름이 다른 샷과 겹치는 경우를 만든다. */
const splitAs = (id: string, names: string[], actions: string[]) => ({
  shot_id: id,
  reason: 'two actions',
  new_shots: names.map((name, k) => ({ shot_id: name, duration_seconds: 2, S: { character_action: actions[k] } })),
})
const notesOf = (shot: unknown) => ((shot as { check_notes?: Array<{ constraint?: string }> }).check_notes ?? []).map((n) => n.constraint)
const actionsFrom = (shots: unknown[], source: string) =>
  (shots as Array<{ source_shot_id?: string; S: { character_action: string } }>).filter((s) => s.source_shot_id === source).map((s) => s.S.character_action)
const sourcesWith = (shots: unknown[], constraint: string) =>
  (shots as Array<{ source_shot_id?: string }>).filter((s) => notesOf(s).includes(constraint)).map((s) => s.source_shot_id)

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

  // 왜: 묶음 점검은 자기 묶음 샷만 본다 — 보지 못한 앞 묶음 샷 번호(shot_5)에 단 지적이 그 샷의 그림 지시로 붙었다(검토 b 2026-11-11).
  it('묶음 점검이 자기 묶음 밖의 샷 번호에 단 지적은 버린다', async () => {
    m.generate.mockImplementation(async (prompt: string) => ({
      shots_to_split: [],
      semantic_issues: prompt.startsWith('[묶음 2/') ? [issue('shot_5', 'Keep the red scarf.'), issue('shot_36', 'Keep the lamp lit.')] : [],
    }))
    const result = await check([20, 15, 10, 25, 20]) // 묶음 2 = shot_36~70
    const notes = result.shotSequence.shots.flatMap(notesOf)
    expect(notes).not.toContain('Keep the red scarf.')
    expect(notes.filter((n) => n === 'Keep the lamp lit.')).toHaveLength(1)
    expect(result.report.issues.some((i) => i.constraint === 'Keep the red scarf.')).toBe(false)
  })

  // 왜: 앞 묶음은 다음 묶음을 못 보니 끝 샷(shot_40)을 나누며 새 샷에 다음 묶음의 실제 번호(shot_41)를 붙일 수 있다 — 그 이름으로 합치면
  //   다음 묶음의 shot_41 나누기 · 지시가 앞 묶음의 새 샷에 붙어 shot_40 의 뒤 절반이 사라지고 진짜 shot_41 은 나뉘지 않은 채 남았다(검토 b 2026-11-11).
  it('앞 묶음이 끝 샷을 나누며 새 샷에 다음 묶음의 샷 번호를 붙여도, 두 묶음의 나누기와 지시가 섞이지 않는다', async () => {
    m.generate.mockImplementation(async (prompt: string) =>
      prompt.startsWith('[묶음 1/')
        ? { shots_to_split: [splitAs('shot_40', ['shot_40', 'shot_41'], ['Mina lifts the lamp.', 'Mina sets the lamp down.'])], semantic_issues: [] }
        : { shots_to_split: [splitAs('shot_41', ['shot_41', 'shot_42'], ['Leo opens the door.', 'Leo steps outside.'])], semantic_issues: [issue('shot_41', 'Keep the red scarf.')] },
    )
    const result = await check([40, 41]) // 81샷 → 40 · 41
    const shots = result.shotSequence.shots
    expect(shots).toHaveLength(83)
    expect(actionsFrom(shots, 'shot_40')).toEqual(['Mina lifts the lamp.', 'Mina sets the lamp down.'])
    expect(actionsFrom(shots, 'shot_41')).toEqual(['Leo opens the door.', 'Leo steps outside.'])
    expect(sourcesWith(shots, 'Keep the red scarf.')).toEqual(['shot_41', 'shot_41'])
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

describe('나눈 새 샷 이름 — 한 번에 점검하는 길도', () => {
  // 왜: 한 번에 점검할 때도 모델이 shot_3 을 나누며 새 샷에 shot_4 이름을 붙이면, shot_4 의 나누기 · 지시가 그 새 샷에 붙어
  //   shot_3 의 뒤 절반이 사라졌다(검토 b 2026-11-11 — 묶음 경계와 같은 고장).
  it('한 번에 점검할 때도 나눈 새 샷의 이름이 다른 샷과 같으면, 그 샷의 나누기와 지시가 새 샷에 섞이지 않는다', async () => {
    m.generate.mockResolvedValue({
      shots_to_split: [
        splitAs('shot_3', ['shot_3', 'shot_4'], ['Mina lifts the lamp.', 'Mina sets the lamp down.']),
        splitAs('shot_4', ['shot_4', 'shot_5'], ['Leo opens the door.', 'Leo steps outside.']),
      ],
      semantic_issues: [issue('shot_4', 'Keep the red scarf.')],
    })
    const result = await check([10])
    expect(m.generate).toHaveBeenCalledTimes(1)
    const shots = result.shotSequence.shots
    expect(shots).toHaveLength(12)
    expect(actionsFrom(shots, 'shot_3')).toEqual(['Mina lifts the lamp.', 'Mina sets the lamp down.'])
    expect(actionsFrom(shots, 'shot_4')).toEqual(['Leo opens the door.', 'Leo steps outside.'])
    expect(sourcesWith(shots, 'Keep the red scarf.')).toEqual(['shot_4', 'shot_4'])
  })

  // 왜: 모델이 나눈 첫 새 샷을 원래 이름(shot_3)으로 지으면, 원래 샷의 지시가 그 새 샷에만 두 번 붙고 나누기로 이미 고친
  //   동작 지적까지 붙었다 — 다른 새 샷처럼 한 번만 물려받아야 같은 그림을 두 번 그리지 않는다.
  it('나눈 새 샷의 이름이 원래 샷과 같아도, 그 새 샷은 다른 새 샷과 똑같이 원래 샷의 지시를 한 번만 물려받는다', async () => {
    m.generate.mockResolvedValue({
      shots_to_split: [splitAs('shot_3', ['shot_3', 'shot_3b'], ['Mina lifts the lamp.', 'Mina sets the lamp down.'])],
      semantic_issues: [issue('shot_3', 'Keep the coat on.'), { ...issue('shot_3', 'Either lift the lamp or set it down.'), category: 'action_budget' }],
    })
    const result = await check([10])
    const kids = result.shotSequence.shots.filter((s) => s.source_shot_id === 'shot_3')
    expect(kids.map(notesOf)).toEqual([['Keep the coat on.'], ['Keep the coat on.']])
  })
})
