// 판정 계기 2판 — 상태 축 · 구도 축 분리 오라클 (t1-a2-separated-oracle-prep).
//
// 1판(judge.mts + score.mts PROMPTS.arrival)의 계기 결함: "composition AND moment-of-action"을
//   match 하나로 뭉개 — 상태가 도달해도 구도가 흘렀으면 0 (A2__sh_01_02__start_end__r1 실례:
//   "drawer pulled open"(상태 성공)인데 "zoomed in, cutting off the man's head"(구도)로 arrival=0).
//   바닥 깔림(비정지 1/12 vs 2/12)의 원인 — previz-verifier와 같은 과의 혼합 지표 교훈.
// 2판 설계 (사전 등록 — 티켓 t1-a2-separated-oracle-prep):
//   상태 축: 액션 상태만 (서랍 열림/닫힘, 포즈 국면) — 프레이밍 명시적 무시.
//   구도 축: 카메라 프레이밍만 — ① 클립 내 드리프트(첫↔끝) ② END ref 대비 도착 프레이밍.
//   2AFC 주지표 (선행 viz-gap "절대 판정보다 짝지음" + 1판 2AFC 11–4 변별력 실증) — 축별 분리 2AFC.
// 좌표 승계: judge.mts 의 JUDGE_MODEL(gemini-3-flash-preview)·temperature 0·768px/JPEG q82·디스크 캐시.
// 스모크 범위: sh_01_02(PULLS DRAWER) 양팔 rep1 2클립만. 풀 재판정 금지(오너 결정 선점 금지).
//   usage: node research/experiments/previz-channel-ablation/judge2.mts smoke
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vlmJson, imgPart, JUDGE_MODEL } from './judge.mts'

const DIR = dirname(fileURLToPath(import.meta.url))
const RUN = join(DIR, 'run')
const VFRAMES = join(RUN, 'vframes')
const FRAMES = join(RUN, 'frames')

// dotenv 없이 .env.local 직접 로드 (judge.mts 는 process.env 만 읽는다)
for (const l of readFileSync(join(DIR, '../../../.env.local'), 'utf8').split('\n')) {
  const i = l.indexOf('=')
  if (i > 0 && !l.trim().startsWith('#')) {
    const k = l.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = l.slice(i + 1).trim()
  }
}

// ── 2판 프롬프트 (결과에 그대로 기록된다) ──
export const PROMPTS2 = {
  state_arrival: [
    'IMAGE A is the target END frame of a film shot (a still reference).',
    'IMAGE B is the LAST frame of a generated video clip for that same shot.',
    'Judge ONLY the ACTION STATE: the stage of the action and the state of objects changed by it',
    '(e.g. a drawer open vs shut, a door ajar vs closed, a person standing vs seated, an arm extended vs at rest).',
    'You MUST IGNORE camera framing, shot size, camera angle, cropping and composition entirely —',
    'even if IMAGE B is zoomed, re-framed or crops the subject, judge only whether the action reached the same state.',
    'match=1 if the action state in B is the same as in A; 0 if the action clearly has not reached the state shown in A.',
    'confidence="low" if the action state is not visible enough to tell, else "high".',
    'Return JSON only: {"match":0 or 1,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
  framing_arrival: [
    'IMAGE A is the target END frame of a film shot (a still reference).',
    'IMAGE B is the LAST frame of a generated video clip for that same shot.',
    'Judge ONLY the CAMERA FRAMING: shot size, camera angle, camera height, and where the subject sits in the frame.',
    'You MUST IGNORE the stage of the action and the state of objects (drawer open/shut, pose differences from the action) —',
    'judge only whether a cinematographer would call B the same camera setup as A.',
    'match=1 if the framing is the same setup; 0 if shot size, angle or subject placement clearly differs (e.g. zoomed in, head cut off, reframed).',
    'confidence="low" if you are unsure, else "high".',
    'Return JSON only: {"match":0 or 1,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
  framing_hold: [
    'IMAGE B is the FIRST frame and IMAGE C is the LAST frame of one generated video clip.',
    'Judge ONLY whether the CAMERA FRAMING held: same shot size, same camera angle, same subject placement in frame.',
    'IGNORE subject motion inside the frame (a person moving, a drawer opening) — that is expected.',
    'drift=1 if the camera framing changed between B and C (zoom, push-in, reframe, crop change); drift=0 if the framing held.',
    'confidence="low" if you are unsure, else "high".',
    'Return JSON only: {"drift":0 or 1,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
  state_twoafc: [
    'IMAGE R is the target END frame of a film shot.',
    'IMAGE 1 and IMAGE 2 are the last frames of two different generated clips for that same shot.',
    'Which one is closer to IMAGE R in ACTION STATE ONLY (stage of the action, state of objects changed by it)?',
    'You MUST IGNORE camera framing, zoom, cropping and composition.',
    'Answer pick=1 or pick=2, or pick=0 if they are genuinely indistinguishable in action state.',
    'Return JSON only: {"pick":0 or 1 or 2,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
  framing_twoafc: [
    'IMAGE R is the target END frame of a film shot.',
    'IMAGE 1 and IMAGE 2 are the last frames of two different generated clips for that same shot.',
    'Which one is closer to IMAGE R in CAMERA FRAMING ONLY (shot size, angle, subject placement)?',
    'You MUST IGNORE the stage of the action and object states (drawer open/shut etc.).',
    'Answer pick=1 or pick=2, or pick=0 if they are genuinely indistinguishable in framing.',
    'Return JSON only: {"pick":0 or 1 or 2,"confidence":"high|low","reason":"<=15 words"}',
  ].join('\n'),
}

type Verdict = { match?: 0 | 1; drift?: 0 | 1; pick?: 0 | 1 | 2; confidence?: string; reason?: string; judge_error?: string }
const safe = async (fn: () => Promise<Verdict>): Promise<Verdict> => {
  try { return await fn() } catch (e) { return { judge_error: (e as Error).message, confidence: 'low' } }
}

/** 한 클립(팔×rep)의 분리 판정 — 상태 도착 · 구도 도착 · 구도 드리프트 */
export async function judgeClip(shotId: string, key: string) {
  const vf = (k: string) => join(VFRAMES, `${key}_${k}.png`)
  const endRef = join(FRAMES, `${shotId}__real_end.png`)
  const [state, framing, hold] = await Promise.all([
    safe(async () => vlmJson<Verdict>([{ text: PROMPTS2.state_arrival }, { text: 'IMAGE A:' }, await imgPart(endRef), { text: 'IMAGE B:' }, await imgPart(vf('last'))])),
    safe(async () => vlmJson<Verdict>([{ text: PROMPTS2.framing_arrival }, { text: 'IMAGE A:' }, await imgPart(endRef), { text: 'IMAGE B:' }, await imgPart(vf('last'))])),
    safe(async () => vlmJson<Verdict>([{ text: PROMPTS2.framing_hold }, { text: 'IMAGE B:' }, await imgPart(vf('first')), { text: 'IMAGE C:' }, await imgPart(vf('last'))])),
  ])
  return { key, state_arrival: state, framing_arrival: framing, framing_hold: hold }
}

/** 축별 2AFC — 1판과 동일한 위치 무작위화 규칙((shot_id.length + rep) % 2) 승계 */
export async function judgePair(shotId: string, rep: number, soKey: string, seKey: string) {
  const endRef = join(FRAMES, `${shotId}__real_end.png`)
  const seFirst = (shotId.length + rep) % 2 === 0
  const one = seFirst ? seKey : soKey
  const two = seFirst ? soKey : seKey
  const run = async (prompt: string) => {
    const r = await safe(async () => vlmJson<Verdict>([
      { text: prompt },
      { text: 'IMAGE R:' }, await imgPart(endRef),
      { text: 'IMAGE 1:' }, await imgPart(join(VFRAMES, `${one}_last.png`)),
      { text: 'IMAGE 2:' }, await imgPart(join(VFRAMES, `${two}_last.png`)),
    ]))
    const valid = r.pick === 0 || r.pick === 1 || r.pick === 2
    const winner = !valid ? 'unjudged' : r.pick === 0 ? 'tie' : (r.pick === 1 ? one : two).includes('start_end') ? 'start_end' : 'start_only'
    return { pick: r.pick ?? null, winner, seShownFirst: seFirst, confidence: r.confidence, reason: r.reason ?? r.judge_error }
  }
  return { state_2afc: await run(PROMPTS2.state_twoafc), framing_2afc: await run(PROMPTS2.framing_twoafc) }
}

// ── 스모크: sh_01_02 양팔 rep1 ──
async function smoke() {
  const SHOT = 'sh_01_02'
  const SO = 'A2__sh_01_02__start_only__r1'
  const SE = 'A2__sh_01_02__start_end__r1'
  const [so, se] = await Promise.all([judgeClip(SHOT, SO), judgeClip(SHOT, SE)])
  const pair = await judgePair(SHOT, 1, SO, SE)

  // 채점은 코드 (판정 3원칙): 스모크 성공 = 육안 실측 재현 여부를 필드별 대입
  const reproduction = {
    // 육안 실측(vault): END 팔 서랍 활짝 열림(상태 도달) vs 무END 팔 7초 내내 닫힘(상태 미도달)
    state_axis_se_gt_so:
      se.state_arrival.match === 1 && so.state_arrival.match === 0,
    state_2afc_picks_se: pair.state_2afc.winner === 'start_end',
    // 티켓 예측: 구도 축은 양팔 드리프트 검출 ("이 생성기는 상태는 따라가고 구도는 흘린다")
    framing_drift_both_arms:
      se.framing_hold.drift === 1 && so.framing_hold.drift === 1,
    framing_drift_by_arm: { start_only: so.framing_hold.drift ?? null, start_end: se.framing_hold.drift ?? null },
  }

  const out = {
    scoredAt: new Date().toISOString(),
    ticket: 't1-a2-separated-oracle-prep',
    scope: 'smoke only — sh_01_02 양팔 rep1. 풀 재판정 아님(오너 결정 Q1 대기).',
    judge: { model: JUDGE_MODEL, temperature: 0, imageWidth: 768, jpegQuality: 82, prompts: PROMPTS2 },
    instrument_defect_reference: {
      note: '1판 혼합 지표의 실례 — 같은 클립(SE r1)이 상태 성공인데 구도 사유로 arrival=0.',
      original_se_r1_arrival: { match: 0, reason: 'Image B is zoomed in, cutting off the man\'s head and changing the framing.' },
      original_se_r1_motion_observed: 'The drawer is pulled open, moving right towards the man.',
    },
    trials: { start_only: so, start_end: se, pair },
    reproduction,
  }
  writeFileSync(join(RUN, 'results2-smoke.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ trials: out.trials, reproduction }, null, 2))
}

if (process.argv[2] === 'smoke') await smoke()
else throw new Error('usage: judge2.mts smoke  (풀 재판정은 오너 결정 Q1 이후 별도 러너)')
