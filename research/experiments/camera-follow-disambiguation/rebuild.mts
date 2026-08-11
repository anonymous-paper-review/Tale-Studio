import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildVideoPrompt } from '@/lib/director/video-prompt'

const ROOT = dirname(fileURLToPath(import.meta.url))
const TEXT = join(ROOT, 'text')
const IDS = ['hand_in_frame', 'hand_off_frame', 'gaze_in_frame', 'gaze_off_frame', 'reaction_hold', 'reaction_push_in']

const results: any[] = []
for (const id of IDS) {
  const path = join(TEXT, `${id}.json`)
  const item = JSON.parse(readFileSync(path, 'utf8'))
  const shots = item.shot_design?.shots ?? []
  const covering = shots.filter((shot: any) => (shot.intent?.source_beats ?? []).includes(0))
  const selected = covering.find((shot: any) => shot.dynamic_spec?.camera_motion?.type && shot.dynamic_spec.camera_motion.type !== 'static') ?? covering[0] ?? shots[0] ?? null
  const dynamicSpec = selected?.dynamic_spec ?? null
  const decoupageShot = item.decoupage?.scenes?.flatMap((scene: any) => scene.shots ?? []).find((shot: any) => shot.shot_id === selected?.intent?.shot_id) ?? null
  const prompt = buildVideoPrompt({
    prompt: item.vizPrompt,
    generationMethod: 'I2V',
    modelKey: 'happy-horse',
    durationSeconds: 5,
    dynamicSpec,
    startEndReference: false,
  })
  item.selected_shot = selected
  item.camera_intent = decoupageShot?.camera_intent ?? null
  item.camera_move_motivation = decoupageShot?.camera_move_motivation ?? null
  item.dynamic_spec = dynamicSpec
  item.camera_type = dynamicSpec?.camera_motion?.type ?? null
  item.video_prompt = prompt.fullPrompt
  item.video_prompt_parts = prompt.prompt_parts
  writeFileSync(path, JSON.stringify(item, null, 2))
  results.push({
    id: item.id,
    family: item.family,
    action: item.action,
    expectedCamera: item.expectedCamera,
    expectedTypes: item.expectedTypes,
    expectedReason: item.expectedReason,
    camera_intent: item.camera_intent,
    camera_type: item.camera_type,
    camera_move_motivation: item.camera_move_motivation,
    dynamic_spec: item.dynamic_spec,
    selected_shot_id: selected?.intent?.shot_id ?? null,
    selected_shot_summary: selected?.intent?.dramatic_purpose ?? null,
    shot_count: item.shot_design?.shots?.length ?? 0,
    model: item.model,
    text_path: path,
    video_prompt: item.video_prompt,
  })
  console.log(`${id}: intent=${item.camera_intent} type=${item.camera_type} selected=${results.at(-1).selected_shot_id}`)
}

writeFileSync(join(TEXT, 'summary.json'), JSON.stringify({
  experiment: 'camera-follow-disambiguation',
  finished_at: new Date().toISOString(),
  contract: 'relaxed-v3',
  fixture: join(ROOT, '..', '..', '..', 'logs', '064631aa-f6b2-4f7c-800b-66b0517a2769', 'INTEGRATED.json'),
  model: results[0]?.model ?? null,
  case_count: results.length,
  note: 'Summary rebuilt from completed text runs, selecting the shot that covers source beat 0 rather than an added establishing shot.',
  results,
}, null, 2))
