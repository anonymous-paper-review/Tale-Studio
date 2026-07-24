#!/usr/bin/env node
// 결과 조립 + 원본 대조 (ffmpeg).
//   1) 리타임: Seedance 최소 4초 제약으로 클립이 콘티 길이보다 길다 → 트림이 아니라 setpts 배속 압축
//      (트림은 끝 프레임 도착을 잘라먹어 도착점 평가가 무효가 된다. 정지/미동 샷이라 배속 시각 왜곡 미미)
//   2) 팔별 6샷 concat → 18.9초 시퀀스 (24fps·1280x720·무음 통일)
//   3) 원본 정답 구간(5.77~24.67s) 추출
//   4) 정량: 샷별 첫 프레임 SSIM(입력 시작 프레임 대비 — 첫 프레임 고정 측정) +
//            끝 프레임 SSIM(의도한 끝 프레임 대비 — 도착점 정확도. A팔은 끝 입력이 없으므로 해당 없음)
//   5) 모자이크: [원본 | R | B1 / B2 | C | A] 3x2 라벨 스택 → 블라인드 리뷰용
//   산출: assets/compare/ 아래. 지표는 metrics.json + 표 출력.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const A = path.join(EXP, 'assets')
const C = path.join(A, 'compare')
const ORIG = `${process.env.HOME}/Downloads/ref/video_girls_in_mirror.mp4`
const DUR = { 1: 5.53, 2: 3.43, 3: 1.44, 4: 3.3, 5: 3.63, 6: 1.57 }
const SEG = { start: 5.77, end: 24.67 }
const ARMS = ['a', 'b1', 'b2', 'c', 'r']
const S = [1, 2, 3, 4, 5, 6]

const payloads = JSON.parse(fs.readFileSync(path.join(A, 'payloads/payloads.json'), 'utf8'))
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { encoding: 'utf8' })
const ffs = (args) => execFileSync('ffmpeg', ['-y', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const probeDur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }))

fs.mkdirSync(path.join(C, 'retimed'), { recursive: true })
fs.mkdirSync(path.join(C, 'frames'), { recursive: true })

// ── SSIM: 두 이미지 (해상도 720p 통일). ffmpeg는 SSIM 결과를 stderr로 내므로 spawnSync로 캡처.
function ssim2(imgA, imgB) {
  const r = spawnSync('ffmpeg', ['-y', '-i', imgA, '-i', imgB, '-filter_complex',
    '[0:v]scale=1280:720,format=yuv420p[a];[1:v]scale=1280:720,format=yuv420p[b];[a][b]ssim', '-f', 'null', '-'],
    { encoding: 'utf8' })
  const m = /All:([\d.]+)/.exec((r.stderr ?? '') + (r.stdout ?? ''))
  return m ? parseFloat(m[1]) : null
}

// ── 1) 원본 정답 구간 + 원본 샷별 세그먼트 ──
const origSeg = path.join(C, 'original_segment.mp4')
if (!fs.existsSync(origSeg))
  ff(['-ss', String(SEG.start), '-to', String(SEG.end), '-i', ORIG, '-vf', 'scale=1280:720,fps=24', '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', origSeg])

// ── 2) 리타임 + 팔별 concat ──
const metrics = []
for (const arm of ARMS) {
  const parts = []
  for (const n of S) {
    const src = path.join(A, `clips/arm-${arm}/s${n}.mp4`)
    const dst = path.join(C, `retimed/${arm}_s${n}.mp4`)
    const actual = probeDur(src)
    const factor = DUR[n] / actual
    if (!fs.existsSync(dst))
      ff(['-i', src, '-vf', `setpts=PTS*${factor.toFixed(6)},scale=1280:720,fps=24`, '-an', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', dst])
    parts.push(dst)

    // ── 4) 프레임 지표 ──
    const shot = payloads.arms[arm].shots.find((s) => s.shot === n)
    const first = path.join(C, `frames/${arm}_s${n}_first.jpg`)
    const last = path.join(C, `frames/${arm}_s${n}_last.jpg`)
    if (!fs.existsSync(first)) ff(['-i', src, '-frames:v', '1', '-q:v', '2', first])
    if (!fs.existsSync(last)) ff(['-sseof', '-0.15', '-i', src, '-vsync', '0', '-update', '1', '-q:v', '2', last])
    const startRef = shot.start_image ? path.join(EXP, shot.start_image) : path.join(A, `arm-c/frames/s${n}_start.jpg`)
    const endRef = shot.end_image ? path.join(EXP, shot.end_image) : null
    metrics.push({
      arm, shot: n,
      clip_s: Math.round(actual * 100) / 100,
      target_s: DUR[n],
      first_frame_ssim: ssim2(first, startRef),
      end_frame_ssim: endRef ? ssim2(last, endRef) : null,
    })
  }
  const listFile = path.join(C, `concat_${arm}.txt`)
  fs.writeFileSync(listFile, parts.map((p) => `file '${p}'`).join('\n'))
  const seq = path.join(C, `arm-${arm}_seq.mp4`)
  if (!fs.existsSync(seq)) ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', seq])
}

// ── 5) 블라인드 모자이크 (원본 + 5팔, 3x2, 무라벨·셔플 — design §5 정성 평가 규칙) ──
//    drawtext 미지원 빌드라 라벨은 어차피 불가 → 블라인드 원칙과 부합. 매핑은 mosaic_key.txt에.
const mosaic = path.join(C, 'mosaic_blind.mp4')
if (!fs.existsSync(mosaic)) {
  const order = ['original', 'b2', 'a', 'r', 'c', 'b1'] // 고정 셔플 (키 파일에 기록)
  const inputs = order.map((k) => (k === 'original' ? origSeg : path.join(C, `arm-${k}_seq.mp4`)))
  const fc = inputs.map((_, i) => `[${i}:v]scale=640:360[v${i}]`).join(';') + ';' +
    inputs.map((_, i) => `[v${i}]`).join('') +
    'xstack=inputs=6:layout=0_0|640_0|1280_0|0_360|640_360|1280_360[out]'
  ff([...inputs.flatMap((f) => ['-i', f]), '-filter_complex', fc, '-map', '[out]', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', mosaic])
  fs.writeFileSync(path.join(C, 'mosaic_key.txt'),
    '블라인드 순위 매긴 뒤에 열 것.\n좌상→우상, 좌하→우하 순서:\n' +
    order.map((k, i) => `  ${i + 1}. ${['좌상', '중상', '우상', '좌하', '중하', '우하'][i]} = ${k}`).join('\n') + '\n')
}

// ── 출력 ──
fs.writeFileSync(path.join(C, 'metrics.json'), JSON.stringify(metrics, null, 2))
const fmt = (v) => (v == null ? '  —  ' : v.toFixed(3))
console.log('arm  shot  clip_s  first_ssim  end_ssim')
for (const m of metrics) console.log(`${m.arm.padEnd(3)}  s${m.shot}    ${String(m.clip_s).padEnd(5)}  ${fmt(m.first_frame_ssim)}       ${fmt(m.end_frame_ssim)}`)
const byArm = {}
for (const m of metrics) {
  byArm[m.arm] ??= { first: [], end: [] }
  if (m.first_frame_ssim != null) byArm[m.arm].first.push(m.first_frame_ssim)
  if (m.end_frame_ssim != null) byArm[m.arm].end.push(m.end_frame_ssim)
}
console.log('\n팔별 평균: first / end')
for (const [arm, v] of Object.entries(byArm)) {
  const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : '—')
  console.log(`  ${arm}: ${avg(v.first)} / ${avg(v.end)}`)
}
console.log(`\n산출: ${path.relative(process.cwd(), C)}/ (arm-*_seq.mp4 · original_segment.mp4 · mosaic_blind.mp4 · metrics.json)`)
