// shotDesign 씬 단위 이어달리기(#A) + 샷 청크 분할(#B) 계약 검증 (long-writer-run 2026-07-15).
//   LLM(dispatch.generateJson)을 스텁해 과금 없이: resume 스킵 / softDeadline 부분 반환 /
//   패스당 최소 1씬 보장 / 청크 분할 호출 수·병합 결과를 확인한다.
import { describe, expect, it, vi, beforeEach } from 'vitest'

const generateJsonMock = vi.fn()

vi.mock('@/lib/writer/llm/dispatch', () => ({
  generateJson: (...args: unknown[]) => generateJsonMock(...args),
  describeAxisConfig: () => 'stub-model',
}))

import { runShotDesign } from '@/lib/writer/pipeline/stages/v4_shots'
import type { PipelineLogger } from '@/lib/writer/logger'

// 로거는 no-op 스텁 (인터페이스에서 쓰는 메서드만)
const logger = {
  markStage: vi.fn(async () => {}),
  saveStage: vi.fn(async () => {}),
  saveLlmCall: vi.fn(async () => {}),
  flushRawLlm: vi.fn(async () => {}),
} as unknown as PipelineLogger

const axis = { provider: 'gemini', model: 'stub' } as never

function makeShot(shotId: string) {
  return {
    intent: { shot_id: shotId, scene_id: '', story_beat_ref: 0, dramatic_purpose: 'p', duration_seconds: 5, duration_justification: 'j', audience_focus: 'a', shot_position_in_scene: 'developing' },
    static_spec: { shot_id: shotId },
    dynamic_spec: { shot_id: shotId },
  }
}

function makeDecoupageShot(shotId: string) {
  return {
    shot_id: shotId,
    operation: 'adopt',
    shot_function: 'beat',
    shot_size: 'MS',
    intended_duration_seconds: 5,
    source_beats: [0],
    camera_intent: 'static',
    rhythm_role: 'base',
    dramatic_purpose: 'p',
    beat_summary: 's',
  }
}

function makeInputs(sceneCount: number, shotsPerScene: number) {
  const scenes = {
    scenes: Array.from({ length: sceneCount }, (_, i) => ({
      scene_id: `sc_${i + 1}`,
      location: 'loc_1',
      characters_in_scene: [],
      estimated_seconds: 30,
      scene_actions: [],
    })),
  }
  const decoupage = {
    scenes: scenes.scenes.map((s) => ({
      scene_id: s.scene_id,
      shots: Array.from({ length: shotsPerScene }, (_, j) =>
        makeDecoupageShot(`sh_${s.scene_id}_${j + 1}`),
      ),
    })),
  }
  const plans = scenes.scenes.map((s) => ({ scene_id: s.scene_id }))
  const genre = { genre: 'test', tone: [] }
  const characters = { characters: [] }
  const visualIdentity = { style: {} }
  const worldVisual = { global_palette: [], locations: [] }
  const characterVisual = { characters: [] }
  return { scenes, decoupage, plans, genre, characters, visualIdentity, worldVisual, characterVisual }
}

// generateJson 스텁: 요청된 데쿠파주 샷 수만큼 샷을 돌려준다 (userPrompt에서 샷 수 파싱).
function stubEchoShots() {
  generateJsonMock.mockImplementation(async (userPrompt: string) => {
    const m = /샷 수 = (\d+)개/.exec(userPrompt)
    const n = m ? Number(m[1]) : 1
    return { shots: Array.from({ length: n }, (_, i) => makeShot(`stub_${i}`)) }
  })
}

beforeEach(() => {
  generateJsonMock.mockReset()
  stubEchoShots()
})

function run(
  inputs: ReturnType<typeof makeInputs>,
  opts?: Parameters<typeof runShotDesign>[11],
) {
  return runShotDesign(
    inputs.genre as never,
    inputs.characters as never,
    inputs.scenes as never,
    inputs.visualIdentity as never,
    inputs.worldVisual as never,
    inputs.characterVisual as never,
    inputs.plans as never,
    inputs.decoupage as never,
    '',
    logger,
    axis,
    opts,
  )
}

describe('runShotDesign — 씬 단위 이어달리기(#A)', () => {
  it('예산 없으면 전 씬 완주(done=true), 씬당 1호출(소형 씬)', async () => {
    const inputs = makeInputs(3, 4)
    const res = await run(inputs)
    expect(res.done).toBe(true)
    expect(res.doneSceneIds).toEqual(['sc_1', 'sc_2', 'sc_3'])
    expect(res.shots).toHaveLength(12)
    expect(generateJsonMock).toHaveBeenCalledTimes(3)
  })

  it('softDeadline이 이미 지났어도 패스당 최소 1씬은 처리하고 부분 반환한다', async () => {
    const inputs = makeInputs(3, 4)
    const res = await run(inputs, { softDeadlineMs: Date.now() - 1000 })
    expect(res.done).toBe(false)
    expect(res.doneSceneIds).toEqual(['sc_1'])
    expect(res.shots).toHaveLength(4)
    expect(generateJsonMock).toHaveBeenCalledTimes(1)
  })

  it('resume이 주어지면 완료 씬을 건너뛰고 이어서 생성한다', async () => {
    const inputs = makeInputs(3, 4)
    const first = await run(inputs, { softDeadlineMs: Date.now() - 1000 })
    generateJsonMock.mockClear()

    const second = await run(inputs, {
      resume: { doneSceneIds: first.doneSceneIds, shots: first.shots },
    })
    expect(second.done).toBe(true)
    expect(second.doneSceneIds).toEqual(['sc_1', 'sc_2', 'sc_3'])
    expect(second.shots).toHaveLength(12)
    // sc_1은 재호출되지 않는다
    expect(generateJsonMock).toHaveBeenCalledTimes(2)
    const prompts = generateJsonMock.mock.calls.map((c) => String(c[0]))
    expect(prompts.some((p) => p.includes('"sc_1"'))).toBe(false)
  })
})

describe('runShotDesign — 샷 청크 분할(#B)', () => {
  it('씬의 데쿠파주 샷이 8개를 넘으면 청크(8개 단위)로 나눠 호출하고 병합한다', async () => {
    const inputs = makeInputs(1, 17) // 17샷 → 8+8+1 = 3청크
    const res = await run(inputs)
    expect(res.done).toBe(true)
    expect(generateJsonMock).toHaveBeenCalledTimes(3)
    expect(res.shots).toHaveLength(17)
    // shot_id는 청크 내 index → 데쿠파주 shot_id 매핑이 보존된다
    expect(res.shots.map((s) => s.intent.shot_id)).toEqual(
      Array.from({ length: 17 }, (_, j) => `sh_sc_1_${j + 1}`),
    )
    // 청크 안내 문구가 프롬프트에 병기된다
    const prompts = generateJsonMock.mock.calls.map((c) => String(c[0]))
    expect(prompts[0]).toContain('1~8번째 묶음')
    expect(prompts[2]).toContain('17~17번째 묶음')
  })

  it('8개 이하 씬은 단일 호출(기존 동작 보존)', async () => {
    const inputs = makeInputs(1, 8)
    const res = await run(inputs)
    expect(generateJsonMock).toHaveBeenCalledTimes(1)
    expect(res.shots).toHaveLength(8)
  })
})
