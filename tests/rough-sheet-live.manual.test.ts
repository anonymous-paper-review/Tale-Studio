import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import type { ProjectFormat } from '@/types/project'
import type { RoughStoryboardSpec, RoughStoryboardPromptInput } from '@/lib/writer/rough-storyboard'

// #sheet-formats 라이브 하니스 (수동 게이트 — **실제 fal 과금 1콜/실행**, CI 항상 skip):
//   RUN_SHEET_LIVE=1 LIVE_FMT=cinema_2.39:1 pnpm vitest run tests/rough-sheet-live.manual.test.ts
//
// 용도: 실물 프로젝트가 없는 포맷의 러프 시트를 DB 쓰기 없이 끝까지 검증한다 —
//   storage 템플릿 + 프로덕션 셀/프롬프트 빌더로 생성하고, 프로덕션 크롭으로 파싱까지.
//   (라우트 E2E 인 sheet-formats-e2e 와 달리 프로젝트·shots 행이 필요 없다. 처음 쓴 곳:
//    cinema_2.39:1 — 4포맷 중 유일하게 실물 프로젝트가 없어 라우트 E2E 불가, 2026-08-18.)
//
// 재현성 3규칙 준수: 로직은 전부 제품 함수 import(복붙 없음), 셀 입력은 아래 fixture 로 고정,
//   좌표(모델·캔버스·템플릿 URL·프롬프트·request_id)는 out 디렉토리 meta.json 에 기록.

const LIVE = process.env.RUN_SHEET_LIVE === '1'
const FMT = (process.env.LIVE_FMT ?? 'cinema_2.39:1') as ProjectFormat
// (실험 종료) LIVE_GEOM A/B 변수는 제거됨 — 지오메트리 계약은 실측 후 제품
//   buildRoughGridPrompt(grid4)에 채택되어(#geometry-contract) 이제 기본 경로에 포함된다.
const OUT =
  process.env.LIVE_OUT ?? path.join(process.cwd(), 'research/experiments/sheet-formats', `out-live-${FMT.replace(/[^a-z0-9]/gi, '')}`)

// 라우트 모듈 로드 전에 프로덕션 env 주입 (fal apiKey·supabaseAdmin 은 모듈 로드 시 env 를 읽는다).
//   vitest 셋업의 유닛테스트 보호 센티널을 **무조건 덮어쓴다** — 게이트 뒤 라이브 테스트.
function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

// ── fixture: 시네마스코프 4샷 (사막 하이웨이 대치) — rich spec 전 라벨 경로(KEY/렌즈/FOCUS/색온도) 작동 ──
type Fixture = { shotId: string; input: RoughStoryboardPromptInput }
const spec = (v: unknown) => v as RoughStoryboardSpec
const FIXTURE: Fixture[] = [
  {
    shotId: 'sh_cn_01',
    input: {
      shotType: 'WS',
      actionDescription: 'a lone drifter walks down the centerline of an empty desert highway toward camera',
      characterNames: [],
      location: 'abandoned desert highway',
      timeOfDay: 'dusk',
      mood: 'tense',
      durationSeconds: 6,
      spec: spec({
        staticSpec: {
          shot_type: 'WS',
          lens_mm: 32,
          camera_angle: 'eye_level',
          depth_of_field: 'deep',
          framing: {
            rule: 'rule_of_thirds',
            focal_point: 'the lone figure on the horizon line',
            layers: {
              foreground: 'cracked asphalt with a faded center stripe',
              midground: 'the walking figure, long coat',
              background: 'mesas and a low sun on the horizon',
            },
          },
          character_blocking: [
            { position_in_frame: 'center_left', pose: 'walking steadily', gaze: 'ahead' },
          ],
          lighting: { key_direction: 'side_left', quality: 'hard', color_temp_kelvin: 3200 },
        },
        intent: { audience_focus: 'the lone figure on the horizon line', duration_seconds: 6 },
        dynamicSpec: {
          camera_motion: { type: 'dolly', direction: 'in', speed: 'slow' },
          character_motion: [{ verb: 'walk_forward', magnitude: 'large' }],
        },
      }),
    },
  },
  {
    shotId: 'sh_cn_02',
    input: {
      shotType: 'MS',
      actionDescription: 'the drifter halts as a second silhouette steps onto the road far ahead',
      characterNames: [],
      location: 'abandoned desert highway',
      timeOfDay: 'dusk',
      mood: 'tense',
      durationSeconds: 4,
      spec: spec({
        staticSpec: {
          shot_type: 'MS',
          lens_mm: 40,
          camera_angle: 'low',
          depth_of_field: 'shallow',
          framing: {
            rule: 'centered',
            focal_point: 'the coat hem flaring in the wind',
            layers: {
              foreground: 'heat shimmer over asphalt',
              midground: 'the halted figure, coat catching the wind',
              background: 'a tiny second silhouette far up the road',
            },
          },
          character_blocking: [
            { position_in_frame: 'center', pose: 'standing, weight back', gaze: 'ahead' },
          ],
          lighting: { key_direction: 'back', quality: 'hard', color_temp_kelvin: 3400 },
        },
        intent: { audience_focus: 'the coat hem flaring in the wind', duration_seconds: 4 },
        dynamicSpec: {
          camera_motion: { type: 'static', direction: 'none' },
          character_motion: [{ verb: 'halt', magnitude: 'small' }],
        },
      }),
    },
  },
  {
    shotId: 'sh_cn_03',
    input: {
      shotType: 'CU',
      actionDescription: 'the drifter turns to scan the ridgeline',
      characterNames: [],
      location: 'abandoned desert highway',
      timeOfDay: 'dusk',
      mood: 'tense',
      durationSeconds: 3,
      spec: spec({
        staticSpec: {
          shot_type: 'CU',
          lens_mm: 85,
          camera_angle: 'eye_level',
          depth_of_field: 'shallow',
          framing: {
            rule: 'rule_of_thirds',
            focal_point: 'the slow tilt of the blank head',
            layers: {
              foreground: 'collar edge, out of focus',
              midground: 'the blank wooden head in profile',
              background: 'blurred ridgeline',
            },
          },
          character_blocking: [
            { position_in_frame: 'right_third', pose: 'still, alert', gaze: 'left' },
          ],
          lighting: { key_direction: 'side_right', quality: 'soft', color_temp_kelvin: 5800 },
        },
        intent: { audience_focus: 'the slow tilt of the blank head', duration_seconds: 3 },
        dynamicSpec: {
          camera_motion: { type: 'static', direction: 'none' },
          gaze_arc: [{ from: 'left', to: 'right' }],
        },
      }),
    },
  },
  {
    shotId: 'sh_cn_04',
    input: {
      shotType: 'WS',
      actionDescription: 'the two figures advance toward each other down the long straight road',
      characterNames: [],
      location: 'abandoned desert highway',
      timeOfDay: 'dusk',
      mood: 'tense',
      durationSeconds: 8,
      spec: spec({
        staticSpec: {
          shot_type: 'WS',
          lens_mm: 27,
          camera_angle: 'high',
          depth_of_field: 'deep',
          framing: {
            rule: 'symmetry',
            focal_point: 'the shrinking gap of road between the two figures',
            layers: {
              foreground: 'roadside gravel and a leaning mile marker',
              midground: 'two figures approaching each other on the centerline',
              background: 'the highway vanishing point between mesas',
            },
          },
          character_blocking: [
            { position_in_frame: 'left_third', pose: 'walking', gaze: 'right' },
            { position_in_frame: 'right_third', pose: 'walking', gaze: 'left' },
          ],
          lighting: { key_direction: 'top_left', quality: 'hard', color_temp_kelvin: 6500 },
        },
        intent: { audience_focus: 'the shrinking gap between the two figures', duration_seconds: 8 },
        dynamicSpec: {
          camera_motion: { type: 'crane', direction: 'up', speed: 'slow' },
          character_motion: [
            { verb: 'walk_forward', magnitude: 'large' },
            { verb: 'walk_forward', magnitude: 'large' },
          ],
        },
      }),
    },
  },
]

describe.runIf(LIVE)('rough-sheet live — 포맷 시트 실생성 + 프로덕션 크롭 (DB 불요)', () => {
  it(
    `${FMT} grid4: storage 템플릿 → fal 생성 → cropRoughGridFrames 파싱`,
    async () => {
      loadEnv()
      await mkdir(OUT, { recursive: true })

      const { sheetSpecOf, sheetGeometry, buildRoughGridCell, buildRoughGridPrompt } = await import(
        '@/lib/writer/rough-storyboard-grid'
      )
      const { templateAssetUrl } = await import('@/lib/storage/template-asset')
      const { falImageSubmit, falImageFetch, DEFAULT_EDIT_IMAGE_MODEL } = await import(
        '@/lib/writer/llm/fal'
      )
      const { cropRoughGridFrames } = await import('@/lib/writer/rough-grid-crop')

      const sheetSpec = sheetSpecOf('grid4', FMT)
      expect(sheetSpec, `${FMT} spec`).toBeTruthy()
      const geom = sheetGeometry('grid4', FMT)
      const templateUrl = await templateAssetUrl(geom.templatePath.replace(/^\//, ''))
      expect(templateUrl, 'storage 템플릿 URL').toBeTruthy()

      // 프로덕션 라우트와 동일 조립: 셀 → 프롬프트 → edit 모델 + 명시 캔버스 (#sheet-formats)
      const cells = FIXTURE.map((f) => buildRoughGridCell(f.input, f.shotId))
      const prompt = buildRoughGridPrompt(cells, 'grid4', { frameAxis: geom.frameAxis })

      const submittedAt = new Date().toISOString()
      const { request_id, model } = await falImageSubmit({
        model: DEFAULT_EDIT_IMAGE_MODEL,
        prompt,
        reference_image_urls: [templateUrl!],
        image_size: geom.roughImageSize ?? undefined,
      })

      let url: string | null = null
      for (let i = 0; i < 90 && !url; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        const res = await falImageFetch(model, request_id)
        if (res.status === 'COMPLETED') url = res.url
        else if (res.status === 'FAILED') throw new Error(`fal failed: ${res.error}`)
      }
      expect(url, 'fal 완료').toBeTruthy()

      const sheetBuf = Buffer.from(await (await fetch(url!)).arrayBuffer())
      await writeFile(path.join(OUT, 'sheet.png'), sheetBuf)
      const meta = await sharp(sheetBuf).metadata()
      // fal 실측 규약(#fal-canvas): 요청 치수 픽셀 정확 반환 — 어긋나면 스키마 배선이 깨진 것
      expect({ w: meta.width, h: meta.height }, '시트 = 요청 캔버스').toEqual({
        w: sheetSpec!.canvas.width,
        h: sheetSpec!.canvas.height,
      })

      const frames = await cropRoughGridFrames(sheetBuf, 'grid4', FIXTURE.length, FMT)
      expect(frames).toHaveLength(FIXTURE.length)
      const dims: Record<string, string> = {}
      let want: { w: number; h: number } | null = null
      for (let i = 0; i < frames.length; i++) {
        for (const key of ['start', 'direction', 'end'] as const) {
          const buf = frames[i][key]
          const m = await sharp(buf).metadata()
          if (!want) want = { w: m.width!, h: m.height! }
          expect({ w: m.width, h: m.height }, `${FIXTURE[i].shotId} ${key} 균일 크기`).toEqual(want)
          dims[`${FIXTURE[i].shotId}-${key}`] = `${m.width}x${m.height}`
          await writeFile(path.join(OUT, `${FIXTURE[i].shotId}-${key}.png`), buf)
        }
      }

      // 좌표 기록 (재현성 3규칙 ③): 같은 입력 + 같은 채점 기준이 재현의 단위
      await writeFile(
        path.join(OUT, 'meta.json'),
        JSON.stringify(
          {
            format: FMT,
            model,
            request_id,
            image_size: geom.roughImageSize,
            templateUrl,
            submittedAt,
            completedAt: new Date().toISOString(),
            sheet: `${meta.width}x${meta.height}`,
            frame: want ? `${want.w}x${want.h}` : null,
            // 스펙 좌표 동봉 — 오버레이 검증 스크립트가 제품 코드 밖에서 좌표를 재타이핑하지 않게
            spec: { canvas: sheetSpec!.canvas, colBoxes: sheetSpec!.colBoxes, rowBoxes: sheetSpec!.rowBoxes },
            prompt,
          },
          null,
          2,
        ),
      )
    },
    1_200_000,
  )
})
