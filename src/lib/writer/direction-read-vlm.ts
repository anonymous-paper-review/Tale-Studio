// 연출 장 읽기(D10 ② · 2026-11-22 오너 Q1 · Q3) — 읽는 AI(Gemini 3.6 Flash, 정합 검사 src/lib/adherence/vision.ts 와 같은 모델)가
//   시작 장과 연출 장을 보고 사람이 그린 표시(화살표 · 움직임 선 · 손글씨)만 읽어, 움직임이 끝난 끝 장을 영어 · 한국어 한 줄로 쓴다.
//   글은 2026-11-22 비교 시험(scratchpad fb1120/fb-end/exp, 다섯 샷)에서 쓴 것 그대로. 서버 전용.
//   키가 없거나 · 응답이 틀리거나 · 시간을 넘기면 null — 생성 흐름을 막지 않고 물음 창이 "직접 적어 주세요"를 보인다.
import sharp from 'sharp'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'
const READ_TIMEOUT_MS = 30_000
/** 한 줄 상한 — 그림 · 영상 지시에 싣는 글이 길어지지 않게. */
const LINE_MAX_CHARS = 600

export const DIRECTION_READ_PROMPT =
  'You are a storyboard supervisor. Image 1 is the START frame of a film shot (pencil sketch, faceless wooden mannequins). ' +
  'Image 2 is the same instant with marks the director drew on top. Everything in image 2 that is not in image 1 is a mark. ' +
  'Read only the marks: for each arrow, what it starts on (which figure, object, or the camera), which way it points and how far ' +
  'it reaches in the frame; copy each note word for word in its language. Labels about lens, light or color are not movement. ' +
  'Do not guess beyond the marks; no marks means a static shot. Return JSON only: ' +
  '{"marks":[{"on":"","reading":""}],"camera":"none|...","end_en":"1-2 sentences: the END frame after the movement completes, ' +
  'with frame positions (left third, center, right edge, out of frame)","end_ko":"the same in Korean","unclear":""}'

function apiKey(): string | null {
  return process.env.TALE_GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || null
}

async function imageB64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    // 러프 한 장은 400px 안팎이다 — 손글씨를 읽기 좋게 1024px 로 키워 보낸다(시험과 같은 크기).
    const out = await sharp(buf).resize({ width: 1024 }).jpeg({ quality: 85 }).toBuffer()
    return out.toString('base64')
  } catch {
    return null
  }
}

/** 시작 장 · 연출 장 → 끝 장 한 줄(영어 = 지시용, 한국어 = 화면용). 못 읽으면 null. */
export async function readDirectionMarks(startUrl: string, directionUrl: string): Promise<{ en: string; ko: string | null } | null> {
  const key = apiKey()
  if (!key) return null
  const [start, direction] = await Promise.all([imageB64(startUrl), imageB64(directionUrl)])
  if (!start || !direction) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)
  try {
    const res = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: DIRECTION_READ_PROMPT },
              { inline_data: { mime_type: 'image/jpeg', data: start } },
              { inline_data: { mime_type: 'image/jpeg', data: direction } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
    const parsed = JSON.parse(text) as { end_en?: unknown; end_ko?: unknown }
    const en = typeof parsed.end_en === 'string' ? parsed.end_en.trim().slice(0, LINE_MAX_CHARS) : ''
    if (!en) return null
    const ko = typeof parsed.end_ko === 'string' && parsed.end_ko.trim() ? parsed.end_ko.trim().slice(0, LINE_MAX_CHARS) : null
    return { en, ko }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
