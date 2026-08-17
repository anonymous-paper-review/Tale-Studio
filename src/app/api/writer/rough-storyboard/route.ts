// 러프 스토리보드(pre-concept previz) 비동기 생성 — fal submit + generation_jobs.
//
// writer 탭 진입/버튼에서 호출. 서버가 대상 샷을 결정해 멱등으로 submit:
//   - rough_storyboard 가 이미 있는 샷 skip (force 제외)
//   - 같은 kind 의 queued 잡이 있는 샷 skip (재진입/더블클릭 중복 방지)
// 완료는 webhook(/poll reconcile)이 storage 업로드 + shots.rough_storyboard(JSONB) 갱신.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { falImageSubmit, DEFAULT_EDIT_IMAGE_MODEL, DEFAULT_IMAGE_MODEL } from '@/lib/writer/llm/fal'
import {
  createGenerationJob,
  AUTO_GENERATION_GIVE_UP_THRESHOLD,
  STALE_QUEUED_MS,
} from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { isRichStaticSpec, type RoughStoryboardSpec } from '@/lib/writer/rough-storyboard'
// L4(shotDesign) state 로더 — 공용 lib(#motion-contract): 비디오 라우트와 공유.
import { loadShotDesignByMainId, resolveShotDesign } from '@/lib/writer/shot-design-state'
import {
  buildRoughGridCell,
  buildRoughGridPrompt,
  buildCellContinuityLine,
  GRID_MAX_SHOTS,
  sheetGeometry,
  type RoughGridVariant,
} from '@/lib/writer/rough-storyboard-grid'
import { parseProjectFormat } from '@/types/project'
import { templateAssetUrl } from '@/lib/storage/template-asset'
import { parseCheckConstraints } from '@/lib/writer/check-notes'
import { deriveEnBatch } from '@/lib/writer/i18n/derive-en'


export const runtime = 'nodejs'
export const maxDuration = 60

// queued 잡이 webhook 유실(서버리스 fire-and-forget 종료 등)로 영영 미해결로 남으면, in_flight 가드가
//   그 샷의 재생성을 영구 차단한다(아래 루프에서 force 보다 먼저 검사 → 사람이 눌러도 skip). fal 잡은
//   maxDuration(60s) 안에 끝나므로, 이보다 한참 오래된 queued 는 버려진 것으로 보고 in_flight 에서 제외한다
//   (2026-06-26, shot_9 가 stuck queued 로 재생성이 막혀 "검은 화면 그대로"이던 버그). 정상 중복 방지는 유지.
//   TTL 값은 generation_jobs 상태/lock 집계와 공유한다(STALE_QUEUED_MS).

const BodySchema = z.object({
  projectId: z.string().uuid(),
  /** 지정 시 해당 샷만 (per-shot 재생성). 미지정 시 누락분 전체. */
  shotIds: z.array(z.string()).optional(),
  /** true 면 기존 rough_storyboard 가 있어도 재생성 (단, queued 잡 중복은 여전히 skip) */
  force: z.boolean().optional(),
  /** 방향 칩 — 상대적 연출 방향(영문 수식어). force 재생성과 함께 프롬프트 Emphasis 로 주입. */
  styleHints: z.array(z.string()).max(8).optional(),
})

/**
 * rich 경로 shotDesign(state)의 자유서술(framing layers·focal·blocking 포즈·motion verb)을 영어 base 로 정규화.
 *   shotDesign 은 표시되지 않는 파이프라인 내부 상태라 native 보존 불요 — 생성용 EN 만 필요(language boundary S3c).
 *   deriveEnBatch 가 이미 영어면 LLM skip(파이프라인 한국어 산출만 번역). 캐싱 없이 호출당 1배치(추후 최적화 여지).
 */
async function translateRoughSpecsEn(
  specByShotId: Map<string, RoughStoryboardSpec>,
  shotIds: string[],
): Promise<Map<string, RoughStoryboardSpec>> {
  const items: Array<{ id: string; native: string }> = []
  for (const sid of shotIds) {
    const spec = specByShotId.get(sid)
    if (!spec) continue
    const s = spec.staticSpec
    const layers = s.framing.layers
    if (layers.foreground) items.push({ id: `${sid}|fg`, native: layers.foreground })
    if (layers.midground) items.push({ id: `${sid}|mg`, native: layers.midground })
    if (layers.background) items.push({ id: `${sid}|bg`, native: layers.background })
    if (s.framing.focal_point) items.push({ id: `${sid}|focal`, native: s.framing.focal_point })
    if (spec.intent?.audience_focus) items.push({ id: `${sid}|aud`, native: spec.intent.audience_focus })
    s.character_blocking.forEach((b, i) => {
      if (b.pose) items.push({ id: `${sid}|pose.${i}`, native: b.pose })
    })
    ;(spec.dynamicSpec?.character_motion ?? []).forEach((m, i) => {
      if (m.verb) items.push({ id: `${sid}|verb.${i}`, native: m.verb })
    })
  }
  if (!items.length) return specByShotId
  const en = await deriveEnBatch(items, 'rough storyboard shot-design facets')
  const out = new Map(specByShotId)
  for (const sid of shotIds) {
    const spec = specByShotId.get(sid)
    if (!spec) continue
    const s = spec.staticSpec
    const layers = s.framing.layers
    out.set(sid, {
      ...spec,
      staticSpec: {
        ...s,
        framing: {
          ...s.framing,
          layers: {
            foreground: en.get(`${sid}|fg`) ?? layers.foreground,
            midground: en.get(`${sid}|mg`) ?? layers.midground,
            background: en.get(`${sid}|bg`) ?? layers.background,
          },
          focal_point: en.get(`${sid}|focal`) ?? s.framing.focal_point,
        },
        character_blocking: s.character_blocking.map((b, i) => ({
          ...b,
          pose: en.get(`${sid}|pose.${i}`) ?? b.pose,
        })),
      },
      intent: spec.intent
        ? { ...spec.intent, audience_focus: en.get(`${sid}|aud`) ?? spec.intent.audience_focus }
        : spec.intent,
      dynamicSpec: spec.dynamicSpec
        ? {
            ...spec.dynamicSpec,
            character_motion: spec.dynamicSpec.character_motion.map((m, i) => ({
              ...m,
              verb: en.get(`${sid}|verb.${i}`) ?? m.verb,
            })),
          }
        : spec.dynamicSpec,
    })
  }
  return out
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success)
      return NextResponse.json(
        { ok: false, error: { code: 'bad_request', message: parsed.error.message } },
        { status: 400 },
      )
    const { projectId, shotIds, force, styleHints } = parsed.data

    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response

    const quota = await checkUserQuota(access.userId!)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id, settings')
      .eq('id', projectId)
      .maybeSingle()
    if (!project)
      return NextResponse.json(
        { ok: false, error: { code: 'not_found', message: 'project not found' } },
        { status: 404 },
      )

    const [
      { data: shots },
      { data: scenes },
      { data: locations },
      { data: chars },
      { data: queuedJobs },
      { data: failedJobs },
      specByShotId,
    ] = await Promise.all([
        supabaseAdmin
          .from('shots')
          .select(
            'shot_id, scene_id, shot_type, action_description, characters, camera_config, lighting_config, focal_length, aperture, duration_seconds, rough_storyboard, design_ref, check_notes, prompt, static_spec, dynamic_spec',
          )
          .eq('project_id', projectId)
          .order('sort_order'),
        supabaseAdmin
          .from('scenes')
          .select('scene_id, location, time_of_day, mood')
          .eq('project_id', projectId),
        supabaseAdmin
          .from('locations')
          .select('location_id, visual_description')
          .eq('project_id', projectId),
        supabaseAdmin
          .from('characters')
          .select('character_id, name')
          .eq('project_id', projectId),
        supabaseAdmin
          .from('generation_jobs')
          .select('target')
          .eq('project_id', projectId)
          .eq('kind', 'shot_rough_storyboard')
          .eq('status', 'queued')
          .gte('created_at', new Date(Date.now() - STALE_QUEUED_MS).toISOString()),
        // 직전 실패 이력 → safe mode 파생 (fal 입력 모더레이션 우회 재시도).
        // 별도 상태 저장 없음 — 실패 잡의 존재가 진실 (architecture §0).
        supabaseAdmin
          .from('generation_jobs')
          .select('target')
          .eq('project_id', projectId)
          .eq('kind', 'shot_rough_storyboard')
          .eq('status', 'failed'),
        loadShotDesignByMainId(projectId),
      ])

    const sceneById = new Map((scenes ?? []).map((s) => [s.scene_id as string, s]))
    // scene.location 은 location_id (오픈캐스트: 원문 텍스트가 곧 id). 그 로케이션의 visual_description 을
    //   db_fallback 배경으로 끌어온다 (rich 경로는 framing.layers 사용 → 미사용).
    const locationDescById = new Map(
      (locations ?? []).map((l) => [l.location_id as string, l.visual_description as string | null]),
    )
    const nameById = new Map(
      (chars ?? []).map((c) => [c.character_id as string, c.name as string]),
    )
    const inFlight = new Set(
      (queuedJobs ?? []).flatMap((j) => {
        const t = j.target as { writerShotId?: string; writerShotIds?: string[] }
        // 그리드 잡(writerShotIds, #rough-grid)과 구 단일 잡(writerShotId) 모두 중복 방지 대상.
        return [...(t?.writerShotIds ?? []), ...(t?.writerShotId ? [t.writerShotId] : [])]
      }),
    )
    // 실패 누적 횟수(샷별) — safeMode 파생 + give-up 게이트(임계값 이상이면 자율 재생성 멈춤).
    const failCountByShot = new Map<string, number>()
    for (const j of failedJobs ?? []) {
      const id = (j.target as { writerShotId?: string })?.writerShotId
      if (id) failCountByShot.set(id, (failCountByShot.get(id) ?? 0) + 1)
    }

    const wanted = shotIds?.length
      ? (shots ?? []).filter((s) => shotIds.includes(s.shot_id as string))
      : (shots ?? [])

    // 게이트 선별(번역·제출 전 무비용 판정) — 대상 확정을 먼저 해서 아래 무거운 작업을 캡에 맞춘다.
    const submitted: Array<{
      shotId: string
      jobId: string
      promptSource: 'shotDesign' | 'db_fallback' | 'llm_rewrite'
      safeMode: boolean
    }> = []
    const skipped: Array<{
      shotId: string
      reason: 'exists' | 'in_flight' | 'gave_up' | 'no_info'
    }> = []
    const eligible: NonNullable<typeof shots> = []
    for (const s of wanted) {
      const shotId = s.shot_id as string
      // #5 정보 가드(서버 = 최종 방어선): 액션(스토리)이 비면 만들 근거가 없다 — 누가 호출하든
      //   (자동/누락 일괄/상세 재생성/방향칩) 생성하지 않는다. force 도 예외 아님(빈 입력엔 재생성도 무의미).
      //   클라 게이트는 UX일 뿐, 실제 차단·과금 방어는 여기서 한다(architecture §3).
      if (!((s.action_description as string) ?? '').trim()) {
        skipped.push({ shotId, reason: 'no_info' })
        continue
      }
      if (inFlight.has(shotId)) {
        skipped.push({ shotId, reason: 'in_flight' })
        continue
      }
      if (!force && s.rough_storyboard) {
        skipped.push({ shotId, reason: 'exists' })
        continue
      }
      // give-up 게이트: force(사람의 명시적 재생성)가 아니면, 반복 실패 샷은 자율 재생성을 멈춘다
      //   (모더레이션 등 결정론적 실패의 무한 재제출·fal 과금 차단). 회복은 카드의 "다시 시도"(force).
      if (!force && (failCountByShot.get(shotId) ?? 0) >= AUTO_GENERATION_GIVE_UP_THRESHOLD) {
        skipped.push({ shotId, reason: 'gave_up' })
        continue
      }
      eligible.push(s)
    }

    // 그리드 제출 캡(#rough-grid 2026-07-22, 구 #c1·#c3 계승) — 잡 1개 = 그리드 1장 = 샷 최대 4개.
    //   호출당 그리드 2장(샷 8) = 쿼터 8 중 잡 2개만 소비(구 klein 6잡 대비 여유). 번역 배치도
    //   샷 8개 분량이라 maxDuration(60s) 내 안전. 잔여는 remaining 으로 클라 펌프가 라운드를 이어간다.
    //   단일샷 재생성(shotIds 1개)은 1열 스트립(strip1)으로 3프레임만 다시 만든다.
    const MAX_GRID_JOBS_PER_CALL = 2
    const gridVariant: RoughGridVariant =
      shotIds?.length === 1 && eligible.length === 1 ? 'strip1' : 'grid4'
    const perGrid = gridVariant === 'strip1' ? 1 : GRID_MAX_SHOTS
    const targets = eligible.slice(0, MAX_GRID_JOBS_PER_CALL * perGrid)
    // #grid-shift(2026-08-05): 그리드가 씬 경계를 가로지르지 않게 절단 — 혼재 시트(sc_01 5·6 +
    //   sc_02 7·8)에서 칸 밀림 실측. 남는 칸은 기존 empties 처리(빈 종이). 잡 수 상한은 유지.
    const chunkPlan: Array<typeof targets> = []
    for (const s of targets) {
      const last = chunkPlan[chunkPlan.length - 1]
      if (!last || last.length >= perGrid || last[0].scene_id !== s.scene_id) chunkPlan.push([s])
      else last.push(s)
    }
    const cappedChunks = chunkPlan.slice(0, MAX_GRID_JOBS_PER_CALL)
    const plannedCount = cappedChunks.reduce((n, c) => n + c.length, 0)
    const remaining = eligible.length - plannedCount

    // 언어 경계(S3b): 주 컬럼이 native(수동/편집 샷)일 수 있어, 프롬프트 주입 전 action·mood 를 EN 으로 정규화.
    //   deriveEnBatch 가 이미 영어인 값은 LLM 호출 없이 통과(파이프라인 EN 산출은 무비용, native 만 번역).
    //   장소 라벨·시간대·인물 이름도 정규화(2026-07-03) — s3 오픈 로케이션 계약으로 로케이션 id 가
    //   스토리 언어가 되면서 Setting 줄에 비영어가 그대로 실리게 됨(klein 은 영어 편향 텍스트 인코더).
    //   범위는 이번 호출의 targets(캡 이후)가 속한 씬/등장 인물로 한정 — 캡의 시간 예산을 지키는 본체.
    const targetSceneIds = new Set(targets.map((s) => s.scene_id as string))
    const targetScenes = (scenes ?? []).filter((sc) => targetSceneIds.has(sc.scene_id as string))
    const targetCharIds = new Set(targets.flatMap((s) => ((s.characters as string[]) ?? [])))
    const targetChars = (chars ?? []).filter((c) => targetCharIds.has(c.character_id as string))
    // #n-1: 같은 씬 직전 샷의 종료 상태 텍스트(EN prompt 우선) — 그리드 경계를 넘는 연속성 줄 재료.
    const prevTextByShotId = new Map<string, string>()
    {
      let prevRow: Record<string, unknown> | null = null
      for (const s of shots ?? []) {
        if (prevRow && prevRow.scene_id === s.scene_id) {
          const t = ((prevRow.prompt as string) || (prevRow.action_description as string) || '').trim()
          if (t) prevTextByShotId.set(s.shot_id as string, t)
        }
        prevRow = s as Record<string, unknown>
      }
    }

    // #p2-wiring: 분할·리넘버를 겪은 샷은 design_ref(부모 v4 id)로 rich spec 을 조인.
    // #split-spec(2026-08-10): ref 체계 프로젝트에서 ref 없는 샷(분할 자식)은 main-id 폴백 금지 —
    //   리넘버 뒤 옆 샷 설계를 훔쳐와 설명과 무관한 러프가 그려졌다(실측 e1a9fd08 sh_03_15:
    //   "도면을 옷에 숨긴다" 셀에 원설계 shot_15(추적자 돌격) blocking/focal 이 조인됨).
    //   그런 샷은 spec 없이 DB fallback 셀(빈약하지만 올바름)로 간다. 판정은 전 샷 기준.
    const projectUsesDesignRefs = (shots ?? []).some(
      (s) => typeof s.design_ref === 'string' && s.design_ref,
    )
    const resolvedSpecByShotId = new Map<string, RoughStoryboardSpec>()
    for (const s of targets) {
      const sid = s.shot_id as string
      const spec = resolveShotDesign(specByShotId, {
        shotId: sid,
        designRef: typeof s.design_ref === 'string' ? s.design_ref : null,
      }, projectUsesDesignRefs)
      if (spec) {
        resolvedSpecByShotId.set(sid, spec)
        continue
      }
      // state 조인 미스 → shots 컬럼 폴백 (#split-inherit 2026-08-12). 분할 둘째+ 자식은
      //   design_ref 가 의도적으로 없지만(#split-spec — 옆 설계 훔침 방지), persist 가 부분
      //   상속 스펙을 컬럼에 남긴다. 컬럼은 그 샷 자신의 값이라 훔침 위험이 없다 — 영상
      //   라우트의 "shots.dynamic_spec 우선" 선례와 같은 원칙. 레거시/수동 샷은 컬럼이
      //   없으므로 기존 db_fallback 그대로.
      const colStatic = s.static_spec as RoughStoryboardSpec['staticSpec'] | null
      // rich 모양일 때만 채택 (#v2-rough-500 2026-08-17): static_spec 컬럼은 rich 부분상속
      //   (#split-inherit) 외에 writer-v2 previz 스펙 등 다른 계약의 provenance 도 담긴다.
      //   rich 소비자(translateRoughSpecsEn·시트 셀)는 framing.layers·character_blocking 을
      //   가드 없이 역참조하므로, 모양이 다른 스펙을 채택하면 라우트가 500 으로 죽는다
      //   (실측: writer-v2 프로젝트 러프 제출 전량 실패). 모양이 아니면 db_fallback 셀로.
      if (colStatic && isRichStaticSpec(colStatic)) {
        resolvedSpecByShotId.set(sid, {
          staticSpec: colStatic,
          dynamicSpec:
            (s.dynamic_spec as RoughStoryboardSpec['dynamicSpec'] | null) ?? undefined,
        })
      }
    }
    const [actionEnByShot, moodEnByScene, translatedSpecs, timeEnByScene, locEnByScene, nameEnById] =
      await Promise.all([
        deriveEnBatch(
          targets.map((s) => ({ id: s.shot_id as string, native: (s.action_description as string) ?? '' })),
          'shot action description',
        ),
        deriveEnBatch(
          targetScenes.map((sc) => ({ id: sc.scene_id as string, native: (sc.mood as string) ?? '' })),
          'scene mood',
        ),
        // rich 경로 shotDesign 자유서술(blocking·layers·focal·motion) → EN (S3c)
        translateRoughSpecsEn(resolvedSpecByShotId, targets.map((s) => s.shot_id as string)),
        deriveEnBatch(
          targetScenes.map((sc) => ({ id: sc.scene_id as string, native: (sc.time_of_day as string) ?? '' })),
          'scene time of day',
        ),
        deriveEnBatch(
          targetScenes.map((sc) => ({ id: sc.scene_id as string, native: (sc.location as string) ?? '' })),
          'location place label',
        ),
        deriveEnBatch(
          targetChars.map((c) => ({ id: c.character_id as string, native: (c.name as string) ?? '' })),
          'character name (transliterate to Latin)',
        ),
      ])
    // 프롬프트용 EN 이름 맵 — DB 조회 키(scene.location / characters id)는 원문 유지, 라벨만 EN.
    const nameEnMap = new Map(
      targetChars.map((c) => [
        c.character_id as string,
        nameEnById.get(c.character_id as string) ?? (c.name as string),
      ]),
    )

    // 그리드 청크 제출(#rough-grid): targets 를 열 수(perGrid)씩 묶어 그리드/스트립 1장씩 submit.
    //   템플릿(public asset)을 gpt-image-2/edit reference 로 — base URL 없으면(로컬 무터널) T2I 폴백
    //   (모델이 시트째 그림 — crop 비례 좌표가 근사라 dev 전용 저품질 경로. 프로덕션은 항상 edit).
    //   klein 전용 장치(seed 톤 고정·safeMode 프롬프트 축약·llm_rewrite)는 폐기 — instruction 모델이라
    //   불필요. give-up 게이트(반복 실패 자율 재생성 중단)는 위 선별에서 그대로 작동.
    // 템플릿은 앱 public URL(터널)이 아니라 스토리지에서 제공한다 — 터널이 죽으면 fal 이
    //   422 file_download_error 로 전량 실패하던 경로(2026-08-13). 자세한 이유는 template-asset.ts.
    // #sheet-formats(2026-08-17): 프로듀서 포맷 전용 시트 — 셀이 포맷 종횡비를 갖는 템플릿 +
    //   명시 캔버스(실측 4/4 수락). 레거시(horizontal·포맷 미상)는 종전 템플릿 + 'auto'
    //   (reference 비율 유지 — crop 좌표 정합의 핵심) 그대로: 검증된 동작 불변.
    const projectFormat = parseProjectFormat(
      (project.settings as { format?: unknown } | null)?.format,
    )
    const sheetGeom = sheetGeometry(gridVariant, projectFormat)
    const templateUrl = await templateAssetUrl(sheetGeom.templatePath.replace(/^\//, ''))
    const webhookUrl = resolveWebhookUrl()

    for (const chunk of cappedChunks) {
      const cells = chunk.map((s, ci) => {
        const shotId = s.shot_id as string
        const scene = sceneById.get(s.scene_id as string)
        const camera = (s.camera_config ?? {}) as { pan?: number }
        const lighting = (s.lighting_config ?? {}) as { position?: string }
        const cell = buildRoughGridCell(
          {
            shotType: (s.shot_type as string) ?? 'MS',
            actionDescription:
              actionEnByShot.get(shotId) ?? (s.action_description as string) ?? '',
            characterNames: ((s.characters as string[]) ?? []).map(
              (id) => nameEnMap.get(id) ?? nameById.get(id) ?? id,
            ),
            characterNameById: nameEnMap,
            location:
              (scene ? locEnByScene.get(scene.scene_id as string) : undefined) ??
              (scene?.location as string | undefined),
            locationDescription: locationDescById.get(scene?.location as string) ?? null,
            timeOfDay:
              (scene ? timeEnByScene.get(scene.scene_id as string) : undefined) ??
              (scene?.time_of_day as string | undefined),
            mood: scene
              ? moodEnByScene.get(scene.scene_id as string) ?? (scene.mood as string)
              : undefined,
            cameraPitch: camera.pan ?? null,
            focalLength: (s.focal_length as number | null) ?? null,
            aperture: (s.aperture as number | null) ?? null,
            lightPosition: lighting.position ?? null,
            durationSeconds: (s.duration_seconds as number | null) ?? null,
            spec: translatedSpecs.get(shotId) ?? null,
            styleHints,
          },
          shotId,
        )
        // shotCheck 채널1(#p2-wiring) 제약 + 이전 샷 연속성 줄(#n-1)을 START 꼬리에 첨부.
        //   #grid-shift: 연속성 줄은 그리드의 "첫 칸"에만 — 같은 시트 안 인접 칸은 모델이 옆
        //   칸을 직접 보며 그리므로 텍스트 참조가 중복이고, 과잉 참조가 칸 밀림을 유발했다.
        const constraints = parseCheckConstraints(s.check_notes)
        const contLine = ci === 0 ? buildCellContinuityLine(prevTextByShotId.get(shotId)) : null
        const extra = [
          contLine,
          constraints.length ? `Continuity constraints: ${constraints.join('; ')}` : null,
        ].filter(Boolean)
        return extra.length ? { ...cell, start: `${cell.start}. ${extra.join('. ')}` } : cell
      })

      let prompt = buildRoughGridPrompt(cells, gridVariant, { frameAxis: sheetGeom.frameAxis })
      if (styleHints?.length) prompt += `\n\nEmphasis for every panel: ${styleHints.join(', ')}.`
      if (!templateUrl) {
        prompt = `Create the storyboard sheet yourself on clean paper (no reference image available), matching the panel layout described below, then fill it.\n\n${prompt}`
      }

      const { request_id, model } = await falImageSubmit(
        templateUrl
          ? {
              model: DEFAULT_EDIT_IMAGE_MODEL, // gpt-image-2/edit — 템플릿 칸에 그려 넣기
              prompt,
              reference_image_urls: [templateUrl],
              // 포맷 시트는 캔버스 명시(=템플릿 치수, #sheet-formats) / 레거시는 미전달 →
              //   image_size 'auto' (reference 비율 유지 — crop 좌표 정합의 핵심, 종전 그대로)
              ...(sheetGeom.roughImageSize ? { image_size: sheetGeom.roughImageSize } : {}),
              webhookUrl,
            }
          : {
              model: DEFAULT_IMAGE_MODEL, // T2I 폴백 (dev)
              prompt,
              aspect_ratio: (() => {
                const [w, h] = sheetGeom.repaintCanvas.split('x').map(Number)
                return w > h ? '16:9' : w < h ? '9:16' : '1:1'
              })(),
              webhookUrl,
            },
      )
      const chunkShotIds = chunk.map((s) => s.shot_id as string)
      const job = await createGenerationJob({
        projectId,
        requestId: request_id,
        model,
        kind: 'shot_rough_storyboard',
        target: {
          workspaceId: project.workspace_id,
          writerShotIds: chunkShotIds,
          gridVariant,
        },
        inputSnapshot: {
          prompt,
          gridVariant,
          shotIds: chunkShotIds,
          templateUrl,
          // 포맷 시트를 썼을 때만 기록 — finalize 크롭이 같은 좌표·프레임 축을 복원 (#sheet-formats)
          sheet_format: sheetGeom.roughImageSize ? projectFormat : null,
        },
      })
      for (const s of chunk) {
        const shotId = s.shot_id as string
        submitted.push({
          shotId,
          jobId: job.id,
          promptSource: translatedSpecs.get(shotId) ? 'shotDesign' : 'db_fallback',
          safeMode: false,
        })
      }
    }

    return NextResponse.json({ ok: true, data: { submitted, skipped, remaining } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/rough-storyboard]', msg)
    return NextResponse.json(
      { ok: false, error: { code: 'internal', message: msg } },
      { status: 500 },
    )
  }
}
