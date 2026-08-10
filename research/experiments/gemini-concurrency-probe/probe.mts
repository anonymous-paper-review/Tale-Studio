// Gemini 동시성 계층 분리 프로브 (2026-08-09) — v2 병렬 실패(유효 1.1배)의 직렬화 지점 규명.
//   가설 분기: (A) Node undici 커넥션 풀이 병목 → 디스패처 튠으로 해소 (B) 서버측 키 단위
//   스로틀 → 튠 무효. 제품 래퍼(geminiGenerate)를 그대로 사용해 전송 계층만 변수로 둔다.
// 좌표: gemini-3-flash-preview · 프롬프트 ~4KB 합성(씬 분해 유사 부하) · 각 단계 4콜.
import { config } from 'dotenv'

config({ path: '.env.local' })

// 합성 부하 — decoupage 유사 크기(수 KB 입력, 구조화 JSON 출력 요구)
const SCENE_FILLER = Array.from({ length: 40 }, (_, i) =>
  `beat_${i}: 주인공이 낡은 등대 계단을 오르며 ${i}번째 단서를 발견하고, 바람 소리가 커지면서 긴장이 고조된다.`,
).join('\n')
const BIG_PROMPT = `다음 씬의 내러티브 비트를 영화 샷 10개로 분해해 JSON 배열로 반환하라.
각 샷: { "shot_id": string, "size": "EWS|WS|MS|CU|ECU", "duration_s": number, "description": string(한 문장) }.
반환은 JSON 배열만.

## 씬 비트
${SCENE_FILLER}`

async function timedCall(
  gen: (p: string, o: Record<string, unknown>) => Promise<string>,
  tag: string,
  idx: number,
) {
  const t0 = Date.now()
  try {
    await gen(BIG_PROMPT, { expectJson: true, temperature: 0.7 })
    const ms = Date.now() - t0
    console.log(`  [${tag}] call#${idx} ${(ms / 1000).toFixed(1)}s`)
    return ms
  } catch (e) {
    console.log(`  [${tag}] call#${idx} FAILED: ${e instanceof Error ? e.message.slice(0, 80) : e}`)
    return -1
  }
}

async function phase(tag: string, n: number, gen: (p: string, o: Record<string, unknown>) => Promise<string>) {
  const t0 = Date.now()
  const walls = await Promise.all(Array.from({ length: n }, (_, i) => timedCall(gen, tag, i + 1)))
  const total = (Date.now() - t0) / 1000
  const ok = walls.filter((w) => w > 0)
  const avg = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length / 1000 : 0
  console.log(`[${tag}] 총 ${total.toFixed(1)}s · 콜 평균 ${avg.toFixed(1)}s · n=${n}`)
  return { total, avg }
}

async function main() {
  const { geminiGenerate } = await import('../../../src/lib/writer/llm/gemini')

  console.log('== 1단계: 단독 1콜 (기준 지연) ==')
  const base = await phase('단독', 1, geminiGenerate)

  console.log('== 2단계: 동시 4콜 (기본 디스패처) ==')
  const def4 = await phase('기본×4', 4, geminiGenerate)

  console.log('== 3단계: 동시 4콜 (undici 커넥션 64 튠) ==')
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 64, pipelining: 1 }))
  const tuned4 = await phase('튠×4', 4, geminiGenerate)

  console.log('\n== 판정 재료 ==')
  console.log(`기준 1콜: ${base.total.toFixed(1)}s`)
  console.log(
    `기본×4: 총 ${def4.total.toFixed(1)}s (병렬이면 ≈기준, 직렬이면 ≈기준×4) · 콜 평균 ${def4.avg.toFixed(1)}s (평균이 기준보다 크게 부풀면 큐잉)`,
  )
  console.log(`튠×4: 총 ${tuned4.total.toFixed(1)}s — 기본×4 대비 개선되면 클라이언트(undici) 병목, 동일하면 서버측`)
}

main().catch((e) => {
  console.error('[프로브 실패]', e)
  process.exit(1)
})
