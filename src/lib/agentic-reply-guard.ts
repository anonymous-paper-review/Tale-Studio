// 채팅 agentic 응답의 updates JSON 유출 방어 — 임시 조치(2026-07-15).
//   writer/director 챗은 응답 끝의 ```json {updates:[...]} ``` 블록을 추출·적용하고 표시에서 제거하는데,
//   응답이 max_tokens 에서 잘리면(닫는 펜스 없음) 또는 JSON 파싱이 실패하면 원문 전체가 채팅 메시지로
//   저장돼 거대한 raw JSON 이 사용자에게 그대로 노출된다(2026-07-15 실측: 76샷 일괄 updates 시도가
//   4096 토큰에서 잘림). 근본 해법(배치 상한 프롬프트 규칙 + stop_reason 연동) 전까지, 실패 경로에서
//   첫 ```json 펜스 이후를 잘라내고 안내 문구로 대체한다.
const NOTICE =
  '(변경 명령이 너무 커서 응답이 중간에 잘렸어요. 적용된 변경은 없습니다 — 범위를 씬 단위로 나눠 다시 요청해 주세요.)'

export function stripLeakedUpdatesBlock(text: string): string {
  const i = text.indexOf('```json')
  if (i === -1) return text
  const head = text.slice(0, i).trim()
  return head ? `${head}\n\n${NOTICE}` : NOTICE
}
