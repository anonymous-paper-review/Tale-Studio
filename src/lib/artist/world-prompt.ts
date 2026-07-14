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

export function worldShotPrompt(
  visualDescription: string,
  timeOfDay: string,
  mood: string,
  boost: string | null,
  shot: WorldShotKey,
): string {
  return `${buildWorldPrompt(visualDescription, timeOfDay, mood, boost)}, ${WORLD_SHOT_SUFFIX[shot]}`
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
