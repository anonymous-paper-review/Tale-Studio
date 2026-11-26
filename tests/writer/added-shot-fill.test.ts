// 채팅 · [+ 샷 추가]로 더한 샷의 빈 칸(인물 자리 · 자세 · 모습 · 빛)을 같은 씬 앞뒤 샷과 씬 무대로 채우는지 검사한다(오너 2026-11-27 N2)
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompassDir, SceneStage, StagePosture } from '@/lib/writer/types/pipeline'

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; filters: string[] }>,
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
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null })
    q.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      if (patch) {
        const hit = rows()
        db.updates.push({ table, patch, filters: [...filters] })
        for (const row of hit) Object.assign(row, patch)
        return Promise.resolve({ data: hit.map((row) => ({ shot_id: row.shot_id })), error: null }).then(resolve, reject)
      }
      return Promise.resolve({ data: rows(), error: null }).then(resolve, reject)
    }
    return q
  }
  return { supabaseAdmin: { from } }
})

import { fillAddedShot, isAddedFillSpec, isFillableAddedShot, type AddedShotRow } from '@/lib/writer/pipeline/stage/added_shot'
import { refillAddedShots } from '@/lib/writer/pipeline/util/added_shot_persist'
import { roughIsStaticHold, poseOf } from '@/lib/director/still-prompt'
import { shotStageDesign } from '@/lib/writer/board-card'

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
  it('채우기는 글 모델을 부르지 않는다', () => {
    for (const file of ['src/lib/writer/pipeline/stage/added_shot.ts', 'src/lib/writer/pipeline/util/added_shot_persist.ts']) {
      expect(read(file)).not.toMatch(/generateJson|dispatchLlm|@\/lib\/llm|deriveEn|openai|anthropic/i)
    }
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

  // 왜: 소품 자리 · 구도 겹 · 초점은 그 카메라 화면의 자리라, 빌리면 클로즈업에도 억지로 그린다. 씬 고정 소품은 무대 표지로 배경 줄에 들어간다.
  it('소품 자리 · 구도 겹 · 초점 · 심도 · 색감은 빌리지 않는다', () => {
    const added = addedShot('sh_01_23', ['mina', 'jun'])
    const { spec } = fill(added, [P1, P2, added])
    expect(spec?.framing).toEqual({ layers: {} })
    for (const key of ['prop_placement', 'depth_of_field', 'palette_emphasis', 'texture_notes', 'color_grading_intent', 'first_frame_prompt']) {
      expect(spec).not.toHaveProperty(key)
    }
  })

  // 왜: 오너 2026-09-08 "샷 문장의 자세가 무대 비트보다 우선" — 한 사람 샷의 글이 자세를 말하면 그 글이 이긴다. 여러 사람이면 누구 자세인지 몰라 보지 않는다.
  it('한 사람 샷의 글에 자세 낱말이 있으면 그 자세로 세우고, 여러 사람 샷은 글로 자세를 바꾸지 않는다', () => {
    const one = addedShot('sh_01_24', ['jun'], { action_description: '준이 창가에 서 있다', action_description_native: '준이 창가에 서 있다' })
    expect(poseById(fill(one, [P1, P2, one]).spec).get('jun')).toBe('standing')
    const two = addedShot('sh_01_25', ['mina', 'jun'], { action_description: '민아가 서 있다', action_description_native: '민아가 서 있다' })
    expect(poseById(fill(two, [P1, P2, two]).spec)).toEqual(new Map([['mina', 'sitting'], ['jun', 'sitting']]))
  })

  // 왜: 채운 칸에서 나온 앵글 · 색온도가 카드 칩에 다른 샷처럼 보여야 "다른 샷처럼 차 있다"가 화면에서 보인다.
  it('채운 더한 샷의 콘티 카드에 다른 샷처럼 앵글 · 색온도 칩이 보인다', () => {
    const added = addedShot('sh_01_26', ['mina', 'jun'])
    expect(shotStageDesign(fill(added, [P1, P2, added]).spec, null)).toEqual({ cameraAngle: 'eye_level', cameraMotion: null, colorTempK: 4500 })
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

  // 왜: 이 기능 전에 더해 둔 샷도 오너가 바란 "다른 샷처럼"이다 — 채운 표시 없이 칸이 빈 더한 샷도 다음 그리기 때 채운다. 파이프라인 샷은 넘겨도 건드리지 않는다.
  it('이 기능 전에 더해 둔 샷도 러프를 그릴 때 채우고, 파이프라인 샷은 넘겨도 쓰지 않는다', async () => {
    const out = await refillAddedShots(PROJECT, ['sh_01_01', 'sh_01_27', 'sh_01_02'])
    expect([...out.keys()]).toEqual(['sh_01_27'])
    expect(db.updates.map((u) => u.patch)).toHaveLength(1)
  })

  // 왜: 러프 길이 그 샷을 그리기 직전에 다시 채워야 러프 · 실사 · 영상이 같은 칸을 본다. 더한 샷이 없는 요청은 아무것도 더 읽지 않는다.
  it('러프 길은 더한 샷이 있을 때만 그리기 직전에 다시 채우고, 그 칸으로 그린다', () => {
    const route = read('src/app/api/writer/rough-storyboard/route.ts')
    const shotColumns = /\.from\('shots'\)\s*\.select\(\s*'([^']+)'/.exec(route)?.[1] ?? ''
    expect(shotColumns).toMatch(/\bsource\b/)
    const refill = route.indexOf('refillAddedShots(')
    expect(refill).toBeGreaterThan(0)
    expect(refill).toBeLessThan(route.indexOf('const resolvedSpecByShotId'))
    expect(route).toMatch(/targets\.filter\(\(s\) => s\.source === 'manual'\)/)
  })
})
