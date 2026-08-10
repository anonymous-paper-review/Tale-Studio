// previz 채널 ablation — 판정기.
//   prep : A1 출력을 제품 크롭(cropRoughGridFrames)으로 3패널 분해 + A2 클립에서 첫/중간/마지막 프레임 추출
//   judge: VLM 1차 판정 (사전 등록 체크리스트) → results.json
//   usage: run.mts collect 이후 → score.mts prep && score.mts judge
//
// 판정 설계 메모: 선행 실험(2026-08-07 viz-gap)의 결론 "절대 판정보다 짝지음 비교가 신뢰성 있는 오라클"에 따라
//   모든 1차 판정을 **레퍼런스와 나란히 놓는 짝지음**으로 구성했다. 다만 사전 등록된 측정은
//   클립별 절대 이진 판정("마지막 1초가 END 프레임 구도와 일치하는가")이므로 그것을 **주 지표**로 계산하고,
//   2AFC(두 팔의 마지막 프레임을 무작위 순서로 놓고 END 에 더 가까운 쪽 고르기)는 **보조 강건성 검사**로만 쓴다.
import { config } from 'dotenv'
config({ path: '.env.local' })

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vlmJson, imgPart, JUDGE_MODEL, type Part } from './judge.mts'

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const ASSETS = join(RUN, 'assets')
const PANELS = join(RUN, 'panels')
const VFRAMES = join(RUN, 'vframes')
const FRAMES = join(RUN, 'frames')

const manifest = JSON.parse(readFileSync(join(RUN, 'manifest.json'), 'utf8'))
const frozen = JSON.parse(readFileSync(join(RUN, 'fixtures.json'), 'utf8'))
const fxOf = (shot_id: string) => frozen.fixtures.find((f: any) => f.shot_id === shot_id)

// ── 판정 프롬프트 (결과에 그대로 기록된다) ──
const PROMPTS = {
  blocking: (panel: 'START' | 'END') =>
    [
      `IMAGE A is the ${panel} panel of a rough pencil previz storyboard (wooden mannequin stand-ins).`,
      `IMAGE B is a finished repaint that is supposed to reproduce the SAME shot staging as IMAGE A.`,
      'Judge ONLY blocking: camera framing/shot size, camera angle, where each figure and major prop sits in the frame, and each figure\'s pose and facing.',
      'Ignore art style, rendering, color, lighting and the fact that A has faceless mannequins while B has real people — those are expected to differ.',
      'match=1 if the blocking is the same shot (a viewer would call it the same setup and the same moment); 0 if framing, figure placement/count or pose clearly differs.',
      'confidence="low" if you are unsure or the panel is ambiguous, else "high".',
      'Return JSON only: {"match":0 or 1,"confidence":"high|low","reason":"<=15 words"}',
    ].join('\n'),
  annotation: [
    'IMAGE A is the DIRECTION panel of a rough pencil previz storyboard: it carries hand-drawn motion arrows and hand-written text labels.',
    'IMAGE B is the corresponding panel of a finished repaint. The repaint was instructed to redraw the SAME arrows and labels on top as an annotation overlay.',
    'Judge: does IMAGE B carry the same motion annotation as IMAGE A — arrows in the same places pointing the same way, and the same text labels?',
    'match=1 if the annotation is clearly carried over (minor style/wording differences OK); 0 if arrows/labels are missing, or point somewhere else, or say something different.',
    'Also report what text you can read in B (verbatim, empty array if none).',
    'Return JSON only: {"match":0 or 1,"confidence":"high|low","b_labels":["..."],"reason":"<=15 words"}',
  ].join('\n'),
  hygiene: [
    'IMAGE A is the START panel and IMAGE B is the END panel of a finished repainted storyboard sheet.',
    'These two panels must be CLEAN final film frames: the hand-drawn motion arrows and hand-written labels belong ONLY in the middle panel, which is not shown here.',
    'Answer two things:',
    '  contamination=1 if EITHER image contains any hand-drawn arrow, hand-written label, or any overlaid text; else 0.',
    '  mannequin=1 if EITHER image still shows a wooden artist mannequin / faceless featureless dummy instead of a real person; else 0.',
    '  (If the shot legitimately contains no people at all, mannequin=0.)',
    'Return JSON only: {"contamination":0 or 1,"mannequin":0 or 1,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
  arrival: [
    'IMAGE A is the target END frame of a film shot (a still reference).',
    'IMAGE B is the LAST frame of a generated video clip for that same shot.',
    'Judge whether the clip ARRIVED at the target: does IMAGE B show the same composition and the same moment-of-action as IMAGE A?',
    'Judge camera framing/shot size, where figures and major props sit, and each figure\'s pose and the state of the action (e.g. a drawer open vs shut, a person standing vs seated).',
    'Ignore small differences in rendering, grain, sharpness or colour.',
    'match=1 only if a viewer would say the clip ended at the reference END frame; 0 if the framing, the pose, or the action state is clearly different.',
    'Return JSON only: {"match":0 or 1,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
  motion: [
    'IMAGE A is a previz DIRECTION panel: it shows a shot with hand-drawn arrows/labels specifying the intended motion.',
    'IMAGE B is the FIRST frame and IMAGE C is the LAST frame of a generated video clip of that shot.',
    'Judge whether the motion that actually happened between B and C goes in the direction the annotation in A asked for.',
    'If A says the shot holds still, then match=1 only when B and C are essentially the same composition.',
    'match=1 if the observed change agrees with the annotated intent; 0 if it moves the wrong way, or does not move when motion was asked, or moves when a static hold was asked.',
    'Return JSON only: {"match":0 or 1,"confidence":"high|low","observed":"<=12 words","reason":"<=15 words"}',
  ].join('\n'),
  leak: [
    'These images are frames sampled from a generated video clip that is supposed to be a clean live-action film shot.',
    'Report contamination=1 if ANY frame shows artifacts leaking in from the storyboard sheet it was referenced from:',
    ' hand-drawn arrows, hand-written text labels, panel borders/frames, a split-screen or multi-panel layout, or letterbox panel dividers.',
    'Otherwise contamination=0.',
    'Return JSON only: {"contamination":0 or 1,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
  twoafc: [
    'IMAGE R is the target END frame of a film shot.',
    'IMAGE 1 and IMAGE 2 are the last frames of two different generated clips for that same shot.',
    'Which one arrives closer to IMAGE R in composition, figure placement and action state?',
    'Answer pick=1 or pick=2, or pick=0 if they are genuinely indistinguishable in how close they are.',
    'Return JSON only: {"pick":0 or 1 or 2,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
}

async function prep() {
  mkdirSync(PANELS, { recursive: true })
  mkdirSync(VFRAMES, { recursive: true })
  const { cropRoughGridFrames } = await import('@/lib/writer/rough-grid-crop')

  // A1: 제품 크롭으로 3패널 분해 (finalize 와 동일 경로)
  for (const j of manifest.jobs.A1) {
    if (!j.done) continue
    const outs = { start: join(PANELS, `${j.key}_start.png`), direction: join(PANELS, `${j.key}_direction.png`), end: join(PANELS, `${j.key}_end.png`) }
    if (existsSync(outs.end)) continue
    const [f] = await cropRoughGridFrames(readFileSync(j.local), 'strip1', 1)
    writeFileSync(outs.start, f.start)
    writeFileSync(outs.direction, f.direction)
    writeFileSync(outs.end, f.end)
  }

  // A2: 첫/중간/마지막 프레임 + 사람 검토용 필름스트립
  for (const j of manifest.jobs.A2) {
    if (!j.done) continue
    const last = join(VFRAMES, `${j.key}_last.png`)
    if (existsSync(last)) continue
    const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', j.local]).toString().trim())
    // 주의: 입력 시크(-ss dur-ε)는 EOF 를 넘어가면 **exit 0 인데 파일을 안 만든다**(무음 실패).
    //   마지막 프레임은 반드시 끝 기준 시크(-sseof)로 뽑고, 매 추출마다 산출물 존재를 단언한다.
    const run = (args: string[], dest: string) => {
      execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, '-frames:v', '1', dest])
      if (!existsSync(dest)) throw new Error(`frame extract produced no file: ${dest}`)
    }
    run(['-ss', String(Math.min(0.4, dur / 10)), '-i', j.local], join(VFRAMES, `${j.key}_first.png`))
    run(['-ss', String(dur / 2), '-i', j.local], join(VFRAMES, `${j.key}_mid.png`))
    run(['-sseof', '-0.2', '-i', j.local], last)
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', j.local, '-vf', `fps=6/${dur},scale=260:-1,tile=6x1`, '-frames:v', '1', join(VFRAMES, `${j.key}_strip.png`)])
  }
  console.log(JSON.stringify({ panels: manifest.jobs.A1.filter((j: any) => j.done).length, clips: manifest.jobs.A2.filter((j: any) => j.done).length }, null, 2))
}

/** 동시 실행 제한 풀 */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>, tag = ''): Promise<R[]> {
  const out: R[] = new Array(items.length) as R[]
  let i = 0
  let done = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++
        out[k] = await fn(items[k])
        done++
        if (tag) console.log(`  ${tag} ${done}/${items.length}`)
      }
    }),
  )
  return out
}

async function judge() {
  const a1done = manifest.jobs.A1.filter((j: any) => j.done)
  const a2done = manifest.jobs.A2.filter((j: any) => j.done)

  // ── A1 ──
  const a1 = await pool(a1done, 6, async (j: any) => {
    const fx = fxOf(j.shot_id)
    const rough = (k: string) => join(FRAMES, `${j.shot_id}__rough_${k}.png`)
    const panel = (k: string) => join(PANELS, `${j.key}_${k}.png`)
    const [bStart, bEnd, ann, hyg] = await Promise.all([
      vlmJson<any>([{ text: PROMPTS.blocking('START') }, { text: 'IMAGE A:' }, await imgPart(rough('start')), { text: 'IMAGE B:' }, await imgPart(panel('start'))]),
      vlmJson<any>([{ text: PROMPTS.blocking('END') }, { text: 'IMAGE A:' }, await imgPart(rough('end')), { text: 'IMAGE B:' }, await imgPart(panel('end'))]),
      vlmJson<any>([{ text: PROMPTS.annotation }, { text: 'IMAGE A:' }, await imgPart(rough('direction')), { text: 'IMAGE B:' }, await imgPart(panel('direction'))]),
      vlmJson<any>([{ text: PROMPTS.hygiene }, { text: 'IMAGE A:' }, await imgPart(panel('start')), { text: 'IMAGE B:' }, await imgPart(panel('end'))]),
    ])
    return {
      key: j.key, arm: 'A1', shot_id: j.shot_id, klass: j.klass, rep: j.rep,
      model: j.model_actual, request_id: j.request_id, out: j.local, stripSha: j.stripSha,
      previzLabel: fx.label,
      blocking_start: bStart, blocking_end: bEnd, annotation: ann, hygiene: hyg,
      blockingMatch: bStart.match === 1 && bEnd.match === 1,
      flagged: [bStart, bEnd, ann, hyg].some((v) => v?.confidence === 'low'),
    }
  }, 'A1')

  // ── A2 ──
  const a2 = await pool(a2done, 6, async (j: any) => {
    const fx = fxOf(j.shot_id)
    const vf = (k: string) => join(VFRAMES, `${j.key}_${k}.png`)
    const endRef = join(FRAMES, `${j.shot_id}__real_end.png`)
    const [arr, mot, leak] = await Promise.all([
      vlmJson<any>([{ text: PROMPTS.arrival }, { text: 'IMAGE A:' }, await imgPart(endRef), { text: 'IMAGE B:' }, await imgPart(vf('last'))]),
      vlmJson<any>([{ text: PROMPTS.motion }, { text: 'IMAGE A:' }, await imgPart(join(FRAMES, `${j.shot_id}__rough_direction.png`)), { text: 'IMAGE B:' }, await imgPart(vf('first')), { text: 'IMAGE C:' }, await imgPart(vf('last'))]),
      vlmJson<any>([{ text: PROMPTS.leak }, await imgPart(vf('first')), await imgPart(vf('mid')), await imgPart(vf('last'))]),
    ])
    return {
      key: j.key, arm: j.arm, a2arm: j.a2arm, shot_id: j.shot_id, klass: j.klass, rep: j.rep,
      endpoint: j.endpoint, request_id: j.request_id, out: j.local,
      refs: j.refs, durationSeconds: j.durationSeconds, previzLabel: fx.label,
      arrival: arr, motion: mot, leak,
      flagged: [arr, mot, leak].some((v) => v?.confidence === 'low'),
    }
  }, 'A2')

  // ── 보조: 2AFC (팔 위치 무작위화 — 위치 편향 상쇄) ──
  const pairs: any[] = []
  for (const fx of frozen.fixtures) {
    for (let rep = 1; rep <= 3; rep++) {
      const so = a2done.find((j: any) => j.shot_id === fx.shot_id && j.a2arm === 'start_only' && j.rep === rep)
      const se = a2done.find((j: any) => j.shot_id === fx.shot_id && j.a2arm === 'start_end' && j.rep === rep)
      if (so && se) pairs.push({ shot_id: fx.shot_id, rep, so, se, seFirst: (fx.shot_id.length + rep) % 2 === 0 })
    }
  }
  const afc = await pool(pairs, 6, async (p: any) => {
    const one = p.seFirst ? p.se : p.so
    const two = p.seFirst ? p.so : p.se
    const r = await vlmJson<any>([
      { text: PROMPTS.twoafc },
      { text: 'IMAGE R:' }, await imgPart(join(FRAMES, `${p.shot_id}__real_end.png`)),
      { text: 'IMAGE 1:' }, await imgPart(join(VFRAMES, `${one.key}_last.png`)),
      { text: 'IMAGE 2:' }, await imgPart(join(VFRAMES, `${two.key}_last.png`)),
    ])
    const winner = r.pick === 0 ? 'tie' : (r.pick === 1 ? one : two).a2arm
    return { shot_id: p.shot_id, rep: p.rep, seShownFirst: p.seFirst, pick: r.pick, winner, confidence: r.confidence, reason: r.reason }
  }, '2AFC')

  // ── 집계 ──
  const rate = (n: number, d: number) => (d ? +((n / d) * 100).toFixed(1) : 0)
  const a1Panels = a1.length * 2
  const a1Agg = {
    n_images: a1.length,
    blockingMatch_panelRate: rate(a1.filter((r) => r.blocking_start.match === 1).length + a1.filter((r) => r.blocking_end.match === 1).length, a1Panels),
    blockingMatch_panelN: `${a1.filter((r) => r.blocking_start.match === 1).length + a1.filter((r) => r.blocking_end.match === 1).length}/${a1Panels}`,
    blockingMatch_imageRate: rate(a1.filter((r) => r.blockingMatch).length, a1.length),
    annotationCarried_rate: rate(a1.filter((r) => r.annotation.match === 1).length, a1.length),
    arrowContamination_rate: rate(a1.filter((r) => r.hygiene.contamination === 1).length, a1.length),
    mannequinLeft_rate: rate(a1.filter((r) => r.hygiene.mannequin === 1).length, a1.length),
    flagged: a1.filter((r) => r.flagged).map((r) => r.key),
    byClass: Object.fromEntries(['static', 'single', 'double', 'camera'].map((k) => {
      const rows = a1.filter((r) => r.klass === k)
      return [k, { n: rows.length, blockingPanelRate: rate(rows.filter((r) => r.blocking_start.match === 1).length + rows.filter((r) => r.blocking_end.match === 1).length, rows.length * 2), annotation: rate(rows.filter((r) => r.annotation.match === 1).length, rows.length) }]
    })),
  }

  const byArm = (arm: string) => a2.filter((r) => r.a2arm === arm)
  const armAgg = (arm: string) => {
    const rows = byArm(arm)
    return {
      n: rows.length,
      arrivalMatch_rate: rate(rows.filter((r) => r.arrival.match === 1).length, rows.length),
      arrivalMatch_n: `${rows.filter((r) => r.arrival.match === 1).length}/${rows.length}`,
      motionMatch_rate: rate(rows.filter((r) => r.motion.match === 1).length, rows.length),
      contamination_rate: rate(rows.filter((r) => r.leak.contamination === 1).length, rows.length),
      byClass: Object.fromEntries(['static', 'single', 'double', 'camera'].map((k) => {
        const rr = rows.filter((r) => r.klass === k)
        return [k, { n: rr.length, arrival: rate(rr.filter((r) => r.arrival.match === 1).length, rr.length), motion: rate(rr.filter((r) => r.motion.match === 1).length, rr.length) }]
      })),
    }
  }
  const so = armAgg('start_only')
  const se = armAgg('start_end')
  const increment = +(se.arrivalMatch_rate - so.arrivalMatch_rate).toFixed(1)

  // 사전 등록 기각 조건 대입
  const verdict = {
    A1_blockingPanelRate: a1Agg.blockingMatch_panelRate,
    A1_predictionMet_ge95: a1Agg.blockingMatch_panelRate >= 95,
    A1_rejectTriggered_lt80: a1Agg.blockingMatch_panelRate < 80,
    A1_arrowContamination: a1Agg.arrowContamination_rate,
    A1_contaminationWithinBudget_le5: a1Agg.arrowContamination_rate <= 5,
    A2_increment_pp: increment,
    A2_branch:
      increment >= 20 ? '④ 채널 유효 확정 — 축 B 는 프로덕션 구성(START+END)으로 측정'
        : increment < 10 ? '② END 참조 조향 무효 — 영상 채널 재설계 안건, 축 B 는 START-only 구성으로 측정'
          : '③ 판정 유보 — n 증설 후 재판정',
  }

  const results = {
    scoredAt: new Date().toISOString(),
    judge: { model: JUDGE_MODEL, temperature: 0, prompts: PROMPTS },
    coordinates: {
      project: frozen.project, styleAnchor: frozen.styleAnchor,
      fixtures: frozen.fixtures.map((f: any) => ({ shot_id: f.shot_id, klass: f.klass, previzLabel: f.label, duration: f.shot.duration_seconds, charRefs: f.charRefs.length })),
      a1Model: 'openai/gpt-image-2/edit', a2Model: manifest.videoModel.endpoint,
      cost: manifest.cost,
    },
    aggregate: { A1: a1Agg, A2: { start_only: so, start_end: se, increment_pp: increment } },
    verdict,
    twoAFC: {
      note: '보조 강건성 검사 — 사전 등록 지표 아님. 위치 편향 상쇄 위해 팔 순서 무작위화.',
      start_end_wins: afc.filter((r) => r.winner === 'start_end').length,
      start_only_wins: afc.filter((r) => r.winner === 'start_only').length,
      ties: afc.filter((r) => r.winner === 'tie').length,
      rows: afc,
    },
    flagged: {
      note: '사람 스팟 판정 대기 — VLM 이 confidence=low 로 표시한 시행.',
      A1: a1Agg.flagged,
      A2: a2.filter((r) => r.flagged).map((r) => r.key),
    },
    trials: { A1: a1, A2: a2 },
  }
  writeFileSync(join(RUN, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ aggregate: results.aggregate, verdict, twoAFC: { se: results.twoAFC.start_end_wins, so: results.twoAFC.start_only_wins, tie: results.twoAFC.ties }, flagged: results.flagged }, null, 2))
}

const mode = process.argv[2]
if (mode === 'prep') await prep()
else if (mode === 'judge') await judge()
else throw new Error('usage: score.mts prep|judge')
