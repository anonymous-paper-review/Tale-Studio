// t0-verb-sequence-classify — 복합 동사 78종을 순차/동시/판단불가로 분류.
//   지각(어느 쪽인가)만 모델에 맡기고, 집계·판정은 코드가 한다(판정 3원칙).
//   제품 호출기(claudeGenerateJson)를 직접 import — 복붙 금지 규칙.
// 실행: pnpm dlx tsx research/experiments/t0-verb-sequence-classify/classify.mts
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'

config({ path: '.env.local' })
const { claudeGenerateJson } = await import('@/lib/writer/llm/claude')

const extract = JSON.parse(readFileSync(new URL('./extract.json', import.meta.url), 'utf8'))
type Row = { run: string; shot_id: string | null; verb: string; action: string | null }
const rows: Row[] = extract.compound

// 유형(고유 문자열) 단위로 분류하고, 건수는 코드가 되센다.
const byVerb = new Map<string, Row[]>()
for (const r of rows) byVerb.set(r.verb, [...(byVerb.get(r.verb) ?? []), r])
const items = [...byVerb.entries()].map(([verb, list], i) => ({
  idx: i,
  verb,
  count: list.length,
  context: (list[0].action ?? '').slice(0, 160),
}))

const prompt = `아래는 스토리보드 샷 설계에서 인물의 동작을 적은 짧은 영어 표현들이다. 각각이
**순차(sequential)** 인지 **동시(simultaneous)** 인지 판별하라.

- sequential: 먼저 A를 하고 그다음 B를 한다 (시간 순서가 있다). 예: "flips switch and exits"
- simultaneous: A와 B가 한 몸짓의 두 면이다 (동시에 일어난다). 예: "clutches and sobs"
- unknown: 문맥만으로 어느 쪽인지 정할 수 없다

각 항목의 context 는 같은 샷의 액션 서술이다(비어 있을 수 있다). 판단이 갈리면 unknown 으로 두라 —
억지로 고르지 마라.

입력:
${JSON.stringify(items.map((i) => ({ idx: i.idx, verb: i.verb, context: i.context })), null, 1)}

출력 JSON 형식(다른 키 금지):
{"items":[{"idx":0,"label":"sequential|simultaneous|unknown","why":"5단어 이내 근거"}]}`

const res = await claudeGenerateJson<{ items: { idx: number; label: string; why: string }[] }>(prompt, {
  maxTokens: 8000,
})

const labelByIdx = new Map(res.items.map((i) => [i.idx, i]))
const classified = items.map((it) => {
  const j = labelByIdx.get(it.idx)
  const label = ['sequential', 'simultaneous', 'unknown'].includes(j?.label ?? '') ? j!.label : 'unknown'
  return { ...it, label, why: j?.why ?? '(모델 미응답 → unknown)' }
})

// 채점 = 코드. 유형 단위와 건수 단위 둘 다 센다.
const tally = (key: 'types' | 'instances') => {
  const acc = { sequential: 0, simultaneous: 0, unknown: 0 }
  for (const c of classified) acc[c.label as keyof typeof acc] += key === 'types' ? 1 : c.count
  return acc
}
const types = tally('types')
const instances = tally('instances')
const decided = instances.sequential + instances.simultaneous
const seqShareOfAll = instances.sequential / (instances.sequential + instances.simultaneous + instances.unknown)
const seqShareOfDecided = decided ? instances.sequential / decided : null

const verdict = (share: number | null) =>
  share == null ? '측정 불가'
    : share >= 0.7 ? '≥70% — 상류 필드 안건 승격 대상'
      : share >= 0.5 ? '50~70% — 유보(표본 확대)'
        : '<50% — 가설 기각(현행 유지)'

const out = {
  ticket: 't0-verb-sequence-classify',
  date: '2026-08-12',
  method: '지각(순차/동시)만 모델 1콜, 집계·판정은 코드. 분류는 고유 문자열 단위, 비율은 건수 단위로 환산.',
  model: 'claude (제품 기본 축 설정 — claudeGenerateJson)',
  corpus: {
    v4_files: extract.source_files,
    verbs_total: extract.verbs_total,
    compound_total: extract.compound_total,
    compound_ratio: extract.compound_ratio,
    unique_strings: items.length,
  },
  tally_types: types,
  tally_instances: instances,
  sequential_share_all: +seqShareOfAll.toFixed(4),
  sequential_share_decided: seqShareOfDecided == null ? null : +seqShareOfDecided.toFixed(4),
  verdict_on_all: verdict(seqShareOfAll),
  verdict_on_decided: verdict(seqShareOfDecided),
  classified,
  instances_detail: rows,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log('유형 단위:', JSON.stringify(types))
console.log('건수 단위:', JSON.stringify(instances))
console.log(`순차 비율(전체 기준) ${(seqShareOfAll * 100).toFixed(1)}% → ${out.verdict_on_all}`)
console.log(`순차 비율(판단된 것만) ${seqShareOfDecided == null ? 'NA' : (seqShareOfDecided * 100).toFixed(1) + '%'} → ${out.verdict_on_decided}`)
