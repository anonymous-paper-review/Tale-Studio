// 화면 비율('16:9' · 'horizontal_16:9' · '2.39:1') → fal 이미지 크기 이름(landscape_16_9 등). 맞는 이름이 없으면 'auto'.
//   fal 입력 조립(writer/llm/fal.ts)과 기준 그림 없이 그리는 배경(artist/world-submit.ts)이 함께 쓴다 — 배경 경로 테스트들이
//   fal.ts 를 통째로 흉내 내서 여기 따로 둔다(2026-10-13).
export function imageSizeForAspect(ar?: string): string {
  if (!ar) return 'auto'
  const cleaned = ar.replace(/^(horizontal_|vertical_|cinema_)/, '')
  const map: Record<string, string> = {
    '16:9': 'landscape_16_9',
    '4:3': 'landscape_4_3',
    '1:1': 'square_hd',
    '3:4': 'portrait_4_3',
    '9:16': 'portrait_16_9',
  }
  if (map[cleaned]) return map[cleaned]
  // 숫자 비율 → 가까운 preset
  const m = /^([\d.]+):([\d.]+)$/.exec(cleaned)
  if (m) {
    const ratio = parseFloat(m[1]) / parseFloat(m[2])
    if (ratio > 1.6) return 'landscape_16_9' // 1.78, 2.39 등
    if (ratio > 1.2) return 'landscape_4_3'
    if (Math.abs(ratio - 1) < 0.05) return 'square_hd'
    if (ratio > 0.65) return 'portrait_4_3'
    return 'portrait_16_9'
  }
  return 'auto'
}
