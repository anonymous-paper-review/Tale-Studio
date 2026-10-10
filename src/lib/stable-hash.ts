// 작은 내용 지문 — 같은 내용이면 같은 값(키 순서 무관). 비밀 · 보안 용도가 아니라 "바뀌었나"를 가리는 데만 쓴다.
//   lib/lifecycle 의 producer 원천 지문과 같은 방식(FNV-1a 32비트 + 키 정렬 JSON).

export function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function stableHash(value: unknown): string {
  return fnv1a(stableStringify(value))
}
