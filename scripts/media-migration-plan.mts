#!/usr/bin/env node
// media-migration-plan.ts — 보관함 객체를 "옮길 것 / 버릴 것 / 사람이 정할 것"으로 분류해
//   집계를 찍고 이전용 목록 파일을 남긴다.
//
// 왜 데이터베이스에 직접 붙나: 요금 한도 초과로 보관함 API 가 막혀 있어도(402) Postgres 직결은
//   살아 있다. 차단이 관문 층에만 걸리기 때문이다. 그래서 서비스가 멈춘 상태에서도 계획을
//   세우고 검증할 수 있다. 파일을 실제로 옮기는 것은 차단이 풀린 뒤다.
//
// 판정 규칙은 `src/lib/storage/migration-plan.ts` 하나만 안다 — 이 스크립트는 규칙을
//   다시 쓰지 않는다. 규칙과 검증이 어긋나면 "옮겼다고 보고했는데 빠진" 상태를 못 잡는다.
//
// 사용:
//   node --import ./tests/fixtures/alias-hook.mjs scripts/media-migration-plan.mts
//   node --import ./tests/fixtures/alias-hook.mjs scripts/media-migration-plan.mts --out plan.json

import { writeFileSync } from 'node:fs'
import pg from 'pg'
import dotenv from 'dotenv'
import {
  classifyMediaObject,
  projectIdOfPath,
  type ClassifyContext,
  type MediaDisposition,
} from '@/lib/storage/migration-plan'

dotenv.config({ path: '.env.local', quiet: true })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const HOST = process.env.SUPABASE_DB_HOST
const PASSWORD = process.env.SUPABASE_DB_PASSWORD
if (!URL || !HOST || !PASSWORD) {
  console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_DB_HOST / SUPABASE_DB_PASSWORD 필요')
  process.exit(1)
}
const ref = URL.match(/https:\/\/([^.]+)\./)?.[1]
if (!ref) {
  console.error(`✗ NEXT_PUBLIC_SUPABASE_URL 에서 프로젝트 식별자를 못 읽었어요: ${URL}`)
  process.exit(1)
}

/** 제목이 시험·샘플로 보이는 프로젝트.
 *  판정에는 쓰지 않는다 — 이 파일들도 전부 옮긴다(옮겨두면 지울 수 있지만 안 옮기면
 *  되돌리기 어렵다). 다만 "나중에 버리면 얼마가 줄어드는지"는 알아야 결정할 수 있으므로
 *  옮기는 것 안에서 이 몫만 따로 집계해 보여준다. */
const TEST_TITLE = /(test|sample|viz|테스트)/i

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`
}

const client = new pg.Client({
  host: HOST,
  port: 5432,
  database: 'postgres',
  user: `postgres.${ref}`,
  password: PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
})

await client.connect()

const { rows: projectRows } = await client.query<{ id: string; title: string | null }>(
  'select id::text as id, title from projects',
)
const ctx: ClassifyContext = {
  liveProjectIds: new Set(projectRows.map((p) => p.id)),
}
const testProjectIds = new Set(
  projectRows.filter((p) => TEST_TITLE.test(p.title ?? '')).map((p) => p.id),
)

const { rows: objects } = await client.query<{ name: string; size: string | null }>(`
  select name, metadata->>'size' as size
  from storage.objects
  where bucket_id = 'media'
  order by name
`)
await client.end()

interface Bucket {
  files: number
  bytes: number
  reasons: Map<string, { files: number; bytes: number }>
}
const totals = new Map<MediaDisposition, Bucket>()
const manifest: Array<{ path: string; bytes: number; disposition: MediaDisposition; reason: string }> = []
/** 옮기는 것 중 시험·샘플 프로젝트 몫 — 이전 후 버릴지 정할 때 쓸 숫자. */
const testShare = { files: 0, bytes: 0 }

for (const row of objects) {
  const bytes = Number(row.size ?? 0)
  const { disposition, reason } = classifyMediaObject(row.name, ctx)

  let bucket = totals.get(disposition)
  if (!bucket) {
    bucket = { files: 0, bytes: 0, reasons: new Map() }
    totals.set(disposition, bucket)
  }
  bucket.files += 1
  bucket.bytes += bytes
  const byReason = bucket.reasons.get(reason) ?? { files: 0, bytes: 0 }
  byReason.files += 1
  byReason.bytes += bytes
  bucket.reasons.set(reason, byReason)

  manifest.push({ path: row.name, bytes, disposition, reason })

  if (disposition === 'migrate') {
    const projectId = projectIdOfPath(row.name)
    if (projectId && testProjectIds.has(projectId)) {
      testShare.files += 1
      testShare.bytes += bytes
    }
  }
}

const grandFiles = objects.length
const grandBytes = manifest.reduce((sum, m) => sum + m.bytes, 0)

const LABEL: Record<MediaDisposition, string> = {
  migrate: '옮긴다',
  'skip-temp': '안 옮긴다 — 생성용 임시물',
  'skip-orphan': '안 옮긴다 — 주인 없음',
  review: '사람이 정한다',
}
const ORDER: MediaDisposition[] = ['migrate', 'skip-temp', 'skip-orphan', 'review']

console.log(`\nmedia 버킷 ${grandFiles.toLocaleString()}개 · ${humanBytes(grandBytes)}`)
console.log(`살아 있는 프로젝트 ${ctx.liveProjectIds.size}개 (그중 시험·샘플 ${testProjectIds.size}개)\n`)

for (const disposition of ORDER) {
  const bucket = totals.get(disposition)
  if (!bucket) continue
  const share = ((bucket.bytes / grandBytes) * 100).toFixed(1)
  console.log(
    `■ ${LABEL[disposition]} — ${bucket.files.toLocaleString()}개 · ${humanBytes(bucket.bytes)} (${share}%)`,
  )
  for (const [reason, stat] of [...bucket.reasons].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`    ${stat.files.toLocaleString().padStart(6)}개 · ${humanBytes(stat.bytes).padStart(9)}  ${reason}`)
  }
  console.log()
}

const migrate = totals.get('migrate')
if (migrate) {
  console.log(
    `→ 지금 규칙대로면 ${migrate.files.toLocaleString()}개 · ${humanBytes(migrate.bytes)} 를 복사합니다.` +
      ` 전체의 ${((migrate.bytes / grandBytes) * 100).toFixed(0)}% 입니다.`,
  )
}
if (migrate && testShare.files) {
  const share = ((testShare.bytes / migrate.bytes) * 100).toFixed(0)
  console.log(
    `→ 그중 ${testShare.files.toLocaleString()}개 · ${humanBytes(testShare.bytes)} (${share}%) 가` +
      ` 시험·샘플 프로젝트입니다. 지금은 같이 옮기고, 버릴지는 이전이 끝난 뒤 정합니다.`,
  )
}
const review = totals.get('review')
if (review) {
  console.log(
    `→ ${review.files.toLocaleString()}개 · ${humanBytes(review.bytes)} 는 규칙이 판정하지 못했습니다. 확인이 필요합니다.`,
  )
}

const outFlag = process.argv.indexOf('--out')
if (outFlag !== -1 && process.argv[outFlag + 1]) {
  const path = process.argv[outFlag + 1]
  writeFileSync(path, JSON.stringify({ generatedFrom: ref, totalFiles: grandFiles, totalBytes: grandBytes, objects: manifest }, null, 2))
  console.log(`\n목록을 저장했어요: ${path}`)
}
