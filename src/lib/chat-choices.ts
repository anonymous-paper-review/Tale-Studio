// 채팅 선택지 문법(#p4-choices 2026-08-06) — 에이전트가 되묻는 대신 고를 수 있는 후보를 제시.
//   응답 본문 마지막의 `[CHOICES] a | b | c` 한 줄을 추출·제거한다 (Story Foundation 등).
//   버튼 클릭 = 그 문구를 채팅에 입력(핸드오프 패턴) — 판정·반영은 타이핑과 동일 경로.

export interface ParsedChoices {
  reply: string
  choices: string[]
  markerFound: boolean
}

const CHOICES_RE = /^\s*\[CHOICES\]\s*(.*)\s*$/im

export function parseChatChoices(text: string): ParsedChoices {
  const m = CHOICES_RE.exec(text)
  if (!m) return { reply: text, choices: [], markerFound: false }
  const choices = m[1]
    // 모델이 지시의 "|" 대신 " / "를 쓰는 경우도 있어 공백이 있는 슬래시를
    // 구분자로 허용한다. URL·비율·복합어의 슬래시는 그대로 둔다.
    .split(/\s*\|\s*|\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
  const reply = text.replace(CHOICES_RE, '').trimEnd()
  if (choices.length < 2) {
    console.warn(`[chat-choices] marker found but only ${choices.length} candidate(s) parsed`)
    return { reply, choices: [], markerFound: true }
  }
  return { reply, choices, markerFound: true }
}
