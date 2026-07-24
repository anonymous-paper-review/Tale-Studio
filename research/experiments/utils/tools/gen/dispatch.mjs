#!/usr/bin/env node
// 공용 2-레인 생성 디스패처 — fal + higgsfield 를 동시에 굴려 병목 없이 이미지/영상을 뽑는다.
// 실험은 "무슨 잡을 만들지"(jobs.json)만 선언하고, 라우팅·동시성·resume·과금가드·프로버넌스는 여기서 처리.
//
// 사용:
//   node research/experiments/utils/tools/gen/dispatch.mjs \
//     --jobs <path/to/jobs.json> --assets <실험폴더>/assets [--mode speed|ab|fal|higgsfield]
//
// 모드:
//   speed (기본)  빈 레인이 아무 잡이나 집는다 → 최대 throughput, 프로버넌스 태깅(믹스 출력)
//   ab            두 프로바이더가 같은 잡을 각각 실행 → 파일 접미사 __fal/__hf 로 비교
//   fal | higgsfield  한 프로바이더에 고정 (재현성/품질판정 실험용)
//
// 옵션: --fal-concurrency N(4) --hf-concurrency N(4) --fal-cap N(50) --hf-cap N(50)
//        --only t2i,i2v  (task 필터)  --dry-run (생성 없이 계획+higgsfield 크레딧 견적)
//
// jobs.json = 배열. 각 원소:
//   { "id":"s01", "task":"t2i"|"edit"|"i2v", "prompt":"...",
//     "image":"shots/s01.jpg"(edit·i2v 입력, assets 상대경로/절대/URL),
//     "aspect":"16:9", "seconds":5, "seed":111(fal만), "out":"shots/s01.jpg" }
//
// resume: <assets>/gen_state.json 에 완료분 캐시 — 재실행 시 skip(재과금 방지).
// 산출: <assets>/<out> + <assets>/gen_state.json + <assets>/provenance.json(자산별 provider/model/jobId).

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { TASK_KIND, PROVIDERS, MODELS, supports } from './models.mjs'
import * as falProvider from './providers/fal.mjs'
import * as hfProvider from './providers/higgsfield.mjs'

const PROVIDER_IMPL = { fal: falProvider, higgsfield: hfProvider }

// ── args ──
function parseArgs(argv) {
  const a = { mode: 'speed', falConcurrency: 4, hfConcurrency: 4, falCap: 50, hfCap: 50, dryRun: false, only: null }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    const next = () => argv[++i]
    if (k === '--jobs') a.jobs = next()
    else if (k === '--assets') a.assets = next()
    else if (k === '--mode') a.mode = next()
    else if (k === '--fal-concurrency') a.falConcurrency = Number(next())
    else if (k === '--hf-concurrency') a.hfConcurrency = Number(next())
    else if (k === '--fal-cap') a.falCap = Number(next())
    else if (k === '--hf-cap') a.hfCap = Number(next())
    else if (k === '--only') a.only = new Set(next().split(',').map((s) => s.trim()))
    else if (k === '--dry-run') a.dryRun = true
    else throw new Error(`알 수 없는 인자: ${k}`)
  }
  if (!a.jobs) throw new Error('--jobs 필요')
  if (!a.assets) throw new Error('--assets 필요')
  if (!['speed', 'ab', 'fal', 'higgsfield'].includes(a.mode)) throw new Error(`--mode 잘못됨: ${a.mode}`)
  return a
}

const suffixOut = (out, provider) => {
  const ext = path.extname(out)
  return out.slice(0, out.length - ext.length) + (provider === 'fal' ? '__fal' : '__hf') + ext
}

// 모드별로 실행 단위(unit)를 만든다. unit = { job, provider|null, out, key }
function buildUnits(jobs, mode) {
  const units = []
  for (const job of jobs) {
    if (mode === 'ab') {
      for (const provider of PROVIDERS) {
        if (!supports(provider, job.task)) continue
        units.push({ job, provider, out: suffixOut(job.out, provider), key: `${job.id}__${provider}` })
      }
    } else if (mode === 'fal' || mode === 'higgsfield') {
      units.push({ job, provider: mode, out: job.out, key: job.id })
    } else {
      // speed — provider는 실행 시 결정
      units.push({ job, provider: null, out: job.out, key: job.id })
    }
  }
  return units
}

// ab 모드 i2v는 같은 프로바이더가 만든 이미지(__fal/__hf)를 입력으로 쓴다(프로버넌스 일관 체인).
function resolveImage(unit, mode, assetsDir) {
  const ref = unit.job.image
  if (!ref || mode !== 'ab' || /^https?:\/\//.test(ref)) return ref
  const cand = suffixOut(ref, unit.provider)
  return fs.existsSync(path.join(assetsDir, cand)) ? cand : ref
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buf)
  return buf.length
}

function checkWorkspace() {
  try {
    const out = execFileSync('higgsfield', ['workspace', 'status'], { encoding: 'utf8' }).trim()
    return { ok: !/no workspace/i.test(out), msg: out }
  } catch (e) {
    return { ok: false, msg: (e.stderr || e.message || '').toString().trim() }
  }
}

// ── dry-run: 생성 없이 계획 + higgsfield 크레딧 견적 ──
function costHiggsfield(job) {
  const spec = MODELS.higgsfield[job.task]
  if (!spec) return null
  const args = ['generate', 'cost', spec.jobType, '--prompt', job.prompt, '--json']
  if (job.aspect) args.push('--aspect_ratio', job.aspect)
  if (spec.resolution) args.push('--resolution', spec.resolution)
  if (TASK_KIND[job.task] === 'video') args.push('--duration', String(Math.min(15, Math.max(job.task === 'i2v_se' ? 4 : 3, Math.round(job.seconds ?? 5)))))
  try {
    const out = execFileSync('higgsfield', args, { encoding: 'utf8' })
    return JSON.parse(out).credits ?? null
  } catch { return null }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const assetsDir = path.resolve(args.assets)
  const statePath = path.join(assetsDir, 'gen_state.json')
  const provPath = path.join(assetsDir, 'provenance.json')

  let jobs = JSON.parse(fs.readFileSync(path.resolve(args.jobs), 'utf8'))
  if (!Array.isArray(jobs)) throw new Error('jobs.json 은 배열이어야 함')
  if (args.only) jobs = jobs.filter((j) => args.only.has(j.task))
  for (const j of jobs) {
    if (!j.id || !j.task || !j.out) throw new Error(`잡에 id/task/out 필수: ${JSON.stringify(j).slice(0, 80)}`)
    if (!TASK_KIND[j.task]) throw new Error(`알 수 없는 task '${j.task}' (id=${j.id})`)
  }

  const usesHf = args.mode === 'ab' || args.mode === 'higgsfield' || args.mode === 'speed'
  if (usesHf) {
    const ws = checkWorkspace()
    if (!ws.ok) throw new Error(`higgsfield 워크스페이스 미선택 — 'higgsfield workspace set <id>' 먼저. (${ws.msg})`)
  }

  fs.mkdirSync(assetsDir, { recursive: true })
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {}
  const saveState = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2))

  const units = buildUnits(jobs, args.mode)

  if (args.dryRun) {
    console.log(`[dry-run] mode=${args.mode}  jobs=${jobs.length}  units=${units.length}`)
    const byTask = {}
    let hfCredits = 0
    for (const u of units) {
      byTask[u.job.task] = (byTask[u.job.task] ?? 0) + 1
      const p = u.provider ?? 'speed(?)'
      const m = u.provider ? MODELS[u.provider]?.[u.job.task]?.model ?? MODELS[u.provider]?.[u.job.task]?.jobType : '동적'
      const done = state[u.key]?.done && fs.existsSync(path.join(assetsDir, u.out))
      console.log(`  ${done ? '✓skip' : '·'} ${u.job.id} ${u.job.task} → ${p}/${m} → ${u.out}`)
    }
    // higgsfield 크레딧 견적 (speed는 최악=전부 hf 가정)
    for (const j of jobs) { const c = costHiggsfield(j); if (c) hfCredits += c }
    console.log(`  task별: ${JSON.stringify(byTask)}`)
    console.log(`  higgsfield 크레딧 견적(전부 hf로 갈 때 최대): ~${hfCredits}`)
    return
  }

  // ── 실행: 이미지 단계 → 영상 단계 (i2v는 이미지 산출 의존) ──
  const attempts = { fal: 0, higgsfield: 0 }
  const caps = { fal: args.falCap, higgsfield: args.hfCap }
  const provenance = []

  async function runUnit(unit, provider) {
    const job = unit.job
    const outAbs = path.join(assetsDir, unit.out)
    if (state[unit.key]?.done && fs.existsSync(outAbs)) return 'skip'
    if (attempts[provider] >= caps[provider]) { console.error(`[${provider}] cap ${caps[provider]} 도달 — skip ${job.id}`); return 'cap' }
    attempts[provider]++
    const jobForRun = { ...job, image: resolveImage(unit, args.mode, assetsDir) }
    try {
      const { url, model, meta } = await PROVIDER_IMPL[provider].run(jobForRun, { assetsDir })
      const bytes = await download(url, outAbs)
      const entry = { done: true, provider, model, task: job.task, out: unit.out, url, bytes, jobId: meta.jobId ?? null, seed: meta.seed ?? undefined, seconds: TASK_KIND[job.task] === 'video' ? job.seconds ?? 5 : undefined, ts: new Date().toISOString() }
      state[unit.key] = entry
      provenance.push({ id: job.id, ...entry })
      saveState()
      console.log(`[${provider} ok] ${job.id} ${job.task} (${bytes}B) → ${unit.out}`)
      return 'ok'
    } catch (e) {
      console.error(`[${provider} fail] ${job.id} ${job.task}: ${(e?.message ?? e).toString().slice(0, 160)}`)
      return 'fail'
    }
  }

  // 한 단계(phase)의 unit들을 두 레인 워커로 소진.
  // 각 워커는 자기 프로바이더가 처리할 다음 미claim unit을 훑어 집는다.
  // speed(provider=null)는 아무 레인이나 집고, 집은 레인으로 프로버넌스를 확정한다.
  async function runPhase(phaseUnits) {
    const makeWorker = (provider) => async () => {
      for (;;) {
        // 자기 프로바이더가 처리할 다음 unit 탐색
        let u = null
        for (let i = 0; i < phaseUnits.length; i++) {
          const c = phaseUnits[i]
          if (c.claimed) continue
          if (c.provider === null || c.provider === provider) { c.claimed = true; u = c; break }
        }
        if (!u) return
        if (u.provider === null) u.provider = provider // speed: 이 레인이 실행 → 프로버넌스 확정
        await runUnit(u, provider)
      }
    }
    const activeProviders =
      args.mode === 'fal' ? ['fal'] :
      args.mode === 'higgsfield' ? ['higgsfield'] : PROVIDERS
    const workers = []
    for (const provider of activeProviders) {
      const n = provider === 'fal' ? args.falConcurrency : args.hfConcurrency
      for (let i = 0; i < n; i++) workers.push(makeWorker(provider)())
    }
    await Promise.all(workers)
  }

  const imageUnits = units.filter((u) => TASK_KIND[u.job.task] === 'image')
  const videoUnits = units.filter((u) => TASK_KIND[u.job.task] === 'video')

  if (imageUnits.length) { console.log(`=== 이미지 단계 (${imageUnits.length} units) ===`); await runPhase(imageUnits) }
  if (videoUnits.length) { console.log(`=== 영상 단계 (${videoUnits.length} units) ===`); await runPhase(videoUnits) }

  saveState()
  fs.writeFileSync(provPath, JSON.stringify({ mode: args.mode, attempts, provenance }, null, 2))

  const pending = units.filter((u) => !(state[u.key]?.done)).map((u) => `${u.job.id}(${u.provider ?? '?'})`)
  console.log('\n=== 요약 ===')
  console.log(`attempts: ${JSON.stringify(attempts)}`)
  console.log(`미완료: ${pending.join(', ') || '없음'}`)
  console.log(`프로버넌스: ${path.relative(process.cwd(), provPath)}`)
}

main().catch((e) => { console.error('FATAL', e?.message ?? e); process.exit(1) })
