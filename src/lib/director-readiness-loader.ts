// Director 준비 판정의 재료 모으기(브라우저 전용) — Artist 화면이 이미 들고 있는 인물·배경 상태와
//   shots 사물함(shots-cache)의 샷을 classifyDirectorReadiness 입력으로 옮긴다. 판정 자체는 director-readiness.ts.
import { loadShots, type ShotRow } from '@/lib/shots-cache'
import {
  classifyDirectorReadiness,
  type DirectorReadinessReport,
  type ReadinessScene,
  type ReadinessShot,
} from '@/lib/director-readiness'
import { useArtistStore } from '@/stores/artist-store'
import { useWriterStore } from '@/stores/writer-store'
import type { RoughStoryboardImage } from '@/types'

const hasText = (...values: Array<string | null | undefined>) => values.some((v) => !!v?.trim())

function roughOf(value: unknown): { start: string; end: string } | null {
  const rough = value as RoughStoryboardImage | null
  if (!rough || rough.status !== 'completed' || !rough.frames?.start || !rough.frames?.end) return null
  return { start: rough.frames.start, end: rough.frames.end }
}

function shotOf(row: ShotRow): ReadinessShot {
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && !!v) : [])
  return {
    shotId: row.shot_id,
    sceneId: row.scene_id,
    sortOrder: row.sort_order ?? 0,
    description: (row.action_description_native ?? '').trim() || (row.action_description ?? '').trim(),
    characterIds: ids(row.characters),
    locationIds: ids(row.location_ids),
    rough: roughOf(row.rough_storyboard),
  }
}

/** 지금 프로젝트의 샷별 준비 상태. 재료를 못 읽으면 예외 — 호출부는 단계 게이트로 물러선다. */
export async function loadDirectorReadiness(projectId: string): Promise<DirectorReadinessReport> {
  const artist = useArtistStore.getState()
  const manifest = artist.sceneManifest ?? useWriterStore.getState().sceneManifest
  const rows = await loadShots(projectId)
  const scenes: ReadinessScene[] = (manifest?.scenes ?? []).map((scene, index) => ({
    sceneId: scene.sceneId,
    sortOrder: scene.sortOrder ?? index,
    locationId: scene.location || null,
    timeOfDay: scene.timeOfDay || null,
  }))
  return classifyDirectorReadiness({
    scenes,
    shots: rows.map(shotOf),
    characters: artist.characterAssets.map((c) => ({
      characterId: c.characterId,
      name: c.name,
      entityType: c.entityType,
      hasImage: !!c.views.main,
      generating: artist.generatingViews.some((slot) => slot.characterId === c.characterId),
      hasInfo: hasText(c.appearanceNative, c.fixedPrompt, c.description),
    })),
    locations: artist.worldAssets.map((w) => ({
      locationId: w.locationId,
      name: w.name,
      hasImage: !!w.wideShot,
      generating: artist.generatingLocations.includes(w.locationId),
      hasInfo: hasText(w.visualDescriptionNative, w.visualDescription),
    })),
  })
}
