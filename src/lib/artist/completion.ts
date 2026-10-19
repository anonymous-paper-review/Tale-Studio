// Artist [완료하기] 조건(리뉴얼 1차 2026-10-19, 프로토타입 A9): 인물 · 배경 대표 그림이 하나라도 없으면 넘어갈 수 없다.
//   인물 = 사람(entity_type person, 비어 있으면 사람으로 본다)의 기본 모습 시트, 배경 = 장소의 넓은 그림(wide_shot).
//   사물(object)은 대표 그림을 요구하지 않는다(사물 카드는 따로 — artist-objects-props-gap).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { completionGaps, type CompletionAppearanceRow, type CompletionCharacterRow, type CompletionGaps, type CompletionLocationRow } from '@/lib/artist/completion-gaps'

export { completionGaps, type CompletionAppearanceRow, type CompletionCharacterRow, type CompletionGaps, type CompletionLocationRow }

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
