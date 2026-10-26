// 시리즈 다음 화가 이어받은 그림을 이 화 보관함에 적는 계획(2026-10-26) — writer/start 가 인물 기본 모습 시트 · 배경 와이드샷의
//   빈칸만 채운다. 같은 그림체면 그대로 쓰고, 그림체가 다른데 이번 화 산문에 나오는 인물 · 배경은 비워 둔다
//   (Artist 자동 초안이 앞 화 그림을 참고해 이 화 그림체로 다시 그린다). 이번 화에 안 나오면 그림체가 달라도 그대로 보관한다.
//   순수 함수 — 읽기 · 쓰기는 호출자(writer/start)가 한다.
import { seriesImageUse, type SeriesSnapshot } from './snapshot'
import { characterAppears, locationAppears, type SeriesAppearance } from './view'

/** 지금 이 화에 이미 들어 있는 그림 — 차 있는 칸은 덮지 않는다(사람이 올린 그림 · Artist 가 그린 시트). */
export interface InheritedImageRows {
  characters?: ReadonlyArray<{ character_id: string; sheet_url?: string | null; portrait_url?: string | null }> | null
  locations?: ReadonlyArray<{ location_id: string; wide_shot?: string | null }> | null
}

export interface InheritedImagePlan {
  /** portrait_url null = 앞 화에 대표 사진이 없었다. 시트(여러 각도 한 장)를 대표 사진 칸에 넣지 않는다 — 카드는 빈 대표 사진을 시트로 대신 보여 준다. */
  characters: Array<{ character_id: string; sheet_url: string; portrait_url: string | null }>
  locations: Array<{ location_id: string; wide_shot: string }>
}

const filled = (value: string | null | undefined): boolean => typeof value === 'string' && value.trim().length > 0

/** 어느 행에 이어받은 어떤 그림을 적을지. 산문이 아직 없으면(appearance null) 아무것도 적지 않는다. */
export function planInheritedImageWrites(input: {
  series: SeriesSnapshot
  /** 지금 이 화 그림체(styleIdOf) */
  currentStyleId: string | null
  /** 이번 화 산문에 나오는 인물 · 장소(appearingIn). 산문이 아직 없으면 null. */
  appearance: SeriesAppearance | null
  existing: InheritedImageRows
}): InheritedImagePlan {
  const plan: InheritedImagePlan = { characters: [], locations: [] }
  // 누가 나오는지 모르는 채로 적으면, 그림체를 바꿔 쓴 산문에 앞 화 그림체가 섞인 채 남는다 — 산문이 나온 뒤에 적는다.
  const appearance = input.appearance
  if (!appearance) return plan

  const characterRows = new Map((input.existing.characters ?? []).map((row) => [row.character_id, row]))
  for (const character of input.series.characters) {
    const sheet = character.sheetUrl
    if (!sheet) continue
    const use = seriesImageUse(
      { styleId: character.styleId, image: sheet },
      { currentStyleId: input.currentStyleId, appears: characterAppears(appearance, character.characterId) === true },
    )
    if (use !== 'reuse') continue
    const row = characterRows.get(character.characterId)
    if (filled(row?.sheet_url) || filled(row?.portrait_url)) continue
    plan.characters.push({ character_id: character.characterId, sheet_url: sheet, portrait_url: character.portraitUrl })
  }

  const locationRows = new Map((input.existing.locations ?? []).map((row) => [row.location_id, row]))
  for (const location of input.series.locations) {
    const wide = location.wideShotUrl
    if (!wide) continue
    const use = seriesImageUse(
      { styleId: location.styleId, image: wide },
      { currentStyleId: input.currentStyleId, appears: locationAppears(appearance, location) === true },
    )
    if (use !== 'reuse') continue
    if (filled(locationRows.get(location.locationId)?.wide_shot)) continue
    plan.locations.push({ location_id: location.locationId, wide_shot: wide })
  }

  return plan
}
