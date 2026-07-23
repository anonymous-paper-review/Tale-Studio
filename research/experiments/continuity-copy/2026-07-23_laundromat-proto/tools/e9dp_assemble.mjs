#!/usr/bin/env node
// E9d-proto 조립 (재현용). shotplan.json 순서대로:
//   1) 각 클립을 render_seconds로 트리밍 + 1280x720·24fps·H.264·yuv420p·무음 정규화.
//      영상이 없는 샷(생성 실패)은 첫 프레임 이미지를 render_seconds 프리즈 클립으로 대체(freeze-fallback).
//   2) 정규화 세그먼트를 순서대로 concat → final_60s.mp4 (H.264, 오디오 없음).
//   3) 1초 간격 필름스트립(contact sheet) filmstrip.jpg 생성.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const OUT_DIR = path.join(ROOT, 'research', 'experiments', 'continuity-copy', '2026-07-23_laundromat-proto', 'assets')
const SHOTS_DIR = path.join(OUT_DIR, 'shots')
const CLIPS_DIR = path.join(OUT_DIR, 'clips')
const TRIM_DIR = path.join(OUT_DIR, 'trimmed')
const FINAL = path.join(OUT_DIR, 'final_60s.mp4')
const FILMSTRIP = path.join(OUT_DIR, 'filmstrip.jpg')

const W = 1920, H = 1080, FPS = 24
const VF_NORM = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}`
const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
const ffprobe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString().trim())

fs.mkdirSync(TRIM_DIR, { recursive: true })
const shotplan = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'shotplan.json'), 'utf8'))
const shots = shotplan.shots

const segList = []
const report = []
for (const s of shots) {
  const clip = path.join(CLIPS_DIR, `${s.shot_id}.mp4`)
  const img = path.join(SHOTS_DIR, `${s.shot_id}.jpg`)
  const out = path.join(TRIM_DIR, `${s.shot_id}.mp4`)
  const dur = s.render_seconds
  let source
  if (fs.existsSync(clip)) {
    source = 'video'
    ff(['-i', clip, '-t', String(dur), '-vf', VF_NORM, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', out])
  } else if (fs.existsSync(img)) {
    source = 'freeze(image)'
    ff(['-loop', '1', '-i', img, '-t', String(dur), '-vf', VF_NORM, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', out])
  } else {
    console.error(`[assemble] ${s.shot_id}: no clip and no image — skipping`)
    continue
  }
  const actual = ffprobe(out)
  segList.push(out)
  report.push({ shot_id: s.shot_id, source, target: dur, actual: Math.round(actual * 100) / 100 })
  console.log(`[trim] ${s.shot_id.padEnd(8)} ${source.padEnd(14)} target=${dur}s actual=${actual.toFixed(2)}s`)
}

// concat (정규화 세그먼트 → 재인코딩 concat: timebase 안전)
const listFile = path.join(TRIM_DIR, '_concat.txt')
fs.writeFileSync(listFile, segList.map((f) => `file '${f}'`).join('\n'))
ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', FINAL])
const finalDur = ffprobe(FINAL)

// 필름스트립 (1초 간격 contact sheet)
const nFrames = Math.floor(finalDur)
const cols = 10
const rows = Math.ceil(nFrames / cols)
ff(['-i', FINAL, '-vf', `fps=1,scale=320:180,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', FILMSTRIP])

const summary = { final_seconds: Math.round(finalDur * 100) / 100, resolution: `${W}x${H}`, fps: FPS, segments: report.length, freeze_fallback: report.filter((r) => r.source.startsWith('freeze')).map((r) => r.shot_id), filmstrip_grid: `${cols}x${rows}`, segments_detail: report }
fs.writeFileSync(path.join(OUT_DIR, 'assembly_report.json'), JSON.stringify(summary, null, 2))
console.log(`\n[assemble] final_60s.mp4 = ${finalDur.toFixed(2)}s @ ${W}x${H} ${FPS}fps (${report.length} segments, ${summary.freeze_fallback.length} freeze-fallback)`)
console.log(`[assemble] filmstrip.jpg grid=${cols}x${rows} (${nFrames} frames)`)
