// 채팅 · [+ 샷 추가]로 더한 샷의 빈 칸(인물 자리 · 자세 · 모습 · 빛)을 같은 씬 앞뒤 샷과 씬 무대로 채우는지 검사한다(오너 2026-11-27 N2)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompassDir, SceneStage, StagePosture } from '@/lib/writer/types/pipeline'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; filters: string[] }>,
  reads: [] as string[],
}))
// 글 모델 입구 — 채우기가 부르면 기록된다(검토 rev-addshot 5: 글자가 아니라 실제 부름으로 본다).
const llm = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('@/lib/writer/llm/dispatch', () => ({ generateJson: async () => { llm.calls.push('generateJson'); return {} } }))
vi.mock('@/lib/writer/llm/claude', () => ({ claudeGenerate: async () => { llm.calls.push('claudeGenerate'); return '' } }))
vi.mock('@/lib/writer/llm/gemini', () => ({
  geminiGenerate: async () => { llm.calls.push('geminiGenerate'); return '' },
  geminiGenerateJson: async () => { llm.calls.push('geminiGenerateJson'); return {} },
}))
vi.mock('@/lib/claude', () => ({
  claudeChat: async () => { llm.calls.push('claudeChat'); return '' },
  claudeJSON: async () => { llm.calls.push('claudeJSON'); return {} },
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: async () => { llm.calls.push('deriveEnBatch'); return new Map() },
  deriveNativeBatch: async () => { llm.calls.push('deriveNativeBatch'); return new Map() },
}))

// 서버 쪽 칸 읽기 · 쓰기(refillAddedShots)가 쓰는 만큼만 흉내 낸 DB — 거르개는 eq · in 만 실제로 거르고, 나머지는 기록만 한다.
vi.mock('@/lib/supabase/admin', () => {
  const from = (table: string) => {
    const filters: string[] = []
    const eqs: Array<[string, unknown]> = []
    const ins: Array<[string, unknown[]]> = []
    let patch: Record<string, unknown> | null = null
    const rows = () => (db.tables[table] ?? []).filter((row) => eqs.every(([k, v]) => row[k] === v) && ins.every(([k, vs]) => vs.includes(row[k])))
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (k: string, v: unknown) => { eqs.push([k, v]); filters.push(`eq:${k}`); return q }
    q.in = (k: string, vs: unknown[]) => { ins.push([k, vs]); return q }
    q.is = (k: string) => { filters.push(`is:${k}`); return q }
    q.or = (f: string) => { filters.push(`or:${f}`); return q }
    q.order = () => q
    q.update = (p: Record<string, unknown>) => { patch = p; return q }
    q.maybeSingle = async () => { db.reads.push(table); return { data: rows()[0] ?? null, error: null } }
    q.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      if (patch) {
        const hit = rows()
        db.updates.push({ table, patch, filters: [...filters] })
        for (const row of hit) Object.assign(row, patch)
        return Promise.resolve({ data: hit.map((row) => ({ shot_id: row.shot_id })), error: null }).then(resolve, reject)
      }
      db.reads.push(table)
      return Promise.resolve({ data: rows(), error: null }).then(resolve, reject)
    }
    return q
  }
  return { supabaseAdmin: { from } }
})

import { fillAddedShot, isAddedFillSpec, isFillableAddedShot, type AddedShotRow } from '@/lib/writer/pipeline/stage/added_shot'
import { refillAddedShots } from '@/lib/writer/pipeline/util/added_shot_persist'
import { leftToRight, roughIsStaticHold, poseOf, stillCharacterLabel } from '@/lib/director/still-prompt'
import { describePhotoCharacterRef } from '@/lib/director/photo-strip'
import { shotCardChips, shotStageDesign } from '@/lib/writer/board-card'
import { ADD_SHOT_START_LIGHTING } from '@/lib/writer/add-shot-defaults'
import { buildRoughGridCell, describePlacement } from '@/lib/writer/rough-storyboard-grid'
import type { RoughStoryboardSpec } from '@/lib/writer/rough-storyboard'

const read = (rel: string) => readFileSync(rel, 'utf8')

// 씬 무대: 민아(서쪽)는 앉아 있고 준(동쪽)은 서 있다가 비트 0 안에서 앉는다 — 장부가 그 변화를 shot_2 에 맡겼다.
const STAGE: SceneStage = {
  scene_id: 'scene_1',
  unit: 'm',
  landmarks: [{ id: 'table', label: 'table', x: 0, y: 2 }],
  axis: { from: 'mina', to: 'jun' },
  camera_side: 'right',
  beats: [
    {
      beat: 0,
      characters: [
        { character_id: 'mina', x: -1, y: 0, facing_deg: 90, posture: 'sitting' },
        { character_id: 'jun', x: 1, y: 0, facing_deg: 270, posture: 'standing' },
      ],
      end_characters: [
        { character_id: 'mina', x: -1, y: 0, facing_deg: 90, posture: 'sitting' },
        { character_id: 'jun', x: 1, y: 0, facing_deg: 270, posture: 'sitting' },
      ],
    },
    {
      beat: 1,
      characters: [
        { character_id: 'mina', x: -1, y: 0, facing_deg: 90, posture: 'sitting' },
        { character_id: 'jun', x: 1, y: 0, facing_deg: 270, posture: 'sitting' },
      ],
    },
  ],
  ledger: {
    scene_id: 'scene_1',
    transitions: [{ character_id: 'jun', beat: 0, kind: 'posture', from: 'standing', to: 'sitting', verb: 'sits down', shown_by: ['shot_2'], injected_into: [], covered: true, owner: 'shot_2' }],
  },
  version: 2,
}

const LIGHT = { key_fill_ratio: '4:1', color_temp_kelvin: 4500, quality: 'soft', key_direction: 'top_left' }
const CAMERA = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }
const LIGHTING = { position: 'front', brightness: 50, colorTemp: 5000 }

const place = (posture: StagePosture, x: number) => ({
  in_frame: true, screen_x: x, screen_y: -0.5, distance_m: 6, apparent_height: 0.4,
  position_in_frame: x < 0 ? 'left_third' : 'right_third', depth_band: 'midground', facing: 'three_quarter_front_left', posture,
})

/** 파이프라인이 만든 샷 행 — chars: 인물 → [시작 자세, 끝 자세?]. */
function pipelineShot(
  shot_id: string,
  design_ref: string,
  o: { beat: number; type: string; lens: number; from: CompassDir; keys: Record<string, string>; chars: Record<string, [StagePosture, StagePosture?]>; lighting?: Record<string, unknown>; setup?: Record<string, unknown> },
): AddedShotRow {
  const ids = Object.keys(o.chars)
  return {
    shot_id, scene_id: 'sc_01', source: 'pipeline', shot_type: o.type, characters: ids, character_appearance_keys: o.keys,
    camera_config: CAMERA, lighting_config: LIGHTING, design_ref,
    static_spec: {
      shot_id: design_ref, shot_type: o.type, lens_mm: o.lens, camera_angle: 'eye_level', depth_of_field: 'shallow',
      framing: { rule: 'thirds', layers: { foreground: 'teacup', midground: 'two people', background: 'window' }, focal_point: "Mina's hands" },
      lighting: o.lighting ?? LIGHT,
      character_blocking: ids.map((id) => ({ character_id: id, position_in_frame: id === 'mina' ? 'left_third' : 'right_third', pose: o.chars[id][0], gaze: 'toward_camera', asset_version: 'v1' })),
      prop_placement: [{ prop: 'teacup', position_in_frame: 'center' }],
      palette_emphasis: ['#112233'], texture_notes: 'grain', color_grading_intent: 'cool', first_frame_prompt: 'first frame',
      camera_setup: { subject: 'group', from_direction: o.from, height: 'eye', lens_mm: o.lens, over_shoulder_of: null, axis_cross: 'none', end: null, pov_of: null, ...(o.setup ?? {}) },
      screen_layout: {
        beat: o.beat,
        camera: { x: 0, y: -6, z: 1.5, look_at: { x: 0, y: 0, z: 1.2 }, lens_mm: o.lens, hfov_deg: 54 },
        characters: ids.map((id) => {
          const [start, end] = o.chars[id]
          const x = id === 'mina' ? -0.4 : 0.4
          return { character_id: id, start: place(start, x), ...(end ? { end: place(end, x) } : {}) }
        }),
        issues: [],
      },
    },
    dynamic_spec: { shot_id: design_ref, camera_motion: { type: 'dolly_in', direction: 'forward', speed: 'slow', magnitude: 'moderate' }, character_motion: [{ character_id: 'jun', verb: 'sits down', magnitude: 'medium' }], motion_prompt: 'Jun sits down.' },
  }
}

const P1 = pipelineShot('sh_01_01', 'shot_1', { beat: 0, type: 'WS', lens: 35, from: 'SW', keys: { mina: 'young' }, chars: { mina: ['sitting'] } })
const P2 = pipelineShot('sh_01_02', 'shot_2', { beat: 0, type: 'MS', lens: 50, from: 'SE', keys: { mina: 'young', jun: 'suit' }, chars: { mina: ['sitting'], jun: ['standing', 'sitting'] } })
const P3 = pipelineShot('sh_01_03', 'shot_3', { beat: 1, type: 'CU', lens: 85, from: 'W', keys: { jun: 'suit' }, chars: { jun: ['sitting'] }, lighting: { ...LIGHT, color_temp_kelvin: 5200 } })

/** 채팅 · [+ 샷 추가]가 넣는 행 그대로(writer-store addShot) — 설계 칸은 비어 있고 모습 키는 모두 'current'. */
function addedShot(shot_id: string, characters: string[], extra: Partial<AddedShotRow> = {}): AddedShotRow {
  return {
    shot_id, scene_id: 'sc_01', source: 'manual', shot_type: 'MS', characters,
    character_appearance_keys: Object.fromEntries(characters.map((c) => [c, 'current'])),
    camera_config: CAMERA, lighting_config: LIGHTING, static_spec: null, dynamic_spec: null, design_ref: null,
    action_description: '두 사람이 탁자를 사이에 두고 마주 본다', action_description_native: '두 사람이 탁자를 사이에 두고 마주 본다',
    ...extra,
  }
}

type FilledSpec = {
  shot_type: string
  lens_mm?: number
  camera_angle?: string
  lighting?: Record<string, unknown>
  framing?: unknown
  character_blocking?: Array<{ character_id: string; pose: string; position_in_frame: string; gaze: string }>
  camera_setup?: { from_direction: string; lens_mm: number; height: string; subject: unknown; end?: unknown }
  screen_layout?: { beat: number; end_camera?: unknown; off_frame?: unknown; characters: Array<{ character_id: string; start: { screen_x: number }; end?: unknown }> }
  added_fill: { from: string | null; side: string | null; beat: number | null; lighting_from: string | null }
  [key: string]: unknown
}
function fill(shot: AddedShotRow, sceneShots: AddedShotRow[], stage: unknown = STAGE) {
  const result = fillAddedShot({ shot, sceneShots, stage, format: 'horizontal_16:9' })
  if (!result) throw new Error('not filled')
  return { result, spec: result.static_spec as FilledSpec | null }
}
const poseById = (spec: FilledSpec | null) => new Map((spec?.character_blocking ?? []).map((b) => [b.character_id, poseOf(b.pose)]))

describe('더한 샷의 인물 자리 · 자세 채우기', () => {
  // 왜: 오너 N2 — 채팅으로 더한 샷은 누가 어디 서고 어떤 자세인지 비어 있어, 인물이 둘 이상이면 러프 · 실사가 누가 누구인지 몰랐다.
  it('채팅으로 더한 샷은 같은 씬 앞 샷이 끝난 무대 상태로 인물 자리 · 자세를 채운다', () => {
    const added = addedShot('sh_01_04', ['mina', 'jun'])
    const { spec } = fill(added, [P1, P2, added, P3])
    expect(spec?.added_fill).toMatchObject({ from: 'sh_01_02', side: 'end', beat: 0 })
    expect(spec?.screen_layout?.beat).toBe(0)
    // 앞 샷(shot_2)이 준의 앉기를 보여 주는 샷이라 그 끝 = 앉음.
    expect(poseById(spec)).toEqual(new Map([['mina', 'sitting'], ['jun', 'sitting']]))
    const x = new Map(spec?.screen_layout?.characters.map((c) => [c.character_id, c.start.screen_x]))
    expect(x.get('mina')!).toBeLessThan(x.get('jun')!)
  })

  // 왜: 무대 장부의 핀 규칙(stage/ledger.ts "앞 샷은 START, 뒤 샷은 END") — 변화를 보여 주는 샷보다 앞에 끼운 샷이 변화 뒤 모습이면 그 변화가 두 번 보인다.
  it('장부가 정한 변화 주인 샷보다 앞이면 변화 전, 뒤면 변화 뒤 상태를 잇는다', () => {
    const before = addedShot('sh_01_05', ['mina', 'jun'])
    expect(poseById(fill(before, [P1, before, P2, P3]).spec).get('jun')).toBe('standing')
    const after = addedShot('sh_01_06', ['mina', 'jun'])
    expect(poseById(fill(after, [P1, P2, after, P3]).spec).get('jun')).toBe('sitting')
  })

  // 왜: 씬 맨 앞에 더한 샷은 앞 샷이 없다 — 바로 뒤 샷이 시작하는 모습에서 이어져야 컷이 튀지 않는다(리드 해석).
  it('씬 첫 자리에 더한 샷은 뒤 샷이 시작하는 무대 상태로 채운다', () => {
    const added = addedShot('sh_01_07', ['jun'], { action_description: '준이 고개를 든다', action_description_native: '준이 고개를 든다' })
    const { spec } = fill(added, [added, P3])
    expect(spec?.added_fill).toMatchObject({ from: 'sh_01_03', side: 'start', beat: 1 })
    expect(poseById(spec).get('jun')).toBe('sitting')
  })

  // 왜: 씬에 샷이 하나도 없는 채로 샷을 더하면(새 씬) 이을 샷이 없다 — 씬 무대만으로 채운다(리드 해석).
  it('앞뒤에 샷이 없으면 씬 무대의 첫 순간으로 채운다', () => {
    const added = addedShot('sh_01_08', ['mina', 'jun'])
    const { spec } = fill(added, [added])
    expect(spec?.added_fill).toMatchObject({ from: null, side: 'start', beat: 0 })
    expect(poseById(spec)).toEqual(new Map([['mina', 'sitting'], ['jun', 'standing']]))
  })

  // 왜: 무대가 없는 옛 프로젝트는 계산할 재료가 없다 — 자리 · 자세는 지금처럼 비워 두고 러프는 지금 칸으로 그린다.
  it('씬 무대가 없으면 자리 · 자세는 지금처럼 비워 둔다', () => {
    const added = addedShot('sh_01_09', ['mina', 'jun'])
    const { spec } = fill(added, [P1, added], null)
    expect(spec?.character_blocking).toBeUndefined()
    expect(spec?.screen_layout).toBeUndefined()
    expect(spec?.lighting).toEqual(LIGHT)
    const lonely = addedShot('sh_01_10', ['mina'])
    expect(fill(lonely, [lonely], null).spec).toBeNull()
  })

  // 왜: 모습 키가 모두 'current'라 과거 장면에서도 지금 모습 시트가 붙었다 — 같은 씬 샷이 쓴 그 인물의 모습을 잇는다.
  it('인물 모습은 같은 씬 앞 샷(없으면 뒤 샷)의 그 인물 모습을 이어받는다', () => {
    const added = addedShot('sh_01_11', ['mina', 'jun', 'kim'])
    const { result } = fill(added, [P1, added, P2])
    // 민아 = 앞 샷 P1, 준 = P1 에 없어 뒤 샷 P2, 김 = 씬 어디에도 없어 지금처럼 'current'.
    expect(result.character_appearance_keys).toEqual({ mina: 'young', jun: 'suit', kim: 'current' })
  })

  // 왜: 리드 해석 — 움직임은 그 샷만의 것이다. 앞 샷의 달리 · 앉기를 베끼면 더한 샷이 엉뚱하게 움직인다.
  it('앞뒤 샷의 움직임(인물 동작 · 카메라 움직임)은 베껴 오지 않는다', () => {
    const added = addedShot('sh_01_12', ['mina', 'jun'])
    const { result, spec } = fill(added, [P1, P2, added, P3])
    expect(result).not.toHaveProperty('dynamic_spec')
    expect(spec?.screen_layout?.end_camera).toBeUndefined()
    expect(spec?.screen_layout?.characters.every((c) => c.end === undefined)).toBe(true)
    expect(spec?.camera_setup?.end ?? null).toBeNull()
  })

  // 왜: 리드 해석 — 이야기 · 샷 크기 · 길이 · 대사 · 인물은 사람이 더할 때 정한 것이다. 채우기는 빈 칸만 채운다.
  it('더한 샷의 이야기 · 샷 크기 · 길이 · 대사 · 인물 목록은 그대로 둔다', () => {
    const added = addedShot('sh_01_13', ['jun'], { shot_type: 'CU' })
    const { result, spec } = fill(added, [P1, P2, added, P3])
    expect(Object.keys(result).sort()).toEqual(['character_appearance_keys', 'static_spec'])
    expect(spec?.shot_type).toBe('CU')
    expect(Object.keys(result.character_appearance_keys)).toEqual(['jun'])
  })

  // 왜: 파이프라인 샷 · 다른 설계를 가진 샷의 칸을 덮으면 그 샷의 러프 · 실사 · 영상 지시문이 바뀐다(리드: 한 글자도 안 바뀌게).
  it('파이프라인이 만든 샷은 한 칸도 바꾸지 않는다', () => {
    expect(fillAddedShot({ shot: P2, sceneShots: [P1, P2, P3], stage: STAGE })).toBeNull()
    const base = addedShot('sh_01_14', ['mina'])
    expect(isFillableAddedShot({ ...base, design_ref: 'shot_9' })).toBe(false)
    expect(isFillableAddedShot({ ...base, dynamic_spec: { camera_motion: { type: 'static' } } })).toBe(false)
    expect(isFillableAddedShot({ ...base, static_spec: { engine: 'writer-v2', camera: 'slow pan' } })).toBe(false)
    expect(isFillableAddedShot(base)).toBe(true)
    const filled = fill(base, [P1, base]).spec
    expect(isAddedFillSpec(filled)).toBe(true)
    // 채운 칸은 다시 채울 수 있다(고친 뒤 다시 그릴 때).
    expect(isFillableAddedShot({ ...base, static_spec: filled })).toBe(true)
  })

  // 왜: 더한 샷 러프는 움직임이 없어 세 장이 같은 그림으로 그려진다 — 칸을 채웠다고 실사가 "화살표를 따라 움직여라"로 바뀌면 러프와 어긋난다.
  it('채운 더한 샷도 러프를 그대로 두었으면 실사는 지금처럼 세 장 같은 그림으로 그린다', () => {
    const added = addedShot('sh_01_15', ['mina', 'jun'])
    const spec = fill(added, [P1, P2, added]).spec
    const t = 1_794_863_000_000
    const drawn = { generatedAt: t + 1400, frames: { start: `a.png?v=${t}`, direction: `b.png?v=${t + 10}`, end: `c.png?v=${t + 600}` } }
    expect(roughIsStaticHold({ source: 'manual', static_spec: spec, dynamic_spec: null, design_ref: null, rough_storyboard: drawn })).toBe(true)
    expect(roughIsStaticHold({ source: 'manual', static_spec: { engine: 'writer-v2', camera: 'slow pan left' }, dynamic_spec: null, design_ref: null, rough_storyboard: drawn })).toBe(false)
  })

  // 왜: 리드 해석 "새 LLM 호출은 되도록 없이" — 채우기는 파이프라인의 무대 계산만 쓴다(시간 · 원가 0).
  //   (검토 rev-addshot 5: 글자 검사가 아니라 채우기를 실제로 돌려 글 모델 입구 · 번역이 한 번도 불리지 않는 것을 본다.)
  it('채우기는 글 모델을 부르지 않는다', async () => {
    llm.calls.length = 0
    const added = addedShot('sh_01_60', ['mina', 'jun'], { action_description: '두 사람이 일어난다', action_description_native: '두 사람이 일어난다' })
    fill(added, [P1, P2, added, P3])
    fill(addedShot('sh_01_61', ['jun'], { action_description: '준이 창가에 서 있다' }), [P3])
    db.tables = { shots: [{ project_id: 'p', sort_order: 0, ...P1 }, { project_id: 'p', sort_order: 1, ...added }], scenes: [{ project_id: 'p', scene_id: 'sc_01', stage: STAGE }], projects: [{ id: 'p', settings: {} }] }
    await refillAddedShots('p', ['sh_01_60'])
    expect(llm.calls).toEqual([])
    db.tables = {}
  })
})

describe('혼자 정한 채우기 규칙', () => {
  // 왜: 같은 씬 안에서 빛 방향 · 색온도가 샷마다 다르면 더한 샷만 다른 시간처럼 보인다. 사람이 창에서 고른 빛은 그 사람의 뜻이다.
  it('빛은 앞 샷(없으면 뒤 샷)의 빛을 잇고, [+ 샷 추가] 창에서 빛을 고른 샷은 빌리지 않는다', () => {
    const mid = addedShot('sh_01_16', ['mina'])
    expect(fill(mid, [P1, mid, P3]).spec).toMatchObject({ lighting: LIGHT, added_fill: { lighting_from: 'sh_01_01' } })
    const first = addedShot('sh_01_17', ['jun'])
    expect(fill(first, [first, P3]).spec?.lighting).toMatchObject({ color_temp_kelvin: 5200 })
    const chosen = addedShot('sh_01_18', ['mina'], { lighting_config: { position: 'left', brightness: 70, colorTemp: 3200 } })
    expect(fill(chosen, [P1, chosen]).spec?.lighting).toBeUndefined()
  })

  // 왜: [+ 샷 추가] 창은 빛을 처음부터 5600K 로 보여 주고 그 값을 그대로 저장한다 — 손대지 않은 그 값을 "사람이 고른 빛"으로 읽어
  //   보드로 더한 샷만 빛을 못 이었다(2026-11-27 dev 계정 화면 확인, 씬 4 끝에 더한 샷).
  it('[+ 샷 추가] 창의 빛을 처음 값 그대로 두었으면 고른 것이 아니라 앞뒤 샷의 빛을 잇는다', () => {
    const untouched = addedShot('sh_01_28', ['mina'], { lighting_config: { ...ADD_SHOT_START_LIGHTING } })
    expect(fill(untouched, [P1, untouched]).spec?.lighting).toEqual(LIGHT)
    expect(read('src/features/writer/add-item-dialog.tsx')).toMatch(/useState<LightingConfig\['position'\]>\(ADD_SHOT_START_LIGHTING\.position\)/)
  })

  // 왜: 앞 샷과 같은 쪽에서 봐야 두 사람의 좌우가 이어진다. 렌즈는 같은 씬에서 같은 크기 샷이 쓴 것, 높이는 사람이 고른 앵글이 우선이다.
  it('카메라는 앞 샷의 방향에서 보고, 높이는 창에서 고른 앵글을 따르며, 렌즈는 같은 씬 같은 크기 샷의 렌즈를 쓴다', () => {
    const added = addedShot('sh_01_19', ['mina', 'jun'], { camera_config: { ...CAMERA, pan: 5 } })
    const { spec } = fill(added, [P1, added, P2, P3])
    expect(spec?.camera_setup).toMatchObject({ from_direction: 'SW', height: 'low', lens_mm: 50 })
    expect(spec?.camera_angle).toBe('low_angle')
    // 앞 샷이 시점 샷이면 그 방향은 그 인물의 눈이다 — 무대 기본 방향(축 안쪽 정면)으로 본다.
    const pov = pipelineShot('sh_01_01', 'shot_1', { beat: 0, type: 'WS', lens: 35, from: 'SW', keys: {}, chars: { mina: ['sitting'] }, setup: { pov_of: 'jun' } })
    const afterPov = addedShot('sh_01_20', ['mina', 'jun'])
    expect(fill(afterPov, [pov, afterPov]).spec?.camera_setup).toMatchObject({ from_direction: 'S', height: 'eye', lens_mm: 35 })
  })

  // 왜: 그 샷 인물이 아닌 사람을 "그리지 말 것"으로 적어 두면, 나중에 그 사람을 샷에 더해도 그 말이 남아 시트가 빠진다. 러프는 목록에 없는 사람을 이미 화면 밖으로 본다.
  it('그 샷 인물이 아닌 씬 인물은 자리 목록에도 화면 밖 목록에도 넣지 않는다', () => {
    const added = addedShot('sh_01_21', ['mina'])
    const { spec } = fill(added, [P1, P2, added, P3])
    expect(spec?.character_blocking?.map((b) => b.character_id)).toEqual(['mina'])
    expect(spec?.screen_layout?.characters.map((c) => c.character_id)).toEqual(['mina'])
    expect(spec?.screen_layout).not.toHaveProperty('off_frame')
  })

  // 왜: 일부 인물만 자리가 있으면 러프가 자리 있는 인물만 그리고 나머지를 화면 밖으로 본다.
  it('그 샷 인물 중 하나라도 무대에 없으면 자리 · 자세는 채우지 않는다', () => {
    const added = addedShot('sh_01_22', ['mina', 'kim'])
    const { spec } = fill(added, [P1, added])
    expect(spec?.character_blocking).toBeUndefined()
    expect(spec?.screen_layout).toBeUndefined()
    expect(spec?.lighting).toEqual(LIGHT)
  })

  // 왜: 자세 글은 실사 지시문(영어)의 인물 줄에 그대로 실린다 — 무대 메모는 이야기 언어로 적혀 한국어 프로젝트에서는 영어 지시문에 한국어가 섞였다
  //   (2026-11-27 dev 계정 화면 확인, 실사 1인 복사본 씬 2 끝). 글 모델 없이 막는다: 영어가 아닌 메모는 빼고 자세 · 깊이만 적는다.
  it('무대 메모가 영어가 아니면 더한 샷의 자세 글에 싣지 않고, 영어 메모는 그대로 싣는다', () => {
    const noted: SceneStage = {
      ...STAGE,
      beats: STAGE.beats.map((b) => ({
        ...b,
        characters: b.characters.map((c) => (c.character_id === 'mina' ? { ...c, note: '탁자에 팔꿈치를 괴고 앉아 있음' } : { ...c, note: 'leaning on the counter' })),
        ...(b.end_characters ? { end_characters: b.end_characters.map((c) => (c.character_id === 'mina' ? { ...c, note: '탁자에 팔꿈치를 괴고 앉아 있음' } : { ...c, note: 'leaning on the counter' })) } : {}),
      })),
    }
    const added = addedShot('sh_01_30', ['mina', 'jun'])
    const poses = new Map(fill(added, [P1, P2, added], noted).spec?.character_blocking?.map((b) => [b.character_id, b.pose]))
    expect(poses.get('mina')).toBe('sitting, in the midground')
    expect(poses.get('jun')).toMatch(/^sitting, leaning on the counter, in the /)
  })

  // 왜: 소품 자리 · 구도 겹 · 초점은 그 카메라 화면의 자리라, 빌리면 클로즈업에도 억지로 그린다. 씬 고정 소품은 무대 표지로 배경 줄에 들어간다.
  it('소품 자리 · 구도 겹 · 초점 · 심도 · 색감은 빌리지 않는다', () => {
    const added = addedShot('sh_01_23', ['mina', 'jun'])
    const { spec } = fill(added, [P1, P2, added])
    expect(spec?.framing).toEqual({ layers: {} })
    for (const key of ['prop_placement', 'depth_of_field', 'palette_emphasis', 'texture_notes', 'color_grading_intent', 'first_frame_prompt']) {
      expect(spec).not.toHaveProperty(key)
    }
  })

  // 왜: 오너 2026-09-08 "샷 문장의 자세가 무대 비트보다 우선" — 한 사람 샷의 글이 자세를 말하면 그 글이 이긴다.
  //   여러 사람 샷의 글이 자세를 말하면("두 사람이 일어난다") 누구 자세인지 모른다 — 무대 자세(앉음)를 적으면 글과 어긋난다.
  //   리드 결정(2026-11-27 검토 rev-addshot): 자리(왼쪽 · 오른쪽 · 앞뒤)는 채우고 자세 낱말은 비워 글을 따르게. 글이 자세를 말하지 않으면 무대 자세 그대로.
  it('한 사람 샷의 글에 자세 낱말이 있으면 그 자세로 세우고, 여러 사람 샷의 글이 자세를 말하면 자리는 채우고 자세는 비워 글을 따르게 한다', () => {
    const one = addedShot('sh_01_24', ['jun'], { action_description: '준이 창가에 서 있다', action_description_native: '준이 창가에 서 있다' })
    expect(poseById(fill(one, [P1, P2, one]).spec).get('jun')).toBe('standing')
    for (const story of ['두 사람이 일어난다', '민아가 서 있다', 'They both get up from the bench']) {
      const two = addedShot('sh_01_25', ['mina', 'jun'], { action_description: story, action_description_native: story })
      const spec = fill(two, [P1, P2, two]).spec
      expect(poseById(spec)).toEqual(new Map([['mina', null], ['jun', null]]))
      expect(spec?.character_blocking?.map((b) => [b.character_id, b.position_in_frame])).toEqual([['mina', 'left_third'], ['jun', 'right_third']])
      for (const b of spec?.character_blocking ?? []) expect(b.pose).toMatch(/^in the (?:foreground|midground|background)$/)
    }
    const quiet = addedShot('sh_01_26', ['mina', 'jun'], { action_description: '두 사람이 마주 본다', action_description_native: '두 사람이 마주 본다' })
    expect(poseById(fill(quiet, [P1, P2, quiet]).spec)).toEqual(new Map([['mina', 'sitting'], ['jun', 'sitting']]))
  })

  // 왜: 채운 칸에서 나온 앵글 · 색온도가 카드 칩에 다른 샷처럼 보여야 "다른 샷처럼 차 있다"가 화면에서 보인다.
  it('채운 더한 샷의 콘티 카드에 다른 샷처럼 앵글 · 색온도 칩이 보인다', () => {
    const added = addedShot('sh_01_26', ['mina', 'jun'])
    expect(shotStageDesign(fill(added, [P1, P2, added]).spec, null)).toEqual({ cameraAngle: 'eye_level', cameraMotion: null, colorTempK: 4500, neighborFill: true })
  })

  // 왜: 검토 rev-addshot 4 — "창 처음 빛(5600K)은 사람이 정한 빛이 아니다"는 더한 샷만의 규칙이다. 파이프라인 샷을 Storyboard · Director 에서
  //   front · 50 · 5600K 로 맞춘 사람의 빛을 무대 설계 색온도로 가리면 안 된다.
  it('파이프라인 샷은 빛이 [+ 샷 추가] 창 처음 값과 같아도 카드에 그 빛(사람이 정한 빛)을 보인다', () => {
    const pipelineDesign = shotStageDesign(P2.static_spec, null)
    expect(pipelineDesign).not.toHaveProperty('neighborFill')
    expect(shotCardChips({ shotType: 'MS', stageDesign: pipelineDesign, camera: CAMERA, lighting: { ...ADD_SHOT_START_LIGHTING } }, 'ko').map((c) => c.label)).toEqual(['MS', '아이레벨', '◐ 5600K'])
  })

  // 왜: 검토 rev-addshot 1 — 옆의 아직 안 채운 더한 샷(모습 'current')이나 옛 값으로 채운 더한 샷에서 빌리면, 과거 장면에서 지금 모습이 붙고
  //   옛 비트 · 빛 · 렌즈가 옮아온다. 더한 샷은 움직임이 없어 건너뛰어도 같은 상태라, 그 너머의 파이프라인 샷에서 잇는다.
  it('옆에 더한 샷이 있어도 모습 · 자리 · 빛 · 렌즈는 그 너머의 파이프라인 샷에서 잇는다', () => {
    const unfilled = addedShot('sh_01_40', ['mina'])
    const stale = addedShot('sh_01_41', ['mina'], {
      character_appearance_keys: { mina: 'current' },
      static_spec: {
        shot_id: 'sh_01_41', shot_type: 'MS', lens_mm: 24, camera_angle: 'eye_level', framing: { layers: {} }, lighting: { ...LIGHT, color_temp_kelvin: 9999 },
        character_blocking: [], camera_setup: { subject: 'mina', from_direction: 'N', height: 'eye', lens_mm: 24 },
        screen_layout: { beat: 1, camera: { x: 0, y: 6, z: 1.5, look_at: { x: 0, y: 0, z: 1.2 }, lens_mm: 24, hfov_deg: 74 }, characters: [], issues: [] },
        added_fill: { version: 1, from: null, side: 'start', beat: 1, lighting_from: null },
      },
    })
    const target = addedShot('sh_01_42', ['mina', 'jun'])
    const { result, spec } = fill(target, [P1, unfilled, stale, target, P2])
    expect(result.character_appearance_keys).toEqual({ mina: 'young', jun: 'suit' })
    expect(spec?.added_fill).toMatchObject({ from: 'sh_01_01', side: 'end', beat: 0, lighting_from: 'sh_01_01' })
    expect(spec?.lighting).toEqual(LIGHT)
    expect(spec?.lens_mm).toBe(50)
  })

  // 왜: 검토 rev-addshot 2 — 씬 맨 앞에 샷을 둘 이상 더하면 서로를 이어, 뒤 파이프라인 샷이 바뀌어도 앞의 더한 샷이 옛 값에 묶였다.
  it('씬 맨 앞에 샷을 둘 이상 더해도 모두 뒤의 파이프라인 샷이 시작하는 상태를 잇는다', () => {
    const second = addedShot('sh_01_44', ['jun'], {
      static_spec: {
        shot_id: 'sh_01_44', shot_type: 'MS', lens_mm: 50, camera_angle: 'eye_level', framing: { layers: {} }, character_blocking: [],
        camera_setup: { subject: 'jun', from_direction: 'S', height: 'eye', lens_mm: 50 },
        screen_layout: { beat: 0, camera: { x: 0, y: -6, z: 1.5, look_at: { x: 0, y: 0, z: 1.2 }, lens_mm: 50, hfov_deg: 40 }, characters: [], issues: [] },
        added_fill: { version: 1, from: 'sh_01_03', side: 'start', beat: 0, lighting_from: null },
      },
    })
    const first = addedShot('sh_01_43', ['jun'])
    for (const shot of [first, second]) {
      expect(fill(shot, [first, second, P3]).spec?.added_fill).toMatchObject({ from: 'sh_01_03', side: 'start', beat: 1 })
    }
  })

  // 왜: 카드는 사람이 정한 빛을 무대 설계보다 앞세운다 — 손대지 않은 [+ 샷 추가] 창 값(5600K)이 카드에 남으면 카드는 5600K, 러프는 앞 샷의 빛으로
  //   그려져 같은 샷이 두 빛을 갖는다(2026-11-27 dev 계정 화면 확인, 씬 4 끝 카드). 이은 빛이 없으면 지금처럼 창 값을 보인다.
  it('[+ 샷 추가] 창의 빛을 처음 값 그대로 둔 더한 샷의 카드는 앞뒤 샷에서 이은 색온도를 보인다', () => {
    const board = addedShot('sh_01_29', ['mina'], { lighting_config: { ...ADD_SHOT_START_LIGHTING } })
    const stageDesign = shotStageDesign(fill(board, [P1, board]).spec, null)
    const chips = (design: typeof stageDesign) => shotCardChips({ shotType: 'MS', stageDesign: design, camera: CAMERA, lighting: { ...ADD_SHOT_START_LIGHTING } }, 'ko').map((c) => c.label)
    expect(chips(stageDesign)).toEqual(['MS', '아이레벨', '◐ 4500K'])
    expect(chips(null)).toEqual(['MS', '◐ 5600K'])
  })
})

describe('러프를 그릴 때 다시 채우기', () => {
  const PROJECT = '11111111-2222-4333-8444-555555555555'
  const row = (r: AddedShotRow, sort_order: number) => ({ project_id: PROJECT, sort_order, ...r }) as Record<string, unknown>
  beforeEach(() => {
    db.updates.length = 0
    db.tables = {
      shots: [row(P1, 0), row(addedShot('sh_01_27', ['mina', 'jun']), 1), row(P2, 2), row(P3, 3)],
      scenes: [{ project_id: PROJECT, scene_id: 'sc_01', stage: STAGE }],
      projects: [{ id: PROJECT, settings: { format: 'horizontal_16:9' } }],
    }
  })
  afterEach(() => { db.tables = {} })

  // 왜: 더한 샷의 인물 · 샷 크기를 고친 뒤 옛 자리가 남으면, 더한 인물이 러프에서 빠진다 — 그릴 때마다 다시 계산하고 바뀐 것만 저장한다.
  it('러프를 그릴 때 더한 샷의 채운 칸이 지금과 다르면 다시 채워 저장하고, 같으면 저장하지 않는다', async () => {
    const first = await refillAddedShots(PROJECT, ['sh_01_27'])
    expect(db.updates).toHaveLength(1)
    expect(db.updates[0].patch).toHaveProperty('static_spec')
    expect(db.updates[0].filters).toEqual(expect.arrayContaining(['eq:source', 'is:design_ref', 'is:dynamic_spec']))
    expect(first.get('sh_01_27')?.static_spec).toMatchObject({ added_fill: { from: 'sh_01_01' } })
    await refillAddedShots(PROJECT, ['sh_01_27'])
    expect(db.updates).toHaveLength(1)
    const stored = db.tables.shots.find((r) => r.shot_id === 'sh_01_27')!
    stored.characters = ['mina']
    const again = await refillAddedShots(PROJECT, ['sh_01_27'])
    expect(db.updates).toHaveLength(2)
    expect((again.get('sh_01_27')?.static_spec as FilledSpec).character_blocking?.map((b) => b.character_id)).toEqual(['mina'])
    expect(again.get('sh_01_27')?.character_appearance_keys).toEqual({ mina: 'young' })
  })

  // 왜: 검토 rev-addshot 3 — 한 샷 계산이 예외면 전체가 건너뛰어져, 앞 샷은 DB 칸이 바뀌었는데 러프는 옛 칸으로 그려졌다.
  it('한 샷의 채우기가 실패해도 다른 더한 샷은 채우고, 실패한 샷은 읽은 값 그대로 돌려준다', async () => {
    const broken = row(addedShot('sh_01_50', ['mina']), 1)
    Object.defineProperty(broken, 'characters', { get() { throw new Error('boom') }, enumerable: true })
    db.tables.shots = [row(P1, 0), broken, row(addedShot('sh_01_51', ['mina', 'jun']), 2), row(P2, 3)]
    const out = await refillAddedShots(PROJECT, ['sh_01_50', 'sh_01_51'])
    expect(out.get('sh_01_50')).toEqual({ static_spec: null, character_appearance_keys: { mina: 'current' }, changed: false })
    expect(out.get('sh_01_51')?.changed).toBe(true)
    expect(db.updates.map((u) => (u.patch.static_spec as { shot_id?: string } | null)?.shot_id)).toEqual(['sh_01_51'])
  })

  // 왜: 리드 2026-11-27 속도 — 러프 길은 샷 · 씬 · 프로젝트를 이미 읽었다. 그것을 넘기면 채우기가 같은 것을 다시 읽지 않는다(쓰기는 지금처럼 바뀐 것만).
  it('러프 길이 이미 읽은 샷 · 씬 · 프로젝트를 넘기면 채우기는 다시 읽지 않고 바뀐 것만 쓴다', async () => {
    db.reads.length = 0
    const preloaded = { rows: db.tables.shots.map((r) => ({ ...r }) as unknown as AddedShotRow), stageByScene: new Map<string, unknown>([['sc_01', STAGE]]), format: 'horizontal_16:9' }
    const out = await refillAddedShots(PROJECT, ['sh_01_27'], preloaded)
    expect(db.reads).toEqual([])
    expect(db.updates).toHaveLength(1)
    expect(out.get('sh_01_27')).toMatchObject({ changed: true, static_spec: { added_fill: { from: 'sh_01_01' } } })
    db.updates.length = 0
    await refillAddedShots(PROJECT, ['sh_01_27'], { ...preloaded, rows: db.tables.shots.map((r) => ({ ...r }) as unknown as AddedShotRow) })
    expect(db.updates).toHaveLength(0)
  })

  // 왜: 이 기능 전에 더해 둔 샷도 오너가 바란 "다른 샷처럼"이다 — 채운 표시 없이 칸이 빈 더한 샷도 다음 그리기 때 채운다. 파이프라인 샷은 넘겨도 건드리지 않는다.
  it('이 기능 전에 더해 둔 샷도 러프를 그릴 때 채우고, 파이프라인 샷은 넘겨도 쓰지 않는다', async () => {
    const out = await refillAddedShots(PROJECT, ['sh_01_01', 'sh_01_27', 'sh_01_02'])
    expect([...out.keys()]).toEqual(['sh_01_27'])
    expect(db.updates.map((u) => u.patch)).toHaveLength(1)
  })

})

describe('러프 칸의 인물 이름 단서', () => {
  const NAMES = new Map([['mina', 'Mina'], ['jun', 'Jun']])
  const cellOf = (staticSpec: unknown, action: string) =>
    buildRoughGridCell(
      { shotType: 'MS', actionDescription: action, characterNames: ['Mina', 'Jun'], characterNameById: NAMES, spec: { staticSpec: staticSpec as RoughStoryboardSpec['staticSpec'] } },
      'sh_x',
    ).start

  // 왜: 파이프라인 샷의 러프 칸은 figure 마다 자세 글 · 소품으로 누구인지 드러나 지금 그대로 둔다 — 더한 샷 고침이 그 글을 한 글자도 바꾸지 않는다.
  it('파이프라인 샷 러프 칸은 지금 글 그대로다(한 글자도 안 바뀐다)', () => {
    expect(cellOf(P2.static_spec, 'Jun hands Mina a warm can.')).toBe(
      "medium shot, eye-level angle, 50mm, rule of thirds. figure 1 in the left third of the frame, in the midground, small, far away, three-quarter view, turned toward screen-left, sitting, blank head facing toward camera; figure 2 in the right third of the frame, in the midground, small, far away, three-quarter view, turned toward screen-left, standing, blank head facing toward camera; carried prop (teacup) at center — this is an inanimate object: draw the object itself, NEVER a mannequin, person or head. fg: teacup / mg: two people / bg: window. moment: Jun hands Mina a warm can.. the numbered figure(s) above and any people described in the fg/mg/bg layers are the SAME subjects — draw each subject only once (no plain duplicate mannequin alongside them); anyone mentioned in the moment but not listed as a figure here is OFF-SCREEN, do not draw them. focal point: Mina's hands. lighting and focus (draw these into the sketch): lit from top left — shade figures and ground with directional pencil hatching, cast shadows toward the lower-right, soft feathered shadow edges; draw Mina's hands with the densest, sharpest line detail as the focal point; keep the background loosely and vaguely indicated (shallow focus)",
    )
  })

  // 왜: 통합 확인(n-qa 2026-11-27) — 채팅으로 더한 2인 샷(씬 1 끝)의 러프 · 실사에서 두 사람이 DB 자리(서윤 왼쪽)와 반대로 그려졌다. 더한 샷 칸은 figure 를
  //   자리로만 적어(자세를 비우면 "in the midground"뿐) 누가 figure 1 인지의 단서가 이야기 글(도식을 먼저 부름)뿐이었다 — 이름과 자리를 묶어 적는다.
  it('여러 사람 더한 샷의 러프 칸은 figure 마다 이름을 붙이고, 이야기 속 각 사람의 동작 · 소품을 그 figure 자리에 두라고 말한다', () => {
    const silent = addedShot('sh_01_70', ['mina', 'jun'], { action_description: 'Jun turns back and they both get up', action_description_native: 'Jun turns back and they both get up' })
    const silentSpec = fill(silent, [P1, P2, silent]).spec!
    const [m, j] = silentSpec.screen_layout!.characters.map((c) => c.start as unknown as Parameters<typeof describePlacement>[0])
    const cell = cellOf(silentSpec, 'Jun turns back and they both get up')
    // 자세를 비운 샷은 자세 자리를 아예 비운다 — 깊이를 두 번 적거나 "standing"을 대신 넣지 않는다.
    expect(cell).toContain(`figure 1 (Mina) ${describePlacement(m)}, blank head facing`)
    expect(cell).toContain(`figure 2 (Jun) ${describePlacement(j)}, blank head facing`)
    expect(cell).toContain('figure 1 is Mina and figure 2 is Jun')
    expect(cell).not.toMatch(/standing|sitting/)
    const posed = addedShot('sh_01_71', ['mina', 'jun'], { action_description: 'Mina and Jun look at each other', action_description_native: 'Mina and Jun look at each other' })
    const posedSpec = fill(posed, [P1, P2, posed]).spec!
    expect(cellOf(posedSpec, 'Mina and Jun look at each other')).toMatch(/figure 1 \(Mina\) [^;]*, sitting, in the \w+, blank head facing [^;]*; figure 2 \(Jun\) [^;]*, sitting, in the \w+, blank head facing/)
  })

  // 왜: 정상 경로 고정 — 실사 인물 줄은 더한 두 사람 샷에도 이름 · 화면 자리(왼쪽 · 오른쪽)와 왼쪽부터 차례를 말한다. 러프와 함께 누가 어디인지 이 줄로 묶인다.
  it('더한 두 사람 샷의 실사 인물 줄은 이름 · 화면 자리와 왼쪽부터 차례를 말한다', () => {
    const added = addedShot('sh_01_72', ['mina', 'jun'], { action_description: 'they both get up', action_description_native: 'they both get up' })
    const spec = fill(added, [P1, P2, added]).spec!
    const labels = (spec.character_blocking ?? []).map((b) =>
      stillCharacterLabel({ characterId: b.character_id, name: NAMES.get(b.character_id)!, position: b.position_in_frame, pose: b.pose }, spec),
    )
    expect(labels.map((l) => describePhotoCharacterRef(l))).toEqual(['Mina (left third of the frame — in the midground)', 'Jun (right third of the frame — in the midground)'])
    expect(leftToRight(labels, { start: 'START panel', end: 'END panel' })).toBe(' Left to right in START panel: Mina, Jun.')
  })
})
