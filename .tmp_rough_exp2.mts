// 러프 보드 실험 v2: 긍정문 재작성 프롬프트 × (T2I vs 샷타입 ref edit). negative 파라미터 제거(no-op 확정).
import { createClient } from '@supabase/supabase-js'
import { fal } from '@fal-ai/client'
import { readFileSync, writeFileSync } from 'node:fs'
import { buildRoughStoryboardPrompt } from './src/lib/writer/rough-storyboard'

fal.config({ credentials: process.env.FAL_KEY! })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const OUT = '/tmp/claude-1000/-home-user-Downloads/3042fd1b-b9fb-4528-bbe9-5efc27f9ca5a/scratchpad'
const PROJECT = 'baff4f69-9e79-4c54-bf6b-c9512c4bd395'
const SEED = 1234567
const T2I = 'fal-ai/flux-2/klein/9b'
const EDIT = 'fal-ai/flux-2/klein/9b/edit'

// ── 프롬프트 수술: FIGURE_RULE 을 "부재의 부정" → "존재의 서술"로 교체 ──
const FIGURE_RULE_OLD =
  'Figures: draw every character as the same identical featureless artist mannequin — smooth uniform matte-gray body, plain rounded head with no face, no clothing or costume detail, consistent simple proportions. Every figure is the same mannequin; only pose and position differ.'
const FIGURE_RULE_NEW =
  'Figures: draw every character as the same identical artist mannequin — smooth uniform matte-gray body, a completely blank smooth egg-like oval head with a uniform featureless surface, bare simple doll body, consistent simple proportions. Every figure is the same blank mannequin; only pose and position differ.'
const CU_FRONT =
  'Close-up of a blank featureless artist mannequin head — a smooth egg-shaped oval with a perfectly uniform blank surface, matte gray. '
const SINGLE_FRONT = 'A single lone mannequin figure, vast empty surroundings. '

async function gen(model: string, input: Record<string, unknown>, file: string) {
  const r = (await fal.subscribe(model, { input })) as { data: { images?: { url: string }[] } }
  const url = r.data?.images?.[0]?.url
  if (!url) throw new Error('no image url: ' + file)
  writeFileSync(`${OUT}/${file}`, Buffer.from(await (await fetch(url)).arrayBuffer()))
  console.log('ok', file)
}

// 지난 실험의 로컬 레퍼런스 재업로드(fal storage) — 동일 ref 재사용
const upload = async (name: string) => {
  const buf = readFileSync(`${OUT}/${name}`)
  return fal.storage.upload(new Blob([buf], { type: 'image/png' }))
}
const refs = {
  full: await upload('exp_ref_full.png'),
  cu: await upload('exp_ref_cu.png'),
  group: await upload('exp_ref_group.png'),
}
console.log('refs re-uploaded')

// 실샷 3종 (v1과 동일)
const { data: shots } = await sb.from('shots')
  .select('shot_id, scene_id, shot_type, action_description, characters, camera_config, focal_length, aperture, lighting_config')
  .eq('project_id', PROJECT).in('shot_id', ['shot_1', 'shot_3', 'shot_5'])
const { data: scenes } = await sb.from('scenes').select('scene_id, location, time_of_day, mood').eq('project_id', PROJECT)
const { data: locs } = await sb.from('locations').select('location_id, visual_description').eq('project_id', PROJECT)
const { data: chars } = await sb.from('characters').select('character_id, name').eq('project_id', PROJECT)
const nameById = new Map((chars ?? []).map((c) => [c.character_id, c.name]))

const PLAN = [
  { key: 'wide', shotId: 'shot_1', ref: refs.full, front: SINGLE_FRONT },
  { key: 'cu', shotId: 'shot_3', ref: refs.cu, front: CU_FRONT + SINGLE_FRONT },
  { key: 'group', shotId: 'shot_5', ref: refs.group, front: '' }, // 군집 캐릭터 — 인원수 절 미적용
]
for (const { key, shotId, ref, front } of PLAN) {
  const s = (shots ?? []).find((x) => x.shot_id === shotId)!
  const scene = (scenes ?? []).find((x) => x.scene_id === s.scene_id)
  const loc = (locs ?? []).find((l) => l.location_id === scene?.location)
  const base = buildRoughStoryboardPrompt({
    shotType: s.shot_type,
    actionDescription: s.action_description ?? '',
    characterNames: (s.characters ?? []).map((id: string) => nameById.get(id) ?? id),
    characterNameById: nameById,
    location: scene?.location,
    locationDescription: loc?.visual_description,
    timeOfDay: scene?.time_of_day,
    mood: scene?.mood,
    cameraPitch: (s.camera_config as { pan?: number } | null)?.pan,
    focalLength: s.focal_length,
    aperture: s.aperture,
    lightPosition: (s.lighting_config as { position?: string } | null)?.position,
    spec: null,
  })
  if (!base.includes(FIGURE_RULE_OLD)) console.warn(`⚠ FIGURE_RULE 원문 불일치 (${key}) — 치환 skip 됨`)
  const rewritten = front + base.replace(FIGURE_RULE_OLD, FIGURE_RULE_NEW)

  // (a′) 재작성 프롬프트 + T2I — 프롬프트 단독 효과 분리
  await gen(T2I, { prompt: rewritten, seed: SEED, image_size: 'landscape_16_9' }, `exp2_${key}_a_t2i.png`)
  // (c′) 재작성 프롬프트 + 샷타입 ref edit — 후보 최종형
  const editPrompt = `Using the reference image ONLY as the style guide for the figure look (blank featureless gray artist mannequin, rough monochrome pencil sketch) — discard its composition entirely and draw a completely NEW scene: ${rewritten}`
  await gen(EDIT, { prompt: editPrompt, image_urls: [ref], seed: SEED }, `exp2_${key}_c_edit.png`)
}
console.log('done')
