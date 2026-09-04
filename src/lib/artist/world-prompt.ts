import { buildWorldPrompt } from '@/lib/prompts'
import type { Scene, Location as ManifestLocation } from '@/types'

// World 샷 — 배경 = 이미지 1장(#6·#9): wide 1컷만. establishing 폐기(2026-07-11 죽은 코드 정리).
export type WorldShotKey = 'wideShot'

export const WORLD_SHOT_SUFFIX: Record<WorldShotKey, string> = {
  wideShot: 'wide shot, panoramic',
}

export const WORLD_SHOT_COLUMN: Record<WorldShotKey, 'wide_shot'> = {
  wideShot: 'wide_shot',
}

export const WORLD_SHOT_LABELS: Record<WorldShotKey, string> = {
  wideShot: 'Wide Shot',
}

export interface LocationRowForWorldPrompt {
  location_id?: string | null
  name?: string | null
  visual_description?: string | null
  style_description?: string | null
  lighting_direction?: string | null
  lighting_sources?: string[] | null
  time_of_day?: string | null
  purpose?: string | null
  props?: string[] | null
}

/** 배경 프롬프트에 항상 붙는 "사람 없음" 지시(약속 B1, 2026-09-04). 서버(generate-world)가 최종 보장한다. */
export const NO_PEOPLE_CLAUSE = 'no people or characters, empty environment'
const NO_PEOPLE_RE = /\bno (?:people|humans?|characters|figures|persons?)\b/i

/** 사용자·채팅이 고친 프롬프트에도 사람 금지 절이 빠지지 않게 한다. 이미 있으면 그대로(멱등). */
export function ensureNoPeopleClause(prompt: string): string {
  const p = prompt.trim()
  if (!p) return NO_PEOPLE_CLAUSE
  return NO_PEOPLE_RE.test(p) ? p : `${p.replace(/[,\s]+$/, '')}, ${NO_PEOPLE_CLAUSE}`
}

// safe-mode(약속 B9) — 콘텐츠 정책 거절 뒤 우회 재시도: 그래픽·유혈 낱말을 걷고 순화 토큰을 붙인다.
//   캐릭터(turnaround.ts safeScrub)와 같은 원칙, 배경은 나이 토큰이 없으므로 그래픽 낱말만.
const WORLD_SAFE_GRAPHIC_RE =
  /(유혈|혈흔|선혈|피범벅|피투성이|낭자|시체|시신|사체|고문|학살|절단|참수|토막|\bblood(?:y|stained|ied)?\b|\bgore\b|\bgory\b|\bcorpses?\b|\bdead bod(?:y|ies)\b|\bmutilat\w*|\bdismember\w*|\bgruesome\b|\bviscera\w*|\bentrails\b|\bmassacre\b|\bcarnage\b|\bslaughter\w*|\btortur\w*|\bsevered\b)/gi // i18n-ok: 순화 대상 낱말(그래픽 묘사) 정규식
export const WORLD_SAFE_TOKENS = 'stylized non-graphic illustration, tasteful, safe-for-work, no violence'

export function applyWorldSafeMode(prompt: string): string {
  const scrubbed = prompt.replace(WORLD_SAFE_GRAPHIC_RE, ' ').replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ',').trim()
  return `${scrubbed.replace(/[,\s]+$/, '')}, ${WORLD_SAFE_TOKENS}`
}

export function worldShotPrompt(
  visualDescription: string,
  timeOfDay: string,
  mood: string,
  boost: string | null,
  shot: WorldShotKey,
): string {
  return [
    buildWorldPrompt(visualDescription, timeOfDay, mood, boost),
    NO_PEOPLE_CLAUSE,
    WORLD_SHOT_SUFFIX[shot],
  ]
    .filter(Boolean)
    .join(', ')
}

export function joinPromptParts(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(', ')
}

function stringOrUndefined(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function arrayOrUndefined(value: string[] | null | undefined): string[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : undefined
}

export function mapLocationRowToManifestLocation(
  row: LocationRowForWorldPrompt,
): ManifestLocation {
  return {
    locationId: stringOrUndefined(row.location_id),
    id: stringOrUndefined(row.location_id),
    name: stringOrUndefined(row.name),
    visualDescription: stringOrUndefined(row.visual_description),
    styleDescription: stringOrUndefined(row.style_description),
    lightingDirection: stringOrUndefined(row.lighting_direction),
    lightingSources: arrayOrUndefined(row.lighting_sources),
    timeOfDay: stringOrUndefined(row.time_of_day),
    purpose: stringOrUndefined(row.purpose),
    props: arrayOrUndefined(row.props),
  } as ManifestLocation
}

export function buildWorldShotPromptForLocation(
  location: ManifestLocation,
  scene: Scene | null | undefined,
  boost: string | null,
  shot: WorldShotKey,
): string {
  // writer(v2 worldVisual)가 visual_description==style_description, lighting_direction==lighting_sources
  //   처럼 같은 내용을 두 칸에 채우는 경우가 있어 동일 내용은 한 번만 넣는다(프롬프트 중복·토큰 낭비 방지).
  const visualDesc = location.visualDescription?.trim() ?? ''
  const styleDesc = location.styleDescription?.trim() ?? ''
  const lightDir = location.lightingDirection?.trim() ?? ''
  const lightSrc = location.lightingSources?.length
    ? location.lightingSources.join(', ').trim()
    : ''

  const visual = joinPromptParts([
    visualDesc,
    styleDesc && styleDesc !== visualDesc ? styleDesc : '',
    lightDir ? `lighting direction: ${lightDir}` : '',
    lightSrc && lightSrc !== lightDir ? `lighting sources: ${lightSrc}` : '',
    location.props?.length ? `key props: ${location.props.join(', ')}` : '',
    location.purpose ? `story purpose: ${location.purpose}` : '',
    location.name,
  ])

  const timeOfDay = location.timeOfDay || scene?.timeOfDay || ''
  const mood = joinPromptParts([
    scene?.mood,
    scene?.narrativeSummary ? `scene context: ${scene.narrativeSummary}` : '',
    !scene && location.purpose ? `producer background purpose: ${location.purpose}` : '',
  ])

  return worldShotPrompt(visual, timeOfDay, mood, boost, shot)
}
