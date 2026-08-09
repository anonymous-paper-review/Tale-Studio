// 정합 검사 VLM 판정기 (서버 전용 IO — #adherence P2). 판정 로직/claim 조립은 core.ts.
//   모델: gemini-3-flash-preview(제품 V축 기본 계열), temperature 0, JSON 강제.
//   GEMINI_API_KEY 부재/호출 실패 = null 반환 — 검사는 best-effort, 생성 플로우를 막지 않는다.
import sharp from 'sharp'

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent'

function apiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null
}

async function geminiJson(parts: unknown[]): Promise<Record<string, unknown> | null> {
  const key = apiKey()
  if (!key) return null
  const body = {
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        continue
      }
      const j = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
    }
  }
  return null
}

/** 원격 이미지 → 다운스케일 jpeg base64 (VLM 페이로드 절감). 실패 시 null. */
export async function fetchImageB64(url: string, width = 512): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const out = await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer()
    return out.toString('base64')
  } catch {
    return null
  }
}

export interface StartJudgeItem {
  id: string
  imageB64: string
  claim: string
}
export interface StartVerdict {
  match: boolean
  reason: string
}

/** START 프레임 배치 판정 — 한 호출에 여러 샷. 실패/키 부재 시 null(호출부 no-op). */
export async function judgeStartFrames(items: StartJudgeItem[]): Promise<Map<string, StartVerdict> | null> {
  if (!items.length) return new Map()
  const parts: unknown[] = [
    {
      text: [
        'You are a storyboard supervisor. Each ITEM below is a previz frame (rough pencil sketch with wooden mannequin stand-ins, or a stylized repaint of one).',
        'For EACH item decide whether the frame DEPICTS the described moment — judge ONLY staging: the described action/moment, number of figures, and visual emphasis.',
        'Do NOT judge art style, character identity, faces, colors, or rendering quality (mannequins have no faces by design).',
        'match=1 only if the staging clearly shows the described moment; 0 if it shows a different action, wrong figure count, or unrelated content. Be strict about the ACTION, lenient about style.',
        '',
        `Return JSON only: {${items.map((i) => `"${i.id}":{"match":0 or 1,"reason":"<=12 words"}`).join(',')}}`,
      ].join('\n'),
    },
  ]
  for (const item of items) {
    parts.push({ text: `ITEM ${item.id} should depict: ${item.claim}` })
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: item.imageB64 } })
  }
  const raw = await geminiJson(parts)
  if (!raw) return null
  const out = new Map<string, StartVerdict>()
  for (const item of items) {
    const v = raw[item.id] as { match?: unknown; reason?: unknown } | undefined
    if (!v || (v.match !== 0 && v.match !== 1)) continue
    out.set(item.id, { match: v.match === 1, reason: typeof v.reason === 'string' ? v.reason : '' })
  }
  return out
}

/** 영상 첫/끝 프레임의 방향성 이동 판정. 실패/키 부재 시 null. */
export async function judgeDirection(
  firstB64: string,
  lastB64: string,
  expectationText: string,
): Promise<{ match: boolean; observed: string } | null> {
  const raw = await geminiJson([
    {
      text: [
        'FRAME A is the first frame of a video clip, FRAME B is the last frame of the same clip.',
        `Expected camera movement across the clip: ${expectationText}.`,
        'Compare the two frames and decide if the view actually moved as expected. Describe the observed shift in <=10 words.',
        'Return JSON only: {"match":0 or 1,"observed":"..."}',
      ].join('\n'),
    },
    { text: 'FRAME A:' },
    { inline_data: { mime_type: 'image/jpeg', data: firstB64 } },
    { text: 'FRAME B:' },
    { inline_data: { mime_type: 'image/jpeg', data: lastB64 } },
  ])
  if (!raw || (raw.match !== 0 && raw.match !== 1)) return null
  return { match: raw.match === 1, observed: typeof raw.observed === 'string' ? raw.observed : '' }
}

/** dataURL/base64 프레임 → 64×36 그레이스케일 mean abs diff (0..255). 실패 시 null. */
export async function meanFrameDiff(firstB64: string, lastB64: string): Promise<number | null> {
  try {
    const decode = async (b64: string) =>
      sharp(Buffer.from(b64, 'base64')).resize(64, 36, { fit: 'fill' }).grayscale().raw().toBuffer()
    const [a, b] = await Promise.all([decode(firstB64), decode(lastB64)])
    if (a.length !== b.length || !a.length) return null
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
    return sum / a.length
  } catch {
    return null
  }
}
