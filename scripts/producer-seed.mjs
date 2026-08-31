#!/usr/bin/env node
// producer-seed.mjs — 프로듀서 산출물만 시드로 고정하고, 핸드오프 직전(producer 완료) 상태로
//   반복 리셋하는 하니스. producer → writer/artist 핸드오프 동작을 결정론적으로 재테스트하기 위함.
//   service-role 사용(머신/서버 전용). 자격증명은 .env.local.
//
// 경계:
//   - 프로듀서 시드(보존/복원): projects.producer_draft(cast/backgrounds/story/settings 스냅샷)
//       + story_text/settings/title/locale + messages(stage='producer') 채팅.
//   - writer/artist/director 산출물(reset 시 삭제): shots, scenes, characters, locations,
//       generation_jobs, writer_runs, video_clips, editor_states, camera_light_presets,
//       projects.design_tokens(LOOK), expanded_story, messages(stage!='producer').
//   - characters/locations 는 핸드오프 시 producer_draft 기반으로 재생성되므로 통째로 비운다.
//
// 사용:
//   node scripts/producer-seed.mjs snapshot [projectId]   # 프로듀서 시드를 fixture 파일로 캡처
//   node scripts/producer-seed.mjs clone                  # fixture → 새 프로젝트 stamp (검증용, 권장)
//   node scripts/producer-seed.mjs reset    [projectId]   # 다운스트림 삭제 + fixture 로 producer 상태 복원(in-place)
//   node scripts/producer-seed.mjs prune                  # clone 으로 만든 throwaway 프로젝트 일괄 삭제
//   node scripts/producer-seed.mjs status   [projectId]   # 현재 상태 요약
//
// 권장 검증 흐름: fixture=템플릿(pristine). 매 검증마다 `clone` 으로 새 프로젝트를 떠서
//   producer → writer/artist 핸드오프를 격리 검증하고, 다 쓰면 `prune` 으로 정리한다.
//   reset 은 URL 고정으로 한 프로젝트를 in-place 재사용하고 싶을 때의 보조 수단.
//
// projectId 생략 시 기본값(DEFAULT_PID) 사용. clone/prune 은 fixture 의 workspace 를 사용.

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = resolve(__dirname, 'fixtures/producer-seed.json')
const DEFAULT_PID = 'f123846a-a5bf-41ee-9d60-bbd812ecc7ef'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!URL || !SERVICE) {
  console.error('Missing SUPABASE URL / service-role key in .env.local')
  process.exit(1)
}
const s = createClient(URL, SERVICE, { auth: { persistSession: false } })

// reset 시 통째로 비우는 다운스트림(writer/artist/director) 테이블. shots → scenes 순(FK 안전).
const DOWNSTREAM_TABLES = [
  'shots',
  'scenes',
  'characters',
  'locations',
  'generation_jobs',
  'video_clips',
  'editor_states',
  'camera_light_presets',
  'writer_runs',
]

// clone 으로 만든 throwaway 프로젝트는 title 에 이 마커를 붙여 prune 대상으로 식별한다.
const CLONE_MARKER = '[seed-clone]'

async function snapshot(pid) {
  const { data: proj, error } = await s
    .from('projects')
    .select('title, workspace_id, story_text, settings, producer_draft, locale')
    .eq('id', pid)
    .maybeSingle()
  if (error) throw error
  if (!proj) throw new Error(`project ${pid} not found`)
  if (!proj.producer_draft) {
    console.warn('WARN: producer_draft 가 비어있음 — 프로듀서 산출물이 없는 프로젝트일 수 있다.')
  }

  const { data: messages, error: me } = await s
    .from('messages')
    .select('stage, role, content, created_at')
    .eq('project_id', pid)
    .eq('stage', 'producer')
    .order('created_at', { ascending: true })
  if (me) throw me

  const fixture = {
    sourceProjectId: pid,
    capturedAt: new Date().toISOString(),
    project: {
      title: proj.title,
      workspace_id: proj.workspace_id,
      story_text: proj.story_text,
      settings: proj.settings,
      producer_draft: proj.producer_draft,
      locale: proj.locale ?? 'en',
    },
    producerMessages: messages ?? [],
  }

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2))
  console.log(`snapshot → ${FIXTURE_PATH}`)
  console.log(
    `  cast=${proj.producer_draft?.cast?.length ?? 0}` +
      ` backgrounds=${proj.producer_draft?.backgrounds?.length ?? 0}` +
      ` producerMessages=${fixture.producerMessages.length}`,
  )
}

async function reset(pid) {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`fixture 없음(${FIXTURE_PATH}). 먼저 'snapshot' 을 실행해라.`)
  }
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))

  // 1. 다운스트림 산출물 전부 삭제.
  for (const table of DOWNSTREAM_TABLES) {
    const { error } = await s.from(table).delete().eq('project_id', pid)
    if (error) throw new Error(`reset ${table}: ${error.message}`)
  }

  // 2. 비-producer 스테이지 채팅 삭제(writer/artist/director 등).
  {
    const { error } = await s.from('messages').delete().eq('project_id', pid).neq('stage', 'producer')
    if (error) throw new Error(`reset messages(non-producer): ${error.message}`)
  }

  // 3. producer 채팅을 fixture 기준으로 결정론적 복원(기존 producer 채팅 제거 후 재삽입).
  {
    const { error: de } = await s.from('messages').delete().eq('project_id', pid).eq('stage', 'producer')
    if (de) throw new Error(`reset messages(producer clear): ${de.message}`)
    if (fixture.producerMessages?.length) {
      const rows = fixture.producerMessages.map((m) => ({
        project_id: pid,
        stage: 'producer',
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      }))
      const { error: ie } = await s.from('messages').insert(rows)
      if (ie) throw new Error(`reset messages(producer insert): ${ie.message}`)
    }
  }

  // 4. projects 컬럼을 핸드오프 직전 상태로 복원.
  const { error: pe } = await s
    .from('projects')
    .update({
      title: fixture.project.title,
      story_text: fixture.project.story_text,
      settings: fixture.project.settings,
      producer_draft: fixture.project.producer_draft,
      locale: fixture.project.locale,
      // 다운스트림/핸드오프 산출물 초기화.
      current_stage: 'producer',
      design_tokens: null,
      last_writer_run_id: null,
      expanded_story: '',
      locale_locked: false,
    })
    .eq('id', pid)
  if (pe) throw new Error(`reset projects: ${pe.message}`)

  console.log(`reset done → project ${pid} 는 producer 완료(핸드오프 직전) 상태.`)
  console.log('  /studio/producer?projectId=' + pid + ' 에서 "Complete your story" 로 핸드오프 재실행.')
}

function loadFixtureOrThrow() {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`fixture 없음(${FIXTURE_PATH}). 먼저 'snapshot' 을 실행해라.`)
  }
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
}

// fixture(템플릿) → 새 throwaway 프로젝트 stamp. 매 검증마다 격리된 신규 프로젝트로 핸드오프 테스트.
async function clone() {
  const fixture = loadFixtureOrThrow()
  const wsId = fixture.project.workspace_id
  if (!wsId) {
    throw new Error('fixture 에 workspace_id 없음 — snapshot 을 다시 실행해 workspace_id 를 캡처해라.')
  }
  const newId = randomUUID()
  const baseTitle = (fixture.project.title || 'Untitled').replace(` ${CLONE_MARKER}`, '')
  const title = `${baseTitle} ${CLONE_MARKER}`

  const { error: ie } = await s.from('projects').insert({
    id: newId,
    workspace_id: wsId,
    title,
    story_text: fixture.project.story_text,
    settings: fixture.project.settings,
    producer_draft: fixture.project.producer_draft,
    locale: fixture.project.locale,
    current_stage: 'producer',
    locale_locked: false,
    expanded_story: '',
  })
  if (ie) throw new Error(`clone projects insert: ${ie.message}`)

  if (fixture.producerMessages?.length) {
    const rows = fixture.producerMessages.map((m) => ({
      project_id: newId,
      stage: 'producer',
      role: m.role,
      content: m.content,
      created_at: m.created_at,
    }))
    const { error: me } = await s.from('messages').insert(rows)
    if (me) throw new Error(`clone messages insert: ${me.message}`)
  }

  console.log(`clone done → 새 프로젝트 ${newId} (${title})`)
  console.log(`  /studio/producer?projectId=${newId} 에서 "Complete your story" 로 핸드오프 검증.`)
  console.log(newId)
}

// clone 으로 만든 throwaway(title 에 CLONE_MARKER) 프로젝트를 자식 행까지 일괄 삭제.
async function prune() {
  const fixture = loadFixtureOrThrow()
  const wsId = fixture.project.workspace_id
  const { data: clones, error } = await s
    .from('projects')
    .select('id, title')
    .eq('workspace_id', wsId)
    .like('title', `%${CLONE_MARKER}%`)
  if (error) throw error
  if (!clones?.length) {
    console.log('prune: 삭제할 clone 없음.')
    return
  }
  for (const c of clones) {
    for (const table of DOWNSTREAM_TABLES) {
      const { error: de } = await s.from(table).delete().eq('project_id', c.id)
      if (de) throw new Error(`prune ${table} (${c.id}): ${de.message}`)
    }
    const { error: me } = await s.from('messages').delete().eq('project_id', c.id)
    if (me) throw new Error(`prune messages (${c.id}): ${me.message}`)
    const { error: pe } = await s.from('projects').delete().eq('id', c.id)
    if (pe) throw new Error(`prune projects (${c.id}): ${pe.message}`)
    console.log(`  deleted ${c.id}  ${c.title}`)
  }
  console.log(`prune done → ${clones.length} clone 삭제.`)
}

async function status(pid) {
  const { data: proj } = await s
    .from('projects')
    .select('title, current_stage, design_tokens, last_writer_run_id, producer_draft')
    .eq('id', pid)
    .maybeSingle()
  const out = {
    projectId: pid,
    title: proj?.title,
    current_stage: proj?.current_stage,
    has_design_tokens: proj?.design_tokens != null,
    last_writer_run_id: proj?.last_writer_run_id,
    producer_draft_cast: proj?.producer_draft?.cast?.length ?? 0,
    producer_draft_backgrounds: proj?.producer_draft?.backgrounds?.length ?? 0,
  }
  for (const t of [...DOWNSTREAM_TABLES, 'messages']) {
    const { count, error } = await s.from(t).select('*', { count: 'exact', head: true }).eq('project_id', pid)
    out[t] = error ? `ERR:${error.message}` : count
  }
  const { count: pmsg } = await s
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', pid)
    .eq('stage', 'producer')
  out['messages(producer)'] = pmsg
  console.log(JSON.stringify(out, null, 1))
}

const cmd = process.argv[2]
const pid = process.argv[3] || DEFAULT_PID
const run = { snapshot, clone, reset, prune, status }[cmd]
if (!run) {
  console.error('usage: node scripts/producer-seed.mjs <snapshot|clone|reset|prune|status> [projectId]')
  process.exit(1)
}
run(pid).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
