#!/usr/bin/env node
// E9d-copy 입력 포맷 실험 — 영상 생성 "직전 상태" 스테이징.
//   각 방식(A·B1·B2·C·R)의 입력 이미지를 전부 생성/수확하고, 샷별 I2V 페이로드(payloads.json)를 조립한다.
//   영상(I2V) 콜은 이 스크립트에 없다 — 이미지 계층까지만. (오너 지시 2026-07-23)
//
//   편집 모델: openai/gpt-image-2/edit (제품 DEFAULT_EDIT_IMAGE_MODEL, src/lib/writer/llm/fal.ts와 동일 스키마
//   {prompt, image_urls, image_size}). 생성 상한 MAX_CALLS=35 (계획 29콜 + 재시도 여유). resume: staging_state.json.
//
//   실행: node tools/stage_inputs.mjs            (전부, 재실행 시 완료분 skip)
//         PHASE=dry node tools/stage_inputs.mjs  (콜 계획만 출력)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'

const EXP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = path.resolve(EXP, '../../../..')
const ASSETS = path.join(EXP, 'assets')
const STATE_PATH = path.join(ASSETS, 'staging_state.json')
const CANON = path.join(EXP, '../2026-07-23_character-canon/assets/identity_ref.jpg')
const SRC_WIDE = path.join(ASSETS, 'plates/src_empty_wide.jpg')

const MODEL = 'openai/gpt-image-2/edit'
const MAX_CALLS = 35
const CONCURRENCY = 3
const DRY = process.env.PHASE === 'dry'

// ── FAL_KEY (.env.local fallback) ──
if (!process.env.FAL_KEY) {
  const envFile = path.join(ROOT, '.env.local')
  if (fs.existsSync(envFile)) {
    const m = /^FAL_KEY=(.+)$/m.exec(fs.readFileSync(envFile, 'utf8'))
    if (m) process.env.FAL_KEY = m[1].trim().replace(/^"|"$/g, '')
  }
}
if (!DRY && !process.env.FAL_KEY) { console.error('FAL_KEY missing'); process.exit(1) }
if (!DRY) fal.config({ credentials: process.env.FAL_KEY })

// ── 콘티 상수 (conti.md ⓪) ──
const DUR = { 1: 5.53, 2: 3.43, 3: 1.44, 4: 3.3, 5: 3.63, 6: 1.57 }

const ANCHOR =
  'Retro pastel public restroom: mint-green tiles, orange-red round sinks on a mint counter, large round mirrors with vertical tube lights, warm fluorescent light. The exact same young woman as the reference (black lip-length bob, wispy bangs, layered silver charm choker, pale blue satin slip dress with white daisy lace trim). Cinematic fashion-film still, photorealistic, 16:9. No on-screen text, no watermark.'

// 시작 프레임 구도 지시 (blueprint-a §2 — A·B1 공용)
const COMP = {
  1: 'Front view framed inside the round mirror: she faces the mirror straight-on, chest-up, raising a small lip-gloss wand toward her lips, calm vacant expression.',
  2: 'Left side profile at the counter, gloss wand at her lips, mirror edge and tube light at right.',
  3: 'Symmetrical wide master of the whole restroom; she stands small at center facing the mirror wall.',
  4: 'Over-the-shoulder from behind her head; her face visible in the round mirror reflection.',
  5: 'Top-down sink POV: her face looks down toward camera over the orange sink rim, ceiling light behind her head.',
  6: 'Extreme close-up of the orange-red basin with chrome drain, no person.',
}

// 끝 프레임 지시 (blueprint-b1 §2 — B1·B2 공용)
const END_STATE = {
  1: 'Same scene, same locked camera as the start frame. End state: the gloss wand touches her lips, her chin tilted slightly up, lips freshly glossed.',
  2: 'Same profile framing. End state: wand lowered a few centimeters from her lips, her eyes checking the mirror.',
  3: 'Same wide master framing. End state: nearly identical, her weight shifted to the other leg.',
  4: 'Same over-the-shoulder framing. End state: her head turned a few degrees, eyes meeting her own reflection.',
  5: 'Same top-down sink POV. End state: her face a little closer to the rim, gaze fixed downward.',
  6: 'Same macro framing of the drain, unchanged (static insert). The basin stays dry and empty — no water, no running faucet, nothing added.',
}
const END_PREFIX =
  'Using the reference image as the start frame: keep the identical scene, identical camera position and framing, identical person, wardrobe and lighting. Change only the action state. '

// 움직임 텍스트 — A안 (blueprint-a §2)
const MOTION_A = {
  1: 'She slowly applies lip gloss; only her hand and lips move. Camera locked, no movement.',
  2: 'She keeps applying gloss in profile; tiny head adjustments only. Camera locked.',
  3: 'She stands almost still, slight weight shift. Camera locked.',
  4: 'She studies herself in the mirror, head turns a few degrees. Camera locked.',
  5: 'She leans a little closer over the sink, eyes scanning downward. Camera locked.',
  6: 'Static insert; faint light shimmer only. Camera locked.',
}
// 움직임 텍스트 — 시작+끝 계열 (blueprint-b1 §2: B1·B2·C·R 공용)
const MOTION_SE = {
  1: 'She applies the gloss from start pose to end pose.',
  2: 'She finishes the stroke and lowers the wand slightly.',
  3: 'She stands almost still.',
  4: 'Her head turns slightly toward the mirror.',
  5: 'She leans in slowly over the sink.',
  6: 'Static shot, faint shimmer.',
}

// 3층 텍스트 계약 (design.md §8-1 — 전 팔 공통 통제 변수)
const BIBLE =
  'Continuity bible (LOCKED): the same young woman in every shot — black lip-length bob with wispy bangs, layered silver charm choker, pale blue satin slip dress with white daisy lace trim; wardrobe and hairstyle never change. Location: retro pastel public restroom — mint-green tiles, orange-red round sinks on a mint counter, large round mirrors with vertical tube lights. Light: warm fluorescent from above the mirrors, constant, same time of day. She stays on the same side of the 180-degree line, facing the mirror wall. Signature props: small lip-gloss wand; chrome drain.'
const NEGATIVE =
  'Never: any camera movement beyond what is specified, wardrobe or hairstyle change, shadow direction flip, day/night jump, extra people, duplicate faces, plastic skin, morphing hands, on-screen text, watermark.'

// A안 플레이트 (src_empty_wide 65.5초 원본 프레임에서 편집 파생. wide는 원본 프레임 그대로 승격 — 0콜)
const PLATE_PROMPTS = {
  plate_mirror:
    'Using the reference photo of this exact empty retro pastel restroom: generate a closer straight-on view of one large round mirror with its vertical tube lights, over one orange-red round sink on the mint counter. Empty room, no people. Identical materials, colors and warm fluorescent lighting. Remove all watermark text. Photorealistic, 16:9.',
  plate_sinkpov:
    'Using the reference photo of this exact empty retro pastel restroom: generate a view from inside one orange-red sink basin looking straight up — the orange rim framing the edges, the ceiling and one round ceiling lamp above. Empty, no people. Identical materials and warm lighting. Remove all watermark text. Photorealistic, 16:9.',
  plate_drain:
    'Using the reference photo of this exact empty retro pastel restroom: generate an extreme close-up of one orange-red basin interior with its chrome drain. No people. Identical materials and warm lighting. Remove all watermark text. Photorealistic, macro, 16:9.',
}
const PLATE_FOR_SHOT = { 1: 'plate_mirror', 2: 'plate_mirror', 3: 'plate_wide', 4: 'plate_mirror', 5: 'plate_sinkpov', 6: 'plate_drain' }

// B2 콘티 시트 (v2 재정의: 한 생성 안 6컷 → 셀 수확)
const B2_SHEET_PROMPT =
  'Create one storyboard contact sheet as a single image: exactly 6 photorealistic cinematic panels arranged in a 3-column by 2-row grid, separated by thin white gutters. All 6 panels are frames from the same continuous scene in a retro pastel public restroom (mint-green tiles, orange-red round sinks on a mint counter, large round mirrors with vertical tube lights, warm fluorescent light). Panels 1-5 show the exact same young woman as the reference image: identical face, black lip-length bob with wispy bangs, layered silver charm choker, pale blue satin slip dress with white daisy lace trim. ' +
  `Panel 1 (top-left): ${COMP[1]} Panel 2 (top-center): ${COMP[2]} Panel 3 (top-right): ${COMP[3]} Panel 4 (bottom-left): ${COMP[4]} Panel 5 (bottom-center): ${COMP[5]} Panel 6 (bottom-right): ${COMP[6]} ` +
  'No captions, no labels, no text anywhere in the image.'

// C안 체이닝 지시 (blueprint-c §2 — 영상 단계에서 사용, 페이로드에 명세만 실림)
const CHAIN = {
  2: { from: 1, prompt: 'Continue this exact moment: the same woman, same wand position at her lips, but seen from a left side profile at the counter. Same lighting, same room.' },
  5: { from: 4, prompt: 'The next instant: her gaze drops from the mirror to the sink below — now seen from inside the sink looking up at her face over the orange rim.' },
  6: { from: 5, prompt: 'What she is looking at: extreme close-up of the same orange basin and chrome drain, no person.' },
}

// ── state / helpers ──
const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { artifacts: {}, uploads: {} }
state.artifacts ??= {}; state.uploads ??= {}
const saveState = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
let calls = 0

async function uploadLocal(file) {
  const rel = path.relative(EXP, file)
  if (state.uploads[rel]) return state.uploads[rel]
  const buf = fs.readFileSync(file)
  const url = await fal.storage.upload(new Blob([buf], { type: 'image/jpeg' }))
  state.uploads[rel] = url
  saveState()
  return url
}

async function download(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

// 생성 잡 1건: refs는 (fal url | 로컬 경로) 혼합 허용
async function genImage(id, { prompt, refs, out }) {
  const st = (state.artifacts[id] ??= {})
  const dest = path.join(ASSETS, out)
  if (st.url && fs.existsSync(dest)) return
  if (DRY) { console.log(`[dry] ${id} → ${out} (refs: ${refs.length})`); return }
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (calls >= MAX_CALLS) throw new Error(`call cap ${MAX_CALLS} reached at ${id}`)
    calls++
    try {
      const image_urls = []
      for (const r of refs) image_urls.push(r.startsWith('http') ? r : await uploadLocal(r))
      const res = await fal.subscribe(MODEL, { input: { prompt, image_urls, image_size: 'landscape_16_9' } })
      const url = res.data?.images?.[0]?.url
      if (!url) throw new Error('no image url')
      await download(url, dest)
      st.url = url
      saveState()
      console.log(`[ok] ${id} → ${out} (calls=${calls})`)
      return
    } catch (e) {
      console.error(`[fail] ${id} try${attempt}: ${(e?.message ?? String(e)).slice(0, 140)}`)
      if (attempt === 2) throw e
    }
  }
}

async function pool(jobs, n) {
  let idx = 0
  const errors = []
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => {
    while (idx < jobs.length) {
      const j = jobs[idx++]
      try { await genImage(j.id, j) } catch (e) { errors.push(`${j.id}: ${e?.message ?? e}`) }
    }
  }))
  if (errors.length) throw new Error('group failed:\n' + errors.join('\n'))
}

const S = [1, 2, 3, 4, 5, 6]
const artUrl = (id) => state.artifacts[id]?.url

// ── group 1: 독립 생성 (A 시트·플레이트 3, B1 시작 6, B2 시트 1 = 11콜) ──
async function group1() {
  const jobs = [
    {
      id: 'a_sheet',
      prompt:
        'Using the reference image: a character model sheet of the exact same young woman (identical face, black lip-length bob with wispy bangs, layered silver charm choker, pale blue satin slip dress with white daisy lace trim) — 4 views side by side on one plain light-gray background: front chest-up, left profile chest-up, back of head with choker visible, full body front. Consistent identity across all views, photorealistic, no text.',
      refs: [CANON],
      out: 'arm-a/sheet_character.jpg',
    },
    ...Object.entries(PLATE_PROMPTS).map(([k, prompt]) => ({ id: k, prompt, refs: [SRC_WIDE], out: `arm-a/plates/${k}.jpg` })),
    ...S.map((n) => ({ id: `b1_s${n}_start`, prompt: `${ANCHOR} ${COMP[n]}`, refs: [CANON], out: `arm-b1/frames/s${n}_start.jpg` })),
    { id: 'b2_sheet', prompt: B2_SHEET_PROMPT, refs: [CANON], out: 'arm-b2/conti_sheet.jpg' },
  ]
  await pool(jobs, CONCURRENCY)
  // plate_wide = 원본 65.5초 프레임 승격 (0콜)
  const wideDest = path.join(ASSETS, 'arm-a/plates/plate_wide.jpg')
  if (!fs.existsSync(wideDest)) { fs.mkdirSync(path.dirname(wideDest), { recursive: true }); fs.copyFileSync(SRC_WIDE, wideDest) }
}

// ── group 2: 종속 생성 (A 시작 6, B1 끝 6 = 12콜) ──
async function group2() {
  const jobs = [
    ...S.map((n) => ({
      id: `a_s${n}_start`,
      prompt:
        `${ANCHOR} Reference 1 is her character sheet; reference 2 is the empty room plate for this angle. Place her into the room exactly as follows (shot 6 has no person): ${COMP[n]}`,
      refs: [artUrl('a_sheet'), artUrl(PLATE_FOR_SHOT[n]) ?? path.join(ASSETS, 'arm-a/plates/plate_wide.jpg')],
      out: `arm-a/frames/s${n}_start.jpg`,
    })),
    ...S.map((n) => ({
      id: `b1_s${n}_end`,
      prompt: END_PREFIX + END_STATE[n],
      refs: [artUrl(`b1_s${n}_start`)],
      out: `arm-b1/frames/s${n}_end.jpg`,
    })),
  ]
  await pool(jobs, CONCURRENCY)
}

// ── group 3: B2 셀 수확 (0콜) + B2 끝 프레임 (6콜) ──
async function harvestB2() {
  const sheet = path.join(ASSETS, 'arm-b2/conti_sheet.jpg')
  const img = sharp(sheet)
  const { width: W, height: H } = await img.metadata()
  for (const n of S) {
    const dest = path.join(ASSETS, `arm-b2/frames/s${n}_start.jpg`)
    if (fs.existsSync(dest)) continue
    const col = (n - 1) % 3, row = n <= 3 ? 0 : 1
    const cw = Math.floor(W / 3), ch = Math.floor(H / 2)
    const inset = Math.floor(Math.min(cw, ch) * 0.03) // 거터 트림
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await sharp(sheet)
      .extract({ left: col * cw + inset, top: row * ch + inset, width: cw - inset * 2, height: ch - inset * 2 })
      .resize(1280, 720, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 92 })
      .toFile(dest)
    console.log(`[harvest] b2 s${n}_start (cell ${col},${row})`)
  }
}
async function group3() {
  if (!DRY) await harvestB2()
  const jobs = S.map((n) => ({
    id: `b2_s${n}_end`,
    prompt: END_PREFIX + END_STATE[n],
    refs: [path.join(ASSETS, `arm-b2/frames/s${n}_start.jpg`)],
    out: `arm-b2/frames/s${n}_end.jpg`,
  }))
  await pool(jobs, CONCURRENCY)
}

// ── group 4: β 연출 시트 합성 (코드, 0콜 — blueprint-b2 원안 β용, B1 프레임 재사용) ──
async function composeBetaSheet() {
  const dest = path.join(ASSETS, 'arm-b2/beta_sheet.jpg')
  if (fs.existsSync(dest)) return
  const NOTES = {
    1: '5.5s - camera locked - she applies lip gloss',
    2: '3.4s - camera locked - profile, finishes stroke',
    3: '1.4s - wide master - stands still',
    4: '3.3s - over-shoulder - head turns to mirror',
    5: '3.6s - sink POV - leans in',
    6: '1.6s - macro insert - static',
  }
  const IW = 480, IH = 270, LABEL_W = 340, PAD = 16
  const W = LABEL_W + (IW + PAD) * 2 + PAD * 2
  const H = (IH + PAD) * 6 + PAD
  const composites = []
  for (const n of S) {
    const y = PAD + (n - 1) * (IH + PAD)
    for (const [i, kind] of [['start', 0], ['end', 1]].map(([k], i) => [i, k])) {
      const buf = await sharp(path.join(ASSETS, `arm-b1/frames/s${n}_${kind}.jpg`))
        .resize(IW, IH, { fit: 'cover' }).jpeg().toBuffer()
      composites.push({ input: buf, left: LABEL_W + PAD + i * (IW + PAD), top: y })
    }
    const svg = `<svg width="${LABEL_W}" height="${IH}"><text x="12" y="60" font-family="Helvetica" font-size="34" font-weight="bold" fill="#111">SHOT ${n}</text><text x="12" y="110" font-family="Helvetica" font-size="17" fill="#333">${NOTES[n]}</text><text x="12" y="145" font-family="Helvetica" font-size="15" fill="#666">start (left) / end (right)</text></svg>`
    composites.push({ input: Buffer.from(svg), left: PAD, top: y })
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(composites).jpeg({ quality: 92 }).toFile(dest)
  console.log('[compose] beta_sheet.jpg')
}

// ── payloads.json — 영상 생성기 직전 상태의 계약 ──
function videoPrompt(motion, n) {
  return `${motion} Ending state: ${END_STATE[n]}\n${BIBLE}\n${NEGATIVE}`
}
function buildPayloads() {
  const rel = (p) => p // 경로는 실험 루트 기준
  const durInt = (s) => Math.min(15, Math.max(3, Math.round(s)))
  const shots = (arm) => S.map((n) => {
    const base = {
      shot: n,
      duration_s: DUR[n],
      duration_hint_int: durInt(DUR[n]),
      aspect_ratio: '16:9',
      camera: 'locked',
    }
    if (arm === 'a') return {
      ...base,
      start_image: rel(`assets/arm-a/frames/s${n}_start.jpg`),
      video_prompt: `${MOTION_A[n]} Ending state: ${END_STATE[n]}\n${BIBLE}\n${NEGATIVE}`,
    }
    if (arm === 'b1' || arm === 'b2') return {
      ...base,
      start_image: rel(`assets/arm-${arm}/frames/s${n}_start.jpg`),
      end_image: rel(`assets/arm-${arm}/frames/s${n}_end.jpg`),
      video_prompt: videoPrompt(MOTION_SE[n], n),
    }
    if (arm === 'c') {
      const chained = CHAIN[n]
      return {
        ...base,
        start_image: chained ? null : rel(`assets/arm-b1/frames/s${n}_start.jpg`),
        end_image: rel(`assets/arm-b1/frames/s${n}_end.jpg`),
        video_prompt: videoPrompt(MOTION_SE[n], n),
        ...(chained && {
          chain: {
            note: '시작 프레임은 사전 생성 불가 — 앞 샷 클립의 실제 마지막 프레임에서 영상 단계에 만든다.',
            from_shot_clip: chained.from,
            steps: [
              `ffmpeg으로 clip ${chained.from}의 마지막 프레임 추출`,
              `편집 모델(${MODEL})에 [추출 프레임, 캐릭터 정본] + chain_prompt → 이 샷의 시작 프레임`,
            ],
            chain_prompt: chained.prompt,
            identity_ref: '../2026-07-23_character-canon/assets/identity_ref.jpg',
          },
        }),
      }
    }
    // r: 원본 프레임 그대로 (상한 대조군)
    return {
      ...base,
      start_image: rel(`assets/conti/s${n}_start.jpg`),
      end_image: rel(`assets/conti/s${n}_end.jpg`),
      video_prompt: videoPrompt(MOTION_SE[n], n),
    }
  })
  const payloads = {
    experiment: 'continuity-copy/2026-07-23_input-format',
    staged_at: new Date().toISOString(),
    model_requirements: {
      a: ['strict I2V: 픽셀 단위 첫 프레임 고정 (참조형 금지)'],
      b1: ['strict I2V + start_image/end_image 동시 입력 (Seedance 계열 등 — 선행 스크리닝 §4-가에서 확정)'],
      b2_alpha: ['b1과 동일'],
      b2_beta: ['시트 통째 입력 해석 가능 모델 — 오작동 여부만 기록, 판정 제외 (blueprint-b2 v2)'],
      c: ['b1과 동일 + 순차 실행 (체인 샷은 앞 클립 완료 후 시작 프레임 제작)'],
      r: ['b1과 동일 (원본 프레임 직접 입력 — 상한선)'],
    },
    common: { bible: BIBLE, negative: NEGATIVE, seed_policy: '가능한 모델이면 시드 고정 (시리즈 일관성, design.md §8-3)' },
    arms: {
      a: { label: 'A — 자산+연출 텍스트 (끝 프레임 없음)', shots: shots('a') },
      b1: { label: 'B1 — 시작+끝 프레임 쌍', shots: shots('b1') },
      b2: {
        label: 'B2 — 콘티 시트 셀 수확 → 시작+끝 (v2)',
        shots: shots('b2'),
        beta: {
          label: 'B2β — 시트 통째 입력 (원안, 1회 시도·판정 제외)',
          sheet_image: 'assets/arm-b2/beta_sheet.jpg',
          per_shot_prompt: 'Follow row "SHOT N" of the reference sheet exactly: start from the left image, end at the right image, duration and camera as written. Do not show the sheet itself.',
          full_prompt: 'Create the full sequence: each row is one shot, in order, with the written durations. Cut between shots. Do not show the sheet itself.',
        },
      },
      c: { label: 'C — 클러스터 체이닝 (1→2, 4→5, 5→6)', execution: 'sequential', shots: shots('c') },
      r: { label: 'R — 상한 대조군 (원본 프레임)', shots: shots('r') },
    },
  }
  const dest = path.join(ASSETS, 'payloads/payloads.json')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, JSON.stringify(payloads, null, 2))
  console.log(`[payloads] ${path.relative(EXP, dest)}`)
}

// ── main ──
const main = async () => {
  console.log('=== group 1: sheet + plates + b1 starts + b2 sheet ===')
  await group1()
  console.log('=== group 2: a starts + b1 ends ===')
  await group2()
  console.log('=== group 3: b2 harvest + b2 ends ===')
  await group3()
  if (!DRY) {
    console.log('=== group 4: beta sheet + payloads ===')
    await composeBetaSheet()
    buildPayloads()
  }
  console.log(`done. edit-model calls this run: ${calls}`)
}
main().catch((e) => { saveState(); console.error('FATAL', e?.message ?? e); process.exit(1) })
