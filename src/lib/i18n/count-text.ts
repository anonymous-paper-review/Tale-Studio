// 영어 화면의 단수 · 복수(리드 2026-11-14 답 2 "1 image · 1 shot · Making 1 video").
//   사전 키가 영어 원문이라 수가 1이면 단수 문장 키를 고른다. 한국어 사전은 두 키가 같은 꼴이다.
type Translate = (text: string, params?: Record<string, string | number>) => string

export function countText(
  t: Translate,
  count: number,
  one: string,
  many: string,
  params?: Record<string, string | number>,
): string {
  return count === 1 ? t(one, params) : t(many, params)
}
