// 씬의 새 장소를 영어 표기(office_hallway)로 지어내면 이야기 언어 장소명으로 한 번 다시 쓰게 하고, 그래도 남으면 알린다 (2026-10-21 오너 "업로드된 파일을 다듬기로 시작했을 때 Treatment 생성 실패")
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@/lib/writer/llm/local', () => ({ localGenerateJson: mocks.generate }))

import { runScenes } from '@/lib/writer/pipeline/stages/s3_scenes'
import type { Characters, Genre, NarrativeStructure, PipelineInput, Scenes } from '@/lib/writer/types/pipeline'
import type { PipelineLogger } from '@/lib/writer/logger'

const cast = { characters: [{ id: 'minho', name: '민호' }] } as Characters
const input = { story: 'S#1. 회사 복도 자판기 앞 / 밤\n민호가 동전을 넣는다.', outputLocale: 'ko', changeLevel: 'polish' } as PipelineInput
const genre = { depth_level: 'D1', runtime_seconds: 6 } as Genre
const structure = { acts: [{ act_id: 'act_1' }] } as NarrativeStructure
const logger = { saveStage: vi.fn(), saveLlmCall: vi.fn(), markStage: vi.fn() }
const scenesAt = (location: string): Scenes => ({
  scenes: [{ scene_id: 'scene_1', act_ref: 'act_1', location, narrative_time: 'present', characters_in_scene: ['minho'], scene_actions: ['민호가 자판기에 동전을 넣는다.'], estimated_seconds: 6, dialogue_summary: '민호가 동전을 넣는다.' } as Scenes['scenes'][number]],
  total_estimated_seconds: 6,
})
const run = () => runScenes(input, genre, structure, cast, undefined, logger as unknown as PipelineLogger, { provider: 'local', baseUrl: 'http://fixture.invalid' })

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
  })

  it('새 장소를 영어 표기로 지어내면 이야기 언어 장소명으로 한 번 다시 쓰게 해서 이어 간다', async () => {
    // 왜: 한 번 틀렸다고 트리트먼트 전체가 실패하면 처음부터 다시 해야 한다. 고장: 업로드한 대본을 다듬기로 시작할 때.
    mocks.generate.mockResolvedValueOnce(scenesAt('office_hallway')).mockResolvedValueOnce(scenesAt('회사 복도'))

    const result = await run()

    expect(result.scenes[0].location).toBe('회사 복도')
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    const repairPrompt = String(mocks.generate.mock.calls[1][0])
    expect(repairPrompt).toContain('office_hallway')
    expect(logger.saveStage.mock.calls.some(([name]) => name === '05_s3_scenes.json')).toBe(true)
  })

  it('다시 써도 영어 표기 장소가 남으면 알리고 완료한 이야기로 저장하지 않는다', async () => {
    // 왜: 정상 경로 고정 — 모르는 장소 표기가 남은 이야기는 배경 · 샷이 어긋나므로 넘기지 않는다(화면에 [다시 시도]가 뜬다).
    mocks.generate.mockResolvedValue(scenesAt('office_hallway'))

    await expect(run()).rejects.toThrow(/unknown_location/)
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(logger.saveStage.mock.calls.some(([name]) => name === '05_s3_scenes.json')).toBe(false)
  })
})
