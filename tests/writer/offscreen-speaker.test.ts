// 등장인물 목록에 없는 목소리(음성 메시지 속 병원 직원 등)가 대사에 나와도 샷 저장이 멈추지 않는다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShotSequence, DialogueTrack } from '@/lib/writer/types/pipeline'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insertedShots: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/flags', () => ({ isFlagOn: () => false }))
vi.mock('@/lib/writer/facet-render', () => ({
  facetsHash: (spec: { shot_id?: string }) => `hash:${spec.shot_id ?? 'missing'}`,
  renderDirectorPromptFromFacets: vi.fn(),
  renderDirectorPromptTemplate: vi.fn(),
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async (items: Array<{ id: string; native: string }>) => new Map(items.map((item) => [item.id, item.native])),
  deriveNativeBatch: async () => new Map(),
  i18nHash: (value: string) => `i18n:${value}`,
  isTargetScript: () => false,
}))

import { persistShotsToDb } from '@/lib/writer/pipeline/util/persist_manifest'

const PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000'
const VOICEMAIL = '(O.S., recorded voicemail playing on phone speaker)'

function shot(id: string, characters: string[]) {
  return {
    shot_id: id,
    duration_seconds: 5,
    S: { scene_id: 'scene_1', scene_purpose: 'p', emotion_beat: { start: 'calm', end: 'calm' }, character_action: 'Mara listens to the phone' },
    C: { causal_link: { from: null, to: null }, info_disclosure: 'info' },
    V: { camera: { type: 'MS', angle: 'eye', movement: 'static' }, lighting: {}, composition: 'center', mood: 'quiet' },
    assets: { characters: characters.map((c) => ({ id: c, asset_version: 'v1' })), locations: [] },
    first_frame_generation: { base_assets: characters, composition_prompt: 'Mara by the window' },
    video_generation: { motion_prompt: 'still' },
  }
}

function sequence(shots: Array<Record<string, unknown>>): ShotSequence {
  return { project_id: PROJECT_ID, total_shots: shots.length, total_duration_seconds: shots.length * 5, depth_level: 'D4', shots } as unknown as ShotSequence
}

function dialogueTrack(lines: Array<{ shot: string; character_id: string; line: string; delivery?: string }>): DialogueTrack {
  const byShot = new Map<string, Array<{ character_id: string; line: string; delivery?: string }>>()
  for (const { shot: id, ...l } of lines) byShot.set(id, [...(byShot.get(id) ?? []), l])
  return {
    profiles: [],
    scenes: [{ scene_id: 'scene_1', shots: [...byShot].map(([shot_id, dialogue]) => ({ shot_id, dialogue, narration: null })) }],
  }
}

beforeEach(() => {
  mocks.insertedShots = []
  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => {
    if (table === 'shots') {
      return {
        select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
        delete: vi.fn(() => {
          const chain: Record<string, unknown> = {}
          chain.eq = vi.fn(() => chain)
          chain.then = (ok: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(ok)
          return chain
        }),
        insert: vi.fn(async (rows: Record<string, unknown>[]) => {
          mocks.insertedShots = rows
          return { error: null }
        }),
      }
    }
    if (table === 'projects') {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { locale: 'en' }, error: null })) })) })) }
    }
    if (table === 'character_appearances') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [
              { character_id: 'mara', appearance_key: 'current', narrative_time: 'present', is_default: true },
              { character_id: 'tom', appearance_key: 'current', narrative_time: 'present', is_default: true },
            ],
            error: null,
          })),
        })),
      }
    }
    if (table === 'scenes') {
      const chain = { eq: vi.fn(() => chain) }
      return {
        select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [{ scene_id: 'sc_01', narrative_time: 'present' }], error: null })) })),
        update: vi.fn(() => chain),
      }
    }
    if (table === 'scene_character_appearance_overrides') {
      return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) }
    }
    throw new Error(`unexpected table ${table}`)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('목록에 없는 화자의 대사', () => {
  it('대사 화자가 등장인물 목록에 없으면 그 대사는 화면 밖 목소리로 저장하고 샷은 그대로 저장한다', async () => {
    // 왜: 2026-10-27 운영 시연 프로젝트(10분)에서 대사 단계가 음성 메시지 속 병원 직원을 화자로 지어냈고,
    //   샷 저장이 그 화자의 모습을 찾다 세 번 다 실패해 샷 0개로 끝났다 — Storyboard 가 빈 화면으로 멈췄다.
    await persistShotsToDb(
      PROJECT_ID,
      sequence([shot('shot_1', ['mara'])]),
      dialogueTrack([
        { shot: 'shot_1', character_id: 'hospital_administrator', line: 'Ms. Vance, this is Saint Jude’s.', delivery: VOICEMAIL },
        { shot: 'shot_1', character_id: 'mara', line: 'Not now.' },
      ]),
    )

    expect(mocks.insertedShots).toHaveLength(1)
    const lines = mocks.insertedShots[0].dialogue_lines as Array<{ characterId: string | null; text: string }>
    expect(lines.map((l) => [l.characterId, l.text])).toEqual([
      [null, 'Ms. Vance, this is Saint Jude’s.'],
      ['mara', 'Not now.'],
    ])
  })

  it('목록에 없는 화자는 샷 인물과 인물 모습 칸에 넣지 않는다', async () => {
    // 왜: 그 화자는 그림도 모습도 없다 — 샷 인물로 들어가면 실사 스토리보드 · 영상이 인물 계약 오류로 그 샷을 멈춘다.
    await persistShotsToDb(
      PROJECT_ID,
      sequence([shot('shot_1', ['mara'])]),
      dialogueTrack([{ shot: 'shot_1', character_id: 'hospital_administrator', line: 'Please call us back.', delivery: VOICEMAIL }]),
    )

    expect(mocks.insertedShots[0].characters).toEqual(['mara'])
    expect(mocks.insertedShots[0].character_appearance_keys).toEqual({ mara: 'current' })
  })

  it('화면 밖 목소리로 바꾼 대사는 말투 설명을 그대로 지닌다', async () => {
    // 왜: "전화 스피커로 나오는 음성 메시지" 같은 설명이 영상 모델에게 이 목소리가 어디서 나는지 알려 준다.
    await persistShotsToDb(
      PROJECT_ID,
      sequence([shot('shot_1', ['mara'])]),
      dialogueTrack([{ shot: 'shot_1', character_id: 'hospital_administrator', line: 'Please call us back.', delivery: VOICEMAIL }]),
    )

    const lines = mocks.insertedShots[0].dialogue_lines as Array<{ delivery: string }>
    expect(lines[0].delivery).toBe(VOICEMAIL)
  })

  it('목록에 있는 화자는 지금처럼 샷 인물에 더해진다', async () => {
    // 왜: 정상 경로 고정 — 연기 주체 목록에서 빠진 화자도 인물 그림이 붙어야 한다(#w-a 2026-08-31 오너 확정).
    await persistShotsToDb(
      PROJECT_ID,
      sequence([shot('shot_1', ['mara'])]),
      dialogueTrack([{ shot: 'shot_1', character_id: 'tom', line: 'You came back.' }]),
    )

    expect(mocks.insertedShots[0].characters).toEqual(['mara', 'tom'])
    expect(mocks.insertedShots[0].character_appearance_keys).toEqual({ mara: 'current', tom: 'current' })
    const lines = mocks.insertedShots[0].dialogue_lines as Array<{ characterId: string | null }>
    expect(lines[0].characterId).toBe('tom')
  })

  it('대사 화자 id 가 대소문자나 버전 꼬리만 다르면 목록의 인물로 맞춰 저장한다', async () => {
    // 왜: 진짜 인물의 대사가 id 표기 차이("Mara" · "tom_v1")만으로 화면 밖 목소리가 되면 그 인물의 입이 안 움직인다.
    await persistShotsToDb(
      PROJECT_ID,
      sequence([shot('shot_1', ['mara'])]),
      dialogueTrack([
        { shot: 'shot_1', character_id: 'Mara', line: 'Dad?' },
        { shot: 'shot_1', character_id: 'tom_v1', line: 'You came.' },
      ]),
    )

    const lines = mocks.insertedShots[0].dialogue_lines as Array<{ characterId: string | null }>
    expect(lines.map((l) => l.characterId)).toEqual(['mara', 'tom'])
    expect(mocks.insertedShots[0].characters).toEqual(['mara', 'tom'])
  })
})
