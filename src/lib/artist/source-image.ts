// 출처 그림(#image-to-artist 2026-09-17) — 사용자가 올린 인물 원본이 character_appearances.derived_from_url 에 있으면
//   시트는 그 그림을 정체성 참조로 넣어 만들고(버튼 생성·자동 초안 둘 다), 대표 사진(portrait_url)은 원본을 유지한다.

/** 시트 I2I 의 정체성 참조 순서: 출처 원본 → 기준 얼굴(비기본 모습) → 직전 시트. 없는 것은 빠진다. */
export function sheetIdentityReferences(opts: {
  sourceImageUrl?: string | null
  baseFaceUrl?: string | null
  priorSheetUrl?: string | null
}): string[] {
  return [opts.sourceImageUrl, opts.baseFaceUrl, opts.priorSheetUrl].filter((u): u is string => typeof u === 'string' && u.length > 0)
}

/** 시트가 착지해도 대표 사진을 시트 크롭으로 덮지 않을 모습인가 — 출처 원본이 있으면 그것이 대표 사진이다. */
export function keepsSourcePortrait(appearance: { derived_from_url?: string | null } | null | undefined): boolean {
  return typeof appearance?.derived_from_url === 'string' && appearance.derived_from_url.length > 0
}
