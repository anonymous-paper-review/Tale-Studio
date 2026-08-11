import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

const ROOT = dirname(fileURLToPath(import.meta.url))
const BASE_FIXTURE = join(ROOT, '..', '..', '..', 'logs', '064631aa-f6b2-4f7c-800b-66b0517a2769', 'INTEGRATED.json')
const OUT = join(ROOT, 'text')
mkdirSync(OUT, { recursive: true })

const CASES = [
  {
    id: 'hand_in_frame',
    family: '손동작',
    action: '그녀가 프레임 안에 놓인 붉은 레버를 손으로 천천히 당긴다.',
    vizPrompt: 'A woman slowly pulls a red lever that is fully visible inside the frame. Keep the entire hand and lever operation in view.',
    expectedCamera: 'static',
    expectedTypes: ['static'],
    expectedReason: '손과 레버의 동작이 같은 프레임 안에서 끝남',
  },
  {
    id: 'hand_off_frame',
    family: '손동작',
    action: '그녀가 프레임 오른쪽 밖에 있는 붉은 레버를 향해 손을 뻗어 당긴다.',
    vizPrompt: 'A woman reaches toward a red lever outside the right edge of the frame and pulls it. The camera must pan right to reveal and follow the lever.',
    expectedCamera: 'move',
    expectedTypes: ['pan', 'tracking'],
    expectedReason: '대상과 손이 프레임 밖에 있어 오른쪽 재구성이 필요함',
  },
  {
    id: 'gaze_in_frame',
    family: '시선',
    action: '그녀가 같은 프레임 안에 보이는 열린 출입구로 시선을 옮긴다.',
    vizPrompt: 'A woman shifts her gaze toward an open doorway that is already visible inside the frame. Keep the camera locked and let the gaze change carry the moment.',
    expectedCamera: 'static',
    expectedTypes: ['static'],
    expectedReason: '시선의 대상이 이미 화면 안에 있음',
  },
  {
    id: 'gaze_off_frame',
    family: '시선',
    action: '그녀가 프레임 오른쪽 밖에서 들려온 금속음 쪽으로 시선을 돌리고 그 대상을 드러낸다.',
    vizPrompt: 'A woman turns toward a metallic sound outside the right edge of the frame. Pan right to reveal what she sees; the reveal is the camera purpose.',
    expectedCamera: 'move',
    expectedTypes: ['pan', 'tracking'],
    expectedReason: '시선의 대상이 프레임 밖에 있어 리빌이 필요함',
  },
  {
    id: 'reaction_hold',
    family: '감정',
    action: '그녀가 충격을 받은 표정으로 프레임 안에서 숨을 멈춘다.',
    vizPrompt: 'A woman freezes in shock and holds her breath. Keep the camera locked at the same framing; show the emotion through her face only.',
    expectedCamera: 'static',
    expectedTypes: ['static'],
    expectedReason: '감정 변화가 같은 구도 안에서 완결됨',
  },
  {
    id: 'reaction_push_in',
    family: '감정',
    action: '그녀의 충격을 얼굴이 점점 화면을 채우는 고립된 반응으로 보여준다.',
    vizPrompt: 'A woman freezes in shock. Slowly dolly in so her isolated reaction grows to fill the frame; the changing facial scale is the camera purpose.',
    expectedCamera: 'move',
    expectedTypes: ['dolly_in'],
    expectedReason: '감정을 얼굴의 배율 변화로 보여주기 위해 돌리 인이 필요함',
  },
] as const

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function makeFixture(base: any, item: (typeof CASES)[number]) {
  const sceneId = `camera_follow_${item.id}`
  const scene = {
    scene_id: sceneId,
    act_ref: 'Camera Response Test',
    location: 'camera_test_room',
    time_of_day: 'day',
    weather: 'clear',
    characters_in_scene: ['char'],
    purpose: 'camera-response-disambiguation',
    emotion_beat: { start: 'neutral', end: 'focused' },
    dialogue_summary: item.action,
    key_dialogue: [],
    info_asymmetry: 'audience=character',
    estimated_seconds: 5,
    scene_actions: [item.action],
  }
  const characters = clone(base.characters)
  characters.characters = [{
    ...characters.characters.find((character: any) => character.id === 'char'),
    id: 'char',
    name: 'subject',
    appearance_description: 'adult performer in a neutral blue studio costume',
    personality: [],
  }]
  const characterVisual = clone(base.characterVisual)
  characterVisual.characters = [{
    ...characterVisual.characters.find((character: any) => character.character_id === 'char'),
    character_id: 'char',
    appearance: 'A neutral blue mannequin performer with a simple featureless head and body.',
    costume: ['matte blue studio suit'],
    palette: ['#2E6FBB', '#E85D3F', '#38B56C'],
  }]
  const worldVisual = clone(base.worldVisual)
  worldVisual.locations = [{
    id: 'camera_test_room',
    name: 'camera test room',
    description: 'A neutral studio room with a clear floor, a red lever, a green target marker, and no story-specific props.',
  }]
  const neutralPlan = {
    scene_id: sceneId,
    coverage_pattern: 'single_take',
    shot_count_target: 1,
    lens_vocabulary: [50],
    camera_mounting: 'mixed',
    camera_energy: 'breathing',
    lighting_arc: { start_K: 4500, end_K: 4500, dominant_ratio: '3:1', quality: 'soft' },
    palette_emphasis: ['#2E6FBB', '#E85D3F', '#38B56C'],
    dominant_pov: 'char',
    spatial_axis_180: null,
    rhythm_profile: 'sustained',
    cut_pace: 'long_takes',
    avg_shot_seconds: 5,
    visual_intent: 'Neutral technical framing test; do not preselect camera movement.',
  }
  return {
    ...base,
    characters,
    characterVisual,
    worldVisual,
    scenes: { ...base.scenes, scenes: [scene] },
    sceneCinematography: [neutralPlan],
  }
}

async function main() {
  process.env.WRITER_CAMERA_CONTRACT = 'relaxed-v3'
  const { Agent, setGlobalDispatcher } = await import('undici')
  setGlobalDispatcher(new Agent({ connections: 16 }))

  const base = JSON.parse(readFileSync(BASE_FIXTURE, 'utf8'))
  const { runDecoupage } = await import('@/lib/writer/pipeline/stages/decoupage')
  const { runShotDesign } = await import('@/lib/writer/pipeline/stages/v4_shots')
  const { resolveModels } = await import('@/lib/writer/pipeline')
  const { PipelineLogger } = await import('@/lib/writer/logger')
  const { buildVideoPrompt } = await import('@/lib/director/video-prompt')

  const runCase = async (item: (typeof CASES)[number]) => {
    const fx = makeFixture(base, item)
    const models = resolveModels(fx.input)
    const logger = new PipelineLogger(`camera-follow-${item.id}`)
    await logger.init()

    console.log(`\n── ${item.id} · ${item.action} ──`)
    const dec = await runDecoupage(
      fx.genre,
      fx.characters,
      fx.scenes,
      fx.worldVisual,
      fx.sceneCinematography,
      logger,
      models.V,
      { concurrency: 1 },
    )
    const shotDesign = await runShotDesign(
      fx.genre,
      fx.characters,
      fx.scenes,
      fx.visualIdentity,
      fx.worldVisual,
      fx.characterVisual,
      fx.sceneCinematography,
      dec.plan ?? null,
      '',
      logger,
      models.V,
      { concurrency: 1 },
    )

    const coveringShots = (shotDesign.shots ?? []).filter((shot: any) => (shot.intent?.source_beats ?? []).includes(0))
    const firstShot =
      coveringShots.find((shot: any) => shot.dynamic_spec?.camera_motion?.type && shot.dynamic_spec.camera_motion.type !== 'static') ??
      coveringShots[0] ??
      shotDesign.shots?.[0] ??
      null
    const decoupageShot = dec.plan?.scenes?.flatMap((scene: any) => scene.shots ?? []).find((shot: any) => shot.shot_id === firstShot?.intent?.shot_id) ?? null
    const dynamicSpec = firstShot?.dynamic_spec ?? null
    const cameraIntent = decoupageShot?.camera_intent ?? null
    const cameraType = dynamicSpec?.camera_motion?.type ?? null
    const video = buildVideoPrompt({
      prompt: item.vizPrompt,
      generationMethod: 'I2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
      dynamicSpec,
      startEndReference: false,
    })

    const result = {
      ...item,
      model: models.V,
      scene_id: `camera_follow_${item.id}`,
      camera_intent: cameraIntent,
      camera_move_motivation: decoupageShot?.camera_move_motivation ?? null,
      dynamic_spec: dynamicSpec,
      camera_type: cameraType,
      shot_count: shotDesign.shots?.length ?? 0,
      selected_shot: firstShot,
      decoupage: dec,
      shot_design: shotDesign,
      video_prompt: video.fullPrompt,
      video_prompt_parts: video.prompt_parts,
    }
    const path = join(OUT, `${item.id}.json`)
    writeFileSync(path, JSON.stringify(result, null, 2))
    console.log(`camera_intent=${cameraIntent} · camera_type=${cameraType} · shots=${result.shot_count}`)
    return {
      id: item.id,
      family: item.family,
      action: item.action,
      expectedCamera: item.expectedCamera,
      expectedTypes: item.expectedTypes,
      camera_intent: cameraIntent,
      camera_type: cameraType,
      camera_move_motivation: result.camera_move_motivation,
      dynamic_spec: dynamicSpec,
      shot_count: result.shot_count,
      model: result.model,
      text_path: path,
      video_prompt: video.fullPrompt,
    }
  }

  const results: any[] = []
  for (const batch of [CASES.slice(0, 3), CASES.slice(3)]) {
    results.push(...(await Promise.all(batch.map(runCase))))
  }

  const summary = {
    experiment: 'camera-follow-disambiguation',
    finished_at: new Date().toISOString(),
    contract: 'relaxed-v3',
    fixture: BASE_FIXTURE,
    model: results[0]?.model ?? null,
    case_count: results.length,
    results,
  }
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(`\n[완료] ${results.length}개 케이스 → ${join(OUT, 'summary.json')}`)
}

main().catch((error) => {
  console.error('[실험 실패]', error)
  process.exit(1)
})
