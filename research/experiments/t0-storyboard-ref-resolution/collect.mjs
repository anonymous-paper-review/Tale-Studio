// t0-storyboard-ref-resolution — 영상 발주에 들어가는 스토리보드 프레임의 실제 픽셀 크기 분포.
//   DB 조회 + 이미지 헤더만 디코드(전체 다운로드 최소화). 발주 0, 쓰기 0.
// 실행: node research/experiments/t0-storyboard-ref-resolution/collect.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

// PNG/JPEG/WebP 헤더에서 크기만 읽는다(전체 디코드 없음).
function sizeFromBuffer(buf) {
  // PNG: 8바이트 시그니처 + IHDR
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), fmt: 'png' }
  }
  // WebP: RIFF....WEBP
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const type = buf.toString('ascii', 12, 16)
    if (type === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), fmt: 'webp/vp8x' }
    if (type === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, fmt: 'webp/lossy' }
    if (type === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, fmt: 'webp/lossless' }
    }
  }
  // JPEG: SOFn 마커 탐색
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), fmt: 'jpeg' }
      }
      i += 2 + len
    }
  }
  return null
}

async function probe(url) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-65535' } })
    if (!res.ok && res.status !== 206) return { error: `HTTP ${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    const size = sizeFromBuffer(buf)
    const total = res.headers.get('content-range')?.split('/')?.[1] ?? res.headers.get('content-length')
    return size ? { ...size, bytes: total ? Number(total) : null } : { error: '헤더에서 크기 못 읽음' }
  } catch (e) {
    return { error: String(e).slice(0, 80) }
  }
}

const { data: runs } = await db.from('writer_runs').select('project_id').eq('status', 'completed')
const projectIds = [...new Set((runs ?? []).map((r) => r.project_id))]

const rows = []
for (const pid of projectIds) {
  const { data: shots } = await db
    .from('shots')
    .select('shot_id,storyboard_image,rough_storyboard')
    .eq('project_id', pid)
    .not('storyboard_image', 'is', null)
  for (const s of shots ?? []) {
    const sb = s.storyboard_image
    const start = sb?.frames?.start ?? null
    const end = sb?.frames?.end ?? null
    if (!start && !end) continue
    rows.push({
      project_id: pid,
      shot_id: s.shot_id,
      start_url: start,
      end_url: end,
      strip_url: sb?.stripUrl ?? null,
      single_url: sb?.url ?? null,
      status: sb?.status ?? null,
      rough_url: s.rough_storyboard?.url ?? null,
    })
  }
}

// 표본: 프로젝트당 최대 3샷(전수 다운로드 회피 — 티켓 "표본 추출" 지시)
const byProject = {}
for (const r of rows) (byProject[r.project_id] ??= []).push(r)
const sample = Object.values(byProject).flatMap((list) => list.slice(0, 3))

for (const r of sample) {
  if (r.start_url) r.start_size = await probe(r.start_url)
  if (r.end_url) r.end_size = await probe(r.end_url)
  if (r.strip_url) r.strip_size = await probe(r.strip_url)      // 경로 대조: 시트(스트립) 원본
  if (r.single_url) r.single_size = await probe(r.single_url)   // 경로 대조: 단일 이미지
  if (r.rough_url) r.rough_size = await probe(r.rough_url)      // 경로 대조: 러프 원본
}

const shorts = []
for (const r of sample) for (const k of ['start_size', 'end_size']) {
  const s = r[k]
  if (s?.w && s?.h) shorts.push({ shot: `${r.project_id.slice(0, 8)}/${r.shot_id}`, which: k, w: s.w, h: s.h, short: Math.min(s.w, s.h) })
}
const under720 = shorts.filter((s) => s.short < 720)
const bySize = {}
for (const s of shorts) bySize[`${s.w}x${s.h}`] = (bySize[`${s.w}x${s.h}`] ?? 0) + 1

// 경로별 대조 — 같은 샷의 시트/단일/러프는 얼마나 큰가
const pathCompare = sample.filter((r) => r.start_size?.w).map((r) => ({
  shot: `${r.project_id.slice(0, 8)}/${r.shot_id}`,
  frame: r.start_size?.w ? `${r.start_size.w}x${r.start_size.h}` : null,
  strip: r.strip_size?.w ? `${r.strip_size.w}x${r.strip_size.h}` : null,
  single: r.single_size?.w ? `${r.single_size.w}x${r.single_size.h}` : null,
  rough: r.rough_size?.w ? `${r.rough_size.w}x${r.rough_size.h}` : null,
}))

const out = {
  ticket: 't0-storyboard-ref-resolution',
  date: '2026-08-12',
  method: 'DB 조회 + 이미지 헤더 64KB 범위 요청으로 크기만 판독. 발주 0·쓰기 0.',
  projects_completed: projectIds.length,
  shots_with_frames: rows.length,
  sampled_shots: sample.length,
  frame_samples: shorts.length,
  under_720_short_side: under720.length,
  under_720_ratio: shorts.length ? +(under720.length / shorts.length).toFixed(3) : null,
  size_distribution: bySize,
  path_comparison: pathCompare,
  samples: sample,
}
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(out, null, 2))
console.log(`완료 프로젝트 ${projectIds.length} | 프레임 보유 샷 ${rows.length} | 표본 ${sample.length}샷 / 프레임 ${shorts.length}장`)
console.log(`짧은 변 <720: ${under720.length}/${shorts.length} (${(out.under_720_ratio * 100).toFixed(1)}%)`)
console.log('크기 분포:', JSON.stringify(bySize))
console.log('경로 대조 (프레임 / 스트립 / 단일 / 러프):')
for (const p of pathCompare) console.log(`  ${p.shot}: ${p.frame} / ${p.strip ?? '-'} / ${p.single ?? '-'} / ${p.rough ?? '-'}`)
