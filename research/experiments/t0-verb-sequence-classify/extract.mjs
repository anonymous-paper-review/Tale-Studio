// t0-verb-sequence-classify — 복합 동사(한 문자열에 동작 2개) 전수 추출.
//   추출·집계는 코드. 분류(순차/동시)는 별도 단계에서 LLM 지각 1콜, 채점은 다시 코드.
// 실행: node research/experiments/t0-verb-sequence-classify/extract.mjs
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'

const COMPOUND = [/\bthen\b/i, /\bafter\b/i, /\bbefore\b/i, / and /i, /,/]

const verbs = []
const files = []
for (const d of readdirSync('logs')) {
  const p = `logs/${d}/11_v4_shotDesign.json`
  if (!existsSync(p)) continue
  files.push(p)
  const v4 = JSON.parse(readFileSync(p, 'utf8'))
  for (const shot of v4.shots ?? []) {
    const spec = shot.dynamic_spec
    const shotId = spec?.shot_id ?? shot.intent?.shot_id ?? null
    for (const cm of spec?.character_motion ?? []) {
      if (!cm?.verb) continue
      verbs.push({
        run: d,
        shot_id: shotId,
        character_id: cm.character_id ?? null,
        verb: String(cm.verb),
        magnitude: cm.magnitude ?? null,
        // 오분류를 줄이기 위한 맥락 — 같은 샷의 액션 서술
        action: shot.intent?.character_action ?? shot.action_description ?? shot.intent?.action ?? null,
        camera: spec?.camera_motion?.type ?? null,
      })
    }
  }
}

const compound = verbs.filter((v) => COMPOUND.some((re) => re.test(v.verb)))
// 같은 문자열 반복은 분류 1회로 충분 — 분류는 유형 단위, 집계는 건수 단위.
const uniqueVerbs = [...new Set(compound.map((c) => c.verb))]

const out = {
  ticket: 't0-verb-sequence-classify',
  date: '2026-08-12',
  source_files: files.length,
  verbs_total: verbs.length,
  compound_total: compound.length,
  compound_ratio: +(compound.length / verbs.length).toFixed(4),
  unique_compound_strings: uniqueVerbs.length,
  compound,
}
writeFileSync(new URL('./extract.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`v4 파일 ${files.length} | 동사 ${verbs.length} | 복합 ${compound.length} (${(out.compound_ratio * 100).toFixed(1)}%) | 고유 문자열 ${uniqueVerbs.length}`)
console.log(uniqueVerbs.slice(0, 12).map((v) => ` - ${v}`).join('\n'))
