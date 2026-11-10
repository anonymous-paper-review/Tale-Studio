// 길이를 골랐으면 샷 나누기가 씬 시간 안에서 샷을 나누고, 합이 고른 길이를 넘으면 넘은 씬을 샷을 줄여 다시 나눈다(오너 2026-11-10 추천안)
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  generateJson: vi.fn(),
  prompts: [] as string[],
}))

vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: mocks.generateJson,
  describeAxisConfig: () => 'test-model',
}))

import { RUNTIME_FIT_SHOT_SECONDS, runDecoupage, runtimeFitCap, runtimeFitShotCap } from '@/lib/writer/pipeline/stages/decoupage'

// 이 시험을 위해 지은 두 씬 — 고른 길이 15초를 산문이 4초 · 11초로 나눴다.
function scene(id: string, seconds: number, beats: string[]) {
  return {
    scene_id: id,
    act_ref: 'act_1',
    location: 'loc_hall',
    time_of_day: 'night',
    narrative_time: { relation: 'present', label: '' },
    characters_in_scene: [],
    purpose: 'conflict',
    emotion_beat: { start: 'calm', end: 'tense' },
    dialogue_summary: '',
    info_asymmetry: 'audience=character',
    estimated_seconds: seconds,
    scene_actions: beats,
  }
}
const SCENES = { scenes: [scene('scene_1', 4, ['민호가 자판기를 두드린다']), scene('scene_2', 11, ['캔이 쏟아진다', '민호가 웃는다'])], total_estimated_seconds: 15 }
const GENRE = { genre: 'Comedy', tone: [], targetEmotion: [], runtime_seconds: 15, depth_level: 'D1', format: 'horizontal_16:9' }
const logger = {
  markStage: vi.fn(async () => undefined),
  saveLlmCall: vi.fn(async () => undefined),
  saveText: vi.fn(async () => undefined),
  saveStage: vi.fn(async () => undefined),
}
function shots(sceneId: string, seconds: number[]) {
  return {
    shots: seconds.map((s, i) => ({
      shot_id: `shot_${sceneId}_00${i + 1}`,
      operation: 'derived',
      shot_function: 'action',
      source_beats: [0],
      beat_summary: 'beat',
      shot_size: 'MS',
      intended_duration_seconds: s,
      camera_intent: 'static',
    })),
  }
}
/** 씬 · 몇 번째 부름인지에 따라 답하는 가짜 감독(AI). null 이면 그 부름은 실패한다. */
function answer(plan: Record<string, Array<number[] | null>>) {
  const calls: Record<string, number> = {}
  mocks.generateJson.mockImplementation(async (prompt: string) => {
    mocks.prompts.push(prompt)
    const id = /scene_id=(\w+)/.exec(prompt)?.[1] ?? ''
    const n = calls[id] ?? 0
    calls[id] = n + 1
    const seconds = plan[id][Math.min(n, plan[id].length - 1)]
    if (seconds === null) throw new Error('감독 응답 없음')
    return shots(id, seconds)
  })
}
/** 앞 차례에 이미 나눠 둔 씬(이어 가기 체크포인트). */
function decoupaged(sceneId: string, seconds: number[], extra: Record<string, unknown> = {}) {
  const list = shots(sceneId, seconds).shots.map((s) => ({ ...s, scene_id: sceneId }))
  return { scene_id: sceneId, beat_count: 1, shot_count: list.length, coverage_ratio: 1, rhythm_profile: '', uncovered_beats: [], shots: list, ...extra }
}
type RunOpts = { resume?: unknown[]; softDeadlineMs?: number; concurrency?: number }
const runOn = (scenes: unknown, cap: number | null, opts: RunOpts = {}) =>
  runDecoupage(GENRE as never, { characters: [] } as never, scenes as never, { locations: [] } as never, null, logger as never, {} as never, { runtimeCapSeconds: cap, ...opts } as never)
const run = (cap: number | null, opts: RunOpts = {}) => runOn(SCENES, cap, opts)
const total = (plan: { scenes: Array<{ shots: Array<{ intended_duration_seconds?: number }> }> } | undefined) =>
  (plan?.scenes ?? []).flatMap((s) => s.shots).reduce((sum, s) => sum + (s.intended_duration_seconds ?? 0), 0)

beforeEach(() => {
  mocks.generateJson.mockReset()
  mocks.prompts = []
})

describe('고른 길이 맞춤 — 샷 나누기', () => {
  // 왜: 고른 길이는 Producer 에서 고른 구간의 위 끝이다. "대본 그대로"는 길이가 대본을 따르니 맞추지 않는다.
  it('길이를 골랐으면 샷 길이 상한은 고른 길이(15 · 60 · 300 · 1200초)이고, 대본 그대로처럼 길이를 고르지 않았으면 상한이 없다', () => {
    expect(runtimeFitCap({ runtimeSeconds: 15 } as never)).toBe(15)
    expect(runtimeFitCap({ runtimeSeconds: 60 } as never)).toBe(60)
    expect(runtimeFitCap({ runtimeSeconds: 1200 } as never)).toBe(1200)
    expect(runtimeFitCap({ preserveScript: true } as never)).toBeNull()
    expect(runtimeFitCap({} as never)).toBeNull()
  })

  // 왜: 지금 지시는 "샷 길이 합이 씬 시간을 넘어도 된다(뒤에서 늘린다)"라서 15초를 골라도 41초 보드가 나왔다(C01).
  it('길이를 골랐으면 샷 나누기 지시는 씬 시간 안에서 샷 수 상한까지만 나누게 하고, 넘어도 된다는 말을 뺀다', async () => {
    answer({ scene_1: [[4]], scene_2: [[5, 5]] })
    await run(15)
    const first = mocks.prompts.find((p) => p.includes('scene_id=scene_2'))!
    expect(first).toContain('[시간 예산 — 고른 길이 15초]')
    expect(first).toContain('합은 11초를 넘지 마라')
    expect(first).toContain(`최대 ${runtimeFitShotCap(11)}샷`)
    expect(first).not.toContain('넘는 것은 허용된다')
    expect(runtimeFitShotCap(11)).toBe(Math.floor(11 / RUNTIME_FIT_SHOT_SECONDS))
    expect(runtimeFitShotCap(3)).toBe(1)
  })

  // 왜: 정상 경로 고정 — 길이를 고르지 않은 길(대본 그대로)은 지금 지시 그대로다.
  it('길이를 고르지 않았으면 샷 나누기 지시는 지금과 같다', async () => {
    answer({ scene_1: [[3, 3, 3]], scene_2: [[6, 6]] })
    await run(null)
    expect(mocks.prompts.some((p) => p.includes('[시간 예산'))).toBe(false)
    expect(mocks.generateJson).toHaveBeenCalledTimes(2)
  })

  // 왜: 오너 추천안 — 고른 길이를 넘으면 샷을 줄여 다시 나눈다. 넘은 씬만 다시 부른다(넘지 않은 씬은 그대로).
  it('샷 길이 합이 고른 길이를 넘으면 넘은 씬만 샷을 줄여 한 번 더 나누고 줄어든 나누기를 쓴다', async () => {
    answer({ scene_1: [[3, 3, 3], [4]], scene_2: [[5, 5]] })
    const result = await run(15)
    expect(mocks.generateJson).toHaveBeenCalledTimes(3)
    const retry = mocks.prompts[2]
    expect(retry).toContain('scene_id=scene_1')
    expect(retry).toContain('앞 나누기는 이 씬을 9초로 나눠 고른 길이를 넘었다')
    expect(result.plan?.scenes.find((s) => s.scene_id === 'scene_1')?.shots).toHaveLength(1)
    expect(total(result.plan)).toBe(14)
  })

  // 왜: 다시 나눠도 줄지 않으면 더 긴 쪽을 쓸 까닭이 없다 — 처음 나누기를 둔다(더 줄이는 방법은 오너 결정 대기).
  it('다시 나눠도 샷 길이 합이 줄지 않으면 처음 나누기를 그대로 쓴다', async () => {
    answer({ scene_1: [[3, 3, 3], [5, 5]], scene_2: [[5, 5]] })
    const result = await run(15)
    expect(mocks.generateJson).toHaveBeenCalledTimes(3)
    expect(result.plan?.scenes.find((s) => s.scene_id === 'scene_1')?.shots).toHaveLength(3)
  })

  // 왜: 파이프라인의 샷 나누기 단계가 실제로 고른 길이를 넘겨야 위 규칙이 돈다(배선).
  it('Writer 파이프라인의 샷 나누기 단계는 고른 길이를 샷 나누기에 넘긴다', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('src/lib/writer/pipeline/steps.ts', 'utf8')).toContain('runtimeCapSeconds: runtimeFitCap(s.input)')
  })

  // 왜: 정상 경로 고정 — 합이 고른 길이 안이면 AI 를 더 부르지 않는다(비용 · 시간).
  it('샷 길이 합이 고른 길이 안이면 다시 나누지 않는다', async () => {
    answer({ scene_1: [[4]], scene_2: [[5, 5]] })
    const result = await run(15)
    expect(mocks.generateJson).toHaveBeenCalledTimes(2)
    expect(total(result.plan)).toBe(14)
  })

  // 왜: 같은 샷 수로 다시 나누면 같은 길이가 또 나온다 — "샷을 줄여"를 숫자로 준다(11초 씬을 2샷 12초로 나눴으면 다시는 1샷).
  it('다시 나눌 때는 앞 나누기보다 적은 샷 수까지만 나누게 한다', async () => {
    answer({ scene_1: [[4]], scene_2: [[6, 6], [9]] })
    await run(15)
    const scene2 = mocks.prompts.filter((p) => p.includes('scene_id=scene_2'))
    expect(scene2).toHaveLength(2)
    expect(scene2[0]).toContain(`최대 ${runtimeFitShotCap(11)}샷`)
    expect(scene2[1]).toContain('앞 나누기는 이 씬을 12초로 나눠 고른 길이를 넘었다(2샷)')
    expect(scene2[1]).toContain('최대 1샷')
  })

  // 왜: 샷을 줄이다 이야기 비트가 빠지거나 반응 샷부터 사라지면 안 된다 — 대표 스토리보드 모드와 같은 절약 순서(#coverage-first).
  it('샷을 줄일 때는 비트를 지우지 말고 합치게 하고, 반응 · 리빌 같은 커버리지 샷을 먼저 빼지 않게 한다', async () => {
    answer({ scene_1: [[4]], scene_2: [[5, 5]] })
    await run(15)
    const first = mocks.prompts.find((p) => p.includes('scene_id=scene_2'))!
    expect(first).toContain('비트를 지우지 말고 여러 비트를 한 샷에 합쳐라')
    expect(first).toContain('커버리지 샷을 먼저 빼지 마라')
  })

  // 왜: 넘은 씬이 여럿이면 가장 많이 넘은 씬을 먼저 줄인다. 그것만으로 고른 길이 안에 들면 나머지는 AI 를 더 부르지 않는다.
  //   기본 동시 처리(4)로 돈다 — 동시에 다시 나누면 합이 들어온 뒤에도 남은 씬까지 불렀다(검토 a 2026-11-10: 5번 · 14초).
  it('많이 넘은 씬부터 다시 나누고, 합이 고른 길이 안으로 들어오면 남은 씬은 다시 나누지 않는다', async () => {
    const three = { scenes: [scene('scene_a', 5, ['a']), scene('scene_b', 5, ['b']), scene('scene_c', 5, ['c'])], total_estimated_seconds: 15 }
    answer({ scene_a: [[6], [5]], scene_b: [[9], [4]], scene_c: [[5]] })
    const result = await runOn(three, 15)
    expect(mocks.generateJson).toHaveBeenCalledTimes(4)
    expect(mocks.prompts[3]).toContain('scene_id=scene_b')
    expect(total(result.plan)).toBe(15)
  })

  // 왜: 시간이 모자라 두 번에 나눠 도는 긴 작업에서, 한 번 다시 나눈 씬을 다음 차례에 또 부르면 같은 씬을 끝없이 나눌 수 있다.
  it('한 번 다시 나눈 씬은 이어 갈 때 또 다시 나누지 않는다', async () => {
    answer({ scene_1: [[3, 3, 3]], scene_2: [[5, 5]] })
    const result = await run(15, { resume: [decoupaged('scene_1', [3, 3, 3], { runtime_fit_retried: true }), decoupaged('scene_2', [5, 5])] })
    expect(mocks.generateJson).not.toHaveBeenCalled()
    expect(result.done).toBe(true)
    expect(total(result.plan)).toBe(19)
  })

  // 왜: 다 나눈 직후 이번 차례 시간이 거의 다 갔으면(서버 300초 제한) 다시 나누기를 다음 차례로 미뤄야 작업이 강제로 끊기지 않는다.
  it('다 나눈 뒤 이번 차례 시간이 모자라면 다시 나누기를 다음 차례로 미루고, 다음 차례에 이어서 다시 나눈다', async () => {
    answer({ scene_1: [[3, 3, 3], [4]], scene_2: [[5, 5]] })
    const first = await run(15, { resume: [decoupaged('scene_2', [5, 5])], softDeadlineMs: Date.now() + 1_000 })
    expect(first.done).toBe(false)
    expect(mocks.generateJson).toHaveBeenCalledTimes(1)
    const second = await run(15, { resume: first.scenes, softDeadlineMs: Date.now() + 1_000 })
    expect(second.done).toBe(true)
    expect(mocks.generateJson).toHaveBeenCalledTimes(2)
    expect(total(second.plan)).toBe(14)
  })

  // 왜: 다시 나누기는 덤이다 — 그 부름이 실패해도(모델 오류) 작업을 멈추지 않고 처음 나누기로 간다.
  it('다시 나누기가 실패하면 처음 나누기를 그대로 쓰고 작업을 이어 간다', async () => {
    answer({ scene_1: [[3, 3, 3], null], scene_2: [[5, 5]] })
    const result = await run(15)
    expect(result.done).toBe(true)
    expect(mocks.generateJson).toHaveBeenCalledTimes(3)
    expect(result.plan?.scenes.find((s) => s.scene_id === 'scene_1')?.shots).toHaveLength(3)
  })
})
