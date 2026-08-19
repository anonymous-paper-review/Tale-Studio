#!/usr/bin/env node
// backfill-thumbnails.mjs — 기존 media 버킷의 원본 이미지에 _thumb.webp 썸네일을 일괄 생성한다 (방법 B).
//   src/lib/storage-thumb.ts 의 write-time 생성과 동일 규약(512px WebP q72). 멱등 — 이미 있으면 skip.
//   service-role 사용(머신/서버 전용). 자격증명은 .env.local.
//
// 사용:
//   node scripts/backfill-thumbnails.mjs            # 전체
//   node scripts/backfill-thumbnails.mjs --dry-run  # 만들지 않고 대상만 출력
//   node scripts/backfill-thumbnails.mjs --prefix <workspaceId>/<projectId>  # 특정 경로만
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import dotenv from 'dotenv'

import { shouldBackfill } from './backfill-filter.mjs'

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
const THUMB_WIDTH = 512
const THUMB_QUALITY = 72
const LIST_LIMIT = 100
const CONCURRENCY = 8

const DRY = process.argv.includes('--dry-run')
const prefixIdx = process.argv.indexOf('--prefix')
const ROOT = prefixIdx !== -1 ? (process.argv[prefixIdx + 1] ?? '') : ''

const IMG_EXT = /\.(png|jpe?g|webp)$/i
// 이미 썸네일인 파일은 건너뛴다: 우리가 만든 _thumb.webp, 그리고 영상 썸네일(_thumbnail.jpg 등,
//   Editor 가 clip.thumbnailUrl 로 직접 읽는 작은 이미지)은 재썸네일 불필요.
const isAlreadyThumb = (name) =>
  /_thumb\.webp$/i.test(name) || /_thumbnail\.(png|jpe?g|webp)$/i.test(name)
function thumbName(name) {
  const dot = name.lastIndexOf('.')
  return `${dot === -1 ? name : name.slice(0, dot)}_thumb.webp`
}

let scanned = 0
let made = 0
let skipped = 0
let excluded = 0
let failed = 0

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

// 트리를 훑어 만들 대상(orig→thumb) 목록만 수집한다(다운로드는 아래 풀에서 병렬).
async function collect(prefix, tasks) {
  const entries = await listAll(prefix)
  const names = new Set(entries.map((e) => e.name))
  const folders = []
  for (const e of entries) {
    if (e.id == null) {
      folders.push(e.name)
      continue
    }
    if (!IMG_EXT.test(e.name) || isAlreadyThumb(e.name)) continue
    const orig = prefix ? `${prefix}/${e.name}` : e.name
    // 화면에 안 뜨는 파일(생성용 임시 재료 등)은 제외 — 아무도 안 읽는 썸네일을 만들지 않는다.
    if (!shouldBackfill(orig)) {
      excluded++
      continue
    }
    scanned++
    const tName = thumbName(e.name)
    if (names.has(tName)) {
      skipped++
      continue
    }
    tasks.push({
      orig,
      thumb: prefix ? `${prefix}/${tName}` : tName,
    })
  }
  for (const f of folders) await collect(prefix ? `${prefix}/${f}` : f, tasks)
}

async function makeThumb({ orig, thumb }) {
  if (DRY) {
    console.log('would create', thumb)
    made++
    return
  }
  try {
    const { data: blob, error: dlErr } = await s.storage.from(BUCKET).download(orig)
    if (dlErr) throw dlErr
    const buf = Buffer.from(await blob.arrayBuffer())
    const out = await sharp(buf)
      .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer()
    const { error: upErr } = await s.storage
      .from(BUCKET)
      .upload(thumb, out, { contentType: 'image/webp', upsert: true })
    if (upErr) throw upErr
    made++
    if (made % 20 === 0) console.log(`  … ${made} thumbnails 생성`)
  } catch (err) {
    failed++
    console.warn('✗', orig, err instanceof Error ? err.message : err)
  }
}

// 동시성 풀 — 원본 다운로드가 느려 순차는 매우 느리다.
async function runPool(tasks, n) {
  let i = 0
  const worker = async () => {
    while (i < tasks.length) {
      const task = tasks[i++]
      await makeThumb(task)
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker))
}

console.log(
  `[backfill-thumbnails] bucket=${BUCKET} root='${ROOT || '(all)'}'${DRY ? ' (dry-run)' : ''}`,
)
const tasks = []
await collect(ROOT, tasks)
console.log(
  `대상 ${tasks.length}개 (스킵 ${skipped} · 제외 ${excluded}) — 생성 시작 (동시성 ${CONCURRENCY})`,
)
await runPool(tasks, CONCURRENCY)
console.log(
  `\n완료: 생성 ${made} · 스킵(이미있음) ${skipped} · 제외(화면 미노출) ${excluded} · 실패 ${failed} · 스캔(원본 이미지) ${scanned}`,
)
