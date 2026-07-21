#!/usr/bin/env node
// ⚙️ SEED ONLY — 테스트 대상 아님. 백엔드 로직 재구현 0 (순수 DB insert).
//   실 테스트(핸드오프·재생성·director sync)는 브라우저가 실 UI로 수행한다.
//   설계: specs/e2e-real-flow-producer-to-director.md §2 (셋업).
//
// 하는 일: admin 워크스페이스에 fresh 프로젝트 1개 생성 + producer_draft(cast/backgrounds/settings/story)
//   시드 → 실 producer 게이트가 canHandoff=true 가 되게. characters/locations 테이블은 시드하지 않는다
//   (실 POST /api/writer/start 의 upsertProducerCast/Backgrounds 가 채우는 게 진짜 동작이므로).
//
// 사용: node e2e/scenarios/setup-real-flow-project.mjs
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '').trim()] }))

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ADMIN_WS = 'ce053575-62d5-4c8d-898f-34a1a5c6b40b'

// 카메라 모션이 의미있는 다이내믹 씬 (후속 카메라 A/B 대비: 팬/트래킹/줌).
const STORY = [
  '좁고 어두운 골목. 한 남자가 전력으로 달려 도망친다.',
  '숨을 몰아쉬며 뒤를 흘깃 돌아보고, 젖은 벽을 손으로 짚어 급히 방향을 꺾는다.',
  '골목 끝 희미한 가로등 불빛을 향해 내달린다 — 카메라가 그를 바짝 좇는다.',
].join(' ')

const settings = {
  genre: 'sci-fi',
  subGenre: 'thriller-to-action',
  playtime: 45, // 15~60s → D2 (짧고 저렴)
  format: 'horizontal_16:9',
  dialogueLanguage: 'ko',
  tone: ['스릴러'],
}

// 인물 1(풀 필드 — 어느 depth든 게이트 통과) + 배경 1(완성본).
const castLocalId = 'seed-' + randomUUID().slice(0, 8)
const bgLocalId = 'seed-' + randomUUID().slice(0, 8)
const producerDraft = {
  version: 1,
  savedAt: Date.now(),
  settings,
  storyText: STORY,
  storyReady: true,
  cast: [{
    localId: castLocalId,
    name: '도주자',
    entityType: 'person',
    appearance: '20대 후반 남성, 헝클어진 짧은 머리, 땀에 젖은 회색 후드, 낡은 운동화. 다급하고 겁에 질린 표정.',
    role: 'protagonist',
    arc: { start_state: '쫓기며 겁에 질림', end_state: '가까스로 벗어나 안도', arc_type: '생존/탈출' },
    motivation: { want: '추격자에게서 벗어나기', need: '안전한 곳에 도달' },
    origin: 'producer',
    userEdited: true,
  }],
  backgrounds: [{
    localId: bgLocalId,
    name: '뒷골목',
    visualDescription: '비에 젖어 번들거리는 좁은 뒷골목. 낮은 벽돌 건물 사이, 끝에 흐릿한 가로등 하나. 밤, 차가운 청록색 톤.',
    purpose: '추격/도주가 벌어지는 주 무대',
    origin: 'producer',
    userEdited: true,
  }],
}

const projectId = randomUUID()
const now = new Date().toISOString()
const { error } = await db.from('projects').insert({
  id: projectId,
  workspace_id: ADMIN_WS,
  title: `[e2e] 골목 추격 — ${new Date().toISOString().slice(0, 16)}`,
  story_text: STORY,
  settings,
  current_stage: 'producer',
  producer_draft: producerDraft,
  created_at: now,
  updated_at: now,
})
if (error) { console.error('insert 실패:', error.message); process.exit(1) }

// 게이트 셀프체크(하드 요건 재현)
const hard = []
if (!settings.genre) hard.push('genre')
if (!(settings.playtime >= 5 && settings.playtime <= 2400)) hard.push('playtime')
if (!settings.format) hard.push('format')
if (!settings.dialogueLanguage) hard.push('dialogueLanguage')
if (!producerDraft.storyReady) hard.push('storyText')
const p = producerDraft.cast[0]
if (!p.name || !p.appearance) hard.push('cast:fields')
const b = producerDraft.backgrounds[0]
if (!b.name || !b.visualDescription || !b.purpose) hard.push('background')

console.log('✓ fresh admin 프로젝트 생성:', projectId)
console.log('  workspace:', ADMIN_WS, '(admin@tale.studio)')
console.log('  stage: producer · playtime 45s(D2) · cast 1 · background 1')
console.log('  producer URL: ' + (env.APP_URL || 'http://localhost:3000') + '/studio/producer?project=' + projectId)
console.log(hard.length ? '⚠ 게이트 미충족: ' + hard.join(', ') : '✓ 게이트 하드요건 전부 충족 → canHandoff 예상 true')
