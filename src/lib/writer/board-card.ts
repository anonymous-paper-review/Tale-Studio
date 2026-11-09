// Storyboard 카드 · 씬 머리에 보이는 글(v3 시안 S1, 2026-11-03 오너 "v3로 적용").
//   칩(샷 크기 · 앵글 · 움직임 · 색온도) · 대사 한 줄 · 글 속 인물 이름 표시 · 씬 이름을 정한다 — 화면(rough-storyboard-view)은 그리기만 한다.
//   칩 값은 제품 데이터에 있는 것만(리드 지시): 앵글 · 움직임 · 색온도는 러프가 따르는 무대 설계(shots.static_spec · dynamic_spec)에서 읽는다.
//   약속: tests/writer/board-card.test.ts
import { translate } from '@/lib/i18n/translate'
import type { AppLocale } from '@/lib/locale'
import { normalizeCameraMotionType, type CameraMotionType } from '@/lib/writer/motion-vocabulary'
import { isDefaultCamera, isDefaultLighting } from '@/lib/writer/shot-config-from-design'
import { angleOfCamera, type CameraAngle } from '@/lib/writer/shot-edit'
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names'
import type { DialogueLine, Shot, ShotStageDesign } from '@/types'

export type CardChipKind = 'size' | 'angle' | 'motion' | 'temperature'
export interface CardChip {
  kind: CardChipKind
  label: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/** 보드가 샷을 불러올 때 — 무대 설계 원본(jsonb)에서 칩 값만 읽는다. 셋 다 없으면 null(무대 설계가 없는 샷). */
export function shotStageDesign(staticSpec: unknown, dynamicSpec: unknown): ShotStageDesign | null {
  const still = isRecord(staticSpec) ? staticSpec : {}
  const moving = isRecord(dynamicSpec) ? dynamicSpec : {}
  const angle = typeof still.camera_angle === 'string' && still.camera_angle.trim() ? still.camera_angle.trim() : null
  const lighting = isRecord(still.lighting) ? still.lighting : {}
  const kelvin = typeof lighting.color_temp_kelvin === 'number' && Number.isFinite(lighting.color_temp_kelvin) && lighting.color_temp_kelvin > 0
    ? Math.round(lighting.color_temp_kelvin)
    : null
  const cameraMotion = isRecord(moving.camera_motion) ? moving.camera_motion : {}
  const motion = typeof cameraMotion.type === 'string' && cameraMotion.type.trim() ? cameraMotion.type.trim() : null
  if (!angle && !motion && kelvin === null) return null
  return { cameraAngle: angle, cameraMotion: motion, colorTempK: kelvin }
}

/** 앵글 글 → 짧은 이름(영어 키). 무대 설계 → 6축 근사(shot-config-from-design angleToPitchRoll)와 같은 낱말 순서로 읽는다. 모르면 null. */
function angleKey(raw: string): string | null {
  const a = raw.toLowerCase()
  if (a.includes('overhead') || a.includes('bird') || a.includes('top_down') || a.includes('top-down')) return 'Overhead'
  if (a.includes('worm')) return "Worm's-eye"
  if (a.includes('high')) return 'High angle'
  if (a.includes('low')) return 'Low angle'
  if (a.includes('eye')) return 'Eye-level'
  if (a.includes('dutch') || a.includes('canted')) return 'Dutch angle'
  return null
}

const MOTION_KEYS: Record<CameraMotionType, string> = {
  static: 'Static',
  pan: 'Pan',
  tilt: 'Tilt',
  dolly_in: 'Dolly in',
  dolly_out: 'Dolly out',
  tracking: 'Tracking',
  crane: 'Crane',
  handheld_drift: 'Handheld',
  rack_focus: 'Rack focus',
}

/** 움직임 글 → 짧은 이름(영어 키). 파이프라인 어휘로 한 번 정규화하고(pan_right → pan), 끝내 모르면 null. */
function motionKey(raw: string): string | null {
  const normalized = normalizeCameraMotionType(raw)
  if (!normalized.mapped) return null
  return MOTION_KEYS[normalized.type as CameraMotionType] ?? null
}

const CAMERA_ANGLE_KEYS: Record<CameraAngle, string> = { eye: 'Eye-level', high: 'High angle', low: 'Low angle' }

/** 카드 칩 — 샷 크기는 늘. 앵글 · 색온도는 사람이 정한 카메라 · 조명 값(채팅 · 샷 추가 창 · Director)이 있으면 그것(팝업 머리와 같은 앵글),
 *  없으면 러프가 따르는 무대 설계 값 — Director 가 들어올 때 빈 칸만 무대 설계로 채우는 순서(shot-config-from-design)와 같다.
 *  움직임은 무대 설계에만 있다. 값이 없는 칩은 만들지 않는다(직접 더한 샷 · 옛 프로젝트는 샷 크기만일 수 있다). */
export function shotCardChips(
  shot: Pick<Shot, 'shotType' | 'stageDesign'> & Partial<Pick<Shot, 'camera' | 'lighting'>>,
  locale: AppLocale,
): CardChip[] {
  const chips: CardChip[] = [{ kind: 'size', label: shot.shotType }]
  const design = shot.stageDesign ?? null
  const cameraSet = !isDefaultCamera(shot.camera)
  const angle = cameraSet ? CAMERA_ANGLE_KEYS[angleOfCamera(shot.camera)] : design?.cameraAngle ? angleKey(design.cameraAngle) : null
  if (angle) chips.push({ kind: 'angle', label: translate(locale, angle) })
  const motion = design?.cameraMotion ? motionKey(design.cameraMotion) : null
  if (motion) chips.push({ kind: 'motion', label: translate(locale, motion) })
  const kelvin = !isDefaultLighting(shot.lighting) ? shot.lighting?.colorTemp : design?.colorTempK
  if (typeof kelvin === 'number' && kelvin > 0) chips.push({ kind: 'temperature', label: `◐ ${Math.round(kelvin)}K` })
  return chips
}

// 러프 보드 카드 액션 글 크기 — 열 수(축척)마다. 기본 3열 = 11/5 시안 S1 의 13.5px(UI/Label), 열이 늘면 줄고 줄면 커진다(#zoom-desc).
//   Director 격자는 공용 storyboardDescriptionFontSize(3열 12px)를 그대로 쓴다. 약속: tests/writer/board-story-font.test.ts
const BOARD_STORY_FONT: Record<number, string> = { 1: '15px', 2: '14px', 3: '13.5px', 4: '12px', 5: '11px', 6: '10.5px' }

export function boardStoryFontSize(columns: number): string {
  const clamped = Math.min(6, Math.max(1, Math.round(columns)))
  return BOARD_STORY_FONT[clamped]
}

export interface CardDialogue {
  speaker: string
  text: string
  /** 이 줄 말고 더 있는 대사 줄 수. */
  more: number
}

/** 카드의 대사 한 줄 — 글이 있는 첫 줄. 화자는 대사 탭과 같다(모르는 id 는 그대로, 내레이션은 V.O.). */
export function cardDialogue(lines: readonly DialogueLine[] | null | undefined, nameById: ReadonlyMap<string, string>): CardDialogue | null {
  const spoken = (lines ?? []).filter((line) => line.text?.trim())
  const first = spoken[0]
  if (!first) return null
  const speaker = first.characterId ? (nameById.get(first.characterId) ?? first.characterId) : 'V.O.'
  return { speaker, text: first.text.trim(), more: spoken.length - 1 }
}

export interface MentionSegment {
  text: string
  mention: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 글 속 인물 이름을 멘션으로 나눈다 — 글은 바꾸지 않는다(조각을 이으면 원문). 긴 이름부터, 영어 이름은 낱말 경계에서만. */
export function mentionSegments(text: string, names: readonly string[]): MentionSegment[] {
  if (!text) return []
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (unique.length === 0) return [{ text, mention: false }]
  const alternatives = unique.map((name) => {
    const body = escapeRegExp(name)
    // 영어 · 숫자로 끝나거나 시작하는 이름은 옆 글자가 영숫자면 다른 낱말이다. 한글 이름 뒤에는 조사가 붙는다.
    const before = /^[A-Za-z0-9]/.test(name) ? '(?<![A-Za-z0-9])' : ''
    const after = /[A-Za-z0-9]$/.test(name) ? '(?![A-Za-z0-9])' : ''
    return `${before}${body}${after}`
  })
  const re = new RegExp(alternatives.join('|'), 'g')
  const out: MentionSegment[] = []
  let last = 0
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0
    if (start > last) out.push({ text: text.slice(last, start), mention: false })
    out.push({ text: match[0], mention: true })
    last = start + match[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false })
  return out
}

// 씬의 때로 흔히 저장되는 영어 낱말 — [+ 씬 추가]에서 비운 때('day') · 대본 머리("INT. 복도 – NIGHT")가 남긴다(검토 A L5).
//   화면 언어로 옮기고, 이 밖의 말(한국어 때 · 파이프라인이 쓴 자유 글)은 지어내지 않고 그대로 둔다.
const TIME_WORDS: Record<string, string> = {
  day: 'Day',
  night: 'Night',
  dawn: 'Dawn',
  dusk: 'Dusk',
  morning: 'Morning',
  noon: 'Noon',
  afternoon: 'Afternoon',
  evening: 'Evening',
  sunrise: 'Sunrise',
  sunset: 'Sunset',
  midnight: 'Midnight',
}

/** 씬 머리 이름 — "장소 이름 · 때". 장소 칸의 id 는 Artist 목록 이름으로(모르는 id 는 그대로), 빈 칸은 건너뛴다.
 *  locale 을 주면 흔한 영어 때(day · night …)를 그 언어로 옮긴다. */
export function sceneHeadTitle(
  scene: { location: string; timeOfDay: string },
  entities: ReadonlyArray<{ id: string; name: string }>,
  locale?: AppLocale,
): string {
  const place = resolveEntityNames(scene.location?.trim(), entities).trim()
  const time = scene.timeOfDay?.trim() ?? ''
  const word = TIME_WORDS[time.toLowerCase()]
  return [place, locale && word ? translate(locale, word) : time].filter(Boolean).join(' · ')
}
