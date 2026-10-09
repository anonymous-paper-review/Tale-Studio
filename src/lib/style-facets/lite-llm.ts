// 그림체 분석기 모델 호출(경량 lite v0.1) — 채움 1회 + 컴파일 1회, 확인에 걸리면 각각 한 번 더(인계 lite 계약).
//   그림은 주소로 넘긴다(우리 저장소 주소만 — 호출부가 확인한다). 생각은 모델 기본(adaptive): 끄면 컴파일이 단어 상한을 넘긴다(실측).
//   실패하면 facets 없이 돌려준다 — 생성은 앵커 그림만으로 이어진다(기능 저하이지 오류가 아니다).
import { CLAUDE_MODEL, getAnthropicClient } from '@/lib/claude'
import {
  buildLiteCompilePrompt,
  buildLiteFillPrompt,
  checkLiteFill,
  liteFacetsFromCompile,
  type LiteFacetsRecord,
} from '@/lib/style-facets/lite'

const FILL_MAX_TOKENS = 16000
/** 6000 은 유저 그림 6장 중 3장에서 생각이 다 먹어 비었다(사이클 11) — 12000, 다시 할 때 1.5배. */
const COMPILE_MAX_TOKENS = 12000
/** 라우트 한도(300초) 안에서 다시 시도할지 — 이 시간을 넘겼으면 더 부르지 않는다. */
const RETRY_DEADLINE_MS = 200_000

export interface LiteAttempt {
  step: 'fill' | 'compile'
  ok: boolean
  reason?: string
  max_tokens: number
  stop?: string | null
  ms: number
}

async function call(content: Array<{ type: 'image'; source: { type: 'url'; url: string } } | { type: 'text'; text: string }>, maxTokens: number) {
  const response = await getAnthropicClient().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content }],
  })
  return {
    text: response.content.map((block) => (block.type === 'text' ? block.text : '')).join(''),
    stop: response.stop_reason,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  }
}

export async function extractLiteFacets(imageUrl: string): Promise<{ facets: LiteFacetsRecord | null; attempts: LiteAttempt[] }> {
  const started = Date.now()
  const attempts: LiteAttempt[] = []
  const usage: Record<string, unknown> = {}

  let fill: { filledJson: string; sceneSummary: string } | null = null
  for (let i = 0; i < 2 && !fill; i++) {
    if (i > 0 && Date.now() - started > RETRY_DEADLINE_MS) break
    const t0 = Date.now()
    try {
      const out = await call([{ type: 'image', source: { type: 'url', url: imageUrl } }, { type: 'text', text: buildLiteFillPrompt() }], FILL_MAX_TOKENS)
      usage.fill = out.usage
      const check = checkLiteFill(out.text)
      attempts.push({ step: 'fill', ok: check.ok, reason: check.ok ? undefined : check.reason, max_tokens: FILL_MAX_TOKENS, stop: out.stop, ms: Date.now() - t0 })
      if (check.ok) fill = { filledJson: check.filledJson, sceneSummary: check.sceneSummary }
    } catch (error) {
      attempts.push({ step: 'fill', ok: false, reason: error instanceof Error ? error.message.slice(0, 200) : 'error', max_tokens: FILL_MAX_TOKENS, ms: Date.now() - t0 })
    }
  }
  if (!fill) return { facets: null, attempts }

  const prompt = buildLiteCompilePrompt(fill.filledJson, fill.sceneSummary)
  for (const maxTokens of [COMPILE_MAX_TOKENS, Math.round(COMPILE_MAX_TOKENS * 1.5)]) {
    if (maxTokens !== COMPILE_MAX_TOKENS && Date.now() - started > RETRY_DEADLINE_MS) break
    const t0 = Date.now()
    try {
      const out = await call([{ type: 'text', text: prompt }], maxTokens)
      usage.compile = out.usage
      const facets = liteFacetsFromCompile(out.text, { model: CLAUDE_MODEL, extractedAt: new Date().toISOString(), usage })
      attempts.push({ step: 'compile', ok: !!facets, reason: facets ? undefined : 'compile_check', max_tokens: maxTokens, stop: out.stop, ms: Date.now() - t0 })
      if (facets) {
        console.log(`[style-facets] lite ok in ${Date.now() - started}ms figure=${facets.figure ? 'yes' : 'no'}`)
        return { facets, attempts }
      }
    } catch (error) {
      attempts.push({ step: 'compile', ok: false, reason: error instanceof Error ? error.message.slice(0, 200) : 'error', max_tokens: maxTokens, ms: Date.now() - t0 })
    }
  }
  console.warn('[style-facets] lite failed:', JSON.stringify(attempts))
  return { facets: null, attempts }
}
