// 이야기의 이름·참조·표시 언어를 실제 생성과 미리보기 경계에서 검사한다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), from: vi.fn(), run: vi.fn() }))
vi.mock('@/lib/writer/llm/local', () => ({ localGenerateJson: mocks.generate }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/writer/run-store', () => ({ getActiveRun: mocks.run }))
vi.mock('@/lib/api/guard', () => ({ requireProjectAccess: vi.fn(async () => ({ ok: true })) }))

import { runScenes, mergeOpenWorld } from '@/lib/writer/pipeline/stages/s3_scenes'
import { runV2Design } from '@/lib/writer/pipeline/stages/v2_design'
import { GET } from '@/app/api/writer/preview/[projectId]/route'
import { replaceSlugs } from '@/lib/script-lines'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import type { Characters, Scenes, Dramaturgy, Genre, PipelineInput, NarrativeStructure } from '@/lib/writer/types/pipeline'
import type { PipelineLogger } from '@/lib/writer/logger'

const cast = { characters: [{ id: 'char', name: '쿄타로' }, { id: 'char_2', name: '코마츠' }] } as Characters
const world = { locations: [{ id: 'school_roof', name: '학교 옥상', description: '' }, { id: 'vending_machine_corner', name: '자판기 앞', description: '' }] }
const candidate = { id: 'roof_stairs', name: '옥상 계단', description: '옥상으로 이어지는 계단', derived_from: '', scene_potential: [] }
const input = { story: '두 사람이 옥상에서 만난다.', outputLocale: 'ko' } as PipelineInput
const genre = { depth_level: 'D1', runtime_seconds: 6 } as Genre
const structure = { acts: [{ act_id: 'act_1' }] } as NarrativeStructure
const logger = { saveStage: vi.fn(), saveLlmCall: vi.fn(), markStage: vi.fn() }
const sceneResult = (): Scenes => ({
  scenes: [{ scene_id: 'scene_1', act_ref: 'act_1', location: 'school_roof', narrative_time: 'present', characters_in_scene: ['char', 'char_2'], scene_actions: ['char가 vending_machine_corner에서 char_2를 만난다.'], estimated_seconds: 6, dialogue_summary: '두 사람이 만난다.' } as Scenes['scenes'][number]],
  total_estimated_seconds: 6,
})
const execute = (result: Scenes, candidates?: Dramaturgy) => {
  mocks.generate.mockResolvedValue(result)
  return runScenes(input, genre, structure, cast, world, logger as unknown as PipelineLogger, { provider: 'local', baseUrl: 'http://fixture.invalid' }, undefined, candidates)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('이름을 정리한 이야기만 다음 단계에 넘긴다', () => {
  it('이야기 문장에 등록된 장소의 내부 식별자가 있으면 그 장소의 표시 이름으로 보여준다.', async () => {
    const result = await execute(sceneResult())
    expect(result.scenes[0].scene_actions).toEqual(['쿄타로가 자판기 앞에서 코마츠를 만난다.'])
    expect(result.scenes[0].location).toBe('school_roof')
    expect(result.scenes[0].characters_in_scene).toEqual(['char', 'char_2'])
    expect(logger.saveStage).toHaveBeenCalledWith('05_s3_scenes.json', result)
  })

  it('대사에 붙은 말투 설명도 인물 이름으로 정리하고 화자 참조는 보존한다.', async () => {
    const raw = sceneResult()
    raw.scenes[0].key_dialogue = [{ character_id: 'char', line: 'char_2, 여기야.', delivery: 'char_2에게 낮은 목소리로' }]
    const result = await execute(raw)
    expect(result.scenes[0].key_dialogue).toEqual([{ character_id: 'char', line: '코마츠, 여기야.', delivery: '코마츠에게 낮은 목소리로' }])
  })

  it('본문에서 채택한 장소 후보도 등록하고 그 장소의 이름을 보여준다.', async () => {
    const raw = sceneResult()
    raw.scenes[0].scene_actions = ['char가 roof_stairs에서 char_2를 만난다.']
    const merged = mergeOpenWorld(world, raw, [candidate])
    expect(merged.locations).toContainEqual({ id: 'roof_stairs', name: '옥상 계단', description: '옥상으로 이어지는 계단' })
    const result = await execute(raw, { core_engine: '', mechanism_notes: [], dramatic_diagnosis: { stakes: '', weak_beats: [], cdq_candidates: [], ending_check: '' }, world_inventory: [candidate] })
    expect(result.scenes[0].scene_actions).toEqual(['쿄타로가 옥상 계단에서 코마츠를 만난다.'])
    // 정리된 본문으로 다시 합쳐도 채택한 장소가 사라지지 않는다.
    expect(mergeOpenWorld(world, result, [candidate]).locations).toContainEqual({ id: 'roof_stairs', name: '옥상 계단', description: '옥상으로 이어지는 계단' })
  })

  it.each([
    ['필수 장소가 없으면', (r: Scenes) => { delete (r.scenes[0] as Partial<Scenes['scenes'][number]>).location }, /스키마/],
    ['이야기 목록이 배열이 아니면', (r: Scenes) => { Object.assign(r.scenes[0], { scene_actions: '잘못된 목록' }) }, /스키마/],
    ['등록되지 않은 인물을 참조하면', (r: Scenes) => { r.scenes[0].characters_in_scene = ['char2'] }, /unknown_character/],
    ['등록되지 않은 장소 식별자를 참조하면', (r: Scenes) => { r.scenes[0].location = 'location_99' }, /unknown_location/],
    ['문장 속에 등록되지 않은 식별자가 남으면', (r: Scenes) => { r.scenes[0].scene_actions = ['char2가 옥상에서 기다린다.'] }, /unresolved_identifier/],
    ['선택한 언어와 다른 이야기 문장이 나오면', (r: Scenes) => { r.scenes[0].scene_actions = ['The students wait on the roof.'] }, /output_language/],
  ])('%s 검증에서 알리고 완료한 이야기로 저장하지 않는다.', async (_why, inject, error) => {
    const raw = sceneResult()
    inject(raw)
    await expect(execute(raw)).rejects.toThrow(error)
    expect(logger.saveStage.mock.calls.some(([name]) => name === '05_s3_scenes.json')).toBe(false)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['한국어', 'ko'],
    ['영어', 'en'],
  ] as const)('%s 이야기에서 순수 일본어 서사 문장이 나오면 검증에서 알리고 완료한 이야기로 저장하지 않는다.', async (_name, locale) => {
    const raw = sceneResult()
    raw.scenes[0].scene_actions = ['二人は屋上で話している。']
    mocks.generate.mockResolvedValue(raw)
    await expect(runScenes({ ...input, outputLocale: locale }, genre, structure, cast, world, logger as unknown as PipelineLogger, { provider: 'local', baseUrl: 'http://fixture.invalid' })).rejects.toThrow(/output_language/)
    expect(logger.saveStage.mock.calls.some(([name]) => name === '05_s3_scenes.json')).toBe(false)
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it('등록된 일본어 이름과 숫자만 있는 비트 및 별도 발화 언어의 대사는 언어 오류로 막지 않는다.', async () => {
    const namedCast = { characters: [{ id: 'char', name: '京太郎' }, { id: 'char_2', name: '小松' }] } as Characters
    const namedWorld = { locations: [{ id: 'school_roof', name: '屋上', description: '' }] }
    for (const outputLocale of ['ko', 'en'] as const) {
      const raw = sceneResult()
      raw.scenes[0].scene_actions = ['京太郎、小松、屋上。', '123 45.']
      raw.scenes[0].key_dialogue = [{ character_id: 'char', line: '二人は屋上で話している。', delivery: '静かに' }]
      mocks.generate.mockResolvedValue(raw)
      const result = await runScenes({ ...input, outputLocale }, genre, structure, namedCast, namedWorld, logger as unknown as PipelineLogger, { provider: 'local', baseUrl: 'http://fixture.invalid' })
      expect(result.scenes[0].scene_actions).toEqual(['京太郎、小松、屋上。', '123 45.'])
      expect(result.scenes[0].key_dialogue?.[0].line).toBe('二人は屋上で話している。')
    }
  })

  it('이야기와 대사에 등록된 인물의 내부 식별자가 있으면 그 인물의 이름으로 보여준다.', () => {
    const entities = [...cast.characters, { id: 'char_20', name: 'Kai' }]
    const raw = 'char가 char_2와 char_20을 본다. char2와 charcoal은 그대로 둔다.'
    const expected = '쿄타로가 코마츠와 Kai을 본다. char2와 charcoal은 그대로 둔다.'
    expect(resolveEntityNames(raw, entities)).toBe(expected)
    expect(replaceSlugs(raw, entities.map((e) => ({ slug: e.id, name: e.name })), '')).toBe(expected)
  })

  it('별칭과 실제 등록 식별자가 겹치면 실제 등록된 인물 이름을 우선한다.', () => {
    const names = [{ id: 'char_2', name: '코마츠' }, { id: 'character_2', name: 'Kai' }]
    for (const rows of [names, names.toReversed()]) {
      expect(resolveEntityNames('char_2와 character_2', rows)).toBe('코마츠와 Kai')
    }
  })
})

describe('화면 구성 결과의 구조와 참조도 저장 전에 검사한다', () => {
  const design = () => ({
    characterVisual: { characters: [{ character_id: 'char', appearance: '검은 교복', costume: [], palette: [] }, { character_id: 'char_2', appearance: '흰 교복', costume: [], palette: [] }] },
    worldVisual: { global_palette: { primary: '', secondary: '', accent: '', forbidden: [] }, color_meaning: {}, locations: world.locations.map((l) => ({ id: l.id, style_description: l.name, lighting_sources: [], props: [] })), vfx_approach: '' },
  })
  const executeDesign = async (raw: unknown) => {
    mocks.generate.mockResolvedValue(raw)
    return runV2Design({ style: {} } as never, null, cast, world, '', logger as unknown as PipelineLogger, { provider: 'local', baseUrl: 'http://fixture.invalid' }, 'ko')
  }

  it('화면 구성이 장소를 다음 단계로 넘길 때 등록된 표시 이름을 함께 유지한다.', async () => {
    const result = await executeDesign(design())
    expect(result.worldVisual.locations[1]).toMatchObject({ id: 'vending_machine_corner', name: '자판기 앞' })
  })

  it.each([
    ['인물 목록이 배열이 아니면', () => ({ ...design(), characterVisual: { characters: '잘못된 목록' } }), /스키마/],
    ['등록되지 않은 인물을 반환하면', () => ({ ...design(), characterVisual: { characters: [{ character_id: 'char2', appearance: '', costume: [], palette: [] }] } }), /unknown_character/],
    ['등록되지 않은 장소를 반환하면', () => ({ ...design(), worldVisual: { ...design().worldVisual, locations: [{ id: 'location_99', style_description: '', lighting_sources: [], props: [] }] } }), /unknown_location/],
  ])('%s 검증에서 알리고 화면 구성을 저장하지 않는다.', async (_why, raw, error) => {
    await expect(executeDesign(raw())).rejects.toThrow(error)
    expect(logger.saveStage).not.toHaveBeenCalled()
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })
})

function installPreview(locale: 'ko' | 'en', locked = true, native: string | null = '검은 교복을 입은 학생') {
  const raw = sceneResult()
  mocks.run.mockResolvedValue({ status: 'running', state: { input, characters: cast, scenes: raw } })
  const rows: Record<string, unknown> = {
    projects: { locale, locale_locked: locked },
    characters: [{ character_id: 'char', name: '쿄타로', role: 'protagonist' }],
    character_appearances: [{ character_id: 'char', appearance: 'A student in a black uniform', appearance_native: native }],
    locations: [{ location_id: 'vending_machine_corner', name: '자판기 앞', visual_description: 'A corner with vending machines', visual_description_native: native ? '자판기가 놓인 모퉁이' : null }],
  }
  mocks.from.mockImplementation((table: string) => {
    const value = { data: rows[table] ?? [], error: null }
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => value), then: (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve) }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    return query
  })
}

async function preview(uiLocale = 'en') {
  const response = await GET(new NextRequest(`http://localhost/api/writer/preview/project?locale=${uiLocale}`), { params: Promise.resolve({ projectId: 'project' }) })
  expect(response.status).toBe(200)
  return response.json()
}

describe('미리보기에서 콘텐츠 언어와 전체 등록 이름을 사용한다', () => {
  it('인물과 배경 미리보기의 설명은 선택된 콘텐츠 언어의 표시용 설명을 사용한다.', async () => {
    installPreview('ko')
    const body = await preview('en')
    expect(body.characters[0].description).toBe('검은 교복을 입은 학생')
    expect(body.worlds[0].description).toBe('자판기가 놓인 모퉁이')
    expect(body.roster).toContainEqual({ slug: 'vending_machine_corner', name: '자판기 앞' })
    expect(body.scenes[0].beats).toEqual(['쿄타로가 자판기 앞에서 코마츠를 만난다.'])
  })

  it('잠기지 않은 프로젝트의 설명은 현재 화면 언어를 따른다.', async () => {
    installPreview('en', false)
    expect((await preview('ko')).characters[0].description).toBe('검은 교복을 입은 학생')
    expect((await preview('en')).characters[0].description).toBe('A student in a black uniform')
  })

  it('표시용 번역이 없으면 원래 설명을 남기고 번역이 없는 상태를 구분한다.', async () => {
    installPreview('ko', true, null)
    const body = await preview('ko')
    expect(body.characters[0].description).toBe('A student in a black uniform')
    expect(body.characters[0].descriptionFallback).toBe(true)
    expect(body.worlds[0].descriptionFallback).toBe(true)
  })
})
