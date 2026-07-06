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
//   ── skip-mode (커밋 전 실브라우저 점검용 셋업; README "Skip 모드") ──
//   newProject [title]        E2E 워크스페이스에 throwaway 프로젝트 생성 → `NEW_PROJECT <pid>`
//   skipArtist <pid>          seedCast + stubWorld + setStage artist (artist 게이트를 비용 0 으로 오픈)
//   skipWriter <pid>          seedCast + 씬/샷(대사) 시드 + rough_storyboard 스텁 + setStage writer (writer 멀티탭 게이트 비용 0)
//   stubWorld <pid>           로케이션 shot 더미 채움(autogen fal 호출 skip)
//   cookies [outPath]         E2E 세션 쿠키를 파일로 굽기(브라우저 주입용, 기본 tmp)
//   rmProject <pid>           throwaway 프로젝트 + 자식행 삭제
//   pruneSkip                 [e2e-skip] 프로젝트 일괄 삭제
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { createServerClient } from '@supabase/ssr'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

// ── skip-mode 셋업 (README "Skip 모드" 참고) ────────────────────────────────
// 세션에서 구현한 기능을 커밋 전에 실브라우저로 눌러보기 위한 최소 상태 준비.
// service-role 로 E2E 계정 워크스페이스에 throwaway 프로젝트를 만들고 게이트만 연다.
const SKIP_MARKER = '[e2e-skip]'
const STUB_IMG = 'https://example.com/e2e-stub.png' // autoGenerateBaseImages 우회용 더미(=fal 호출 0)

async function e2eWorkspace() {
  const { data: list } = await s.auth.admin.listUsers({ perPage: 1000 })
  const user = list?.users?.find((u) => u.email === process.env.E2E_EMAIL)
  if (!user) throw new Error('E2E_EMAIL 유저 없음 — .env.local / seed:test-accounts 확인')
  const { data: ws } = await s
    .from('workspaces')
    .select('id')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!ws) throw new Error('E2E 유저 워크스페이스 없음')
  return { user, workspaceId: ws.id }
}

// 새 throwaway 프로젝트(제목에 SKIP_MARKER) — 마지막 줄 `NEW_PROJECT <pid>`
async function newProject(titleArg) {
  const { workspaceId } = await e2eWorkspace()
  const title = `${SKIP_MARKER} ${titleArg || new Date().toISOString()}`
  const { data, error } = await s
    .from('projects')
    .insert({ workspace_id: workspaceId, title })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  console.log('NEW_PROJECT ' + data.id)
}

// 모든 로케이션 shot 을 더미로 채워 artist 진입 자동생성(fal) 을 skip → 비용 0
async function stubWorld(pid) {
  need(pid, 'projectId')
  const { error } = await s
    .from('locations')
    .update({ wide_shot: STUB_IMG, establishing_shot: STUB_IMG })
    .eq('project_id', pid)
  if (error) throw new Error(error.message)
  console.log('world shots stubbed (autogen skip) for', pid)
}

// seedCast + stubWorld + setStage artist 한 방 — artist UI 게이트를 비용 0 으로 연다
async function skipArtist(pid) {
  need(pid, 'projectId')
  await seedCast(pid)
  await stubWorld(pid)
  await setStage(pid, 'artist')
  console.log('SKIP_READY artist', pid)
}

// seedCast + 씬/샷(대사 포함) 시드 + rough_storyboard 스텁 + setStage writer 한 방.
// writer 멀티탭 뷰어(스토리보드/스크립트) 를 비용 0 으로 연다 — rough_storyboard 를 completed 더미로
// 채워 진입 자동생성(fal) 을 skip. 라인: L1=sc_01 heading, L2=sh_01_01 action, L3=sh_01_01 대사,
// L4=sh_01_02 action, L5/L6=sh_01_02 대사 2줄(→ L5/L6 이 대사 축소 가드 테스트 대상).
async function skipWriter(pid) {
  need(pid, 'projectId')
  await seedCast(pid)
  const stub = { url: STUB_IMG, status: 'completed', errorMessage: null, generatedAt: Date.now() }
  await s.from('scenes').delete().eq('project_id', pid)
  await s.from('shots').delete().eq('project_id', pid)
  const { error: se } = await s.from('scenes').insert({
    project_id: pid,
    scene_id: 'sc_01',
    narrative_summary: '카이가 폐허가 된 성에서 마지막 결투를 앞두고 있다.',
    location: '폐허가 된 성',
    time_of_day: 'dusk',
    mood: '긴장된',
    characters_present: ['char_hero'],
    estimated_duration_seconds: 30,
    sort_order: 0,
  })
  if (se) throw new Error('scene insert: ' + se.message)
  const shotRows = [
    {
      project_id: pid, scene_id: 'sc_01', shot_id: 'sh_01_01', shot_type: 'WS', sort_order: 0,
      action_description: '카이가 무너진 성벽 사이로 천천히 걸어 들어온다.',
      characters: ['char_hero'], duration_seconds: 6, generation_method: 'T2V',
      dialogue_lines: [{ characterId: 'char_hero', text: '드디어 여기까지 왔군.', emotion: '', delivery: '', durationHint: 0 }],
      rough_storyboard: stub,
    },
    {
      project_id: pid, scene_id: 'sc_01', shot_id: 'sh_01_02', shot_type: 'CU', sort_order: 1,
      action_description: '카이가 검을 뽑아 상대를 겨눈다.',
      characters: ['char_hero'], duration_seconds: 5, generation_method: 'T2V',
      dialogue_lines: [
        { characterId: 'char_hero', text: '각오는 됐겠지.', emotion: '', delivery: '', durationHint: 0 },
        { characterId: 'char_hero', text: '물러설 곳은 없어.', emotion: '', delivery: '', durationHint: 0 },
      ],
      rough_storyboard: stub,
    },
  ]
  const { error: she } = await s.from('shots').insert(shotRows)
  if (she) throw new Error('shots insert: ' + she.message)
  await setStage(pid, 'writer')
  console.log('SKIP_READY writer', pid)
}

// E2E 계정 @supabase/ssr 세션 쿠키를 굽어 파일로 저장(브라우저 주입용). 기본 tmp 경로.
async function cookies(outPath) {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const out = outPath || join(tmpdir(), 'e2e-cookies.json')
  const anon = createClient(URL, anonKey, { auth: { persistSession: false } })
  const { data: signIn, error } = await anon.auth.signInWithPassword({
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
  })
  if (error) throw error
  const jar = []
  const ssr = createServerClient(URL, anonKey, {
    cookies: { getAll: () => jar, setAll: (cs) => cs.forEach(({ name, value }) => jar.push({ name, value })) },
  })
  await ssr.auth.setSession({
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
  })
  writeFileSync(out, JSON.stringify({ userId: signIn.user.id, cookies: jar }))
  console.log('COOKIES ' + out + ' (' + jar.length + ')')
}

// throwaway 프로젝트 + 자식행 삭제
const CHILD_TABLES = [
  'shots', 'scenes', 'generation_jobs', 'character_image_candidates',
  'location_image_candidates', 'characters', 'locations', 'writer_runs',
  'editor_states', 'video_clips', 'messages',
]
async function rmProject(pid) {
  need(pid, 'projectId')
  for (const t of CHILD_TABLES) {
    const { error } = await s.from(t).delete().eq('project_id', pid)
    if (error && !/does not exist|column/.test(error.message)) console.error(t, 'del:', error.message)
  }
  const { error } = await s.from('projects').delete().eq('id', pid)
  if (error) throw new Error(error.message)
  console.log('removed project', pid)
}

// SKIP_MARKER 붙은 throwaway 프로젝트 일괄 삭제(E2E 워크스페이스 한정)
async function pruneSkip() {
  const { workspaceId } = await e2eWorkspace()
  const { data } = await s
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .like('title', SKIP_MARKER + '%')
  for (const p of data ?? []) await rmProject(p.id)
  console.log('pruned', (data ?? []).length, 'skip projects')
}

const map = { seedCast, chars, locs, candidates, jobs, setStage, setLook, clearLook, failRun, runs, loginCheck, newProject, stubWorld, skipArtist, skipWriter, cookies, rmProject, pruneSkip }
const fn = map[cmd]
if (!fn) {
  console.error('cmd 미지정/오타:', cmd, '\n사용 가능:', Object.keys(map).join(', '), '\n(상단 주석 또는 e2e/README.md 참고)')
  process.exit(1)
}
await fn(projectId, arg3)
