// 씬의 새 장소를 영어 표기(office_hallway)로 지어내면 그 장소 이름만 이야기 언어로 다시 받아 바꾸고, 그래도 남으면 알린다 (2026-10-21 오너 "업로드된 파일을 다듬기로 시작했을 때 Treatment 생성 실패")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@/lib/writer/llm/local', () => ({ localGenerateJson: mocks.generate }))

import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes'
import type { BackgroundContract, Characters, Genre, NarrativeStructure, PipelineInput, Scenes } from '@/lib/writer/types/pipeline'
import type { PipelineLogger } from '@/lib/writer/logger'

const cast = { characters: [{ id: 'minho', name: '민호' }] } as Characters
const input = { story: 'S#1. 회사 복도 자판기 앞 / 밤\n민호가 동전을 넣는다.', outputLocale: 'ko', changeLevel: 'polish' } as PipelineInput
const genre = { depth_level: 'D1', runtime_seconds: 6 } as Genre
const structure = { acts: [{ act_id: 'act_1' }] } as NarrativeStructure
const logger = { saveStage: vi.fn(), saveLlmCall: vi.fn(), markStage: vi.fn() }
const scenesAt = (location: string, action = '민호가 자판기에 동전을 넣는다.'): Scenes => ({
  scenes: [{ scene_id: 'scene_1', act_ref: 'act_1', location, narrative_time: 'present', characters_in_scene: ['minho'], scene_actions: [action], estimated_seconds: 6, dialogue_summary: '민호가 동전을 넣는다.' } as Scenes['scenes'][number]],
  total_estimated_seconds: 6,
})
const run = (over: Partial<PipelineInput> = {}, world?: BackgroundContract) =>
  runScenes({ ...input, ...over }, genre, structure, cast, world, logger as unknown as PipelineLogger, { provider: 'local', baseUrl: 'http://fixture.invalid' })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.generate.mockReset()
})

describe('씬의 새 장소 이름', () => {
  it('새 장소를 영어 표기로 지어내지 말고 이야기 언어 장소명으로 쓰라고 처음부터 지시한다', async () => {
    // 왜: 업로드한 대본을 다듬기로 시작하면 모델이 "회사 복도"를 office_hallway 로 지어내 검증에서 두 번 다 막혔다(개발 DB 재현).
    mocks.generate.mockResolvedValue(scenesAt('회사 복도'))
    await run()
    const system = String((mocks.generate.mock.calls[0][1] as { systemInstruction?: string }).systemInstruction)
    expect(system).toContain('office_hallway')
    expect(system).toMatch(/영어 snake_case/)
    expect(system).toContain('회사 복도')
  })

  it('영어 작품이면 장소 이름 예시도 영어로 든다', async () => {
    // 왜: 영어 작품에 한국어 예시만 주면 장소 이름이 한국어로 나올 수 있다(10/21 검토).
    mocks.generate.mockResolvedValue({ ...scenesAt('Office hallway', 'Minho drops a coin into the machine.'), scenes: [{ ...scenesAt('Office hallway', 'Minho drops a coin into the machine.').scenes[0], dialogue_summary: 'Minho drops a coin.' }] })
    await run({ outputLocale: 'en', story: 'Minho drops a coin into the vending machine.' })
    const system = String((mocks.generate.mock.calls[0][1] as { systemInstruction?: string }).systemInstruction)
    expect(system).toContain('Office hallway')
    expect(system).not.toContain('회사 복도')
  })

  it('새 장소를 영어 표기로 지어내면 그 장소 이름만 이야기 언어로 다시 받아 바꾸고 이어 간다', async () => {
    // 왜: 한 번 틀렸다고 트리트먼트 전체가 실패하면 처음부터 다시 해야 한다. 고장: 업로드한 대본을 다듬기로 시작할 때.
    mocks.generate
      .mockResolvedValueOnce(scenesAt('office_hallway', '민호가 office_hallway 끝의 자판기에 동전을 넣는다.'))
      .mockResolvedValueOnce({ office_hallway: '회사 복도' })

    const result = await run()

    expect(result.scenes[0].location).toBe('회사 복도')
    expect(result.scenes[0].scene_actions).toEqual(['민호가 회사 복도 끝의 자판기에 동전을 넣는다.'])
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(String(mocks.generate.mock.calls[1][0])).toContain('office_hallway')
    expect(logger.saveStage.mock.calls.some(([name]) => name === '05_s3_scenes.json')).toBe(true)
  })

  it('장소 이름만 바꾸고 씬 · 막 · 길이 · 인물은 그대로 둔다', async () => {
    // 왜: 이야기를 처음부터 다시 쓰게 하면 앞서 고친 막 · 길이가 다시 틀어질 수 있다(10/21 검토).
    mocks.generate
      .mockResolvedValueOnce(scenesAt('office_hallway'))
      .mockResolvedValueOnce({ office_hallway: '회사 복도' })

    const result = await run()

    expect(result.scenes[0]).toMatchObject({ scene_id: 'scene_1', act_ref: 'act_1', characters_in_scene: ['minho'], estimated_seconds: 6, dialogue_summary: '민호가 동전을 넣는다.' })
  })

  it('이름을 받아도 영어 표기가 남으면 알리고 완료한 이야기로 저장하지 않는다', async () => {
    // 왜: 정상 경로 고정 — 모르는 장소 표기가 남은 이야기는 배경 · 샷이 어긋나므로 넘기지 않는다(화면에 [다시 시도]가 뜬다).
    mocks.generate
      .mockResolvedValueOnce(scenesAt('office_hallway'))
      .mockResolvedValueOnce({})

    await expect(run()).rejects.toThrow(/unknown_location/)
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(logger.saveStage.mock.calls.some(([name]) => name === '05_s3_scenes.json')).toBe(false)
  })

  it('장소가 하나도 없을 때는 번호식 장소 표기도 이름만 다시 받아 바꾼다', async () => {
    // 왜: 장소 목록이 비면 가리킬 장소가 없어 번호식 표기(location_1)도 새로 지어낸 것이다(10/21 검토).
    mocks.generate
      .mockResolvedValueOnce(scenesAt('location_1'))
      .mockResolvedValueOnce({ location_1: '회사 복도' })

    const result = await run()

    expect(result.scenes[0].location).toBe('회사 복도')
  })
})
