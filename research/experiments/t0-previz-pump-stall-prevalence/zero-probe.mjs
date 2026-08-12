// 완주율 0 프로젝트 성격 확인 — 실제 사용자 작업물인가, 시드/테스트인가 (read-only)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ZEROS = ['831c5787', '185ec87b', '3d5b10bf', '92948d6f', 'fe699c5b']
const { data: projs } = await db.from('projects').select('id,title,created_at,workspace_id,current_stage')
for (const z of ZEROS) {
  const p = projs.find((x) => x.id.startsWith(z))
  console.log(z, '|', p?.title, '|', p?.created_at?.slice(0, 19), '| stage', p?.current_stage, '| ws', String(p?.workspace_id).slice(0,8))
}
// 대조: 완주한 프로젝트 3개
for (const z of ['a5cb2cae', '0e337d5d', '2beb605c']) {
  const p = projs.find((x) => x.id.startsWith(z))
  console.log('[완주]', z, '|', p?.title, '|', p?.created_at?.slice(0, 19), '| stage', p?.current_stage, '| ws', String(p?.workspace_id).slice(0,8))
}
const users = new Set(projs.map((p) => p.workspace_id))
console.log('전체 프로젝트', projs.length, '/ 워크스페이스 수', users.size)
