// t1-scene-potential-transfer — scene_potential(제안) → scene_actions(씬) 전이 blind 매칭.
//   설계(사전 등록): 유도 무대 위 씬마다 — scene_actions 원문 + 후보 scene_potential 목록
//   (정답 무대 + 같은 런의 타 무대 2 distractor, 무대명 가림, 순서는 scene_id 결정론 셔플) →
//   LLM은 매칭만 지각(강제 선택 1..K), 채점은 코드(정답률 vs 우연율 1/3).
//   distractor를 같은 런으로 한정한 이유: tide_gauge_station이 양 런에 실존 — 교차 풀이면 정답 중복.
//   계기: previz-channel-ablation/judge.mts 재사용(gemini-3-flash-preview 핀·temp 0·디스크 캐시).
//   실행: pnpm dlx tsx research/experiments/t1-scene-potential-transfer/run.mts
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { vlmJson, JUDGE_MODEL } from '../previz-channel-ablation/judge.mts'

// .env.local 로드 (judge.mts 는 process.env 만 읽음)
for (const l of readFileSync(path.resolve('.env.local'), 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i > 0 && !l.trim().startsWith('#')) {
    const k = l.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = l.slice(i + 1).trim()
  }
}

const RUNS = [
  { tag: 'A', dir: 'logs/e4da245a-8d89-44e5-8fde-131d016ef2e3' },
  { tag: 'B', dir: 'logs/5260d92d-2e7b-4991-8bff-00213b37ef77' },
]
const OUT = path.resolve('research/experiments/t1-scene-potential-transfer/results.json')

type Stage = { id: string; name: string; scene_potential: string[] }
type Scene = { scene_id: string; location: string; scene_actions: string[] }

// scene_id 기반 결정론 셔플 (좌표 재현성 — Math.random 배제)
const seedShuffle = <T,>(arr: T[], seed: string): T[] => {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0
    const j = h % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const PROMPT = (actions: string[], options: string[][]) =>
  [
    '아래는 한 씬의 실제 액션 목록(SCENE ACTIONS)과, 씬 상황 아이디어 목록 후보들(OPTION 1..N)이다.',
    '이 씬은 후보 중 정확히 하나의 아이디어 목록이 있는 무대 위에 지어졌다.',
    '무대 이름은 가려져 있다 — 내용의 의미적 연결만으로, 이 씬이 어느 OPTION의 아이디어에서 나왔는지 골라라.',
    '반드시 하나를 고른다(기권 없음).',
    '',
    `SCENE ACTIONS:\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`,
    '',
    ...options.map((o, i) => `OPTION ${i + 1}:\n${o.map((p) => `- ${p}`).join('\n')}`),
    '',
    'JSON만 반환: {"pick": <1..N>, "reason": "<=20 words"}',
  ].join('\n')

async function main() {
  const trials: Record<string, unknown>[] = []
  for (const run of RUNS) {
    const inv = (JSON.parse(readFileSync(path.resolve(run.dir, '01_s0_dramaturgy.json'), 'utf8'))
      .world_inventory as Stage[])
    const scenes = (JSON.parse(readFileSync(path.resolve(run.dir, '05_s3_scenes.json'), 'utf8'))
      .scenes as Scene[])
    const stageIds = new Set(inv.map((s) => s.id))
    const adopted = scenes.filter((sc) => stageIds.has(sc.location))
    console.log(`[${run.tag}] 유도 무대 씬 ${adopted.length}개 / 무대 ${inv.length}종`)
    for (const sc of adopted) {
      const answer = inv.find((s) => s.id === sc.location)!
      const distractors = inv.filter((s) => s.id !== sc.location)
      const ordered = seedShuffle([answer, ...distractors], sc.scene_id + run.tag)
      const answerIdx = ordered.indexOf(answer) + 1
      const r = await vlmJson<{ pick: number; reason: string }>([
        { text: PROMPT(sc.scene_actions, ordered.map((s) => s.scene_potential)) },
      ])
      const correct = r.pick === answerIdx
      trials.push({
        run: run.tag, scene: sc.scene_id, stage: sc.location, k: ordered.length,
        answer_position: answerIdx, pick: r.pick, correct, reason: r.reason,
        scene_actions: sc.scene_actions, options: ordered.map((s) => ({ masked_potential: s.scene_potential })),
      })
      console.log(`  ${sc.scene_id}@${sc.location}: pick=${r.pick} 정답=${answerIdx} ${correct ? '✓' : '✗'}`)
    }
  }
  const n = trials.length
  const hits = trials.filter((t) => t.correct).length
  const acc = hits / n
  const chance = 1 / 3
  const delta_pp = +((acc - chance) * 100).toFixed(1)
  const out = {
    finished_at: new Date().toISOString(),
    judge: { model: JUDGE_MODEL, temperature: 0, note: 'previz-channel-ablation/judge.mts 재사용 — 텍스트 전용' },
    n_trials: n, hits, accuracy: +acc.toFixed(4), chance: +chance.toFixed(4), delta_pp,
    verdict_pre_registered: delta_pp >= 20 ? '참 — 전이 실존 (정답률−우연율 ≥ +20%p)' : '기각 — scene_potential은 장식 (Δ < +20%p)',
    trials,
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2))
  console.log(`\n[완료] ${hits}/${n} = ${(acc * 100).toFixed(1)}% (우연 33.3%, Δ${delta_pp}%p) → ${out.verdict_pre_registered}`)
}

main().catch((e) => { console.error('[실패]', e); process.exit(1) })
