// Artist [완료하기] 조건(리뉴얼 1차 2026-10-19, 프로토타입 A9): 인물 · 배경 대표 그림이 하나라도 없으면 넘어갈 수 없다.
//   인물 = 사람(entity_type person, 비어 있으면 사람으로 본다)의 기본 모습 시트, 배경 = 장소의 넓은 그림(wide_shot).
//   사물(object)은 대표 그림을 요구하지 않는다(사물 카드는 따로 — artist-objects-props-gap).
import { supabaseAdmin } from '@/lib/supabase/admin'

export interface CompletionCharacterRow { character_id: string; name: string | null; entity_type: string | null }
export interface CompletionAppearanceRow { character_id: string; is_default: boolean | null; sheet_url: string | null }
export interface CompletionLocationRow { location_id: string; name: string | null; wide_shot: string | null }

export interface CompletionGaps { characters: string[]; locations: string[] }

export function completionGaps(
  characters: readonly CompletionCharacterRow[],
  appearances: readonly CompletionAppearanceRow[],
  locations: readonly CompletionLocationRow[],
): CompletionGaps {
  const drawn = new Set(appearances.filter((a) => a.is_default && a.sheet_url).map((a) => a.character_id))
  return {
    characters: characters
      .filter((c) => (c.entity_type ?? 'person') === 'person' && !drawn.has(c.character_id))
      .map((c) => c.name || c.character_id),
    locations: locations.filter((l) => !l.wide_shot).map((l) => l.name || l.location_id),
  }
}

export async function loadCompletionGaps(projectId: string): Promise<CompletionGaps> {
  const [characters, appearances, locations] = await Promise.all([
    supabaseAdmin.from('characters').select('character_id, name, entity_type').eq('project_id', projectId),
    supabaseAdmin.from('character_appearances').select('character_id, is_default, sheet_url').eq('project_id', projectId),
    supabaseAdmin.from('locations').select('location_id, name, wide_shot').eq('project_id', projectId),
  ])
  const failed = characters.error ?? appearances.error ?? locations.error
  if (failed) throw new Error(`completion lookup failed: ${failed.message}`)
  return completionGaps(
    (characters.data ?? []) as CompletionCharacterRow[],
    (appearances.data ?? []) as CompletionAppearanceRow[],
    (locations.data ?? []) as CompletionLocationRow[],
  )
}
