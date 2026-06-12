// 1f644223 러프 스토리보드 초기화 + rich(shotDesign) 프롬프트로 재생성 1회.
//   - 로컬 작업트리의 buildRoughStoryboardPrompt/adapters 를 그대로 사용 (배포본과 무관하게 rich 보장)
//   - fal queue 직접 submit + 프로덕션 webhook 으로 finalize (배포된 /api/fal/webhook 이 영속화)
//   - 시크릿 값은 출력하지 않는다.
import { readFileSync } from 'node:fs'
import { fal } from '@fal-ai/client'
import {
  buildRoughStoryboardPrompt,
  type RoughStoryboardSpec,
} from '../../src/lib/writer/rough-storyboard'
import { writerShotIdToMain } from '../../src/lib/writer/adapters'
import type { ShotDesign } from '../../src/lib/writer/types/pipeline'

const PID = '1f644223-66f2-4923-a75e-3c4ad383709b'
const MODEL = 'fal-ai/flux-2/klein/4b/lora'
const WEBHOOK = 'https://tale-ivory.vercel.app/api/fal/webhook'

const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
const SB_URL = get('NEXT_PUBLIC_SUPABASE_URL')
const SB_KEY = get('SUPABASE_SERVICE_ROLE_KEY')
fal.config({ credentials: get('FAL_KEY') })

const headers = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'content-type': 'application/json',
}
const q = async (path: string) =>
  (await fetch(`${SB_URL}/rest/v1/${path}`, { headers })).json()

// ── 데이터 로드 ────────────────────────────────────────────────────────────
const [shots, scenes, chars, runs, projects] = await Promise.all([
  q(`shots?project_id=eq.${PID}&select=shot_id,scene_id,shot_type,action_description,characters,camera_config,lighting_config,focal_length,aperture&order=sort_order`),
  q(`scenes?project_id=eq.${PID}&select=scene_id,location,time_of_day,mood`),
  q(`characters?project_id=eq.${PID}&select=character_id,name`),
  q(`writer_runs?project_id=eq.${PID}&select=status,shotDesign:state->shotDesign&order=created_at.desc&limit=5`),
  q(`projects?id=eq.${PID}&select=workspace_id`),
])
const workspaceId = projects[0]?.workspace_id
if (!workspaceId) throw new Error('workspace_id 없음')

const nameById = new Map<string, string>(
  chars.map((c: { character_id: string; name: string }) => [c.character_id, c.name]),
)
const sceneById = new Map(scenes.map((s: { scene_id: string }) => [s.scene_id, s]))

const runRow =
  runs.find((r: { status: string; shotDesign: unknown }) => r.status === 'completed' && Array.isArray(r.shotDesign)) ??
  runs.find((r: { shotDesign: unknown }) => Array.isArray(r.shotDesign))
const specByShotId = new Map<string, RoughStoryboardSpec>()
for (const d of ((runRow?.shotDesign ?? []) as ShotDesign[])) {
  const sid = d?.static_spec?.shot_id ?? d?.intent?.shot_id
  const scid = d?.intent?.scene_id
  if (!sid || !scid) continue
  specByShotId.set(writerShotIdToMain(sid, scid), {
    staticSpec: d.static_spec,
    intent: d.intent,
    dynamicSpec: d.dynamic_spec,
  })
}
console.log(`shots=${shots.length} / spec 매칭=${shots.filter((s: { shot_id: string }) => specByShotId.has(s.shot_id)).length}`)

// ── ① 링크 제거 (rough_storyboard → null) ──────────────────────────────────
const clear = await fetch(`${SB_URL}/rest/v1/shots?project_id=eq.${PID}`, {
  method: 'PATCH',
  headers: { ...headers, Prefer: 'return=minimal' },
  body: JSON.stringify({ rough_storyboard: null }),
})
if (!clear.ok) throw new Error(`clear 실패: ${clear.status}`)
console.log('① rough_storyboard 링크 제거 완료')

// 진행중 잡 dedupe (혹시 사용자가 동시에 탭을 새로고침했을 경우)
const queued = await q(`generation_jobs?project_id=eq.${PID}&kind=eq.shot_rough_storyboard&status=eq.queued&select=target`)
const inFlight = new Set(queued.map((j: { target?: { writerShotId?: string } }) => j.target?.writerShotId).filter(Boolean))

// ── ② rich 프롬프트로 재생성 submit ────────────────────────────────────────
let sample = ''
let submitted = 0
for (const s of shots) {
  if (inFlight.has(s.shot_id)) { console.log(`  skip(in_flight) ${s.shot_id}`); continue }
  const scene = sceneById.get(s.scene_id) as { location?: string; time_of_day?: string; mood?: string } | undefined
  const spec = specByShotId.get(s.shot_id) ?? null
  const prompt = buildRoughStoryboardPrompt({
    shotType: s.shot_type ?? 'MS',
    actionDescription: s.action_description ?? '',
    characterNames: (s.characters ?? []).map((id: string) => nameById.get(id) ?? id),
    characterNameById: nameById,
    location: scene?.location,
    timeOfDay: scene?.time_of_day,
    mood: scene?.mood,
    cameraPitch: s.camera_config?.pan ?? null,
    focalLength: s.focal_length ?? null,
    aperture: s.aperture ?? null,
    lightPosition: s.lighting_config?.position ?? null,
    aspectRatio: '16:9',
    spec,
  })
  if (s.shot_id === 'shot_1') sample = prompt

  const { request_id } = await fal.queue.submit(MODEL, {
    input: { prompt, image_size: 'landscape_16_9' },
    webhookUrl: WEBHOOK,
  })
  const ins = await fetch(`${SB_URL}/rest/v1/generation_jobs`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      project_id: PID,
      request_id,
      model: MODEL,
      kind: 'shot_rough_storyboard',
      target: { workspaceId, writerShotId: s.shot_id },
      status: 'queued',
    }),
  })
  if (!ins.ok) throw new Error(`job insert 실패(${s.shot_id}): ${ins.status} ${await ins.text()}`)
  submitted++
  console.log(`  ✓ ${s.shot_id} [${spec ? 'shotDesign' : 'db_fallback'}]`)
}
console.log(`② submit 완료: ${submitted}건`)
console.log('\n— shot_1 프롬프트 샘플 —\n' + sample)
