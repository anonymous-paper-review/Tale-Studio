// previz 검증기 — 결정론 채점기 + 서브에이전트 입력 번들 생성.
//   usage: node prep.mjs <runDir>
//   구포맷(단일 panel)·신포맷(start/direction/end 3프레임) 모두 지원.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const runDir = process.argv[2]
if (!runDir) throw new Error('usage: prep.mjs <runDir>')
const d = JSON.parse(readFileSync(join(runDir, 'data.json'), 'utf8'))
mkdirSync(join(runDir, 'work'), { recursive: true })

// ---- 매핑: design_ref 우선, 없으면 sh_XX_NN → shot_N 정규화
const designById = new Map(d.shotDesign.map((x) => [x.intent.shot_id, x]))
const normId = (dbShotId) => {
  const m = dbShotId.match(/^sh_\d+_(\d+)$/)
  return m ? `shot_${Number(m[1])}` : dbShotId
}
const sceneList = d.scenes.scenes
const sceneByDb = (dbSceneId) => {
  const m = dbSceneId.match(/^sc_(\d+)$/)
  return sceneList.find((s) => s.scene_id === `scene_${Number(m[1])}`)
}

const SIZE_ORDER = ['ECU', 'CU', 'MCU', 'MS', 'MFS', 'FS', 'WS', 'EWS']
const sizeIdx = (t) => SIZE_ORDER.indexOf(t)

// ---- 샷 결합 뷰 (frames: {panel} 또는 {start, direction, end})
// 매핑 원칙: design_ref가 진실. 이름 규칙(sh_XX_NN→shot_N) 추측은 프로젝트 전체에
// design_ref가 하나도 없을 때(구버전)만 허용 — 신버전에서 design_ref null은
// "자체 설계 없는 분할 자식"이므로 추측 매핑하지 않는다 (v0.2에서 허위 복제 판정을 만든 버그의 수정).
const anyRefs = d.shots.some((s) => s.design_ref)
const shots = d.shots
  .slice()
  .sort((a, b) => a.sort_order - b.sort_order)
  .map((s) => {
    const design = designById.get(s.design_ref) ?? (anyRefs ? null : designById.get(normId(s.shot_id)))
    if (!design && !anyRefs) throw new Error(`design 매핑 실패: ${s.shot_id}`)
    const rs = s.rough_storyboard
    const frames = rs?.frames?.start
      ? { start: `${s.shot_id}_start.png`, direction: `${s.shot_id}_direction.png`, end: `${s.shot_id}_end.png` }
      : { panel: `${s.shot_id}_panel.png` }
    return { db: s, design, frames, isTriple: !!rs?.frames?.start }
  })
for (const s of shots) for (const f of Object.values(s.frames)) {
  if (!existsSync(join(runDir, 'frames', f))) throw new Error(`프레임 없음: ${f}`)
}
const isTriple = shots.every((s) => s.isTriple)

// ---- 결정론 통계 + 위반 검출 (규칙 v0: 오너 책 필기 유래)
const findings = []
const sceneStats = []
const bySceneDb = new Map()
for (const s of shots) {
  if (!bySceneDb.has(s.db.scene_id)) bySceneDb.set(s.db.scene_id, [])
  bySceneDb.get(s.db.scene_id).push(s)
}

for (const [dbSceneId, list] of bySceneDb) {
  const scene = sceneByDb(dbSceneId)
  const designed = list.filter((s) => s.design)
  const types = designed.map((s) => s.design.static_spec.shot_type)
  const durs = list.map((s) => s.design?.intent.duration_seconds ?? s.db.duration_seconds ?? 0)
  const cuish = types.filter((t) => ['ECU', 'CU', 'MCU'].includes(t)).length
  const staticN = designed.filter((s) => s.design.dynamic_spec?.camera_motion?.type === 'static').length
  const total = durs.reduce((a, b) => a + b, 0)

  for (let i = 1; i < designed.length; i++) {
    const a = designed[i - 1], b = designed[i]
    const ta = a.design.static_spec.shot_type, tb = b.design.static_spec.shot_type
    if (ta === '2S' || tb === '2S') continue
    const dist = Math.abs(sizeIdx(ta) - sizeIdx(tb))
    const sameAngle = a.design.static_spec.camera_angle === b.design.static_spec.camera_angle
    if (dist === 0 && sameAngle) {
      findings.push({ rule: 'R1-사이즈미변화', severity: 'WARNING', scene: dbSceneId, shots: [a.db.shot_id, b.db.shot_id], detail: `인접 샷이 같은 사이즈(${ta})+같은 앵글(${a.design.static_spec.camera_angle}) — 점프컷처럼 튈 위험` })
    } else if (dist === 0) {
      findings.push({ rule: 'R1-사이즈미변화', severity: 'INFO', scene: dbSceneId, shots: [a.db.shot_id, b.db.shot_id], detail: `인접 샷이 같은 사이즈(${ta}), 앵글 변화로 완화` })
    }
  }
  if (cuish / Math.max(designed.length, 1) > 0.6) {
    findings.push({ rule: 'R2-CU남발', severity: 'WARNING', scene: dbSceneId, shots: [], detail: `CU 계열(ECU/CU/MCU) ${cuish}/${designed.length} = ${Math.round((cuish / designed.length) * 100)}% — 임계 60% 초과` })
  }
  for (const s of designed) {
    const t = s.design.static_spec.shot_type
    if (['WS', 'EWS'].includes(t) && s.design.intent.duration_seconds < 4) {
      findings.push({ rule: 'R3-와이드시간부족', severity: 'WARNING', scene: dbSceneId, shots: [s.db.shot_id], detail: `${t}인데 ${s.design.intent.duration_seconds}s — 정보량 대비 시간 부족(하한 4s)` })
    }
  }
  for (const s of designed) {
    const hasDialogue = Array.isArray(s.db.dialogue_lines) && s.db.dialogue_lines.length > 0
    if (hasDialogue && ['EWS', 'WS', 'FS'].includes(s.design.static_spec.shot_type)) {
      findings.push({ rule: 'R4-대사원거리', severity: 'INFO', scene: dbSceneId, shots: [s.db.shot_id], detail: `대사 있는 샷이 ${s.design.static_spec.shot_type} — 표정 가독성 확인 필요` })
    }
  }
  const covered = new Set()
  for (const s of designed) for (const b of s.design.intent.source_beats ?? []) covered.add(b)
  const uncovered = (scene?.scene_actions ?? []).map((_, i) => i).filter((i) => !covered.has(i))
  if (uncovered.length) {
    findings.push({ rule: 'R5-beat미커버', severity: 'CRITICAL', scene: dbSceneId, shots: [], detail: `담당 샷 없는 beat 인덱스: [${uncovered.join(', ')}] — "${uncovered.map((i) => scene.scene_actions[i]).join('" / "')}"` })
  }

  sceneStats.push({
    scene: dbSceneId, designScene: scene?.scene_id, shotCount: list.length,
    totalSeconds: total, estimatedSeconds: scene?.estimated_seconds ?? null,
    sizeDist: Object.fromEntries(types.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map())),
    sizeVariety: new Set(types).size, cuRatio: +(cuish / Math.max(designed.length, 1)).toFixed(2),
    staticCameraRatio: +(staticN / Math.max(designed.length, 1)).toFixed(2),
    designlessShots: list.filter((s) => !s.design).map((s) => s.db.shot_id),
    durations: durs, avgDuration: +(total / list.length).toFixed(1),
    uncoveredBeats: uncovered,
  })
}

writeFileSync(join(runDir, 'work', 'stats.json'), JSON.stringify(sceneStats, null, 2))
writeFileSync(join(runDir, 'work', 'det_findings.json'), JSON.stringify(findings, null, 2))

// ---- 에이전트 번들 (식단 분리: B/C/리드백에는 설계 정보 없음)
const img = (f) => join(runDir, 'frames', f)
for (const [dbSceneId, list] of bySceneDb) {
  const scene = sceneByDb(dbSceneId)
  const stats = sceneStats.find((x) => x.scene === dbSceneId)

  writeFileSync(join(runDir, 'work', `A_${dbSceneId}.json`), JSON.stringify({
    scene: {
      scene_id: dbSceneId, purpose: scene.purpose, emotion_beat: scene.emotion_beat,
      location: scene.location, time_of_day: scene.time_of_day,
      scene_actions: scene.scene_actions, key_dialogue: scene.key_dialogue,
      dialogue_summary: scene.dialogue_summary, characters_in_scene: scene.characters_in_scene,
      estimated_seconds: scene.estimated_seconds,
    },
    codeStats: stats,
    detFindings: findings.filter((f) => f.scene === dbSceneId),
    shots: list.map((s) => s.design ? ({
      shot_id: s.db.shot_id,
      intent: s.design.intent,
      static_spec: { ...s.design.static_spec, first_frame_prompt: undefined },
      dynamic_spec: s.design.dynamic_spec,
      dialogue_lines: s.db.dialogue_lines,
      action_description: s.db.action_description,
    }) : ({
      shot_id: s.db.shot_id,
      designless: true,
      note: '자체 설계 없음 — design_ref가 null인 분할 자식(shotCheck 분할 산출)으로 추정. 샷 규칙(RA*) 판정 대상 아님. 씬 체크(잉여·길이·흐름)에서는 액션 기준으로만 고려하라.',
      duration_seconds: s.db.duration_seconds,
      dialogue_lines: s.db.dialogue_lines,
      action_description: s.db.action_description,
    })),
  }, null, 2))

  writeFileSync(join(runDir, 'work', `B_${dbSceneId}.json`), JSON.stringify({
    tripleFrame: isTriple,
    shots: list.map((s) => ({
      shot_id: s.db.shot_id,
      images: Object.fromEntries(Object.entries(s.frames).map(([k, f]) => [k, img(f)])),
    })),
  }, null, 2))

  writeFileSync(join(runDir, 'work', `C_${dbSceneId}.json`), JSON.stringify({
    shots: list.map((s) => ({ shot_id: s.db.shot_id, image: img(s.frames.start ?? s.frames.panel) })),
  }, null, 2))

  writeFileSync(join(runDir, 'work', `R_${dbSceneId}.json`), JSON.stringify({
    // 리드백은 샷 순서대로: 신포맷이면 start→direction→end 전부 (previz가 실제 보여주는 것)
    orderedImages: list.flatMap((s) => Object.values(s.frames).map(img)
      .sort((a, b) => ['start', 'direction', 'end', 'panel'].findIndex((k) => a.includes(`_${k}.`)) - ['start', 'direction', 'end', 'panel'].findIndex((k) => b.includes(`_${k}.`)))),
    shotBoundaries: list.map((s) => ({ shot_id: s.db.shot_id, frameCount: Object.keys(s.frames).length })),
  }, null, 2))
}

// B 대조용 정답지 (에이전트 미제공, 집계기 전용) — 설계 없는 분할 자식은 대조 불가라 제외
writeFileSync(join(runDir, 'work', 'B_answer_key.json'), JSON.stringify(
  shots.filter((s) => s.design).map((s) => ({
    shot_id: s.db.shot_id, scene: s.db.scene_id,
    shot_type: s.design.static_spec.shot_type,
    camera_angle: s.design.static_spec.camera_angle,
    figures: (s.design.static_spec.character_blocking ?? []).length,
    blocking: (s.design.static_spec.character_blocking ?? []).map((b) => ({ pos: b.position_in_frame, gaze: b.gaze, pose: b.pose })),
    background: s.design.static_spec.framing?.layers?.background ?? null,
    focal_point: s.design.static_spec.framing?.focal_point ?? null,
    camera_motion: s.design.dynamic_spec?.camera_motion ?? null,
    character_motion: (s.design.dynamic_spec?.character_motion ?? []).map((m) => `${m.character_id}:${m.verb}`),
  })), null, 2))

console.log(JSON.stringify({
  format: isTriple ? '3-frame' : 'single-panel',
  scenes: sceneStats.length, shots: shots.length,
  detFindings: findings.length,
  bySeverity: Object.fromEntries(findings.reduce((m, f) => m.set(f.severity, (m.get(f.severity) || 0) + 1), new Map())),
  designless: shots.filter((s) => !s.design).map((s) => s.db.shot_id),
  angleVocab: [...new Set(shots.filter((s) => s.design).map((s) => s.design.static_spec.camera_angle))],
  motionVocab: [...new Set(shots.filter((s) => s.design).map((s) => s.design.dynamic_spec?.camera_motion?.type))],
}, null, 2))
