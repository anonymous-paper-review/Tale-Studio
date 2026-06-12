// dbde5406 sh_02_02 — safe mode 프롬프트로 1회 재생성 (fal 모더레이션 우회)
import { readFileSync } from 'node:fs'
import { fal } from '@fal-ai/client'
import { buildRoughStoryboardPrompt, type RoughStoryboardSpec } from '../../src/lib/writer/rough-storyboard'
import { writerShotIdToMain } from '../../src/lib/writer/adapters'
import type { ShotDesign } from '../../src/lib/writer/types/pipeline'

const PID = 'dbde5406-b15d-4138-b1b6-baf5016b30d6'
const SHOT = 'sh_02_02'
const MODEL = 'fal-ai/flux-2/klein/4b/lora'
const WEBHOOK = 'https://tale-ivory.vercel.app/api/fal/webhook'

const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
fal.config({ credentials: get('FAL_KEY') })
const SB = get('NEXT_PUBLIC_SUPABASE_URL'); const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const q = async (p: string) => (await fetch(`${SB}/rest/v1/${p}`, { headers })).json()

const [shot] = await q(`shots?project_id=eq.${PID}&shot_id=eq.${SHOT}&select=shot_id,scene_id,shot_type,action_description,characters,camera_config,lighting_config,focal_length,aperture`)
const [scene] = await q(`scenes?project_id=eq.${PID}&scene_id=eq.${shot.scene_id}&select=location,time_of_day,mood`)
const chars = await q(`characters?project_id=eq.${PID}&select=character_id,name`)
const runs = await q(`writer_runs?project_id=eq.${PID}&select=status,shotDesign:state->shotDesign&order=created_at.desc&limit=5`)
const [proj] = await q(`projects?id=eq.${PID}&select=workspace_id`)

const nameById = new Map<string, string>(chars.map((c: { character_id: string; name: string }) => [c.character_id, c.name]))
const runRow = runs.find((r: { status: string; shotDesign: unknown }) => Array.isArray(r.shotDesign))
let spec: RoughStoryboardSpec | null = null
for (const d of ((runRow?.shotDesign ?? []) as ShotDesign[])) {
  const sid = d?.static_spec?.shot_id ?? d?.intent?.shot_id
  const scid = d?.intent?.scene_id
  if (sid && scid && writerShotIdToMain(sid, scid) === SHOT) {
    spec = { staticSpec: d.static_spec, intent: d.intent, dynamicSpec: d.dynamic_spec }
    break
  }
}
console.log('spec:', spec ? 'shotDesign(rich)' : 'db_fallback')

const prompt = buildRoughStoryboardPrompt({
  shotType: shot.shot_type ?? 'MS',
  actionDescription: shot.action_description ?? '',
  characterNames: (shot.characters ?? []).map((id: string) => nameById.get(id) ?? id),
  characterNameById: nameById,
  location: scene?.location, timeOfDay: scene?.time_of_day, mood: scene?.mood,
  cameraPitch: shot.camera_config?.pan ?? null,
  focalLength: shot.focal_length ?? null, aperture: shot.aperture ?? null,
  lightPosition: shot.lighting_config?.position ?? null,
  aspectRatio: '16:9', spec, safeMode: true,
})
console.log('\n— safe mode 프롬프트 —\n' + prompt + '\n')

const { request_id } = await fal.queue.submit(MODEL, { input: { prompt, image_size: 'landscape_16_9' }, webhookUrl: WEBHOOK })
const ins = await fetch(`${SB}/rest/v1/generation_jobs`, {
  method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
  body: JSON.stringify({ project_id: PID, request_id, model: MODEL, kind: 'shot_rough_storyboard', target: { workspaceId: proj.workspace_id, writerShotId: SHOT }, status: 'queued' }),
})
if (!ins.ok) throw new Error(`job insert 실패: ${ins.status}`)
console.log('submit 완료 — webhook 대기')

// 완료 폴링 (최대 2분)
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const [s] = await q(`shots?project_id=eq.${PID}&shot_id=eq.${SHOT}&select=rough_storyboard`)
  if (s.rough_storyboard?.status === 'completed') { console.log('✅ 완료:', s.rough_storyboard.url.slice(0, 60)); process.exit(0) }
  const fail = await q(`generation_jobs?request_id=eq.${request_id}&select=status,error`)
  if (fail[0]?.status === 'failed') { console.log('❌ 다시 실패:', fail[0].error); process.exit(1) }
}
console.log('⏱ 타임아웃 — webhook 미도착 (reconcile 대기)')
