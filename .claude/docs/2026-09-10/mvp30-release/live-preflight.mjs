// 고정 운영 프로젝트를 읽기만 한다. 키/원문 대사/함수본문은 출력하거나 저장하지 않는다.
import { readFileSync, writeFileSync } from 'node:fs'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
const env = dotenv.parse(readFileSync('.env.local'))
const ref = 'qnjnrihfpqkdhjuzvepy'
const projectId = '7112d31e-70ce-4743-9562-057f7beac002'
const out = '.claude/docs/2026-09-10/mvp30-release/live-preflight'
if (new URL(env.SUPABASE_LIVE_URL).hostname !== `${ref}.supabase.co`) throw Error('Live project identity mismatch')
const secrets = Object.entries(env).filter(([key]) => /KEY|TOKEN|PASSWORD|SECRET/.test(key)).map(([,value]) => value).filter(Boolean)
function redact(error) {
  let text = error instanceof Error ? error.message : String(error)
  for (const secret of secrets) text = text.replaceAll(secret, '[redacted]')
  return text
}
async function query(sql) {
  if (!/^\s*select\b/i.test(sql) || /\b(insert|update|delete|alter|create|drop|grant|revoke|truncate|call)\b/i.test(sql)) throw Error('Only SELECT is allowed')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, read_only: true }), signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw Error(`Read-only database query HTTP ${response.status}: ${(await response.text()).slice(0,350)}`)
  return response.json()
}
const result = { checkedAt: new Date().toISOString(), projectRef: ref, projectId, mutations: 0, checks: {}, gaps: [] }
try {
  result.checks.roughFunction = await query(`select p.oid::regprocedure::text as signature, p.prosecdef as security_definer, md5(pg_get_functiondef(p.oid)) as definition_md5, p.proconfig as configuration, has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute, has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute, has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='reserve_rough_storyboard_grid' order by p.oid`)
  const history = await query(`select to_regclass('supabase_migrations.schema_migrations') is not null as present`)
  result.checks.migrationTablePresent = history[0]?.present === true
  result.checks.roughMigration = result.checks.migrationTablePresent ? await query(`select version,name from supabase_migrations.schema_migrations where version='20260910001500'`) : []
} catch (error) { result.gaps.push({ check: 'rough function/migration', error: redact(error) }) }
const db = createClient(env.SUPABASE_LIVE_URL, env.SUPABASE_LIVE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const requests = {
  project: db.from('projects').select('id,current_stage,updated_at').eq('id',projectId).maybeSingle(),
  scenes: db.from('scenes').select('scene_id,sort_order',{ count: 'exact' }).eq('project_id',projectId).order('sort_order'),
  shots: db.from('shots').select('shot_id,scene_id,dialogue_lines',{ count: 'exact' }).eq('project_id',projectId),
  writerRun: db.from('writer_runs').select('id,status,current_stage,completed_units,total_units,error,created_at,updated_at').eq('project_id',projectId).order('created_at',{ ascending: false }).limit(1).maybeSingle(),
  characters: db.from('characters').select('character_id,name,entity_type,appearance,view_main',{ count: 'exact' }).eq('project_id',projectId),
  appearances: db.from('character_appearances').select('character_id,appearance_key,is_default,sheet_url,portrait_url',{ count: 'exact' }).eq('project_id',projectId),
  locations: db.from('locations').select('location_id,name,wide_shot',{ count: 'exact' }).eq('project_id',projectId),
}
const rows = {}
await Promise.all(Object.entries(requests).map(async ([key,request]) => {
  try {
    const response = await request
    if (response.error) throw Error(response.error.message)
    if (response.count !== null && Array.isArray(response.data) && response.count !== response.data.length) throw Error(`Incomplete rows: ${response.data.length}/${response.count}`)
    rows[key] = response.data
  } catch (error) { result.gaps.push({ check: key, error: redact(error) }) }
}))
result.checks.project = rows.project
result.checks.writerRun = rows.writerRun ? { ...rows.writerRun, error: rows.writerRun.error ? 'present (raw text omitted)' : null } : null
function emptyCounts() { return { shots:0, dialogueLines:0, nonempty:0, koreanOnly:0, japaneseKanaOnly:0, koreanAndJapaneseKana:0, hanWithoutKanaOrKorean:0, other:0, empty:0, malformed:0 } }
const total = emptyCounts(); const perScene = new Map((rows.scenes ?? []).map(scene => [scene.scene_id,{sceneId:scene.scene_id,order:scene.sort_order,...emptyCounts()}]))
function category(text) {
  if (!text.trim()) return 'empty'
  const ko=/[가-힣]/u.test(text), ja=/[ぁ-ゖァ-ヺ]/u.test(text)
  return ko&&ja?'koreanAndJapaneseKana':ko?'koreanOnly':ja?'japaneseKanaOnly':/[一-鿿]/u.test(text)?'hanWithoutKanaOrKorean':'other'
}
for (const shot of rows.shots ?? []) {
  if (!perScene.has(shot.scene_id)) perScene.set(shot.scene_id,{sceneId:shot.scene_id,order:null,...emptyCounts()})
  const counts=perScene.get(shot.scene_id);total.shots++;counts.shots++
  if (!Array.isArray(shot.dialogue_lines)) { if(shot.dialogue_lines != null){total.malformed++;counts.malformed++} continue }
  for (const line of shot.dialogue_lines) {
    total.dialogueLines++;counts.dialogueLines++
    if(typeof line?.text!=='string'){total.malformed++;counts.malformed++;continue}
    const key=category(line.text);total[key]++;counts[key]++;if(key!=='empty'){total.nonempty++;counts.nonempty++}
  }
}
result.checks.savedContent = { sceneCount: rows.scenes?.length, shotCount: rows.shots?.length, dialogue: total, byScene: [...perScene.values()], languageMethod:'Unicode presence only: Korean Hangul, Japanese kana, CJK-only, other. No dialogue text retained.' }
result.checks.characters = (rows.characters ?? []).map(character => {
 const appearances=(rows.appearances??[]).filter(row=>row.character_id===character.character_id)
 const defaults=appearances.filter(row=>row.is_default)
 const hasMain=!!(defaults.find(row=>row.sheet_url)?.sheet_url ?? appearances.find(row=>row.sheet_url)?.sheet_url ?? character.view_main)
 return { characterId:character.character_id,name:character.name,entityType:character.entity_type,hasName:!!character.name?.trim(),hasAppearanceDescription:!!character.appearance?.trim(),appearanceCount:appearances.length,defaultAppearanceCount:defaults.length,defaultSheetPresent:defaults.some(row=>!!row.sheet_url),anySheetPresent:appearances.some(row=>!!row.sheet_url),legacyMainPresent:!!character.view_main,mainImagePresent:hasMain,portraitPresent:appearances.some(row=>!!row.portrait_url) }
})
result.checks.locations=(rows.locations??[]).map(row=>({locationId:row.location_id,name:row.name,mainImagePresent:!!row.wide_shot}))
try {
 const local=JSON.parse(readFileSync('.vercel/project.json','utf8'))
 const headers={Authorization:`Bearer ${env.VERCEL_TOKEN}`}
 const response=await fetch(`https://api.vercel.com/v9/projects/${local.projectId}?teamId=${local.orgId}`,{headers,signal:AbortSignal.timeout(20000)})
 if(!response.ok)throw Error(`Vercel project read HTTP ${response.status}`)
 const project=await response.json()
 const production=project.targets?.production
 result.checks.vercel={ projectId:project.id,name:project.name,framework:project.framework,gitProvider:project.link?.type,gitRepo:project.link?.repo,gitOrg:project.link?.org,productionBranch:project.link?.productionBranch??null,productionTarget:production?{id:production.id,url:production.url,readyState:production.readyState,createdAt:production.createdAt,gitBranch:production.meta?.githubCommitRef,gitCommit:production.meta?.githubCommitSha}:null }
 const deployments=await fetch(`https://api.vercel.com/v6/deployments?projectId=${local.projectId}&teamId=${local.orgId}&target=production&limit=3`,{headers,signal:AbortSignal.timeout(20000)})
 if(!deployments.ok)throw Error(`Vercel deployments read HTTP ${deployments.status}`)
 const list=await deployments.json()
 result.checks.vercel.recentProduction=(list.deployments??[]).map(deployment=>({id:deployment.uid,url:deployment.url,state:deployment.state,target:deployment.target,createdAt:deployment.createdAt,gitBranch:deployment.meta?.githubCommitRef,gitCommit:deployment.meta?.githubCommitSha}))
} catch(error) {result.gaps.push({check:'Vercel integration',error:redact(error)})}
result.gaps.push({check:'scope',error:'No production mutation, application handoff request, paid model run, image retrieval, or deployment was performed. URL presence does not verify image accessibility or visual quality.'})
writeFileSync(`${out}.json`,JSON.stringify(result,null,2))
console.log(JSON.stringify({output:`${out}.json`,roughFunctionCount:result.checks.roughFunction?.length,migrationRecorded:result.checks.roughMigration?.length,scenes:result.checks.savedContent.sceneCount,shots:result.checks.savedContent.shotCount,dialogue:total,characters:result.checks.characters,vercel:result.checks.vercel,gaps:result.gaps},null,2))
