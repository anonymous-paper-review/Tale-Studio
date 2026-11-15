// 영어 프로젝트에서 모델이 한국어로 써 온 샷 행동 글 · 씬 요약 · 씬 분위기 · 인물 외형은 영어로 옮긴 글이 화면 칸(_native)에 들어간다 (한국어 프로젝트 · 대사 줄은 그대로)
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DialogueTrack, ShotSequence } from '@/lib/writer/types/pipeline'

type Row = Record<string, unknown>
type DbResult = { data: unknown; error: { message: string } | null }

const mocks = vi.hoisted(() => ({
  locale: 'en' as string,
  responses: new Map<string, { data: unknown; error: { message: string } | null }>(),
  calls: [] as Array<{ table: string; op: string }>,
  inserts: [] as Array<{ table: string; rows: Array<Record<string, unknown>> }>,
  upserts: [] as Array<{ table: string; rows: Array<Record<string, unknown>> }>,
  rpcs: [] as Array<{ name: string; people: Array<Record<string, unknown>> }>,
  claudeJSON: vi.fn(),
}))

// 쿼리 체인 스텁 — 테이블 · 마지막 연산별로 응답을 주입하고, insert · upsert · rpc 로 나간 행을 모은다.
function chain(table: string) {
  const state = { op: 'select' }
  const result = (): DbResult =>
    mocks.responses.get(`${table}.${state.op}`) ??
    (table === 'projects' ? { data: { locale: mocks.locale }, error: null } : { data: [], error: null })
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'update', 'delete']) {
    c[m] = () => {
      state.op = m
      mocks.calls.push({ table, op: m })
      return c
    }
  }
  c.insert = (rows: Array<Record<string, unknown>>) => {
    state.op = 'insert'
    mocks.calls.push({ table, op: 'insert' })
    mocks.inserts.push({ table, rows })
    return c
  }
  c.upsert = (rows: Array<Record<string, unknown>>) => {
    state.op = 'upsert'
    mocks.calls.push({ table, op: 'upsert' })
    mocks.upserts.push({ table, rows })
    return c
  }
  for (const m of ['eq', 'neq', 'order', 'limit', 'in']) c[m] = () => c
  c.maybeSingle = () => Promise.resolve(result())
  c.single = () => Promise.resolve(result())
  c.then = (ok: (v: DbResult) => unknown, err?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, err)
  return c
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (table: string) => chain(table),
    rpc: (name: string, args: { p_people: Array<Record<string, unknown>> }) => {
      mocks.rpcs.push({ name, people: args.p_people })
      return Promise.resolve({ data: null, error: null })
    },
  },
}))
vi.mock('@/lib/flags', () => ({ isFlagOn: () => false }))
vi.mock('@/lib/writer/facet-render', () => ({
  facetsHash: () => 'facets-hash',
  renderDirectorPromptFromFacets: vi.fn(),
  renderDirectorPromptTemplate: vi.fn(),
}))
// 번역 모델 호출만 가짜로 바꾼다 — deriveEnBatch · deriveNativeBatch 는 진짜를 돌려, 영어 프로젝트에서 옮긴 글이 비는 실제 길을 그대로 탄다.
vi.mock('@/lib/claude', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/claude')>()),
  claudeJSON: mocks.claudeJSON,
}))

import { persistAssetsToDb, persistShotsToDb } from '@/lib/writer/pipeline/util/persist_manifest'

const md5 = (text: string) => createHash('md5').update(text).digest('hex')
const HANGUL = /[가-힣]/

const PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000'

// 새로 지은 예문 — 운영 프로젝트 글이 아니다.
const KO_ACTION_A = '소녀가 빗속에서 우산을 접고 문 앞에 선다.'
const EN_ACTION_A = 'A girl folds her umbrella in the rain and stops at the door.'
const KO_ACTION_B = '노인이 낡은 우체통 뚜껑을 열고 편지를 꺼낸다.'
const EN_ACTION_B = 'An old man lifts the lid of a worn mailbox and takes out a letter.'
const EN_ACTION_C = 'A boy kicks a stone along the empty road.'
const KO_OF_ACTION_C = '한 소년이 텅 빈 길을 따라 돌멩이를 찬다.'
const KO_SUMMARY = '비 오는 저녁, 소녀는 닫힌 가게 앞에서 오래 망설인다.'
const EN_SUMMARY = 'On a rainy evening, the girl hesitates for a long time in front of the closed shop.'
const KO_MOOD = '불안 → 안도'
const EN_MOOD = 'Anxiety → Relief'
const KO_LOOK = '곱슬머리에 둥근 안경을 쓴 이십 대 후반 여성'
const EN_LOOK = 'A woman in her late twenties with curly hair and round glasses'
const KO_PROP = '모서리가 닳은 갈색 가죽 가방'
const EN_PROP = 'A brown leather bag with worn corners'
const KO_LINE = '괜찮아, 이제 들어가자.'

const EN_OF: Record<string, string> = {
  [KO_ACTION_A]: EN_ACTION_A,
  [KO_ACTION_B]: EN_ACTION_B,
  [KO_SUMMARY]: EN_SUMMARY,
  [KO_MOOD]: EN_MOOD,
  [KO_LOOK]: EN_LOOK,
  [KO_PROP]: EN_PROP,
}
const KO_OF: Record<string, string> = {
  [EN_ACTION_C]: KO_OF_ACTION_C,
  [EN_ACTION_A]: KO_ACTION_A,
}

/** 번역 모델 대역 — 옮길 글은 표에서 찾고, 표에 없으면 눈에 띄는 꼬리표를 붙인다. fail* 이면 그 방향 호출이 실패한다. */
function installTranslator(opts: { failToEnglish?: boolean; failToNative?: boolean } = {}) {
  mocks.claudeJSON.mockImplementation(async (_system: string, user: string, _temperature: number, label: string) => {
    const toEnglish = label.startsWith('i18n-en:')
    if (toEnglish ? opts.failToEnglish : opts.failToNative) throw new Error('모델 호출 실패(시험용)')
    const { items } = JSON.parse(user.slice(user.indexOf('\n') + 1)) as { items: Array<{ id: string; native?: string; en?: string }> }
    return {
      items: items.map((item) =>
        toEnglish
          ? { id: item.id, en: EN_OF[item.native ?? ''] ?? `[EN] ${item.native}` }
          : { id: item.id, native: KO_OF[item.en ?? ''] ?? `[KO] ${item.en}` },
      ),
    }
  })
}

function shot(id: string, sceneId: string, action: string) {
  return {
    shot_id: id,
    duration_seconds: 5,
    S: { scene_id: sceneId, scene_purpose: 'p', emotion_beat: { start: 'calm', end: 'calm' }, character_action: action },
    C: { causal_link: { from: null, to: null }, info_disclosure: 'info' },
    V: { camera: { type: 'MS', angle: 'eye', movement: 'static' }, lighting: {}, composition: 'center', mood: 'quiet' },
    assets: { characters: [{ id: 'mara', asset_version: 'v1' }], locations: [] },
    first_frame_generation: { base_assets: ['mara'], composition_prompt: 'Mara by the window' },
    video_generation: { motion_prompt: 'still' },
  }
}

function sequence(shots: Array<Record<string, unknown>>): ShotSequence {
  return { project_id: PROJECT_ID, total_shots: shots.length, total_duration_seconds: shots.length * 5, depth_level: 'D4', shots } as unknown as ShotSequence
}

function dialogueTrack(shotId: string, line: string): DialogueTrack {
  return { profiles: [], scenes: [{ scene_id: 'scene_1', shots: [{ shot_id: shotId, dialogue: [{ character_id: 'mara', line, delivery: 'softly' }], narration: null }] }] } as unknown as DialogueTrack
}

async function saveShots(actions: Array<[string, string]>, dialogue: DialogueTrack | null = null): Promise<Row[]> {
  const shots = actions.map(([action, sceneId], i) => shot(`shot_${i + 1}`, sceneId, action))
  await persistShotsToDb(PROJECT_ID, sequence(shots), dialogue)
  return mocks.inserts.find((entry) => entry.table === 'shots')?.rows ?? []
}

function scene(over: Record<string, unknown> = {}) {
  return {
    scene_id: 'scene_1',
    location: 'loc_shop',
    time_of_day: 'evening',
    narrative_time: 'present',
    characters_in_scene: ['mara'],
    purpose: 'conflict',
    emotion_beat: { start: '불안', end: '안도' },
    dialogue_summary: KO_SUMMARY,
    info_asymmetry: 'audience=character',
    estimated_seconds: 10,
    scene_actions: ['소녀가 가게 앞에 선다.'],
    ...over,
  }
}

async function saveScenes(scenes: Array<Record<string, unknown>>): Promise<Row> {
  // 씬 저장은 같은 번호의 수동 씬이 이미 있으면 파이프라인 씬을 빼므로, 남아 있는 씬은 없는 것으로 둔다(샷 시험용 응답을 덮는다).
  mocks.responses.set('scenes.select', { data: [], error: null })
  await persistAssetsToDb(
    PROJECT_ID,
    { characters: [] } as never,
    { scenes, total_estimated_seconds: 10 } as never,
    { locations: [] } as never,
    { characters: [] } as never,
  )
  const rows = mocks.inserts.find((entry) => entry.table === 'scenes')?.rows ?? []
  return rows[0] ?? {}
}

async function saveCharacters(list: Array<Record<string, unknown>>) {
  await persistAssetsToDb(PROJECT_ID, { characters: list } as never, { scenes: [] } as never, { locations: [] } as never, { characters: [] } as never)
}

beforeEach(() => {
  mocks.locale = 'en'
  mocks.responses.clear()
  mocks.calls.length = 0
  mocks.inserts.length = 0
  mocks.upserts.length = 0
  mocks.rpcs.length = 0
  mocks.claudeJSON.mockReset()
  installTranslator()
  mocks.responses.set('character_appearances.select', {
    data: [{ character_id: 'mara', appearance_key: 'current', narrative_time: 'present', is_default: true }],
    error: null,
  })
  mocks.responses.set('scenes.select', {
    data: [
      { scene_id: 'sc_01', narrative_time: 'present' },
      { scene_id: 'sc_02', narrative_time: 'present' },
    ],
    error: null,
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('영어 프로젝트의 샷 화면 설명', () => {
  it('영어 프로젝트에서 샷 행동 글이 한국어로 오면 화면 설명에 영어로 옮긴 글을 쓴다', async () => {
    // 왜: 운영 영어 프로젝트의 씬 2 · 3 샷 19개가 Storyboard 에서 한국어로 보였다(리드 확인 11/15) — 모델이 그 씬의 행동 글을
    //   한국어로 써 왔는데, 영어 프로젝트는 옮긴 글을 만들지 않아 화면 칸(action_description_native)에 한국어 원문이 그대로 들어갔다.
    const rows = await saveShots([[KO_ACTION_A, 'scene_1'], [KO_ACTION_B, 'scene_2']])
    expect(rows.map((r) => r.action_description_native)).toEqual([EN_ACTION_A, EN_ACTION_B])
    expect(rows.map((r) => r.action_description)).toEqual([EN_ACTION_A, EN_ACTION_B])
    expect(rows.some((r) => HANGUL.test(String(r.action_description_native)))).toBe(false)
  })

  it('영어 프로젝트에서 샷 행동 글이 이미 영어면 화면 설명에 그 글을 그대로 쓰고 모델을 부르지 않는다', async () => {
    // 왜: 정상 경로 고정 — 영어 글은 옮길 것이 없다. 비용 없이 통과하는 지금 동작이 이 고침으로 바뀌면 안 된다.
    const rows = await saveShots([[EN_ACTION_C, 'scene_1']])
    expect(rows[0]).toMatchObject({ action_description: EN_ACTION_C, action_description_native: EN_ACTION_C })
    expect(mocks.claudeJSON).not.toHaveBeenCalled()
  })

  it('영어 프로젝트에서 한국어 행동 글을 영어로 못 옮기면 화면 설명에 한국어 원문을 그대로 둔다', async () => {
    // 왜: 번역 모델 호출이 실패한 저장 — 영어 글이 없어 화면에 둘 것이 원문뿐이다. 빈 칸이나 저장 실패보다 종전대로 원문이 낫다.
    installTranslator({ failToEnglish: true })
    const rows = await saveShots([[KO_ACTION_A, 'scene_1']])
    expect(rows[0]).toMatchObject({ action_description: KO_ACTION_A, action_description_native: KO_ACTION_A })
  })

  it('영어 글을 화면 설명으로 쓴 샷은 영어 글의 해시를 i18n_provenance 에 남긴다', async () => {
    // 왜: 한국어 프로젝트에서 옮긴 글이 이미 쓰는 표기(<칸>_native = 영어 글 해시)와 같게 — 나중에 영어 글이 바뀌면 낡은 화면 글을 가려내는 근거다.
    const rows = await saveShots([[KO_ACTION_A, 'scene_1']])
    expect(rows[0].i18n_provenance).toEqual({ action_description: md5(KO_ACTION_A), action_description_native: md5(EN_ACTION_A) })
  })

  it('영어 프로젝트에서 샷 행동 글이 이미 영어면 화면 설명 해시는 남기지 않는다', async () => {
    // 왜: 정상 경로 고정 — 영어 원문이 그대로 화면에 간 샷의 provenance 모양(원문 해시 하나)을 바꾸지 않는다.
    const rows = await saveShots([[EN_ACTION_C, 'scene_1']])
    expect(rows[0].i18n_provenance).toEqual({ action_description: md5(EN_ACTION_C) })
  })

  it('영어 프로젝트에서도 한국어 대사 줄은 한국어 그대로 저장한다', async () => {
    // 왜: 대사는 프로젝트 언어가 아니라 대사 언어 설정이 정한다(영어 프로젝트 + 한국어 대사 설정이 있다). 행동 글 고침이 대사를 영어로 바꾸면 안 된다.
    const rows = await saveShots([[KO_ACTION_A, 'scene_1']], dialogueTrack('shot_1', KO_LINE))
    const lines = rows[0].dialogue_lines as Array<{ text: string }>
    expect(lines.map((l) => l.text)).toEqual([KO_LINE])
  })
})

describe('한국어 프로젝트의 샷 화면 설명', () => {
  beforeEach(() => {
    mocks.locale = 'ko'
  })

  it('한국어 프로젝트에서 샷 행동 글이 한국어면 화면 설명에 그 글을 그대로 쓰고 영어 설명은 따로 옮긴다', async () => {
    // 왜: 정상 경로 고정 — 한국어 프로젝트의 한국어 원문은 원천이라 화면에 그대로, 생성용 영어 설명만 옮긴다.
    const rows = await saveShots([[KO_ACTION_A, 'scene_1']])
    expect(rows[0]).toMatchObject({ action_description: EN_ACTION_A, action_description_native: KO_ACTION_A })
  })

  it('한국어 프로젝트에서 샷 행동 글이 영어면 한국어로 옮긴 글을 화면 설명으로 쓴다', async () => {
    // 왜: 정상 경로 고정 — 파이프라인이 영어를 낸 샷은 한국어 프로젝트 화면에서 한국어로 보여야 한다.
    const rows = await saveShots([[EN_ACTION_C, 'scene_1']])
    expect(rows[0]).toMatchObject({ action_description: EN_ACTION_C, action_description_native: KO_OF_ACTION_C })
    expect(rows[0].i18n_provenance).toEqual({ action_description: md5(EN_ACTION_C), action_description_native: md5(EN_ACTION_C) })
  })

  it('한국어 프로젝트에서 영어 행동 글을 한국어로 못 옮기면 화면 설명에 영어 원문을 그대로 둔다', async () => {
    // 왜: 정상 경로 고정 — 한국어로 옮기는 호출이 실패한 저장. 종전대로 영어 원문을 두고, 영어를 한국어 프로젝트의 "옮긴 글"로 기록하지 않는다.
    installTranslator({ failToNative: true })
    const rows = await saveShots([[EN_ACTION_C, 'scene_1']])
    expect(rows[0]).toMatchObject({ action_description: EN_ACTION_C, action_description_native: EN_ACTION_C })
    expect(rows[0].i18n_provenance).toEqual({ action_description: md5(EN_ACTION_C) })
  })
})

describe('프로젝트 언어 조회', () => {
  it('프로젝트 언어를 읽지 못하면 영어로 보고 저장하지 않고 샷을 지우기 전에 저장 실패로 알린다', async () => {
    // 왜: 이제 영어면 한국어 원문 대신 영어 옮긴 글이 화면 칸에 들어간다. 조회가 한 번 실패한 것을 영어로 덮으면 한국어 프로젝트가 영어로 저장된다.
    mocks.responses.set('projects.select', { data: null, error: { message: 'connection reset' } })
    await expect(saveShots([[KO_ACTION_A, 'scene_1']])).rejects.toThrow(/projects locale read failed/)
    expect(mocks.calls.filter((c) => c.table === 'shots' && c.op === 'delete')).toEqual([])
    expect(mocks.inserts.filter((entry) => entry.table === 'shots')).toEqual([])
  })
})

describe('영어 프로젝트의 씬 화면 칸', () => {
  it('영어 프로젝트에서 씬 요약이 한국어로 오면 화면 요약에 영어로 옮긴 글을 쓴다', async () => {
    // 왜: 샷과 같은 구멍 — 씬 요약(dialogue_summary)이 한국어로 온 씬은 영어 프로젝트에서도 화면 칸에 한국어 원문이 들어갔다.
    const row = await saveScenes([scene()])
    expect(row).toMatchObject({ narrative_summary: EN_SUMMARY, narrative_summary_native: EN_SUMMARY })
    expect(row.i18n_provenance).toMatchObject({ narrative_summary: md5(KO_SUMMARY), narrative_summary_native: md5(EN_SUMMARY) })
  })

  it('영어 프로젝트에서 씬 분위기가 한국어로 오면 화면 분위기에 영어로 옮긴 글을 쓴다', async () => {
    // 왜: 샷과 같은 구멍 — 감정 곡선(emotion_beat)이 한국어로 온 씬의 분위기 칸.
    const row = await saveScenes([scene()])
    expect(row).toMatchObject({ mood: EN_MOOD, mood_native: EN_MOOD })
    expect(row.i18n_provenance).toMatchObject({ mood: md5(KO_MOOD), mood_native: md5(EN_MOOD) })
  })

  it('영어 프로젝트에서 대본에서 옮긴 씬의 요약은 대본 원문을 화면에 그대로 둔다', async () => {
    // 왜: 대본 보존은 사람이 쓴 것을 원천으로 두는 약속이다 — 영어 프로젝트에 한국어 대본을 넣어도 씬 카드 요약이 영어 번역으로 뒤바뀌면 안 된다.
    //   (생성용 영어 요약 narrative_summary 는 그대로 옮긴다.)
    const row = await saveScenes([scene({ provenance: { source: 'script', generated_fields: [] }, source_summary: KO_SUMMARY, dialogue_summary: '' })])
    expect(row).toMatchObject({ narrative_summary: EN_SUMMARY, narrative_summary_native: KO_SUMMARY })
    expect(row.i18n_provenance).not.toHaveProperty('narrative_summary_native')
  })

  it('영어 프로젝트에서 씬 요약이 이미 영어면 화면 요약에 그 글을 그대로 쓰고 모델을 부르지 않는다', async () => {
    // 왜: 정상 경로 고정 — 영어 글은 옮길 것이 없다. (분위기도 영어로 맞춰 모델 호출이 없다.)
    const row = await saveScenes([scene({ dialogue_summary: EN_SUMMARY, emotion_beat: { start: 'Anxiety', end: 'Relief' } })])
    expect(row).toMatchObject({ narrative_summary: EN_SUMMARY, narrative_summary_native: EN_SUMMARY, mood_native: EN_MOOD })
    expect(row.i18n_provenance).toEqual({ narrative_summary: md5(EN_SUMMARY), mood: md5(EN_MOOD) })
    expect(mocks.claudeJSON).not.toHaveBeenCalled()
  })

  it('한국어 프로젝트에서 씬 요약이 한국어면 화면 요약에 그 글을 그대로 쓴다', async () => {
    // 왜: 정상 경로 고정 — 한국어 프로젝트의 한국어 원문은 화면에 그대로다.
    mocks.locale = 'ko'
    const row = await saveScenes([scene()])
    expect(row).toMatchObject({ narrative_summary: EN_SUMMARY, narrative_summary_native: KO_SUMMARY, mood_native: KO_MOOD })
  })
})

describe('영어 프로젝트의 인물 · 사물 외형', () => {
  const person = { id: 'char', name: 'Mara', role: 'protagonist', entity_type: 'person', appearance_description: KO_LOOK }
  const object = { id: 'char_2', name: 'Bag', role: 'supporting', entity_type: 'object', appearance_description: KO_PROP }

  it('영어 프로젝트에서 새 인물 외형이 한국어로 오면 화면 외형에 영어로 옮긴 글을 쓴다', async () => {
    // 왜: 샷과 같은 구멍 — Writer 가 새로 만든 인물의 외형이 한국어로 오면 영어 프로젝트의 Artist 카드에 한국어 원문이 떴다.
    await saveCharacters([person])
    const people = mocks.rpcs.find((c) => c.name === 'upsert_people_with_default_appearances')?.people ?? []
    expect(people[0]).toMatchObject({ appearance: EN_LOOK, appearance_native: EN_LOOK })
    expect(people[0].i18n_provenance).toEqual({ appearance: md5(KO_LOOK), appearance_native: md5(EN_LOOK) })
  })

  it('영어 프로젝트에서 새 사물 외형이 한국어로 오면 사물 목록의 화면 외형도 영어로 옮긴 글을 쓴다', async () => {
    // 왜: 사물은 사람과 다른 저장 길(props)을 타지만 같은 외형 규칙을 쓴다.
    await saveCharacters([person, object])
    const props = mocks.upserts.find((u) => u.table === 'props')?.rows ?? []
    expect(props[0]).toMatchObject({ prop_id: 'char_2', appearance: EN_PROP, appearance_native: EN_PROP })
  })

  it('한국어 프로젝트에서 인물 외형이 한국어면 화면 외형에 그 글을 그대로 쓴다', async () => {
    // 왜: 정상 경로 고정 — 한국어 프로젝트의 한국어 원문은 화면에 그대로, 생성용 영어 외형만 옮긴다.
    mocks.locale = 'ko'
    await saveCharacters([person])
    const people = mocks.rpcs.find((c) => c.name === 'upsert_people_with_default_appearances')?.people ?? []
    expect(people[0]).toMatchObject({ appearance: EN_LOOK, appearance_native: KO_LOOK })
    expect(people[0].i18n_provenance).toEqual({ appearance: md5(KO_LOOK) })
  })
})

describe('이미 저장된 샷 고치기와 저장 코드는 같은 규칙이다', () => {
  it('옛 저장 코드가 남긴 샷을 고친 값은 고친 저장 코드가 새로 만든 값과 같다', async () => {
    // 왜: 운영에 넣을 고치기 목록이 저장 코드와 다른 규칙이면 고친 행과 새로 만든 행이 서로 다르게 보인다 — 같은 한 함수를 쓰는지 값으로 못 박는다.
    const fresh = (await saveShots([[KO_ACTION_A, 'scene_1']]))[0]
    const { planNativeScriptRepair } = await import('@/lib/writer/i18n/native-script')
    const oldRow = {
      id: 'row-1',
      shot_id: fresh.shot_id as string,
      scene_id: fresh.scene_id as string,
      action_description: fresh.action_description as string,
      action_description_native: KO_ACTION_A, // 옛 저장 코드: 영어 프로젝트라 한국어 원문이 그대로 들어갔다
      i18n_provenance: { action_description: md5(KO_ACTION_A) },
    }
    expect(planNativeScriptRepair('en', [oldRow])).toEqual([
      { id: 'row-1', action_description_native: fresh.action_description_native, i18n_provenance: fresh.i18n_provenance },
    ])
  })
})
