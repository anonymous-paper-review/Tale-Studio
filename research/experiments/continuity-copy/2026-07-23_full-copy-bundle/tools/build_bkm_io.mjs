#!/usr/bin/env node
// BKM 입력↔출력 대조 문서 생성 → assets/arm-bkm/io_review.md
//   테이크마다 3열×2행 스트립 1장:
//     윗줄  = 넣은 것   [IN 시작 프레임 | (테이크 라벨) | IN 끝 프레임]
//     아랫줄 = 나온 것  [OUT 첫 프레임 | OUT 중간 | OUT 끝 프레임]
//   열이 시간축으로 정렬되므로 "시작이 시작대로, 끝이 끝대로 나왔나"가 세로 대조 한 번에 보인다.
//   (README.md 는 영상 생성 '직전' QC 게이트 문서 — 이 문서는 생성 '이후' 입출력 연결 리뷰)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = path.join(EXP, 'assets')
const F = path.join(A, 'arm-bkm/frames')
const CLIPS = path.join(A, 'clips/arm-bkm')
const T = path.join(A, 'arm-bkm/thumbs_io')
fs.mkdirSync(T, { recursive: true })

const { takes } = JSON.parse(fs.readFileSync(path.join(EXP, 'takes.json'), 'utf8'))
const jobs = JSON.parse(fs.readFileSync(path.join(EXP, 'jobs.bkm.json'), 'utf8'))

const CW = 300, CH = 169, PAD = 6, LH = 20 // 셀 300px — CONVENTIONS 규칙 3-2 ② 썸네일 폭 권장값

function ffprobeDuration(file) {
  return parseFloat(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
      encoding: 'utf8',
    }).trim(),
  )
}

function extractFrame(clip, sec, out) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(sec), '-i', clip, '-frames:v', '1', out])
}

const label = (text) =>
  Buffer.from(
    `<svg width="${CW}" height="${LH}"><text x="4" y="15" font-family="Helvetica" font-size="13" font-weight="bold" fill="#111">${text}</text></svg>`,
  )

async function cell(imgPath) {
  return sharp(imgPath).resize(CW, CH, { fit: 'cover' }).jpeg().toBuffer()
}

async function strip(t) {
  const out = path.join(T, `${t.id}_io.jpg`)
  if (fs.existsSync(out)) return
  const clip = path.join(CLIPS, `${t.id}.mp4`)
  const dur = ffprobeDuration(clip)
  const tmp = (k) => path.join(T, `.${t.id}_${k}.png`)
  extractFrame(clip, 0.0, tmp('first'))
  extractFrame(clip, dur / 2, tmp('mid'))
  extractFrame(clip, Math.max(0, dur - 0.15), tmp('last'))

  const W = CW * 3 + PAD * 4
  const rowH = LH + CH
  const H = rowH * 2 + PAD * 3
  const comps = []
  const put = async (col, row, img, text) => {
    const x = PAD + col * (CW + PAD)
    const y = PAD + row * (rowH + PAD)
    comps.push({ input: label(text), left: x, top: y })
    if (img) comps.push({ input: await cell(img), left: x, top: y + LH })
  }
  await put(0, 0, path.join(F, `${t.id}_start.jpg`), `IN start`)
  await put(1, 0, null, `${t.id} · ${t.cuts.join(',')} · ${t.secs}s`)
  await put(2, 0, path.join(F, `${t.id}_end.jpg`), `IN end`)
  await put(0, 1, tmp('first'), `OUT first (0.0s)`)
  await put(1, 1, tmp('mid'), `OUT mid (${(dur / 2).toFixed(1)}s)`)
  await put(2, 1, tmp('last'), `OUT last (${dur.toFixed(1)}s)`)

  await sharp({ create: { width: W, height: H, channels: 3, background: '#fff' } })
    .composite(comps)
    .jpeg({ quality: 85 })
    .toFile(out)
  for (const k of ['first', 'mid', 'last']) fs.unlinkSync(tmp(k))
}

const L = []
L.push('# BKM 입력↔출력 대조 — 테이크마다 "넣은 것 vs 나온 것" 한눈 보기')
L.push('')
L.push('> 테이크 27개. 각 스트립의 **윗줄이 넣은 것**(시작·끝 프레임), **아랫줄이 나온 것**(생성 영상의')
L.push('> 첫·중간·끝 프레임). 세로로 대조하면 된다 — 왼쪽 기둥(IN start ↕ OUT first)이 맞고')
L.push('> 오른쪽 기둥(IN end ↕ OUT last)이 맞으면 시작·끝 프레임 계약이 지켜진 것이고, 가운데(OUT mid)가')
L.push('> 그 사이 실제 궤적이다. 움직임·리듬은 정지 화면으로 판단 불가 — 수상한 테이크만 재생 경로의')
L.push('> 클립을 연다. 프롬프트 원문·QC 게이트는 [`README.md`](README.md), 원본 컷 대응은')
L.push('> [`../../conti_full.md`](../../conti_full.md), 실행 보고는 [`../bkm_run_report.md`](../bkm_run_report.md).')
L.push('')
for (const t of takes) {
  await strip(t)
  const job = jobs.find((j) => j.id === `bkm_${t.id}`)
  L.push(`## ${t.id} — 컷 ${t.cuts.join('·')} · ${t.secs}초${t.two ? ' · **2인(도플갱어)**' : ''}`)
  L.push('')
  L.push(`![](thumbs_io/${t.id}_io.jpg)`)
  L.push('')
  L.push(`- **재생**: \`assets/clips/arm-bkm/${t.id}.mp4\` · 입력 원본: \`${job.image}\` + \`${job.end_image}\``)
  L.push('')
}
fs.writeFileSync(path.join(A, 'arm-bkm/io_review.md'), L.join('\n'))
console.log(`io_review.md: ${takes.length}테이크 · thumbs_io ${fs.readdirSync(T).filter((f) => !f.startsWith('.')).length}장`)
