#!/usr/bin/env node
// Artist 파이프라인 라이브 e2e 하니스 — service-role DB 제어 평면.
//
// 목적: artist 이미지 파이프라인(C1~C5)을 실제 fal 생성 + ngrok webhook 으로 검증할 때
//   필요한 "시드/조회/상태조작" 을 한 곳에 모은다. 인증이 필요한 라우트 구동·UI 확인은
//   브라우저(에이전트 도구) 또는 Playwright(아래 README 참고)로 하고, 이 스크립트는
//   service-role 로 DB 만 만지는 결정론적 검증/시드용이다.
//
// 사용: node e2e/harness.mjs <cmd> <projectId> [arg]
//   환경: .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (+ E2E_* 계정).
//
// 명령:
//   seedCast <pid>            카이(char_hero) + 폐허 성(loc_castle) 시드 (origin='producer', view_main=null)
//   chars <pid>               characters (character_id, view_main, appearance, costume)
//   locs <pid>                locations (location_id, visual_description)
//   candidates <pid>          character_image_candidates + location_image_candidates (view/source_hash/is_selected)
//   jobs <pid>                generation_jobs (kind/actor/status/target/source_hash/look_present)
//   setStage <pid> <stage>    projects.current_stage 변경 (artist UI 게이트 열기)
//   setLook <pid> <json>      projects.design_tokens 설정 (writer v2_design 룩 도착 시뮬 — stale 전파 트리거)
//   clearLook <pid>           projects.design_tokens = null (룩 부재 복원)
//   failRun <pid>             최신 writer_run 을 failed 로 (핸드오프 후 텍스트 파이프라인 비용 캡)
//   runs <pid>                writer_runs 상태
//   loginCheck                E2E_EMAIL/E2E_PASSWORD 로 anon 로그인 가능 여부 확인
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!URL || !SERVICE) {
  console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(1)
}
const s = createClient(URL, SERVICE, { auth: { persistSession: false } })
const [cmd, projectId, arg3] = process.argv.slice(2)
const j = (x) => JSON.stringify(x, null, 1)
const need = (v, name) => {
  if (!v) {
    console.error(`✗ ${name} 인자 필요`)
    process.exit(1)
  }
}

async function seedCast(pid) {
  need(pid, 'projectId')
  const { error: ce } = await s.from('characters').upsert(
    [
      {
        project_id: pid,
        character_id: 'char_hero',
        name: '카이',
        role: 'protagonist',
        entity_type: 'person',
        appearance: '20대 여성 검사, 은발 단발, 붉은 가죽 갑옷, 왼쪽 이마에 가는 흉터, 날카로운 회색 눈',
        description: '20대 여성 검사, 은발 단발, 붉은 가죽 갑옷',
        origin: 'producer',
      },
    ],
    { onConflict: 'project_id,character_id' },
  )
  if (ce) throw new Error('char upsert: ' + ce.message)
  const locRow = {
    project_id: pid,
    location_id: 'loc_castle',
    name: '폐허가 된 성',
    visual_description: '무너진 돌 성벽, 짙은 안개, 황혼의 주황빛, 깨진 스테인드글라스',
    style_description: '무너진 돌 성벽, 짙은 안개, 황혼의 주황빛, 깨진 스테인드글라스',
    purpose: '클라이맥스 결투 무대',
    origin: 'producer',
    user_edited: false,
  }
  const { data: ex } = await s.from('locations').select('location_id').eq('project_id', pid).eq('location_id', 'loc_castle')
  const q = ex && ex.length
    ? s.from('locations').update(locRow).eq('project_id', pid).eq('location_id', 'loc_castle')
    : s.from('locations').insert(locRow)
  const { error: le } = await q
  if (le) throw new Error('loc upsert: ' + le.message)
  console.log('seeded char_hero + loc_castle for', pid)
}

async function chars(pid) {
  need(pid, 'projectId')
  const { data, error } = await s
    .from('characters')
    .select('character_id, name, role, appearance, costume, view_main')
    .eq('project_id', pid)
  if (error) throw new Error(error.message)
  console.log(j(data))
}

async function locs(pid) {
  need(pid, 'projectId')
  const { data, error } = await s.from('locations').select('location_id, name, visual_description').eq('project_id', pid)
  if (error) throw new Error(error.message)
  console.log(j(data))
}

async function candidates(pid) {
  need(pid, 'projectId')
  const { data: cc } = await s
    .from('character_image_candidates')
    .select('id, character_id, view, source_hash, is_selected, generated_at')
    .eq('project_id', pid)
    .order('generated_at', { ascending: true })
  const { data: lc } = await s
    .from('location_image_candidates')
    .select('id, location_id, view, source_hash, is_selected, pinned, variant_key, generated_at')
    .eq('project_id', pid)
    .order('generated_at', { ascending: true })
  console.log(j({ character: cc ?? [], location: lc ?? [] }))
}

async function jobs(pid) {
  need(pid, 'projectId')
  const { data, error } = await s
    .from('generation_jobs')
    .select('id, kind, actor, status, target, input_snapshot, created_at')
    .eq('project_id', pid)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  console.log(
    j(
      (data ?? []).map((r) => ({
        kind: r.kind,
        actor: r.actor,
        status: r.status,
        target: r.target,
        source_hash: r.input_snapshot?.source_hash ?? null,
        look_present: r.input_snapshot?.look_present ?? null,
      })),
    ),
  )
}

async function setStage(pid, stage) {
  need(pid, 'projectId')
  need(stage, 'stage')
  const { error } = await s.from('projects').update({ current_stage: stage }).eq('id', pid)
  if (error) throw new Error(error.message)
  console.log(`current_stage=${stage} for ${pid}`)
}

async function setLook(pid, jsonStr) {
  need(pid, 'projectId')
  need(jsonStr, 'json')
  const { error } = await s.from('projects').update({ design_tokens: JSON.parse(jsonStr) }).eq('id', pid)
  if (error) throw new Error(error.message)
  console.log('design_tokens set for', pid)
}

async function clearLook(pid) {
  need(pid, 'projectId')
  const { error } = await s.from('projects').update({ design_tokens: null }).eq('id', pid)
  if (error) throw new Error(error.message)
  console.log('design_tokens cleared for', pid)
}

async function failRun(pid) {
  need(pid, 'projectId')
  const { data: r } = await s
    .from('writer_runs')
    .select('id, status')
    .eq('project_id', pid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!r) {
    console.log('no run')
    return
  }
  const { error } = await s.from('writer_runs').update({ status: 'failed', error: 'e2e cost cap' }).eq('id', r.id)
  if (error) throw new Error(error.message)
  console.log('failed run', r.id, '(was', r.status + ')')
}

async function runs(pid) {
  need(pid, 'projectId')
  const { data } = await s
    .from('writer_runs')
    .select('id, status, current_stage, completed_units, total_units')
    .eq('project_id', pid)
    .order('created_at', { ascending: false })
  console.log(j(data ?? []))
}

async function loginCheck() {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const u = createClient(URL, anon, { auth: { persistSession: false } })
  const { data, error } = await u.auth.signInWithPassword({
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
  })
  if (error) {
    console.error('LOGIN_FAIL', error.message)
    process.exit(1)
  }
  console.log('LOGIN_OK user=' + data.user.id + ' confirmed=' + !!data.user.email_confirmed_at)
}

const map = { seedCast, chars, locs, candidates, jobs, setStage, setLook, clearLook, failRun, runs, loginCheck }
const fn = map[cmd]
if (!fn) {
  console.error('cmd 미지정/오타:', cmd, '\n사용 가능:', Object.keys(map).join(', '), '\n(상단 주석 또는 e2e/README.md 참고)')
  process.exit(1)
}
await fn(projectId, arg3)
