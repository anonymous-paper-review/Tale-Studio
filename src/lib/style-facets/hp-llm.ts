// 그림체 분석기 모델 호출(고성능 판 v1.2.3, 유저 경로) — 두 덩어리 채움을 동시에 1회씩 + 컴파일 1회, 확인에 걸리면 시간이 남을 때 그것만 한 번 더.
//   (2026-10-10 오너 "프리셋과 같은 309칸, 나눠서 동시에"). 10/10 실측(Sonnet, 생각 기본): 309칸 한 번에 230초 · 나눠서 동시에 158초 · 컴파일 54초.
//   라우트 한도(300초) 안에서 끝낸다 — 늦으면 다시 부르지 않고 facets 없이 돌려준다(생성은 앵커 그림만으로 이어진다, 기능 저하이지 오류가 아니다).
//   그림은 주소로 넘긴다(우리 저장소 주소만 — 호출부가 확인한다). 답이 길어 스트림으로 받는다(SDK 는 긴 비스트림 요청을 거절한다).
import { CLAUDE_MODEL, getAnthropicClient } from '@/lib/claude'
import {
  buildHpCompilePrompt,
  buildHpFillPrompt,
  checkHpCompile,
  checkHpFill,
  detailGrade,
  hpFacetsFromCompile,
  mergeHpFill,
  probeCapFor,
  type HpFacetsRecord,
  type HpPart,
} from '@/lib/style-facets/hp'

/** 덩어리 하나의 답은 생각 포함 1.8~2.1만 토큰(10/10 실측) — 넉넉히. */
const FILL_MAX_TOKENS = 32000
/** 컴파일 답은 생각 포함 약 8천 토큰(10/10 실측) — 비면 1.5배로 한 번 더. */
const COMPILE_MAX_TOKENS = 16000
/** 라우트 한도(300초)에서 저장 · 응답 몫을 뺀 시간. */
const BUDGET_MS = 285_000
/** 덩어리를 다시 채울지 — 이 시간이 지났으면 다시 채우면 컴파일까지 못 끝낸다. */
const FILL_RETRY_DEADLINE_MS = 120_000
/** 채움 호출이 써도 되는 시간 = 남은 시간 − 컴파일 몫. */
const COMPILE_RESERVE_MS = 70_000
const COMPILE_RETRY_DEADLINE_MS = 215_000

export interface HpAttempt {
  step: 'fill' | 'compile'
  part?: HpPart
  ok: boolean
  reason?: string
  max_tokens: number
  stop?: string | null
  ms: number
}

type Content = Array<{ type: 'image'; source: { type: 'url'; url: string } } | { type: 'text'; text: string }>

async function call(content: Content, maxTokens: number, timeoutMs: number) {
  const response = await getAnthropicClient()
    .messages.stream({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] }, { timeout: timeoutMs })
    .finalMessage()
  return {
    text: response.content.map((block) => (block.type === 'text' ? block.text : '')).join(''),
    stop: response.stop_reason,
    usage: { input_tokens: response.usage?.input_tokens, output_tokens: response.usage?.output_tokens },
  }
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message.slice(0, 200) : 'error')

export async function extractHpFacets(
  imageUrl: string,
  opts: { now?: () => number } = {},
): Promise<{ facets: HpFacetsRecord | null; attempts: HpAttempt[] }> {
  const now = opts.now ?? Date.now
  const started = now()
  const elapsed = () => now() - started
  const attempts: HpAttempt[] = []
  const usage: Record<string, unknown> = {}
  const timing: Record<string, number> = {}

  async function fillPart(part: HpPart) {
    const t0 = now()
    for (let i = 0; i < 2; i++) {
      if (i > 0 && elapsed() > FILL_RETRY_DEADLINE_MS) break
      const t1 = now()
      try {
        const out = await call(
          [{ type: 'image', source: { type: 'url', url: imageUrl } }, { type: 'text', text: buildHpFillPrompt(part) }],
          FILL_MAX_TOKENS,
          Math.max(30_000, BUDGET_MS - elapsed() - COMPILE_RESERVE_MS),
        )
        usage[`fill_${part}`] = out.usage
        const check = checkHpFill(out.text, part)
        attempts.push({ step: 'fill', part, ok: check.ok, reason: check.ok ? undefined : check.reason, max_tokens: FILL_MAX_TOKENS, stop: out.stop, ms: now() - t1 })
        if (check.ok) {
          timing[`fill_${part}_ms`] = now() - t0
          if (check.untagged.length) console.warn(`[style-facets] hp fill ${part} untagged:`, check.untagged.join(', '))
          return check
        }
      } catch (error) {
        attempts.push({ step: 'fill', part, ok: false, reason: reasonOf(error), max_tokens: FILL_MAX_TOKENS, ms: now() - t1 })
      }
    }
    return null
  }

  const [a, b] = await Promise.all([fillPart('A'), fillPart('B')])
  if (!a || !b) {
    console.warn('[style-facets] hp fill failed:', JSON.stringify(attempts))
    return { facets: null, attempts }
  }

  const filled = mergeHpFill(a.filled, b.filled)
  const prompt = buildHpCompilePrompt(JSON.stringify(filled, null, 2), a.sceneSummary)
  const t0 = now()
  for (const maxTokens of [COMPILE_MAX_TOKENS, Math.round(COMPILE_MAX_TOKENS * 1.5)]) {
    if (maxTokens !== COMPILE_MAX_TOKENS && elapsed() > COMPILE_RETRY_DEADLINE_MS) break
    const t1 = now()
    try {
      const out = await call([{ type: 'text', text: prompt }], maxTokens, Math.max(20_000, BUDGET_MS - elapsed()))
      usage.compile = out.usage
      timing.compile_ms = now() - t0
      timing.total_ms = elapsed()
      const facets = hpFacetsFromCompile(out.text, filled, { model: CLAUDE_MODEL, extractedAt: new Date().toISOString(), usage, timing })
      const check = facets ? null : checkHpCompile(out.text, probeCapFor(detailGrade(filled)))
      const reason = check && !check.ok ? [check.reason, check.section, check.words].filter((part) => part !== undefined).join(':') : undefined
      attempts.push({ step: 'compile', ok: !!facets, reason, max_tokens: maxTokens, stop: out.stop, ms: now() - t1 })
      if (facets) {
        console.log(`[style-facets] hp ok in ${elapsed()}ms grade=${detailGrade(filled) ?? '-'} cap=${probeCapFor(detailGrade(filled))} figure=${facets.figure ? 'yes' : 'no'}`)
        return { facets, attempts }
      }
    } catch (error) {
      attempts.push({ step: 'compile', ok: false, reason: reasonOf(error), max_tokens: maxTokens, ms: now() - t1 })
    }
  }
  console.warn('[style-facets] hp compile failed:', JSON.stringify(attempts))
  return { facets: null, attempts }
}
