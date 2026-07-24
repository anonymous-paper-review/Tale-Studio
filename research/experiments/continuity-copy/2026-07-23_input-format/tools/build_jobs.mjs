#!/usr/bin/env node
// payloads.json → gen 디스패처 jobs.json 변환.
//   배치 가능분: A(6, 시작만) · B1(6, 시작+끝) · B2(6, 시작+끝) · B2β(1, 시트 통째) · R(6, 원본 시작+끝)
//               = 25 잡
//   배치 불가분: C 전체 → tools/run_arm_c_chain.mjs 가 처리.
//     샷 1·3·4는 B1과 입력이 동일하므로 B1 클립을 재사용(중복 과금 제거 + 시드 고정 불가라 별도 생성 시
//     B1 vs C 비교에 무관한 확률 변동이 섞임 — 재사용이 체이닝 변수를 완벽 격리), 샷 2·5·6은 앞 클립에서 체인.
//   task 는 전부 i2v_se (Seedance 2.0, 오너 확정 2026-07-23). duration은 프로바이더가 4~15초로 클램프.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const payloads = JSON.parse(fs.readFileSync(path.join(EXP, 'assets/payloads/payloads.json'), 'utf8'))

// payloads 경로("assets/...")는 실험 루트 기준 → 디스패처는 --assets 기준이므로 접두 제거
const rel = (p) => p.replace(/^assets\//, '')

const jobs = []
for (const [arm, def] of Object.entries(payloads.arms)) {
  for (const s of def.shots) {
    if (arm === 'c') continue // C 전체는 체인 러너 몫 (1·3·4 = B1 클립 재사용, 2·5·6 = 체인)
    jobs.push({
      id: `${arm}_s${s.shot}`,
      task: 'i2v_se',
      prompt: s.video_prompt,
      image: rel(s.start_image),
      ...(s.end_image && { end_image: rel(s.end_image) }),
      seconds: s.duration_s,
      aspect: '16:9',
      out: `clips/arm-${arm}/s${s.shot}.mp4`,
    })
  }
}
// B2β — 시트 통째 입력 1회 (판정 제외, 오작동 기록용)
const beta = payloads.arms.b2.beta
jobs.push({
  id: 'b2beta_full',
  task: 'i2v_se',
  prompt: beta.full_prompt,
  image: rel(beta.sheet_image),
  seconds: 15,
  aspect: '16:9',
  out: 'clips/arm-b2/beta_full.mp4',
})

const dest = path.join(EXP, 'jobs.json')
fs.writeFileSync(dest, JSON.stringify(jobs, null, 2))
console.log(`${jobs.length} jobs → ${path.relative(process.cwd(), dest)}`)
for (const j of jobs) console.log(`  ${j.id}  ${j.image}${j.end_image ? ' + ' + j.end_image : ''}  ${j.seconds}s`)
