// 연출 장을 읽은 한 줄(D10 ② · 2026-11-22 오너 Q1 · Q3 · Q4) — 러프 기록(shots.rough_storyboard.directionRead)에 남는 모양과 "낡음" 규칙.
//   읽는 AI(Gemini 3.6 Flash)가 시작 장과 연출 장을 보고 움직임을 한 줄로 읽는다 → 끝 장 그리기(GPT Image 2) · 실사 지시(오너 R1) · 영상 지시(fb-video)가 쓴다.
//   줄을 읽은(사람이 고친) 연출 장 주소(?v= 포함)를 같이 둔다 — 지금 연출 장 주소와 다르면 낡은 줄이라 어디에도 쓰지 않는다(리드 2026-11-22).
//   저장 · 연출 장 다시 그리기는 주소(?v=)를 바꾸고, 러프 전체 다시 그리기는 기록을 통째로 새로 써서 줄이 없어진다.
//   실사 지시는 끝 그림에 쓴 줄만 싣는다(리드 Q-a 2026-11-22 · 오너 R1) — 그 줄로 그린 끝 장 주소(endDrawn)가 지금 끝 장일 때만(freshDirectionLine).
//     [그대로]를 고르거나 끝 장 작업이 실패 · 버려지면 그 줄은 끝 장 · 실사에는 안 쓰이고 화면(편집기 아래 줄)과 영상에만 쓰인다.
//   영상 지시는 2026-11-23 리드 D2 부터 끝 장과 상관없이 지금 연출 장을 읽은 줄(freshDirectionRead 의 en)을 쓴다 — 시작+끝 영상이 없어져 끝 그림이 영상에 가지 않는다.
//   브라우저 · 서버 어디서나 불러도 되는 순수 파일이다(서버 전용 부품을 들이지 않는다). 약속: tests/writer/direction-read.test.ts
export interface DirectionRead {
  /** 지시(끝 장 그리기 · 실사 · 영상)에 싣는 영어 줄. */
  en: string
  /** 한국어 화면에 보이는 줄 — 읽는 AI 가 같이 준 것, 사람이 한국어로 고치면 그 글. 없으면 null(영어 줄을 보인다). */
  ko: string | null
  /** 'ai' = 읽는 AI 가 읽은 그대로 · 'user' = 사람이 고친 줄(다시 읽지 않는다). */
  source: 'ai' | 'user'
  /** 이 줄을 읽은(고친) 연출 장 주소(?v= 포함) — 지금 연출 장 주소와 다르면 낡은 줄. */
  direction: string
  /** 읽은(고친) 시각(ms). */
  at: number
  /** 이 줄로 그려 끼운 끝 장 주소(?v= 포함) — 아직 그리지 않았으면 null. 지금 끝 장과 같을 때만 실사 지시에 쓴다. */
  endDrawn: string | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** 지금 연출 장을 읽은 줄 — 줄이 없거나 모양이 틀리거나 낡았으면 null. 화면(물음 창 · 편집기 아래 줄)과 영상 지시(fb-video, 리드 D2 2026-11-23 — en)가 쓴다. */
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
    endDrawn: typeof read.endDrawn === 'string' && read.endDrawn ? read.endDrawn : null,
  }
}

/** 영상 지시에 싣는 읽은 줄과 그 출처(오너 2026-11-27 N4b · 리드) — 실사 가운데 장을 고쳐 읽은 줄(shots.storyboard_image.directionRead)이
 *  지금 실사 가운데 장의 것이면 그 줄('real'), 아니면 콘티 연출 장을 읽은 줄('conti', 끝 장과 상관없이 — 리드 D2). 둘 다 없거나 낡았으면 null.
 *  둘 다 살아 있으면 읽은(고친) 시각이 더 나중인 줄(리드 B).
 *  실사 줄이 앞서는 까닭: 실사 가운데 장을 고치면 실사 시트(시작+미들 영상이 보내는 장)가 그 움직임이다. 실사를 다시 그리거나 다른 판을 고르면
 *  가운데 장 주소가 달라 실사 줄은 저절로 낡고 콘티 줄로 돌아간다. 출처는 시작+미들의 "러프 바뀜" 막기(n-video)가 쓴다.
 *  약속: tests/director/video-line-pick.test.ts */
export function pickVideoDirectionRead(
  shot: { storyboard_image?: unknown; rough_storyboard?: unknown } | null | undefined,
): { en: string; source: 'real' | 'conti' } | null {
  const real = freshDirectionRead(shot?.storyboard_image)
  const conti = freshDirectionRead(shot?.rough_storyboard)
  // 둘 다 살아 있으면 더 나중에 읽은(고친) 줄이 이긴다(리드 B 2026-11-27) — 사람이 마지막으로 정한 움직임.
  if (real && (!conti || real.at >= conti.at)) return { en: real.en, source: 'real' }
  return conti ? { en: conti.en, source: 'conti' } : null
}

/** 영상 지시에 싣는 영어 줄 — pickVideoDirectionRead 의 줄만. 없으면 null. */
export function videoDirectionLine(shot: { storyboard_image?: unknown; rough_storyboard?: unknown } | null | undefined): string | null {
  return pickVideoDirectionRead(shot)?.en ?? null
}

/** 실사 지시에 실을 영어 줄 — 지금 연출 장을 읽은 줄이고, 그 줄로 그린 끝 장이 지금 끝 장일 때만. 아니면 null.
 *  실사 두 길(한 샷 · 네 샷 시트, 오너 R1)이 부른다. 영상은 리드 D2(2026-11-23)부터 이 함수가 아니라 freshDirectionRead 의 en 을 쓴다. */
export function freshDirectionLine(rough: unknown): string | null {
  const read = freshDirectionRead(rough)
  const end = record(record(rough)?.frames)?.end
  if (!read || !read.endDrawn || typeof end !== 'string' || read.endDrawn !== end) return null
  return read.en
}

/** 순수: 끝 장을 끼울 때 러프 기록의 줄에 "이 줄로 그렸다" 표시를 단다 — 그 줄(영어 글 · 읽은 연출 장)이 그대로일 때만.
 *  그새 사람이 줄을 고쳤으면 새 줄은 아직 그리지 않은 줄이라 표시를 지운다(null). 줄이 없으면 그대로 돌려준다. */
export function withEndDrawn(directionRead: unknown, drawnFrom: { en: string; direction: string }, endUrl: string): unknown {
  const read = record(directionRead)
  if (!read) return directionRead
  const same = typeof read.en === 'string' && read.en.trim() === drawnFrom.en.trim() && read.direction === drawnFrom.direction
  return { ...read, endDrawn: same ? endUrl : null }
}
