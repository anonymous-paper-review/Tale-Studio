// 캐릭터 대표 이미지(views.main)의 진실(#artist-main-authority 2026-09-03).
//   시트는 2026-08-27 모습 권위 이전 뒤 character_appearances.sheet_url 에만 저장되고 characters.view_main 은
//   더 이상 쓰이지 않는다. 그런데 클라이언트는 view_main 만 보고 "대표 이미지 없음"으로 판정해 Artist 탭에
//   들어갈 때마다 writer 출신 인물의 시트를 다시 만들었다(실측 겨울_5: 진입 3회 = 9잡). 대표 이미지는
//   기본 모습의 시트(없으면 시트가 있는 첫 모습)이고, 구 컬럼은 하위호환 폴백이다.

export interface MainImageAppearance {
  isDefault?: boolean | null
  sheetUrl?: string | null
}

export function mainImageFromAppearances(
  legacyViewMain: string | null | undefined,
  appearances: readonly MainImageAppearance[] | null | undefined,
): string | null {
  const list = appearances ?? []
  const def = list.find((a) => a.isDefault && a.sheetUrl)
  if (def?.sheetUrl) return def.sheetUrl
  const any = list.find((a) => a.sheetUrl)
  if (any?.sheetUrl) return any.sheetUrl
  return legacyViewMain ?? null
}
