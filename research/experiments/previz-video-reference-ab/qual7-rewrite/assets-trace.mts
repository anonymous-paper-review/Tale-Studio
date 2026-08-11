// 에셋 추적 (읽기 전용) — sh_04_16 발주에 쓰인 입력과, 그 입력을 만든 상류 재료를 DB에서 그대로 뜬다.
//   왜: 오너 지시("에셋 뭐 썼는지도 html에 같이 보여달라 — 배경·캐릭터 이미지·영상") .
//   범위: SELECT 만. 쓰기 없음.
// 실행: pnpm dlx tsx research/experiments/previz-video-reference-ab/qual7-rewrite/assets-trace.mts
import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' })

// 정적 import 는 dotenv 보다 먼저 평가돼 admin 클라이언트가 빈 URL 로 생성된다 → 동적 import.
const { supabaseAdmin } = await import('@/lib/supabase/admin')

const DIR = dirname(fileURLToPath(import.meta.url))
const PROJECT_ID = '6d66cacd-7f10-47c8-9c0e-b7f5bc6faa2a'
const SHOT_ID = 'sh_04_16'

const out: Record<string, unknown> = { project_id: PROJECT_ID, shot_id: SHOT_ID }

const { data: shot, error: shotErr } = await supabaseAdmin
  .from('shots')
  .select('*')
  .eq('project_id', PROJECT_ID)
  .eq('shot_id', SHOT_ID)
  .maybeSingle()
if (shotErr) throw shotErr
out.shot = shot
if (!shot) throw new Error('shot 없음')

const charIds = (shot.characters as string[] | null) ?? []
const { data: chars, error: charErr } = charIds.length
  ? await supabaseAdmin
      .from('characters')
      .select('*')
      .eq('project_id', PROJECT_ID)
      .in('character_id', charIds)
  : { data: [], error: null }
if (charErr) throw charErr
out.characters = chars

const { data: project, error: projErr } = await supabaseAdmin
  .from('projects')
  .select('id, title, style_anchor_key')
  .eq('id', PROJECT_ID)
  .maybeSingle()
if (projErr) throw projErr
out.project = project

// 씬(배경) — 씬 테이블에 배경 자산이 있으면 같이 뜬다. 없으면 null 로 남긴다(추측 금지).
if (shot.scene_id) {
  const { data: scene } = await supabaseAdmin
    .from('scenes')
    .select('*')
    .eq('project_id', PROJECT_ID)
    .eq('scene_id', shot.scene_id as string)
    .maybeSingle()
  out.scene = scene ?? null
}

writeFileSync(join(DIR, 'inputs', 'assets-trace.json'), JSON.stringify(out, null, 2))
console.log('OK →', join(DIR, 'inputs', 'assets-trace.json'))
console.log('shot columns:', shot ? Object.keys(shot).join(', ') : '-')
console.log('characters:', (chars ?? []).length)
