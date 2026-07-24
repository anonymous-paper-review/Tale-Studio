#!/usr/bin/env node
// 전편 조립 + 블라인드 모자이크 (생성 완료 후 실행).
//   BKM: 테이크 클립에서 편집 계획대로 컷 슬라이스(테이크 앞에서부터, 다중 컷 테이크는 순차 윈도우)
//        + s24 자리엔 검은 화면 1.8s 삽입 → 원본 컷 타이밍 67초 조립.
//   R  : 컷 클립 각각 [0, 컷길이] 트림 → 동일 조립.
//   BASE: writer 자생 샷 구조 그대로 concat (원본 타이밍 강제 없음 — 그게 BASE의 정의).
//   원본: 0~65.9s 추출. 전부 1280x720/24fps/무음 통일 → 2x2 블라인드 모자이크 + 키 파일.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = path.join(EXP, 'assets')
const C = path.join(A, 'compare')
const ORIG = `${process.env.HOME}/Downloads/ref/video_girls_in_mirror.mp4`
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' })
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }))

const B = [0, 0.37, 0.63, 1.2, 1.5, 1.63, 2.73, 3.87, 5.77, 11.3, 14.73, 16.17, 19.47, 23.1, 24.67, 27.73, 29.5, 33.03, 34.07, 35.47, 37.17, 38.67, 41.47, 46.97, 48.77, 50.77, 53.5, 55.9, 60.9, 61.8, 65.9]
const cutDur = (i) => B[i] - B[i - 1] // i = 1..30 (s01..s30)
const { takes } = JSON.parse(fs.readFileSync(path.join(EXP, 'takes.json'), 'utf8'))

fs.mkdirSync(path.join(C, 'seg'), { recursive: true })
const NORM = ['-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '24', '-s', '1280x720']

function seg(out, src, from, len) {
  if (fs.existsSync(out)) return out
  ff(['-ss', from.toFixed(3), '-i', src, '-t', len.toFixed(3), ...NORM, out])
  return out
}
function blackSeg(out, len) {
  if (fs.existsSync(out)) return out
  ff(['-f', 'lavfi', '-i', `color=black:s=1280x720:r=24:d=${len.toFixed(3)}`, ...NORM.filter((x) => x !== '-an'), '-an', out])
  return out
}
function concatSegs(listName, segs, out) {
  fs.writeFileSync(path.join(C, listName), segs.map((p) => `file '${p}'`).join('\n'))
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(C, listName), '-c', 'copy', out])
}

// ── BKM: 테이크 → 컷 슬라이스 ──
function assembleBkm() {
  const out = path.join(C, 'arm-bkm_full.mp4')
  const segs = []
  // 컷별 소스 테이크 + 테이크 내 오프셋(다중 컷 테이크는 순차 윈도우)
  const takeOffset = {}
  for (let i = 1; i <= 30; i++) {
    const id = 's' + String(i).padStart(2, '0')
    const len = cutDur(i)
    if (id === 's24') { segs.push(blackSeg(path.join(C, 'seg/bkm_s24.mp4'), len)); continue }
    const t = takes.find((tk) => tk.cuts.includes(id))
    const clip = path.join(A, `clips/arm-bkm/${t.id}.mp4`)
    if (!fs.existsSync(clip)) throw new Error(`BKM 클립 미완: ${t.id}`)
    const off = takeOffset[t.id] ?? 0
    const clipDur = dur(clip)
    const from = Math.min(off, Math.max(0, clipDur - len))
    segs.push(seg(path.join(C, `seg/bkm_${id}.mp4`), clip, from, Math.min(len, clipDur - from)))
    takeOffset[t.id] = off + len
  }
  concatSegs('concat_bkm.txt', segs, out)
  console.log('[bkm]', out, dur(out).toFixed(1) + 's')
}
// ── R: 컷 클립 트림 ──
function assembleR() {
  const out = path.join(C, 'arm-r_full.mp4')
  const segs = []
  for (let i = 1; i <= 30; i++) {
    const id = 's' + String(i).padStart(2, '0')
    const len = cutDur(i)
    if (id === 's24') { segs.push(blackSeg(path.join(C, 'seg/r_s24.mp4'), len)); continue }
    const clip = path.join(A, `clips/arm-r/${id}.mp4`)
    segs.push(seg(path.join(C, `seg/r_${id}.mp4`), clip, 0, Math.min(len, dur(clip))))
  }
  concatSegs('concat_r.txt', segs, out)
  console.log('[r]', out, dur(out).toFixed(1) + 's')
}
// ── BASE: 자생 구조 그대로 ──
function assembleBase() {
  const dir = path.join(A, 'clips/arm-base')
  if (!fs.existsSync(dir)) { console.log('[base] 클립 없음 — skip'); return null }
  const clips = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort()
  if (!clips.length) { console.log('[base] 클립 없음 — skip'); return null }
  const segs = clips.map((f, i) => seg(path.join(C, `seg/base_${i}.mp4`), path.join(dir, f), 0, dur(path.join(dir, f))))
  const out = path.join(C, 'arm-base_full.mp4')
  concatSegs('concat_base.txt', segs, out)
  console.log('[base]', out, dur(out).toFixed(1) + 's')
  return out
}
// ── 원본 ──
function original() {
  const out = path.join(C, 'original_full.mp4')
  if (!fs.existsSync(out)) ff(['-ss', '0', '-i', ORIG, '-t', '65.9', ...NORM, out])
  console.log('[orig]', out, dur(out).toFixed(1) + 's')
  return out
}
// ── 2x2 블라인드 모자이크 ──
function mosaic(hasBase) {
  const order = hasBase ? ['bkm', 'original', 'base', 'r'] : ['bkm', 'original', 'r']
  const file = (k) => path.join(C, k === 'original' ? 'original_full.mp4' : `arm-${k}_full.mp4`)
  const inputs = order.map(file)
  const n = inputs.length
  const layout = n === 4 ? '0_0|640_0|0_360|640_360' : '0_0|640_0|0_360'
  const fc = inputs.map((_, i) => `[${i}:v]scale=640:360[v${i}]`).join(';') + ';' +
    inputs.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${n}:layout=${layout}:fill=black[out]`
  const out = path.join(C, 'mosaic_blind_full.mp4')
  ff([...inputs.flatMap((f) => ['-i', f]), '-filter_complex', fc, '-map', '[out]', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out])
  fs.writeFileSync(path.join(C, 'mosaic_key_full.txt'),
    '블라인드 순위 매긴 뒤 열 것.\n' + order.map((k, i) => `${['좌상', '우상', '좌하', '우하'][i]} = ${k}`).join('\n') + '\n')
  console.log('[mosaic]', out)
}

const main = () => {
  original()
  assembleR()
  assembleBkm()
  const base = assembleBase()
  mosaic(!!base)
  console.log('done → assets/compare/')
}
main()
