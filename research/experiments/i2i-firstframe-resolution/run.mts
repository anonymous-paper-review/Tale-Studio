// i2i 첫 그림 — 원본 해상도로 만들면 안 깨지는가 (오너 지시 2026-08-12)
//
// 배경: `rough-background-angle-sheet`(8/11)에서 각도 파생이 전부 무너져("둘 다 쓰레기" — 오너 판정)
//   I2I 뷰 시트 레인이 기각됐다. 그러나 그 실험은 **제품 배선을 통과**했고, 제품 배선은 러프 그리드
//   시트를 칸으로 잘라 374×242 급으로 줄인다(t0-storyboard-ref-resolution: 표본 48/48이 720 미만).
//   → "각도가 안 도는" 원인이 모델 한계인지 **입력 해상도**인지 그 실험은 가르지 못한다.
//   이 실험은 크롭 파이프라인을 **변인에서 제거**하고 원본 크기로 다시 묻는다.
//
// 왜 제품 배선을 안 쓰나: 평소 실험 규칙은 제품 함수 호출이지만, **이번엔 그 배선 자체가 용의자**다.
//   태우면 또 374로 줄어 같은 교란을 반복한다. 단 fal 발주는 제품 헬퍼(falImageGenerate)를 그대로
//   쓴다 — 용의자는 크롭이지 발주가 아니다.
//
// 대전제(rules/experiments.md): 산출 이미지의 해석·판정은 **오너만** 한다. 이 스크립트는 무엇을
//   넣었고 무엇이 나왔는지만 남긴다. 점수·승패를 쓰지 않는다.
//
// 실행: pnpm dlx tsx research/experiments/i2i-firstframe-resolution/run.mts
import { config } from 'dotenv'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

config({ path: '.env.local' })
const { fal } = await import('@fal-ai/client')
fal.config({ credentials: process.env.FAL_KEY ?? '' })
const { falImageGenerate } = await import('@/lib/writer/llm/fal')

const DIR = dirname(fileURLToPath(import.meta.url))
const OUT = join(DIR, 'out')
const MANIFEST = join(DIR, 'manifest.json')
mkdirSync(OUT, { recursive: true })

const BUDGET_CAP_USD = 2.5
const UNIT_COST_USD = 0.19 // gpt-image-2/edit 1장 상한 추정 (fal 요청별 청구 조회 API 없음)

// ── 동결 좌표 ──────────────────────────────────────────────────────────────
// 프로젝트 Sample1. 캐릭터는 char_2(김요한) — char(조승우)는 외형 서술에 실존 배우 이름이 박혀 있어
//   정책 거부 위험(qual6에서 이 프로젝트가 content_policy_violation 겪은 기록). 실험 변인과 무관한
//   실패를 피하려고 회피한 것이며, 그 사실을 기록에 남긴다.
const CHARACTER = {
  id: 'char_2',
  name: '김요한',
  sheet_url:
    'https://qnjnrihfpqkdhjuzvepy.supabase.co/storage/v1/object/public/media/ce053575-62d5-4c8d-898f-34a1a5c6b40b/9d6efa6d-3216-40b0-8a2c-184ab56f02ec/characters/v1-c50f938b516a0c463fd8f294753aa219811679c3267f33f227edd6bcf5abad2a_view_main.png?v=1786076228960',
  sheet_dim: '1088x608',
  sheet_layout: '1×4 턴어라운드 스트립 (front | side-L | side-R | back)',
  appearance:
    'Man in his 30s, extremely slender build, black horn-rimmed glasses, sharply tailored suit, cynical and cold-blooded expression',
  costume: ['맞춤형 블랙 쓰리피스 슈트', '검은색 실크 넥타이', '무광 블랙 프레임 안경'],
}

// 3D 법정 뷰 5각도 — 어제(bg-viewsheet-from-3d) 만든 것을 **재사용**. Blender 미실행, 재업로드 없음.
//   URL 출처: research/experiments/bg-viewsheet-from-3d/manifest.json#viewsheet
const VIEWS_3D = [
  { key: 'bench_eye', label: '판사석 정면 (아이레벨)', url: 'https://v3b.fal.media/files/b/0aa5f101/8wReb5ws9FpyKFfrLeI_j_view_bench_eye.png' },
  { key: 'gallery_eye', label: '방청석 리버스 (아이레벨)', url: 'https://v3b.fal.media/files/b/0aa5f101/r4YVdaThEl0u-HxTfB8F-_view_gallery_eye.png' },
  { key: 'room_high', label: '전경 하이앵글', url: 'https://v3b.fal.media/files/b/0aa5f102/WAU81U1m1p80HFYo61ztr_view_room_high.png' },
  { key: 'wall_eye', label: '측벽 (아이레벨)', url: 'https://v3b.fal.media/files/b/0aa5f102/SU3cpeB7z-QiGf2RW_fEE_view_wall_eye.png' },
  { key: 'witness_low', label: '증인석 로우앵글', url: 'https://v3b.fal.media/files/b/0aa5f102/9M2xxtws7Gipv1ZeJLOWI_view_witness_low.png' },
]
const VIEW_DIM_3D = '1280x720'

// 현행 배경 소스 — 장소 사진 1장(모든 각도에 그대로 쓰이는 그것).
const PHOTO_BG = {
  key: 'photo1',
  label: '장소 사진 1장 (현행 소스)',
  url: 'https://qnjnrihfpqkdhjuzvepy.supabase.co/storage/v1/object/public/media/ce053575-62d5-4c8d-898f-34a1a5c6b40b/9d6efa6d-3216-40b0-8a2c-184ab56f02ec/locations/v1-e6eaea18e885e1078829b56df34896be5ab51439e8f0ba00cb1624b2c572c10e_wide_shot.png?v=1786014459403',
  dim: '1088x608',
  visual_description:
    'Modern minimalist architecture, cold white marble and glass, clean straight-line structure with no excess, cool fluorescent lighting',
}

// 축소 팔이 재현할 크기 — t0-storyboard-ref-resolution 실측의 최빈값.
const SHRUNK_WIDTH = 374

// ── 지시문 (동결 — 두 팔에 바이트 단위로 동일) ─────────────────────────────
// 역할 분리 계약: qual4 prompt_c 에서 검증된 이디엄(참조마다 담당을 명시)을 이미지 축으로 옮긴 것.
function buildPrompt(viewLabel: string): string {
  return [
    'Compose a single cinematic film still.',
    '',
    '@Image1 is a character turnaround sheet (four views of the SAME man: front, left profile, right profile, back).',
    'It defines ONLY who this person is — his face, his glasses, his hair and his suit.',
    'Do NOT copy the sheet layout, its white backdrop, or its multi-panel arrangement into the result.',
    'The result must contain exactly ONE person, not four.',
    '',
    '@Image2 defines ONLY the location and the camera viewpoint: the architecture, the materials,',
    'the layout of the room and the angle it is seen from. Keep that geometry and that viewpoint.',
    'Do NOT copy its rendering style, its surface colors or its lighting treatment.',
    '',
    `Place the man from @Image1 into the space of @Image2, seen from the same viewpoint (${viewLabel}).`,
    'He stands in the mid-ground at a natural scale for that architecture.',
    'Render it as a finished photorealistic cinematic frame: real materials, real light, shallow depth of field.',
    '',
    'Do not add text, captions, labels, borders or panel dividers.',
  ].join('\n')
}

// ── 유틸 ───────────────────────────────────────────────────────────────────
type Job = {
  arm: 'full' | 'shrunk'
  bg_key: string
  bg_label: string
  bg_source_url: string
  bg_input_url?: string
  bg_input_dim?: string
  prompt?: string
  out_url?: string
  out_dim?: string
  out_file?: string
  cost_usd_est?: number
  error?: string
}

function readManifest(): Record<string, unknown> {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8'))
  return {
    purpose:
      '원본 해상도로 i2i 첫 그림을 만들면 각도·정체성이 깨지지 않는가 — rough-background-angle-sheet 기각의 해상도 교란 제거 재시험',
    owner_instruction:
      '2026-08-12 오너: "i2i에서 이미지 안 깨지는 first frame을 만든다가 전제. 우리 배선 쓰지말고 전용스크립트로 캐릭터시트랑 previz가지고. 지금은 gpt image로 자르는 과정에서 픽셀이 작아지니까 그거 말고 진짜 원본으로 i2i firstframe 뽑아도 문제가 되는지."',
    judgement_note:
      '판정은 오너 육안. 이 파일과 리포트는 무엇을 넣었고 무엇이 나왔는지만 남긴다(대전제: 영상·이미지 해석은 사람이 한다).',
    model: 'openai/gpt-image-2/edit',
    project: { id: '9d6efa6d-3216-40b0-8a2c-184ab56f02ec', title: 'Sample1' },
    character: CHARACTER,
    views_3d: { source: 'research/experiments/bg-viewsheet-from-3d (재사용 — Blender 미실행)', dim: VIEW_DIM_3D, views: VIEWS_3D },
    photo_bg: PHOTO_BG,
    shrunk_width: SHRUNK_WIDTH,
    shrunk_note: `현행 재현 팔 — 원본을 폭 ${SHRUNK_WIDTH}px 로 축소해 업로드. 제품 크롭 산출(374×242 급)의 크기만 모사한다.`,
    budget_cap_usd: BUDGET_CAP_USD,
    unit_cost_usd_est: UNIT_COST_USD,
    pricing_note: 'fal 요청별 청구 조회 API 없음 — 비용 = 장수 × 단가 상한 추정',
    jobs: [] as Job[],
  }
}

async function shrinkAndUpload(srcUrl: string, key: string): Promise<{ url: string; dim: string }> {
  const localSrc = join(OUT, `_src_${key}.png`)
  const localDst = join(OUT, `_shrunk_${key}.png`)
  if (!existsSync(localSrc)) {
    const r = await fetch(srcUrl)
    writeFileSync(localSrc, Buffer.from(await r.arrayBuffer()))
  }
  if (!existsSync(localDst)) {
    execFileSync('ffmpeg', ['-y', '-i', localSrc, '-vf', `scale=${SHRUNK_WIDTH}:-2:flags=lanczos`, localDst], { stdio: 'ignore' })
  }
  const buf = readFileSync(localDst)
  const dim = `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
  const url = await fal.storage.upload(new File([buf], `shrunk_${key}.png`, { type: 'image/png' }))
  return { url, dim }
}

// ── 발주 계획 ──────────────────────────────────────────────────────────────
// 원본 팔: 3D 5각도 + 장소사진 1 = 6장
// 축소 팔: 3D 2각도(정면·리버스 — 각도 요구가 가장 큰 쌍) + 장소사진 1 = 3장
const PLAN: Array<{ arm: 'full' | 'shrunk'; bg: { key: string; label: string; url: string } }> = [
  ...VIEWS_3D.map((v) => ({ arm: 'full' as const, bg: v })),
  { arm: 'full', bg: PHOTO_BG },
  { arm: 'shrunk', bg: VIEWS_3D[0] },
  { arm: 'shrunk', bg: VIEWS_3D[1] },
  { arm: 'shrunk', bg: PHOTO_BG },
]

async function main() {
  const prov = readManifest()
  const jobs = prov.jobs as Job[]
  const done = new Set(jobs.filter((j) => j.out_url).map((j) => `${j.arm}:${j.bg_key}`))

  const planned = PLAN.length
  const estTotal = planned * UNIT_COST_USD
  console.log(`계획 ${planned}장 · 예상 상한 $${estTotal.toFixed(2)} / 캡 $${BUDGET_CAP_USD}`)
  if (estTotal > BUDGET_CAP_USD) throw new Error(`예산 캡 초과: $${estTotal.toFixed(2)} > $${BUDGET_CAP_USD}`)

  for (const p of PLAN) {
    const tag = `${p.arm}:${p.bg.key}`
    if (done.has(tag)) {
      console.log(`skip (이미 생성됨) ${tag}`)
      continue
    }
    const job: Job = { arm: p.arm, bg_key: p.bg.key, bg_label: p.bg.label, bg_source_url: p.bg.url }
    try {
      if (p.arm === 'shrunk') {
        const s = await shrinkAndUpload(p.bg.url, p.bg.key)
        job.bg_input_url = s.url
        job.bg_input_dim = s.dim
      } else {
        job.bg_input_url = p.bg.url
        job.bg_input_dim = p.bg.key === PHOTO_BG.key ? PHOTO_BG.dim : VIEW_DIM_3D
      }
      const prompt = buildPrompt(p.bg.label)
      job.prompt = prompt
      console.log(`발주 ${tag} (배경 입력 ${job.bg_input_dim})…`)
      const res = await falImageGenerate({
        model: 'openai/gpt-image-2/edit',
        prompt,
        reference_image_urls: [CHARACTER.sheet_url, job.bg_input_url!],
        aspect_ratio: '16:9',
      })
      job.out_url = res.url
      job.out_dim = `${res.width}x${res.height}`
      job.cost_usd_est = UNIT_COST_USD
      const file = `ff_${p.arm}_${p.bg.key}.png`
      const img = await fetch(res.url)
      writeFileSync(join(OUT, file), Buffer.from(await img.arrayBuffer()))
      job.out_file = `out/${file}`
      console.log(`  → ${res.width}x${res.height}  ${file}`)
    } catch (e) {
      job.error = e instanceof Error ? e.message : String(e)
      console.log(`  ✗ 실패: ${job.error}`)
    }
    jobs.push(job)
    writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  }

  const ok = jobs.filter((j) => j.out_url).length
  ;(prov as Record<string, unknown>).total_cost_usd = Number((ok * UNIT_COST_USD).toFixed(4))
  writeFileSync(MANIFEST, JSON.stringify(prov, null, 2))
  console.log(`\n완료 ${ok}/${jobs.length} · 추정 지출 $${(ok * UNIT_COST_USD).toFixed(2)}`)
}

await main()
