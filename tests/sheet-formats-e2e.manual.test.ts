import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

// #sheet-formats E2E (수동 게이트 — **프로덕션 DB·스토리지에 실제 생성을 씁니다**, CI 항상 skip):
//   RUN_SHEET_E2E=1 pnpm vitest run tests/sheet-formats-e2e.manual.test.ts
//
// 근거: 오너 지시(2026-08-17) "템플릿 storage 업로드 + 파이프라인 배선 후 writer/director 에서
//   잘 나오는지 확인". webtoon_test(오너 테스트 프로젝트)에 실제 러프 force 재생성(1시트)과
//   director 개별 재생성(1샷)을 수행한다 — 오너가 UI 로 직접 누르는 것과 동일한 라우트 경로.
//
// 전부 제품 코드: 라우트 POST 핸들러 그대로 + reconcileJobFromFal(웹훅 대체 폴링 — 로컬엔
//   공개 URL 이 없어 웹훅 생략 경로가 정상이고, poll reconcile 이 그 공식 안전망이다).
//   모킹은 인증 2건뿐(requireProjectAccess/demoWriteBlock — 세션 쿠키 없이 오너 자격 부여).

const LIVE = process.env.RUN_SHEET_E2E === '1'
// 대상은 env 로 오버라이드 가능 — 기본값은 최초 검증(webtoon_test) 좌표.
const PROJECT = process.env.E2E_PROJECT ?? 'a003a8c6-82a1-4b6a-95d6-889a1f57ee08'
const OWNER = 'd93f86e2-bbd6-4a23-b0c4-11a0a4c980ac'
// 세미콜론 = 시트 그룹 구분(그룹별 force 1회 — 호출당 2시트 상한·완료분 재재생성 회피)
const ROUGH_GROUPS = (process.env.E2E_ROUGH_SHOTS ?? 'sh_02_04,sh_02_05,sh_02_06')
  .split(';')
  .map((g) => g.split(',').filter(Boolean))
const REPAINT_SHOT = process.env.E2E_REPAINT_SHOT ?? ROUGH_GROUPS[0][0]
const SKIP_REPAINT = process.env.E2E_SKIP_REPAINT === '1'
const SKIP_SEED = process.env.E2E_SKIP_SEED === '1'

// 라우트 모듈 로드 전에 프로덕션 env 주입 (supabaseAdmin 은 모듈 로드 시 env 를 읽는다).
//   vitest 셋업이 유닛테스트 보호용 센티널(supabase.invalid 등)을 미리 심으므로 **무조건 덮어쓴다**
//   — 이 파일은 게이트 뒤의 라이브 테스트라 실환경 접속이 목적이다.
function loadEnv() {
  const env = readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

vi.mock('@/lib/api/guard', () => ({
  requireProjectAccess: async () => ({ ok: true, userId: OWNER }),
}))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))

const post = (p: string, body: unknown): Request =>
  new Request(`http://localhost${p}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

describe.runIf(LIVE)('sheet-formats E2E — storage 시드 + writer/director 실생성', () => {
  it(
    'templateAssetUrl 시드 → rough force 재생성(세로 grid) → director 개별 재생성(가로 3열 리페인트)',
    async () => {
      loadEnv()
      const outDir = process.env.SHEET_OUT ?? path.join(process.cwd(), 'research/experiments/sheet-formats/out-e2e')
      await mkdir(outDir, { recursive: true })

      const { templateAssetUrl } = await import('@/lib/storage/template-asset')
      const { sheetSpecOf } = await import('@/lib/writer/rough-storyboard-grid')
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const { getGenerationJobById } = await import('@/lib/generation-jobs')
      const { reconcileJobFromFal } = await import('@/lib/fal/reconcile')

      // ── ① 오너 지시: 템플릿 전량 storage 업로드/업데이트 (제품 해시 경로 규약 그대로) ──
      const formats = SKIP_SEED
        ? ([] as const)
        : (['horizontal_16:9', 'vertical_9:16', 'square_1:1', 'cinema_2.39:1'] as const)
      const seeded: string[] = []
      for (const f of formats) {
        for (const v of ['grid4', 'strip1'] as const) {
          const spec = sheetSpecOf(v, f)!
          const url = await templateAssetUrl(spec.templatePath.replace(/^\//, ''))
          expect(url, `${f}:${v} storage url`).toBeTruthy()
          const head = await fetch(url!, { method: 'HEAD' })
          expect(head.ok, `${f}:${v} public 접근`).toBe(true)
          seeded.push(url!)
        }
      }
      // 레거시 2장도 최신 상태 보증 (null 포맷 구 프로젝트용)
      for (const legacy of SKIP_SEED ? [] : ['rough-storyboard-grid.png', 'rough-storyboard-strip.png']) {
        const url = await templateAssetUrl(legacy)
        expect(url).toBeTruthy()
        seeded.push(url!)
      }
      await writeFile(path.join(outDir, 'seeded-urls.json'), JSON.stringify(seeded, null, 2))

      // ── 잔류 queued 잡 정리 — 프로덕션 poll 안전망을 그대로 실행 (쿼터 확보) ──
      const { data: stale } = await supabaseAdmin
        .from('generation_jobs')
        .select('id')
        .eq('project_id', PROJECT)
        .eq('status', 'queued')
      for (const row of stale ?? []) {
        const job = await getGenerationJobById(row.id as string)
        if (job?.status === 'queued') await reconcileJobFromFal(job).catch(() => null)
      }

      const settle = async (jobId: string, label: string) => {
        for (let i = 0; i < 90; i++) {
          await new Promise((r) => setTimeout(r, 5000))
          let job = await getGenerationJobById(jobId)
          if (!job) throw new Error(`${label}: job disappeared`)
          if (job.status === 'queued') job = await reconcileJobFromFal(job)
          if (job.status === 'completed') return job
          if (job.status === 'failed') throw new Error(`${label}: failed — ${job.error}`)
        }
        throw new Error(`${label}: timeout`)
      }
      const frameDims = async (url: string) => {
        const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
        const m = await sharp(buf).metadata()
        return { buf, w: m.width ?? 0, h: m.height ?? 0 }
      }

      // ── ② writer: 러프 force 재생성 — 시트 그룹별 개별 force 호출(완료분 재재생성 회피) ──
      const { POST: roughPOST } = await import('@/app/api/writer/rough-storyboard/route')
      let totalJobs = 0
      for (const group of ROUGH_GROUPS) {
        const roughRes = await roughPOST(
          post('/api/writer/rough-storyboard', {
            projectId: PROJECT,
            shotIds: group,
            force: true,
          }) as never,
        )
        const roughBody = (await roughRes.json()) as {
          ok: boolean
          data?: { submitted: Array<{ jobId: string; shotIds?: string[] }> }
          error?: unknown
        }
        expect(roughBody.ok, `rough submit: ${JSON.stringify(roughBody.error ?? '')}`).toBe(true)
        const ids = [...new Set(roughBody.data!.submitted.map((j) => j.jobId))]
        totalJobs += ids.length
        for (const id of ids) await settle(id, `rough ${id}`)
      }
      expect(totalJobs).toBeGreaterThanOrEqual(1)

      // 검증: 세로 프레임 (셀 9:16 — 레거시 가로 러프가 세로로 교체됐는가)
      const { data: roughShots } = await supabaseAdmin
        .from('shots')
        .select('shot_id, rough_storyboard')
        .eq('project_id', PROJECT)
        .in('shot_id', ROUGH_GROUPS.flat())
      for (const s of roughShots ?? []) {
        const frames = (s.rough_storyboard as { frames?: Record<string, string> } | null)?.frames
        expect(frames?.start, `${s.shot_id} rough frames`).toBeTruthy()
        const { buf, w, h } = await frameDims(frames!.start!)
        expect(w / h, `${s.shot_id} 세로 프레임 (${w}x${h})`).toBeLessThan(0.8)
        await writeFile(path.join(outDir, `rough-${s.shot_id}-start.png`), buf)
      }

      if (SKIP_REPAINT) return

      // ── ③ director: 개별 샷 재생성 — 세로 러프 → 가로 3열 스트립 리페인트 경로 ──
      const { data: shotRow } = await supabaseAdmin
        .from('shots')
        .select('prompt, characters')
        .eq('project_id', PROJECT)
        .eq('shot_id', REPAINT_SHOT)
        .maybeSingle()
      const { data: chars } = await supabaseAdmin
        .from('characters')
        .select('character_id, view_main, portrait')
        .eq('project_id', PROJECT)
        .in('character_id', (shotRow?.characters as string[]) ?? [])
      const charRefs = (chars ?? [])
        .map((c) => (c.view_main as string) || (c.portrait as string))
        .filter(Boolean)

      const { POST: sbPOST } = await import('@/app/api/director/generate-storyboard/route')
      const sbRes = await sbPOST(
        post('/api/director/generate-storyboard', {
          projectId: PROJECT,
          writerShotId: REPAINT_SHOT,
          prompt: (shotRow?.prompt as string) ?? 'repaint the shot faithfully',
          referenceImageUrls: charRefs,
        }),
      )
      const sbBody = (await sbRes.json()) as { ok?: boolean; jobId?: string; mode?: string; error?: string }
      expect(sbBody.jobId, `storyboard submit: ${sbBody.error ?? ''}`).toBeTruthy()
      expect(sbBody.mode).toBe('strip3') // 러프 3프레임 보유 → 스트립 승격
      const sbJob = await settle(sbBody.jobId!, 'storyboard repaint')

      // 검증: 스냅샷이 vertical 시트를 골랐고(sheet_format), 산출 프레임이 세로다
      const snap = sbJob.input_snapshot as { sheet_format?: string } | null
      expect(snap?.sheet_format, 'compose 가 vertical 시트 선택').toBe('vertical_9:16')
      const { data: doneShot } = await supabaseAdmin
        .from('shots')
        .select('storyboard_image')
        .eq('project_id', PROJECT)
        .eq('shot_id', REPAINT_SHOT)
        .maybeSingle()
      const sb = doneShot?.storyboard_image as {
        frames?: Record<string, string>
        stripUrl?: string
      } | null
      expect(sb?.frames?.start).toBeTruthy()
      const { buf: sbuf, w: sw, h: sh } = await frameDims(sb!.frames!.start!)
      expect(sw / sh, `repaint 세로 프레임 (${sw}x${sh})`).toBeLessThan(0.8)
      await writeFile(path.join(outDir, `board-${REPAINT_SHOT}-start.png`), sbuf)
      if (sb?.stripUrl) {
        const { buf: stripBuf, w: stw, h: sth } = await frameDims(sb.stripUrl)
        expect(stw > sth, `가로 3열 시트 (${stw}x${sth})`).toBe(true)
        await writeFile(path.join(outDir, `board-${REPAINT_SHOT}-sheet.png`), stripBuf)
      }
    },
    1_500_000,
  )
})
