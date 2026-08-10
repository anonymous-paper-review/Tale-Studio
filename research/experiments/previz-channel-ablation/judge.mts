// 판정 계기(instrument) — previz 채널 ablation 전용 VLM 심판.
//
// 왜 제품 src/lib/adherence/vision.ts 를 그대로 안 쓰나 (Phase 0 평가 결론):
//   - 제품의 judgeStartFrames 루브릭은 "스타일·정체성·색·렌더링 품질을 판정하지 말라"고 명시한다
//     (vision.ts:74) — A1 이 재야 하는 축과 정반대다. judgeDirection 은 2장을 받지만
//     "한 클립의 첫/끝 프레임에서 카메라가 기대대로 움직였나"에 하드코딩돼 있어(vision.ts:105-107)
//     "프레임 B가 레퍼런스 R과 같은 구도인가"를 표현할 수 없다.
//   - 범용 클라이언트 geminiJson 은 module-private(vision.ts:13) 이라 import 불가.
// 그래서 계기는 독립 모듈로 둔다. 계측기는 제품 코드를 따라 표류하면 안 되고
// 모델 버전이 좌표로 고정돼야 한다(실험 규칙 3: 좌표 기록).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/** 좌표: 심판 모델 고정. 제품 V축과 같은 계열이지만 독립적으로 핀 고정된다. */
export const JUDGE_MODEL = 'gemini-3-flash-preview'

/** 좌표: 심판 입력 이미지 정규화 — 원본 PNG(1280x720, ~800KB)를 그대로 보내면 호출당 수 MB라
 *  판정이 사실상 진행되지 않는다. 제품 fetchImageB64 도 같은 이유로 다운스케일한다(vision.ts:44). */
export const JUDGE_IMAGE_WIDTH = 768
export const JUDGE_IMAGE_QUALITY = 82

const CACHE = join(dirname(fileURLToPath(import.meta.url)), 'run', 'judge-cache')
const URL_BASE = `https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent`

function apiKey(): string {
  const k = (process.env.TALE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY)?.trim()
  if (!k) throw new Error('TALE_GEMINI_API_KEY / GEMINI_API_KEY not set')
  return k
}

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } }

export async function imgPart(path: string): Promise<Part> {
  const buf = await sharp(readFileSync(path))
    .resize({ width: JUDGE_IMAGE_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: JUDGE_IMAGE_QUALITY })
    .toBuffer()
  return { inline_data: { mime_type: 'image/jpeg', data: buf.toString('base64') } }
}

/** 범용 JSON 강제 호출 — temperature 0, 재시도 3회.
 *  디스크 캐시(payload 해시 키): 중간에 죽어도 이미 성공한 판정은 재사용된다. */
export async function vlmJson<T = Record<string, unknown>>(parts: Part[]): Promise<T> {
  const body = {
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  }
  mkdirSync(CACHE, { recursive: true })
  const key = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)
  const cached = join(CACHE, `${key}.json`)
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, 'utf8')) as T
  let lastErr = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${URL_BASE}?key=${apiKey()}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        lastErr = `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
        continue
      }
      const j = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const parsed = JSON.parse(text) as T
      writeFileSync(cached, JSON.stringify(parsed))
      return parsed
    } catch (e) {
      lastErr = (e as Error).message
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  throw new Error(`vlmJson failed after 3 attempts: ${lastErr}`)
}
