#!/usr/bin/env node
// backfill-portraits.mjs — 기존 캐릭터 포트레이트를 #portrait-paper-trim 규약으로 재크롭한다.
//   시트 생성 모델이 CONCEPT 박스보다 그림을 좁게 그리면 고정 비율 크롭이 순백 종이 띠를
//   물고 들어온다(오너 실측: 카드 흰 바). view_main 시트에서 다시 크롭 + 순백 가장자리 트림 후
//   같은 경로에 upsert, _thumb.webp 재생성, characters.portrait 의 ?v= 를 갱신해 캐시를 깬다.
//   크롭 좌표·트림 임계는 src/lib/artist/portrait.ts 와 동일 규약(스크립트 복제 — 레포 관행).
//
// 사용:
//   node scripts/backfill-portraits.mjs            # 전체
//   node scripts/backfill-portraits.mjs --dry-run  # 대상만 출력
//   node scripts/backfill-portraits.mjs --project <projectId>
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
if (!URL || !SERVICE) {
  console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(1)
}
const s = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const BUCKET = 'media'
const DRY = process.argv.includes('--dry-run')
const projArgIdx = process.argv.indexOf('--project')
const ONLY_PROJECT = projArgIdx >= 0 ? process.argv[projArgIdx + 1] : null

// ── src/lib/artist/portrait.ts 와 동일 규약 ──
// ⚠️ REGION 은 v2 템플릿 좌표다. 2026-08-27 v3 템플릿부터 레이아웃이 달라졌으므로 이 스크립트를
//   v3 시트에 돌리면 엉뚱한 크롭이 된다 — v3 는 finalize 가 생성 시 스펙 파생 좌표로 크롭한다.
const REGION = { x0: 0.0135, y0: 0.0611, x1: 0.3094, y1: 0.4102 }
const PAPER_WHITE_MIN = 240
const PAPER_FLAT_FRAC = 0.98
const PAPER_MAX_TRIM_FRAC = 0.1
const BORDER_DARK_MAX_MEAN = 215
const BORDER_MAX_PX = 4
const THUMB_WIDTH = 512
const THUMB_QUALITY = 72

async function trimFlatPaperEdges(buf) {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const colStats = (x) => {
    let white = 0, sum = 0
    for (let y = 0; y < h; y++) { const v = data[y * w + x]; sum += v; if (v >= PAPER_WHITE_MIN) white++ }
    return { paperFrac: white / h, mean: sum / h }
  }
  const rowStats = (y) => {
    let white = 0, sum = 0
    const base = y * w
    for (let x = 0; x < w; x++) { const v = data[base + x]; sum += v; if (v >= PAPER_WHITE_MIN) white++ }
    return { paperFrac: white / w, mean: sum / w }
  }
  const trimSide = (limit, statAt) => {
    let n = 0
    while (n < limit && statAt(n).paperFrac >= PAPER_FLAT_FRAC) n++
    if (n > 0) {
      let border = 0
      while (n < limit && border < BORDER_MAX_PX && statAt(n).mean <= BORDER_DARK_MAX_MEAN) { n++; border++ }
    }
    return n
  }
  const maxX = Math.floor(w * PAPER_MAX_TRIM_FRAC)
  const maxY = Math.floor(h * PAPER_MAX_TRIM_FRAC)
  const left = trimSide(maxX, (i) => colStats(i))
  const right = trimSide(maxX, (i) => colStats(w - 1 - i))
  const top = trimSide(maxY, (i) => rowStats(i))
  const bottom = trimSide(maxY, (i) => rowStats(h - 1 - i))
  if (!left && !right && !top && !bottom) return { buf, trimmed: null }
  const out = await sharp(buf)
    .extract({ left, top, width: w - left - right, height: h - top - bottom })
    .png()
    .toBuffer()
  return { buf: out, trimmed: { left, right, top, bottom } }
}

/** 공개 URL → 스토리지 object path (쿼리 제거 + /object/public/media/ 프리픽스 제거). */
function objectPathOf(url) {
  const clean = url.split('?')[0]
  const marker = `/object/public/${BUCKET}/`
  const i = clean.indexOf(marker)
  return i < 0 ? null : decodeURIComponent(clean.slice(i + marker.length))
}

const { data: rows, error } = await s
  .from('characters')
  .select('project_id, character_id, name, entity_type, view_main, portrait')
  .not('view_main', 'is', null)
  .not('portrait', 'is', null)
if (error) throw error

let done = 0
let skipped = 0
let failed = 0
for (const row of rows) {
  if (ONLY_PROJECT && row.project_id !== ONLY_PROJECT) continue
  if (row.entity_type === 'object') continue
  // 크롭 산 포트레이트만 — 폴백(portrait=main 원본)은 대상 아님.
  if (!row.portrait.includes('_portrait.png')) {
    skipped++
    continue
  }
  const portraitPath = objectPathOf(row.portrait)
  if (!portraitPath) {
    skipped++
    continue
  }
  try {
    const res = await fetch(row.view_main.split('?')[0])
    if (!res.ok) throw new Error(`sheet fetch ${res.status}`)
    const sheet = Buffer.from(await res.arrayBuffer())
    const meta = await sharp(sheet).metadata()
    if (!meta.width || !meta.height || meta.width / meta.height < 1.4) {
      skipped++
      continue
    }
    const raw = await sharp(sheet)
      .extract({
        left: Math.round(meta.width * REGION.x0),
        top: Math.round(meta.height * REGION.y0),
        width: Math.round(meta.width * (REGION.x1 - REGION.x0)),
        height: Math.round(meta.height * (REGION.y1 - REGION.y0)),
      })
      .png()
      .toBuffer()
    const { buf: portrait, trimmed } = await trimFlatPaperEdges(raw)
    const label = `${row.project_id.slice(0, 8)}/${row.character_id}(${row.name ?? ''})`
    if (!trimmed) {
      console.log(`= ${label} — 띠 없음, 그대로`)
      skipped++
      continue
    }
    if (DRY) {
      console.log(`~ ${label} — trim L${trimmed.left} R${trimmed.right} T${trimmed.top} B${trimmed.bottom} (dry)`)
      done++
      continue
    }
    const up = await s.storage.from(BUCKET).upload(portraitPath, portrait, {
      contentType: 'image/png',
      upsert: true,
    })
    if (up.error) throw up.error
    const thumb = await sharp(portrait)
      .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer()
    const thumbPath = portraitPath.replace(/\.png$/, '_thumb.webp')
    const upT = await s.storage.from(BUCKET).upload(thumbPath, thumb, {
      contentType: 'image/webp',
      upsert: true,
    })
    if (upT.error) throw upT.error
    const freshUrl = `${row.portrait.split('?')[0]}?v=${Date.now()}`
    const upd = await s
      .from('characters')
      .update({ portrait: freshUrl })
      .eq('project_id', row.project_id)
      .eq('character_id', row.character_id)
    if (upd.error) throw upd.error
    console.log(`✓ ${label} — trim L${trimmed.left} R${trimmed.right} T${trimmed.top} B${trimmed.bottom}`)
    done++
  } catch (e) {
    failed++
    console.error(`✗ ${row.project_id}/${row.character_id}:`, e instanceof Error ? e.message : e)
  }
}
console.log(`\n완료: 재크롭 ${done} · 스킵 ${skipped} · 실패 ${failed}${DRY ? ' (dry-run)' : ''}`)
