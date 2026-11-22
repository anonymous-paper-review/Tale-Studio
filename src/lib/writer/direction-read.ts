// 연출 장을 읽은 한 줄(D10 ② · 2026-11-22 오너 Q1 · Q3 · Q4) — 러프 기록(shots.rough_storyboard.directionRead)에 남는 모양과 "낡음" 규칙.
//   읽는 AI(Gemini 3.6 Flash)가 시작 장과 연출 장을 보고 움직임을 한 줄로 읽는다 → 끝 장 그리기(GPT Image 2)와 영상 지시(fb-video)가 쓴다.
//   줄을 읽은(사람이 고친) 연출 장 주소(?v= 포함)를 같이 둔다 — 지금 연출 장 주소와 다르면 낡은 줄이라 어디에도 쓰지 않는다(리드 2026-11-22).
//   저장 · 연출 장 다시 그리기는 주소(?v=)를 바꾸고, 러프 전체 다시 그리기는 기록을 통째로 새로 써서 줄이 없어진다.
//   브라우저 · 서버 어디서나 불러도 되는 순수 파일이다(서버 전용 부품을 들이지 않는다). 약속: tests/writer/direction-read.test.ts
export interface DirectionRead {
  /** 지시(끝 장 그리기 · 영상)에 싣는 영어 줄. */
  en: string
  /** 한국어 화면에 보이는 줄 — 읽는 AI 가 같이 준 것, 사람이 한국어로 고치면 그 글. 없으면 null(영어 줄을 보인다). */
  ko: string | null
  /** 'ai' = 읽는 AI 가 읽은 그대로 · 'user' = 사람이 고친 줄(다시 읽지 않는다). */
  source: 'ai' | 'user'
  /** 이 줄을 읽은(고친) 연출 장 주소(?v= 포함) — 지금 연출 장 주소와 다르면 낡은 줄. */
  direction: string
  /** 읽은(고친) 시각(ms). */
  at: number
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** 지금 연출 장을 읽은 줄 — 줄이 없거나 모양이 틀리거나 낡았으면 null. */
export function freshDirectionRead(rough: unknown): DirectionRead | null {
  const r = record(rough)
  const read = record(r?.directionRead)
  const direction = record(r?.frames)?.direction
  if (!read || typeof direction !== 'string' || !direction) return null
  const en = typeof read.en === 'string' ? read.en.trim() : ''
  if (!en || typeof read.direction !== 'string' || read.direction !== direction) return null
  return {
    en,
    ko: typeof read.ko === 'string' && read.ko.trim() ? read.ko.trim() : null,
    source: read.source === 'user' ? 'user' : 'ai',
    direction: read.direction,
    at: typeof read.at === 'number' && Number.isFinite(read.at) ? read.at : 0,
  }
}

/** 지시에 실을 영어 줄 — 지금 연출 장을 읽은 줄이 없거나 낡았으면 null. 영상 지시(fb-video)가 이것을 부른다. */
export function freshDirectionLine(rough: unknown): string | null {
  return freshDirectionRead(rough)?.en ?? null
}
