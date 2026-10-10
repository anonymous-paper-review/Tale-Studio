// 사용자 그림체의 매체(애니 · 카툰 · 실사 등) 고르기 — 지시문과 답 읽기(순수). 모델 호출은 medium-llm.ts (2026-10-09).
//   매체는 카탈로그 값(style_anchors.medium)이고 Writer(시각 형식)와 Director(촬영 장비 표현)가 읽는다. 비어 있으면 실사로
//   간주되므로, 만화 그림체를 정할 때는 그림을 보고 허용 목록에서 하나 고른다. 모델은 제안만 하고 목록 밖 답은 버린다.

/** 허용 목록에 있는 매체만 설명을 붙인다 — 카탈로그가 바뀌면 없는 값을 권하지 않는다. */
const MEDIUM_HINTS: Record<string, string> = {
  '2d_anime': 'hand-drawn manga, webtoon or anime-style art',
  '2d_cartoon': 'western cartoon or comic-book art',
  watercolor: 'painted watercolor art',
  '3d': '3D rendered art',
  stop_motion: 'clay or puppet stop-motion look',
  live_action: 'photographs of real people and places',
}

export function buildMediumPickPrompt(allowed: readonly string[]): string {
  return [
    'This image is a page from a comic. The user wants it turned into a video that keeps this art style.',
    'Pick the ONE medium from the list below that the video should be made in to match this art.',
    '',
    ...allowed.map((medium) => (MEDIUM_HINTS[medium] ? `- ${medium}: ${MEDIUM_HINTS[medium]}` : `- ${medium}`)),
    '',
    'Answer with the medium value only, exactly as written in the list, and nothing else.',
  ].join('\n')
}

/** 답에 허용 목록 값이 정확히 하나 있을 때만 그 값. 없거나 둘 이상이면 null. */
export function parseMediumPick(text: string, allowed: readonly string[]): string | null {
  const lower = text.toLowerCase()
  const found = allowed.filter((medium) => {
    const escaped = medium.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?![a-z0-9_])`).test(lower)
  })
  return found.length === 1 ? found[0] : null
}
