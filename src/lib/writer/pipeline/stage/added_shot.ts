// 더한 샷 채우기(오너 2026-11-27 N2 "채팅으로 더한 샷은 앞뒤 샷의 내용으로 정보 채우기 — writer 파이프라인에 추가한 기능") — 순수 함수.
//   채팅 · [+ 샷 추가](writer-store addShot)로 더한 샷은 이야기 · 샷 크기 · 길이 · 대사 · 인물만 있고, 파이프라인이 샷마다 채우는
//   인물 자리 · 자세(무대 배치) · 모습 키 · 빛이 비어 있었다. 인물이 둘 이상이면 러프 · 실사가 누가 어디 서는지 몰랐다(W6 ②).
//   여기서 같은 씬의 바로 앞 · 뒤 샷과 씬 무대(scenes.stage)로 그 빈 칸을 채운다. 계산은 파이프라인 자기 코드(applyStageToShots ·
//   장부 핀 규칙)만 쓰고 글 모델은 부르지 않는다.
//   - 자리 · 자세: 앞 샷이 끝난 무대 상태(장부가 정한 변화 주인 샷보다 앞이면 변화 전 — ledger "앞 샷 START, 뒤 샷 END"),
//     앞 샷이 없으면 뒤 샷이 시작하는 상태, 둘 다 없으면 씬 무대의 첫 순간. 무대가 없거나 그 샷 인물이 무대에 없으면 채우지 않는다.
//   - 모습 키: 같은 씬 가까운 앞 샷(없으면 뒤 샷)이 쓴 그 인물의 모습. 없으면 지금 값(처음은 'current').
//   - 빛: 앞(없으면 뒤) 샷의 빛. 사람이 [+ 샷 추가] 창에서 빛을 고른 샷은 빌리지 않는다.
//   - 빌리지 않는 것: 움직임(dynamic_spec) · 소품 자리 · 구도 겹 · 초점 · 심도 · 색감 — 그 샷 · 그 카메라만의 것이다.
//   채운 칸은 static_spec 에 파이프라인과 같은 모양으로 두고 표시 added_fill 을 붙인다(새 DB 칸 없음). 약속: tests/writer/added-shot-fill.test.ts
import type {
  CompassDir,
  SceneStage,
  ShotCameraSetup,
  ShotDesign,
  ShotStaticSpec,
  StageCharacterState,
  StagePosture,
} from '@/lib/writer/types/pipeline'
import { applyStageToShots, defaultCameraSetup, stageStatesForBeat } from '@/lib/writer/pipeline/stage/apply'
import { aspectRatioOf, isCompassDir } from '@/lib/writer/pipeline/stage/geometry'
import { deriveTransitions, normalizeStageTransitions, transitionKey } from '@/lib/writer/pipeline/stage/ledger'
import { postureFromMotionText, postureFromPoseText } from '@/lib/writer/pipeline/stage/posture_text'
import { isDefaultLighting } from '@/lib/writer/shot-config-from-design'
import { angleOfCamera } from '@/lib/writer/shot-edit'
import { ADDED_FILL_VERSION, isAddedFillSpec } from '@/lib/writer/pipeline/stage/added_fill_mark'
import { ADD_SHOT_START_LIGHTING } from '@/lib/writer/add-shot-defaults'

export { ADDED_FILL_VERSION, isAddedFillSpec }

/** 샷 행(DB shots) 중 채우기가 읽는 칸. */
export interface AddedShotRow {
  shot_id: string
  scene_id?: string | null
  source?: unknown
  shot_type?: unknown
  characters?: unknown
  character_appearance_keys?: unknown
  camera_config?: unknown
  lighting_config?: unknown
  static_spec?: unknown
  dynamic_spec?: unknown
  design_ref?: unknown
  action_description?: unknown
  action_description_native?: unknown
}

/** 채운 표시 — 어느 샷의 어느 순간을 이었는지(사람이 읽는 기록 · 되돌리기 열쇠). */
export interface AddedFillMark {
  version: number
  /** 자리 · 자세를 이은 샷 id(없으면 씬 무대만으로 — null). */
  from: string | null
  /** 'end' = 앞 샷이 끝난 상태, 'start' = 뒤 샷이 시작하는 상태(이을 샷이 없으면 씬 첫 순간). 자리를 못 채웠으면 null. */
  side: 'end' | 'start' | null
  beat: number | null
  /** 빛을 이은 샷 id. */
  lighting_from: string | null
}

export interface AddedShotFill {
  /** 채운 설계 칸 — 채울 것이 하나도 없으면 null(지금처럼 비움). */
  static_spec: Record<string, unknown> | null
  /** 지금 인물 목록과 정확히 같은 모습 키. */
  character_appearance_keys: Record<string, string>
}

export interface AddedShotFillInput {
  shot: AddedShotRow
  /** 같은 씬의 샷 전부, 보드 순서(더한 샷 포함). */
  sceneShots: readonly AddedShotRow[]
  /** scenes.stage — 없거나 모양이 다르면 자리 · 자세는 채우지 않는다. */
  stage?: unknown
  /** 프로젝트 화면 비율(settings.format). */
  format?: string | null
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()))] : []

/**
 * 채울 수 있는 더한 샷인가 — 사람이 더한 샷(source 'manual')이고 파이프라인 설계(design_ref · 움직임)가 없으며,
 *   설계 칸이 비었거나 이 채우기가 채운 칸이다. 그 밖의 설계(다른 엔진 등)는 건드리지 않는다.
 */
export function isFillableAddedShot(row: AddedShotRow | null | undefined): boolean {
  if (!row || row.source !== 'manual') return false
  if (typeof row.design_ref === 'string' && row.design_ref.trim()) return false
  if (row.dynamic_spec !== null && row.dynamic_spec !== undefined) return false
  return row.static_spec === null || row.static_spec === undefined || isAddedFillSpec(row.static_spec)
}

function keyOf(row: AddedShotRow | undefined, characterId: string): string | null {
  const keys = row?.character_appearance_keys
  if (!isRecord(keys)) return null
  const key = keys[characterId]
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

type Lighting = ShotStaticSpec['lighting']

/** 사람이 빛을 고르지 않은 샷인가 — 비어 있거나 DB 처음 값(front/50/5000), 또는 [+ 샷 추가] 창의 처음 값(5600K) 그대로. */
function lightingUntouched(value: unknown): boolean {
  if (!isRecord(value)) return true
  if (isDefaultLighting(value as Parameters<typeof isDefaultLighting>[0])) return true
  const start = ADD_SHOT_START_LIGHTING
  return (value.position ?? start.position) === start.position && (value.brightness ?? start.brightness) === start.brightness && (value.colorTemp ?? start.colorTemp) === start.colorTemp
}

function lightingOf(row: AddedShotRow): Lighting | null {
  const spec = isRecord(row.static_spec) ? row.static_spec : null
  const l = spec && isRecord(spec.lighting) ? spec.lighting : null
  if (!l) return null
  const out: Partial<Lighting> = {}
  if (typeof l.key_fill_ratio === 'string' && l.key_fill_ratio.trim()) out.key_fill_ratio = l.key_fill_ratio
  if (typeof l.color_temp_kelvin === 'number' && Number.isFinite(l.color_temp_kelvin) && l.color_temp_kelvin > 0) out.color_temp_kelvin = l.color_temp_kelvin
  if (l.quality === 'hard' || l.quality === 'soft' || l.quality === 'diffused') out.quality = l.quality
  if (typeof l.key_direction === 'string' && l.key_direction.trim()) out.key_direction = l.key_direction
  return out.key_direction || out.quality || out.color_temp_kelvin ? (out as Lighting) : null
}

interface LayoutLike {
  beat: number
  characters: Array<{ character_id?: unknown; start?: { posture?: unknown }; end?: { posture?: unknown } }>
  end_derived?: { characters?: unknown }
}
function layoutOf(row: AddedShotRow): LayoutLike | null {
  const spec = isRecord(row.static_spec) ? row.static_spec : null
  const lay = spec && isRecord(spec.screen_layout) ? spec.screen_layout : null
  if (!lay || typeof lay.beat !== 'number' || !Number.isFinite(lay.beat)) return null
  return { ...(lay as unknown as LayoutLike), characters: Array.isArray(lay.characters) ? (lay.characters as LayoutLike['characters']) : [] }
}

const POSTURES: ReadonlySet<string> = new Set(['standing', 'sitting', 'kneeling', 'crouching', 'lying', 'walking', 'running', 'floating', 'other'])
const isPosture = (v: unknown): v is StagePosture => typeof v === 'string' && POSTURES.has(v)

/** 이은 샷이 그 인물을 그린 자세 — 끝 상태(side 'end')는 END 배치(러프 전용 END 추정은 제외), 시작은 START 배치. 모르면 null. */
function refPosture(layout: LayoutLike, characterId: string, side: 'end' | 'start'): StagePosture | null {
  const ch = layout.characters.find((c) => c?.character_id === characterId)
  if (!ch) return null
  const derived = Array.isArray(layout.end_derived?.characters) && (layout.end_derived.characters as unknown[]).includes(characterId)
  const place = side === 'end' && ch.end && !derived ? ch.end : ch.start
  return isPosture(place?.posture) ? place.posture : null
}

function parseStage(value: unknown): SceneStage | null {
  if (!isRecord(value) || !Array.isArray(value.beats) || !value.beats.length) return null
  const beats = value.beats as unknown[]
  const ok = beats.every((b) => isRecord(b) && typeof b.beat === 'number' && Array.isArray(b.characters))
  if (!ok) return null
  return {
    ...(value as unknown as SceneStage),
    landmarks: Array.isArray(value.landmarks) ? (value.landmarks as SceneStage['landmarks']) : [],
    axis: isRecord(value.axis) ? (value.axis as SceneStage['axis']) : null,
    camera_side: value.camera_side === 'left' ? 'left' : 'right',
  }
}

const LENS_DEFAULT = 35
// 일어나기 · 몸 일으키기 — 파이프라인 자세 낱말(posture_text)에 없는 말이라 여기서만 더 본다(여러 사람 샷의 "글이 자세를 말하는가" 판정 전용).
const RISE_WORDS = /일어나|일어난|일어섰|일으키|\bget(?:s|ting)?\s+up\b|\bgot\s+up\b|\bris(?:e|es|ing)\b|\brose\b|\bstand(?:s|ing)?\s+up\b/i
/** 배치에서 자세를 뺀다 — 자세를 비운 샷은 누운 자세 문장("lying down")도 싣지 않는다. */
function withoutPosture<T extends { posture?: unknown }>(place: T): T {
  const copy = { ...place }
  delete copy.posture
  return copy
}
/** 샷 글이 자세나 자세 바꿈을 말하는가 — 파이프라인 자세 낱말(문장 어디든) 또는 일어나기 말. */
function mentionsPosture(text: string | undefined): boolean {
  return !!text && (postureFromMotionText(text) !== null || RISE_WORDS.test(text))
}
/** 영어(인쇄 가능한 ASCII)로만 된 글. */
const ENGLISH_TEXT = /^[\x20-\x7E]+$/
const lensOf = (row: AddedShotRow | undefined): number | null => {
  const spec = row && isRecord(row.static_spec) ? row.static_spec : null
  const lens = spec?.lens_mm
  return typeof lens === 'number' && Number.isFinite(lens) && lens > 0 ? lens : null
}
const shotTypeOf = (row: AddedShotRow): string => String(row.shot_type ?? '').trim().toUpperCase()

/** 앞뒤 샷의 카메라 방향 — 어깨 너머 · 시점 샷의 방향은 그 인물 기준이라 쓰지 않는다. */
function directionOf(row: AddedShotRow | undefined): CompassDir | null {
  const spec = row && isRecord(row.static_spec) ? row.static_spec : null
  const setup = spec && isRecord(spec.camera_setup) ? spec.camera_setup : null
  if (!setup) return null
  if ((typeof setup.pov_of === 'string' && setup.pov_of.trim()) || (typeof setup.over_shoulder_of === 'string' && setup.over_shoulder_of.trim())) return null
  return isCompassDir(setup.from_direction) ? setup.from_direction : null
}

/** 무대 계산 하나 — 그 샷 인물의 자리 · 자세 · 카메라. 못 채우면 null. */
function stagePlacement(
  shot: AddedShotRow,
  characters: string[],
  before: readonly AddedShotRow[],
  after: readonly AddedShotRow[],
  sceneShots: readonly AddedShotRow[],
  stageValue: unknown,
  format: string | null | undefined,
): { spec: ShotStaticSpec; mark: Pick<AddedFillMark, 'from' | 'side' | 'beat'>; issues: string[] } | null {
  const raw = parseStage(stageValue)
  if (!raw || !characters.length) return null
  const stage = normalizeStageTransitions(raw)
  const prev = before.find((s) => layoutOf(s))
  const next = prev ? undefined : after.find((s) => layoutOf(s))
  const ref = prev ?? next
  const side: 'end' | 'start' = prev ? 'end' : 'start'
  const firstBeat = [...stage.beats].sort((a, b) => a.beat - b.beat)[0].beat
  const refLayout = ref ? layoutOf(ref) : null
  const states = stageStatesForBeat(stage, refLayout?.beat ?? firstBeat)
  if (characters.some((id) => !states.start.some((s) => s.character_id === id))) return null

  // 장부 핀(ledger transitionPins 와 같은 규칙): 변화 주인 샷보다 앞의 샷은 변화 전, 뒤의 샷은 변화 뒤.
  const transitions = new Set(deriveTransitions(stage).map((t) => transitionKey(t.beat, t.character_id)))
  const owners = new Map(
    (raw.ledger?.transitions ?? [])
      .filter((t) => typeof t?.owner === 'string' && t.owner)
      .map((t) => [transitionKey(t.beat, t.character_id), t.owner as string] as const),
  )
  const refIndex = ref ? sceneShots.indexOf(ref) : -1
  const pickSide = (characterId: string): 'end' | 'start' => {
    if (!ref) return 'start'
    const key = transitionKey(states.beatUsed, characterId)
    const owner = transitions.has(key) ? owners.get(key) : undefined
    const ownerIndex = owner ? sceneShots.findIndex((s) => s.design_ref === owner) : -1
    if (ownerIndex < 0 || ownerIndex === refIndex) return side
    return refIndex < ownerIndex ? 'start' : 'end'
  }
  // 한 사람 샷은 글의 자세 낱말이 이긴다(오너 2026-09-08 #posture-authority 와 같은 규칙).
  //   여러 사람 샷의 글이 자세를 말하면(“두 사람이 일어난다”) 누구 자세인지 모른다 — 자리는 채우고 자세 낱말은 비워 글을 따르게 한다(리드 2026-11-27 검토 결정).
  const text = [shot.action_description_native, shot.action_description].find((t): t is string => typeof t === 'string' && !!t.trim())
  const textPosture = characters.length === 1 ? postureFromPoseText(text)?.posture ?? null : null
  const postureSilent = characters.length > 1 && mentionsPosture(text)
  const chosen: StageCharacterState[] = states.start.map((startState) => {
    const id = startState.character_id
    const pick = pickSide(id)
    const base = pick === 'end' ? (states.end.find((e) => e.character_id === id) ?? startState) : startState
    const posture = (characters.length === 1 && id === characters[0] ? textPosture : null) ?? (refLayout ? refPosture(refLayout, id, pick) : null) ?? base.posture
    // 무대 메모는 자세 글로 실사 지시문(영어)에 실린다 — 영어가 아닌 메모는 빼고 자세 · 깊이만 적는다(글 모델 없이).
    const { note, ...rest } = base
    return { ...rest, posture, ...(note && ENGLISH_TEXT.test(note) ? { note } : {}) }
  })

  // 카메라: 이은 샷의 방향(없으면 무대 기본), 높이 = 사람이 고른 앵글(없으면 눈높이), 렌즈 = 같은 씬 같은 크기 샷 → 이은 샷 → 35mm.
  const shotType = shotTypeOf(shot) || 'MS'
  const sameSize = [...before, ...after].find((s) => shotTypeOf(s) === shotType && lensOf(s))
  const lens = lensOf(sameSize) ?? lensOf(ref) ?? LENS_DEFAULT
  const angle = angleOfCamera(isRecord(shot.camera_config) ? (shot.camera_config as Parameters<typeof angleOfCamera>[0]) : null)
  const height: ShotCameraSetup['height'] = angle === 'low' ? 'low' : angle === 'high' ? 'high' : 'eye'
  const beatUsed = states.beatUsed
  const single: SceneStage = { ...stage, beats: [{ beat: beatUsed, characters: chosen }], ledger: undefined }
  const base: ShotStaticSpec = {
    shot_id: shot.shot_id,
    lens_mm: lens,
    shot_type: shotType,
    camera_angle: height === 'eye' ? 'eye_level' : `${height}_angle`,
    depth_of_field: 'medium',
    framing: { rule: 'thirds', layers: {}, focal_point: '' },
    lighting: { key_fill_ratio: '', color_temp_kelvin: 0, quality: 'soft', key_direction: '' },
    character_blocking: [],
    prop_placement: [],
    palette_emphasis: [],
    texture_notes: '',
    color_grading_intent: '',
    first_frame_prompt: '',
  }
  const setup: ShotCameraSetup = {
    subject: characters.length === 1 ? characters[0] : characters,
    from_direction: directionOf(ref) ?? defaultCameraSetup(base, single, chosen).from_direction,
    height,
    lens_mm: lens,
    over_shoulder_of: null,
    axis_cross: 'none',
    end: null,
    pov_of: null,
  }
  const design: ShotDesign = {
    intent: {
      shot_id: shot.shot_id, scene_id: String(shot.scene_id ?? ''), story_beat_ref: beatUsed, dramatic_purpose: '', duration_seconds: 5,
      duration_justification: '', audience_focus: '', shot_position_in_scene: 'developing', source_beats: [beatUsed],
    },
    static_spec: { ...base, camera_setup: setup },
    // 움직임은 베끼지 않는다 — 멈춘 카메라 · 동작 없음.
    dynamic_spec: { shot_id: shot.shot_id, camera_motion: { type: 'static', speed: 'slow', magnitude: 'minimal' }, character_motion: [], motion_prompt: '' },
  }
  const applied = applyStageToShots([design], single, null, { aspect: aspectRatioOf(format) })
  const out = applied.shots[0]?.static_spec
  if (!out?.screen_layout) return null
  // 그 샷 인물만 남긴다 — 다른 씬 인물은 자리 목록에도 "그리지 말 것"에도 넣지 않는다(나중에 그 인물을 더해도 막지 않게).
  const keep = new Set(characters)
  const layout = out.screen_layout
  const startOf = new Map(layout.characters.map((c) => [c.character_id, c.start] as const))
  // 자세를 비울 때는 자세 낱말 · 메모 없이 깊이만 적는다(“in the midground”) — 러프 인물 줄 · 실사 인물 줄이 글의 자세를 따른다.
  const blocking = out.character_blocking
    .filter((b) => keep.has(b.character_id))
    .map((b) => (postureSilent ? { ...b, pose: `in the ${startOf.get(b.character_id)?.depth_band ?? 'midground'}` } : b))
  if (characters.some((id) => !blocking.some((b) => b.character_id === id))) return null
  const issues = applied.issues.filter((i) => i.severity !== 'INFO' && !i.constraint).map((i) => i.message)
  return {
    spec: {
      ...out,
      character_blocking: blocking,
      screen_layout: {
        beat: layout.beat,
        camera: layout.camera,
        ...(layout.axis_corrected ? { axis_corrected: true } : {}),
        characters: layout.characters
          .filter((c) => keep.has(c.character_id) && !c.distant)
          .map(({ character_id, start }) => ({ character_id, start: postureSilent ? withoutPosture(start) : start })),
        issues,
      },
    },
    mark: { from: ref?.shot_id ?? null, side, beat: beatUsed },
    issues,
  }
}

/**
 * 더한 샷 하나의 빈 칸을 같은 씬 앞뒤 샷과 씬 무대로 채운다. 채울 수 있는 더한 샷이 아니면 null(아무것도 바꾸지 않는다).
 *   같은 입력이면 늘 같은 값을 돌려준다 — 러프를 그릴 때마다 다시 계산해 바뀐 것만 저장한다(util/added_shot_persist).
 */
export function fillAddedShot(input: AddedShotFillInput): AddedShotFill | null {
  const { shot } = input
  if (!isFillableAddedShot(shot)) return null
  const scene = input.sceneShots.filter((s) => (s.scene_id ?? null) === (shot.scene_id ?? null))
  const at = scene.findIndex((s) => s.shot_id === shot.shot_id)
  // 빌리는 샷 = 더한 샷이 아닌 샷(파이프라인이 만든 샷)만 — 더한 샷은 움직임이 없어 건너뛰어도 같은 상태다. 옆의 아직 안 채운 더한 샷('current')이나
  //   옛 값으로 채운 더한 샷에 묶이지 않는다(2026-11-27 검토 rev-addshot 1 · 2). 자리 순서(장부 핀)는 씬 전체 순서로 본다.
  const lends = (s: AddedShotRow) => s.shot_id !== shot.shot_id && !isFillableAddedShot(s)
  const before = (at >= 0 ? scene.slice(0, at) : scene).filter(lends).reverse()
  const after = (at >= 0 ? scene.slice(at + 1) : []).filter(lends)
  const characters = strings(shot.characters)

  // 모습 키: 같은 씬 가까운 앞 샷 → 뒤 샷 → 지금 값 → 'current'. 키는 지금 인물 목록과 정확히 같게(실사 일괄의 계약 검사).
  const character_appearance_keys = Object.fromEntries(
    characters.map((id) => [id, [...before, ...after].map((s) => keyOf(s, id)).find((k): k is string => !!k) ?? keyOf(shot, id) ?? 'current']),
  )

  const lightingSource = lightingUntouched(shot.lighting_config) ? [...before, ...after].find((s) => lightingOf(s)) : undefined
  const lighting = lightingSource ? lightingOf(lightingSource) : null
  const placement = stagePlacement(shot, characters, before, after, scene, input.stage, input.format)

  const mark: AddedFillMark = {
    version: ADDED_FILL_VERSION,
    from: placement?.mark.from ?? null,
    side: placement?.mark.side ?? null,
    beat: placement?.mark.beat ?? null,
    lighting_from: lightingSource?.shot_id ?? null,
  }
  let static_spec: Record<string, unknown> | null = null
  if (placement) {
    const s = placement.spec
    static_spec = {
      shot_id: shot.shot_id,
      shot_type: s.shot_type,
      lens_mm: s.lens_mm,
      camera_angle: s.camera_angle,
      // 무대 칸의 조건(rough-storyboard isRichStaticSpec) — 구도 겹 · 초점은 그 샷의 것이라 비워 둔다.
      framing: { layers: {} },
      ...(lighting ? { lighting } : {}),
      character_blocking: s.character_blocking,
      camera_setup: s.camera_setup,
      screen_layout: s.screen_layout,
      added_fill: mark,
    }
  } else if (lighting) {
    static_spec = { shot_id: shot.shot_id, shot_type: shotTypeOf(shot) || 'MS', lighting, added_fill: mark }
  }
  return { static_spec, character_appearance_keys }
}
