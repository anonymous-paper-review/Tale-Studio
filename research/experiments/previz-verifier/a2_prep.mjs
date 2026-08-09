// previz 검증기 — A2 (시간·커버리지 오라클) 번들 생성. rubric v0.4 추가분.
//   usage: node a2_prep.mjs <runDir>
//   식단: 설계된 duration_seconds와 파이프라인 estimated_seconds를 의도적으로 제외 —
//   오라클이 내용(beat·대사·액션)만 보고 독립 추정하게 해 앵커링을 차단한다.
//   정답 대조용 A2_answer_key.json에만 설계 길이를 기록.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const runDir = process.argv[2]
const d = JSON.parse(readFileSync(join(runDir, 'data.json'), 'utf8'))
const designById = new Map(d.shotDesign.map((x) => [x.intent.shot_id, x]))
const anyRefs = d.shots.some((s) => s.design_ref)
const normId = (id) => { const m = id.match(/^sh_\d+_(\d+)$/); return m ? `shot_${Number(m[1])}` : id }
const designOf = (s) => designById.get(s.design_ref) ?? (anyRefs ? null : designById.get(normId(s.shot_id)))
const sceneOf = (sc) => d.scenes.scenes.find((x) => x.scene_id === `scene_${Number(sc.slice(3))}`)

const scenes = [...new Set(d.shots.map((s) => s.scene_id))].sort()
const answerKey = []

for (const sc of scenes) {
  const scene = sceneOf(sc)
  const dbShots = d.shots.filter((s) => s.scene_id === sc).sort((a, b) => a.sort_order - b.sort_order)
  const shots = dbShots.map((s) => {
    const dg = designOf(s)
    answerKey.push({
      shot_id: s.shot_id, scene: sc,
      designed_seconds: dg?.intent.duration_seconds ?? s.duration_seconds ?? null,
      pipeline_estimated_scene_seconds: scene?.estimated_seconds ?? null,
    })
    return {
      shot_id: s.shot_id,
      shot_type: dg?.static_spec.shot_type ?? null,
      camera_angle: dg?.static_spec.camera_angle ?? null,
      camera_motion: dg?.dynamic_spec?.camera_motion?.type ?? null,
      dramatic_purpose: dg?.intent.dramatic_purpose ?? null,
      shot_function: dg?.intent.shot_function ?? null,
      action_description: s.action_description,
      dialogue: (s.dialogue_lines ?? []).map((l) => ({ text: l.text, delivery: l.delivery })),
      designless: dg ? undefined : true,
    }
  })
  writeFileSync(join(runDir, 'work', `A2_${sc}.json`), JSON.stringify({
    scene: {
      scene_id: sc, purpose: scene.purpose, emotion_beat: scene.emotion_beat,
      location: scene.location, time_of_day: scene.time_of_day,
      scene_actions: scene.scene_actions, characters_in_scene: scene.characters_in_scene,
    },
    shots,
  }, null, 2))
}
writeFileSync(join(runDir, 'work', 'A2_answer_key.json'), JSON.stringify(answerKey, null, 2))
console.log(JSON.stringify({ scenes: scenes.length, shots: answerKey.length }))
