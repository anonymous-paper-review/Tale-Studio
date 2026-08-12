// 접지 경로 제품 검증 (2026-08-12) — 유닛 테스트는 목이라 실물로 한 번 통과시킨다.
//   확인 대상: ① 접지 콜이 gemini(GROUNDING_MODEL 핀)로 가는가 ② 검색이 실제로 발화하는가
//   ③ claude 경유(154.6s·144.2s) 대비 얼마나 빠른가.
// 실행: pnpm dlx tsx research/experiments/t0-dramaturgy-36flash-outage/verify-product-path.mts
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64 }))

  const { generateJson, DEFAULT_MODELS } = await import('../../../src/lib/writer/llm/dispatch')
  const { getPendingRawCalls } = await import('../../../src/lib/writer/llm/raw_collector')

  const t0 = Date.now()
  const r = await generateJson<{ items?: unknown[] }>(
    '2026년에 공개된 재난 소재 영상물 2편을 웹에서 조사해 JSON 으로만 답하라: {"items":[{"title":"...","released":"..."}]}',
    DEFAULT_MODELS.S, // 제품 S축 기본(gemini-3.6-flash) — 핀이 접지 모델로 갈아타는지 본다
    { webSearch: true },
  )
  const ms = Date.now() - t0

  console.log(`\n[결과] ${(ms / 1000).toFixed(1)}s · 항목 ${r.items?.length ?? '?'}개`)
  for (const c of getPendingRawCalls()) {
    console.log(`  콜: ${c.provider}/${c.model} · ${(c.duration_ms / 1000).toFixed(1)}s`)
  }
  console.log('  ※ 위에 "[gemini] 접지 미발화" 경고가 없으면 검색이 실제로 발화한 것.')
}

main().catch((e) => {
  console.error('[검증 실패]', e)
  process.exit(1)
})
