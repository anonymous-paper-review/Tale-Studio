// previz 검증기 — 효과(E) 축 번들 생성. rubric v0.2 추가분.
//   usage: node eff_prep.mjs <runDir>
//   E1 앵글 효과: high/low 앵글 설계 샷 → 블라인드 "위압/중립/위축" 판독 → 기대(high→위축, low→위압) 대조
//   E2 감정 가독: CU/ECU 설계 샷 → 블라인드 "감정이 읽히나 + 무엇" 판독 → 감정 피크 의도와 대조
//   번들에는 설계·기대값을 넣지 않는다 (블라인드). 기대값은 E_answer_key.json에만.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const runDir = process.argv[2]
const d = JSON.parse(readFileSync(join(runDir, 'data.json'), 'utf8'))
const key = JSON.parse(readFileSync(join(runDir, 'work', 'B_answer_key.json'), 'utf8'))

const designById = new Map(d.shotDesign.map((x) => [x.intent.shot_id, x]))
const normId = (id) => { const m = id.match(/^sh_\d+_(\d+)$/); return m ? `shot_${Number(m[1])}` : id }
const dbShot = new Map(d.shots.map((s) => [s.shot_id, s]))
const designOf = (shotId) => {
  const s = dbShot.get(shotId)
  return designById.get(s?.design_ref) ?? designById.get(normId(shotId))
}
const sceneOf = (sc) => d.scenes.scenes.find((x) => x.scene_id === `scene_${Number(sc.slice(3))}`)

const eKey = []
const bySc = new Map()
for (const k of key) {
  const design = designOf(k.shot_id)
  const checks = []
  if (['high_angle', 'low_angle'].includes(k.camera_angle) && k.figures > 0) checks.push('stance')
  if (['CU', 'ECU'].includes(k.shot_type)) checks.push('emotion')
  if (!checks.length) continue
  const scene = sceneOf(k.scene)
  eKey.push({
    shot_id: k.shot_id, scene: k.scene, checks,
    expectedStance: k.camera_angle === 'high_angle' ? '위축' : k.camera_angle === 'low_angle' ? '위압' : null,
    angle: k.camera_angle,
    dramatic_purpose: design?.intent?.dramatic_purpose ?? null,
    scene_emotion: scene?.emotion_beat ?? null,
  })
  if (!bySc.has(k.scene)) bySc.set(k.scene, [])
  bySc.get(k.scene).push({
    shot_id: k.shot_id,
    image: join(runDir, 'frames', `${k.shot_id}_start.png`),
    checks,
  })
}

for (const [sc, shots] of bySc) {
  writeFileSync(join(runDir, 'work', `E_${sc}.json`), JSON.stringify({ shots }, null, 2))
}
writeFileSync(join(runDir, 'work', 'E_answer_key.json'), JSON.stringify(eKey, null, 2))

console.log(JSON.stringify({
  total: eKey.length,
  byScene: Object.fromEntries([...bySc].map(([sc, v]) => [sc, v.length])),
  stanceShots: eKey.filter((x) => x.checks.includes('stance')).map((x) => `${x.shot_id}(${x.angle})`),
  emotionShots: eKey.filter((x) => x.checks.includes('emotion')).map((x) => x.shot_id),
}, null, 2))
