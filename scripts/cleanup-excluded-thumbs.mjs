#!/usr/bin/env node
// cleanup-excluded-thumbs.mjs — 화면에 안 뜨는 파일(생성용 임시 재료 등)에 잘못 만들어진
//   _thumb.webp 를 지운다. 백필이 필터 없이 돌던 시절(2026-07-17~08-12)의 산물 정리.
//   판정 규칙은 backfill-filter.mjs 의 제외 목록과 동일 — 두 스크립트가 같은 기준을 쓴다.
//
// 삭제는 되돌릴 수 없으므로 **기본은 미리보기(dry-run)** 다. 실제 삭제는 --apply 를 붙인다.
//
// 사용:
//   node scripts/cleanup-excluded-thumbs.mjs           # 지울 대상만 출력 (안전)
//   node scripts/cleanup-excluded-thumbs.mjs --apply   # 실제 삭제
//   node scripts/cleanup-excluded-thumbs.mjs --prefix <workspaceId>/<projectId>  # 특정 경로만
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

import { shouldDeleteThumb } from './backfill-filter.mjs'

dotenv.config({ path: '.env.local', quiet: true })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!URL || !SERVICE) {
  console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(1)
}
const s = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BUCKET = 'media'
const LIST_LIMIT = 100
const REMOVE_BATCH = 100

const APPLY = process.argv.includes('--apply')
const prefixIdx = process.argv.indexOf('--prefix')
const ROOT = prefixIdx !== -1 ? (process.argv[prefixIdx + 1] ?? '') : ''

async function listAll(prefix) {
  const out = []
  for (let offset = 0; ; offset += LIST_LIMIT) {
    const { data, error } = await s.storage
      .from(BUCKET)
      .list(prefix, { limit: LIST_LIMIT, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < LIST_LIMIT) break
  }
  return out
}

async function collect(prefix, targets) {
  const entries = await listAll(prefix)
  const folders = []
  for (const e of entries) {
    if (e.id == null) {
      folders.push(e.name)
      continue
    }
    const path = prefix ? `${prefix}/${e.name}` : e.name
    if (shouldDeleteThumb(path)) targets.push(path)
  }
  for (const f of folders) await collect(prefix ? `${prefix}/${f}` : f, targets)
}

console.log(
  `[cleanup-excluded-thumbs] bucket=${BUCKET} root='${ROOT || '(all)'}' ${APPLY ? '(APPLY — 실제 삭제)' : '(dry-run — --apply 를 붙여야 지운다)'}`,
)
const targets = []
await collect(ROOT, targets)
for (const t of targets) console.log(APPLY ? 'delete' : 'would delete', t)
if (!APPLY || targets.length === 0) {
  console.log(`\n대상 ${targets.length}개${APPLY ? '' : ' — 실제 삭제하려면 --apply'}`)
  process.exit(0)
}

let removed = 0
for (let i = 0; i < targets.length; i += REMOVE_BATCH) {
  const batch = targets.slice(i, i + REMOVE_BATCH)
  const { error } = await s.storage.from(BUCKET).remove(batch)
  if (error) {
    console.error('✗ 삭제 실패:', error.message)
    process.exit(1)
  }
  removed += batch.length
}
console.log(`\n완료: 삭제 ${removed}개`)
