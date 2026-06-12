// sh_02_02 실패 원인 — fal 큐에서 실제 에러 페이로드 회수 (시크릿 미출력)
import { readFileSync } from 'node:fs'
import { fal } from '@fal-ai/client'

const env = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() ?? ''
fal.config({ credentials: get('FAL_KEY') })
const SB = get('NEXT_PUBLIC_SUPABASE_URL'); const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const q = async (p: string) => (await fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json()

const pid = 'dbde5406-b15d-4138-b1b6-baf5016b30d6'
const jobs = await q(`generation_jobs?project_id=eq.${pid}&kind=eq.shot_rough_storyboard&status=eq.failed&select=request_id,model,created_at&order=created_at.desc&limit=1`)
const { request_id, model } = jobs[0]
console.log('request:', request_id, '| model:', model)

try {
  const st = await fal.queue.status(model, { requestId: request_id, logs: true })
  console.log('status:', JSON.stringify(st, null, 1).slice(0, 800))
} catch (e: any) {
  console.log('status err:', e?.status, JSON.stringify(e?.body ?? e?.message).slice(0, 600))
}
try {
  const r = await fal.queue.result(model, { requestId: request_id })
  console.log('result:', JSON.stringify(r.data).slice(0, 300))
} catch (e: any) {
  console.log('result err:', e?.status, JSON.stringify(e?.body ?? e?.message).slice(0, 800))
}

// 해당 샷의 프롬프트 재료도 같이
const shot = (await q(`shots?project_id=eq.${pid}&shot_id=eq.sh_02_02&select=action_description,characters,shot_type`))[0]
console.log('\nsh_02_02 action:', shot?.action_description)
console.log('characters:', JSON.stringify(shot?.characters), '| type:', shot?.shot_type)
