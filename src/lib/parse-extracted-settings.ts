// Producer 채팅 LLM 응답에서 reply(사용자 노출 텍스트)와 extractedSettings(보드 패치)를 분리한다 (C8).
//
// 출력 컨트랙트: LLM은 응답 말미에 ```json {"extractedSettings": {...}} ``` 블록 1개를 emit한다.
// 그러나 LLM은 컨트랙트를 어길 수 있다(중간 위치/펜스 없음/다중 블록/깨진 JSON/대문자 펜스).
// 그 경우에도 reply에 JSON 원문이 절대 새어나가지 않도록 방어적으로 제거한다.
//   - 모든 ``` 코드펜스 블록을 reply에서 제거(깨진 JSON 포함).
//   - 말미의 펜스 없는 JSON 객체({"extractedSettings":...})도 제거.
//   - 파싱 가능한 블록에서 extractedSettings를 추출(마지막 유효 값 우선).

type Parsed = { reply: string; extractedSettings: Record<string, unknown> }

function extractedFromObject(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if ('extractedSettings' in record) {
    const settings = record.extractedSettings
    return settings && typeof settings === 'object' && !Array.isArray(settings)
      ? settings as Record<string, unknown>
      : null
  }
  // 이전 스타일 예시는 이 두 필드를 최상위에 두었다. 다른 항목까지 설정으로 해석하지 않는다.
  const style = Object.fromEntries(Object.entries(record).filter(([key]) =>
    key === 'styleAnchorKey' || key === 'styleAnchorFromAttachment'))
  return Object.keys(style).length ? style : null
}

function takeExtracted(body: string, current: Record<string, unknown>): Record<string, unknown> {
  try {
    return extractedFromObject(JSON.parse(body.trim())) ?? current
  } catch {
    /* 깨진 JSON: 무시(추출 안 함). reply에서는 아래에서 제거된다. */
  }
  return current
}

export function parseExtractedSettings(text: string): Parsed {
  let extractedSettings: Record<string, unknown> = {}
  const source = text ?? ''

  // 1) 모든 ```...``` 펜스 블록을 찾아 extractedSettings 추출(json 펜스 우선, 마지막 유효값 채택)
  const fenceRe = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(source)) !== null) {
    extractedSettings = takeExtracted(m[1], extractedSettings)
  }

  // 2) reply에서 모든 펜스 블록 제거(깨진 JSON·다중·중간 위치 모두 — 원문 누출 차단)
  let reply = source
    .replace(/```[\s\S]*?```/g, '') // 닫힌 펜스 블록
    .replace(/```[\s\S]*$/, '') // 미종결 펜스(토큰 컷오프) — 여는 마커부터 끝까지 제거
    .trim()

  // 3) 펜스 없이 말미에 붙은 JSON 객체({"extractedSettings":...}) 제거 + 추출.
  //    가장 바깥 객체를 잡기 위해 앞쪽 '{'부터 시도해, 끝까지 슬라이스가 통째로 파싱되는 첫 지점을 채택.
  for (let i = 0; i < reply.length; i++) {
    if (reply[i] !== '{') continue
    const tail = reply.slice(i).trim()
    if (!tail.endsWith('}')) continue
    try {
      const object: unknown = JSON.parse(tail)
      const parsed = extractedFromObject(object)
      if (parsed || (object && typeof object === 'object' && 'extractedSettings' in object)) {
        extractedSettings = parsed ?? extractedSettings
        reply = reply.slice(0, i).trim()
        break
      }
    } catch {
      /* 이 지점에서 시작하는 슬라이스는 JSON이 아님 — 다음 '{' 시도 */
    }
  }

  return { reply, extractedSettings }
}
