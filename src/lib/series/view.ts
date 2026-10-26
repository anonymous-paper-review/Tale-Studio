// 시리즈 정보 화면용 모양(2026-10-26) — GET /api/project/[id]/series 가 돌려주고 시작 화면 · Writer · Artist 가 같이 읽는다. 순수 함수.
import { seriesImageUse, type SeriesImageUse, type SeriesSnapshot } from './snapshot'

export interface SeriesViewItem {
  id: string
  name: string
  /** 앞 화에서 복사해 온 그림(인물은 시트, 배경은 와이드샷). 없거나 복사에 실패했으면 null. */
  imageUrl: string | null
  styleId: string | null
  /** 이번 화 산문에 나오나. 산문이 아직 없으면 null. */
  appearing: boolean | null
  /** 이 화에서 그림을 어떻게 쓰나. 산문이 아직 없으면 null. */
  use: SeriesImageUse | null
}

export interface SeriesView {
  prevTitle: string
  prevProjectId: string | null
  prevDeleted: boolean
  characters: SeriesViewItem[]
  locations: SeriesViewItem[]
  /** 앞 화 그림체 */
  styleId: string | null
  /** 지금 이 화 그림체 */
  currentStyleId: string | null
  hasVoices: boolean
  continuesLastScene: boolean
  copyFailures: string[]
  /** ?prose=1 일 때만 — 앞 화 산문(앞 화를 지웠으면 null). */
  prose?: string | null
}

export interface SeriesAppearance {
  characters: Set<string>
  /** 장소 번호 또는 이름(소문자) */
  locations: Set<string>
}

interface AppearanceState {
  scenes?: { scenes?: Array<{ characters_in_scene?: unknown; location?: unknown }> }
}

/** 이번 화 산문에 나오는 인물 번호 · 장소. 씬이 아직 없으면 null. */
export function appearingIn(state: AppearanceState | null | undefined): SeriesAppearance | null {
  const scenes = state?.scenes?.scenes
  if (!Array.isArray(scenes) || scenes.length === 0) return null
  const characters = new Set<string>()
  const locations = new Set<string>()
  for (const scene of scenes) {
    if (Array.isArray(scene.characters_in_scene)) {
      for (const id of scene.characters_in_scene) if (typeof id === 'string' && id.trim()) characters.add(id.trim())
    }
    if (typeof scene.location === 'string' && scene.location.trim()) locations.add(scene.location.trim().toLowerCase())
  }
  return { characters, locations }
}

export function characterAppears(appearance: SeriesAppearance | null, characterId: string): boolean | null {
  return appearance ? appearance.characters.has(characterId) : null
}

export function locationAppears(appearance: SeriesAppearance | null, location: { locationId: string; name: string }): boolean | null {
  if (!appearance) return null
  return appearance.locations.has(location.locationId.toLowerCase()) || appearance.locations.has(location.name.trim().toLowerCase())
}

export function buildSeriesView(input: {
  series: SeriesSnapshot
  prevProjectId: string | null
  prevDeleted: boolean
  currentStyleId: string | null
  appearance: SeriesAppearance | null
  prose?: string | null
}): SeriesView {
  const { series, appearance, currentStyleId } = input
  const useOf = (item: { styleId: string | null; image: string | null }, appears: boolean | null) =>
    appears === null ? null : seriesImageUse(item, { currentStyleId, appears })
  return {
    prevTitle: series.prevTitle,
    prevProjectId: input.prevProjectId,
    prevDeleted: input.prevDeleted,
    characters: series.characters.map((c) => {
      const appearing = characterAppears(appearance, c.characterId)
      return { id: c.characterId, name: c.name, imageUrl: c.sheetUrl, styleId: c.styleId, appearing, use: useOf({ styleId: c.styleId, image: c.sheetUrl }, appearing) }
    }),
    locations: series.locations.map((l) => {
      const appearing = locationAppears(appearance, l)
      return { id: l.locationId, name: l.name, imageUrl: l.wideShotUrl, styleId: l.styleId, appearing, use: useOf({ styleId: l.styleId, image: l.wideShotUrl }, appearing) }
    }),
    styleId: series.styleId,
    currentStyleId,
    hasVoices: series.voices.length > 0,
    continuesLastScene: series.continuesLastScene,
    copyFailures: series.copyFailures,
    ...(input.prose !== undefined ? { prose: input.prose } : {}),
  }
}
