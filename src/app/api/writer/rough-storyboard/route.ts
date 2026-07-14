// 러프 스토리보드(pre-concept previz) 비동기 생성 — fal submit + generation_jobs.
//
// writer 탭 진입/버튼에서 호출. 서버가 대상 샷을 결정해 멱등으로 submit:
//   - rough_storyboard 가 이미 있는 샷 skip (force 제외)
//   - 같은 kind 의 queued 잡이 있는 샷 skip (재진입/더블클릭 중복 방지)
// 완료는 webhook(/poll reconcile)이 storage 업로드 + shots.rough_storyboard(JSONB) 갱신.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { falImageSubmit, ROUGH_STORYBOARD_IMAGE_MODEL } from '@/lib/writer/llm/fal'
import {
  createGenerationJob,
  AUTO_GENERATION_GIVE_UP_THRESHOLD,
  STALE_QUEUED_MS,
} from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import {
  buildRoughStoryboardPrompt,
  type RoughStoryboardSpec,
} from '@/lib/writer/rough-storyboard'
import { rewriteRoughStoryboardPromptViaLLM } from '@/lib/writer/rough-storyboard-llm'
import { writerShotIdToMain } from '@/lib/writer/adapters'
import { deriveEnBatch } from '@/lib/writer/i18n/derive-en'
import type { ShotDesign } from '@/lib/writer/types/pipeline'

/**
 * L4(shotDesign) 원본을 writer_runs.state 에서 회수해 main shot_id 로 색인.
 *   persist 가 V축 facet 을 평탄화하며 버리므로(증발), 러프보드는 state 의 원본 스펙을 직접 쓴다.
 *   run 이 없거나 구버전이면 빈 맵 — 호출부가 DB fallback 으로 처리. best-effort (throw 금지).
 */
async function loadShotDesignByMainId(
  projectId: string,
): Promise<Map<string, RoughStoryboardSpec>> {
  const byId = new Map<string, RoughStoryboardSpec>()
  try {
    const { data: runs } = await supabaseAdmin
      .from('writer_runs')
      .select('status, shotDesign:state->shotDesign')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5)
    const rows = (runs ?? []) as Array<{ status: string; shotDesign: unknown }>
    const row =
      rows.find((r) => r.status === 'completed' && Array.isArray(r.shotDesign)) ??
      rows.find((r) => Array.isArray(r.shotDesign))
    if (!row) return byId
    for (const d of row.shotDesign as ShotDesign[]) {
      const writerShotId = d?.static_spec?.shot_id ?? d?.intent?.shot_id
      const writerSceneId = d?.intent?.scene_id
      if (!writerShotId || !writerSceneId) continue
      byId.set(writerShotIdToMain(writerShotId, writerSceneId), {
        staticSpec: d.static_spec,
        intent: d.intent,
        dynamicSpec: d.dynamic_spec,
      })
    }
  } catch (e) {
    console.error('[writer/rough-storyboard] shotDesign state load failed:', e)
  }
  return byId
}

/**
 * projectId → 결정적 seed. 프로젝트 내 전 샷이 동일 노이즈 베이스를 공유해 스타일 톤(선·음영·마네킹 질감)이
 *   통일되고, force 재생성 시 재현성이 생긴다(같은 프롬프트→같은 그림). 샷별 변주는 프롬프트 차이가 만든다.
 *   (캐릭터 외형 일관성의 주 레버는 프롬프트의 featureless 강제+네거티브이며, seed 는 톤 베이스라인 보조.)
 */
function seedFromProjectId(projectId: string): number {
  let h = 0
  for (let i = 0; i < projectId.length; i++) h = (Math.imul(31, h) + projectId.charCodeAt(i)) | 0
  return (h >>> 0) % 2_000_000_000
}

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
  try {
    const user = await getUser()
    if (!user)
      return NextResponse.json(
        { ok: false, error: { code: 'unauthorized', message: 'Unauthorized' } },
        { status: 401 },
      )

    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success)
      return NextResponse.json(
        { ok: false, error: { code: 'bad_request', message: parsed.error.message } },
        { status: 400 },
      )
    const { projectId, shotIds, force, styleHints } = parsed.data

    const quota = await checkUserQuota(user.id)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
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
            'shot_id, scene_id, shot_type, action_description, characters, camera_config, lighting_config, focal_length, aperture, rough_storyboard',
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
      (queuedJobs ?? [])
        .map((j) => (j.target as { writerShotId?: string })?.writerShotId)
        .filter(Boolean),
    )
    // 실패 누적 횟수(샷별) — safeMode 파생 + give-up 게이트(임계값 이상이면 자율 재생성 멈춤).
    const failCountByShot = new Map<string, number>()
    for (const j of failedJobs ?? []) {
      const id = (j.target as { writerShotId?: string })?.writerShotId
      if (id) failCountByShot.set(id, (failCountByShot.get(id) ?? 0) + 1)
    }
    const previouslyFailed = new Set(failCountByShot.keys())

    const wanted = shotIds?.length
      ? (shots ?? []).filter((s) => shotIds.includes(s.shot_id as string))
      : (shots ?? [])

    // 언어 경계(S3b): 주 컬럼이 native(수동/편집 샷)일 수 있어, 프롬프트 주입 전 action·mood 를 EN 으로 정규화.
    //   deriveEnBatch 가 이미 영어인 값은 LLM 호출 없이 통과(파이프라인 EN 산출은 무비용, native 만 번역).
    //   장소 라벨·시간대·인물 이름도 정규화(2026-07-03) — s3 오픈 로케이션 계약으로 로케이션 id 가
    //   스토리 언어가 되면서 Setting 줄에 비영어가 그대로 실리게 됨(klein 은 영어 편향 텍스트 인코더).
    const [actionEnByShot, moodEnByScene, translatedSpecs, timeEnByScene, locEnByScene, nameEnById] =
      await Promise.all([
        deriveEnBatch(
          wanted.map((s) => ({ id: s.shot_id as string, native: (s.action_description as string) ?? '' })),
          'shot action description',
        ),
        deriveEnBatch(
          (scenes ?? []).map((sc) => ({ id: sc.scene_id as string, native: (sc.mood as string) ?? '' })),
          'scene mood',
        ),
        // rich 경로 shotDesign 자유서술(blocking·layers·focal·motion) → EN (S3c)
        translateRoughSpecsEn(specByShotId, wanted.map((s) => s.shot_id as string)),
        deriveEnBatch(
          (scenes ?? []).map((sc) => ({ id: sc.scene_id as string, native: (sc.time_of_day as string) ?? '' })),
          'scene time of day',
        ),
        deriveEnBatch(
          (scenes ?? []).map((sc) => ({ id: sc.scene_id as string, native: (sc.location as string) ?? '' })),
          'location place label',
        ),
        deriveEnBatch(
          (chars ?? []).map((c) => ({ id: c.character_id as string, native: (c.name as string) ?? '' })),
          'character name (transliterate to Latin)',
        ),
      ])
    // 프롬프트용 EN 이름 맵 — DB 조회 키(scene.location / characters id)는 원문 유지, 라벨만 EN.
    const nameEnMap = new Map(
      (chars ?? []).map((c) => [
        c.character_id as string,
        nameEnById.get(c.character_id as string) ?? (c.name as string),
      ]),
    )

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

      const scene = sceneById.get(s.scene_id as string)
      const camera = (s.camera_config ?? {}) as { pan?: number }
      const lighting = (s.lighting_config ?? {}) as { position?: string }
      const spec = translatedSpecs.get(shotId) ?? null
      const safeMode = previouslyFailed.has(shotId)
      const rulePrompt = buildRoughStoryboardPrompt({
        shotType: (s.shot_type as string) ?? 'MS',
        actionDescription: actionEnByShot.get(shotId) ?? (s.action_description as string) ?? '',
        characterNames: ((s.characters as string[]) ?? []).map(
          (id) => nameEnMap.get(id) ?? nameById.get(id) ?? id,
        ),
        characterNameById: nameEnMap,
        location: (scene ? locEnByScene.get(scene.scene_id as string) : undefined) ?? (scene?.location as string | undefined),
        locationDescription: locationDescById.get(scene?.location as string) ?? null,
        timeOfDay: (scene ? timeEnByScene.get(scene.scene_id as string) : undefined) ?? (scene?.time_of_day as string | undefined),
        mood: scene
          ? moodEnByScene.get(scene.scene_id as string) ?? (scene.mood as string)
          : undefined,
        cameraPitch: camera.pan ?? null,
        focalLength: (s.focal_length as number | null) ?? null,
        aperture: (s.aperture as number | null) ?? null,
        lightPosition: lighting.position ?? null,
        aspectRatio: '16:9',
        spec,
        safeMode,
        styleHints,
      })

      // 3차+ (force 재시도 & 실패 ≥ 임계값) → LLM이 프롬프트 자체를 moderation-safe 영어로 재생성.
      //   auto 는 위 give-up 게이트에서 이미 skip 되므로, 여기 도달하는 failCount≥임계값은 force 뿐.
      //   호출마다 변주 → "동일 프롬프트 반복" 회피. 실패/거부 시 rulePrompt 로 폴백(모델은 제안만, §3).
      const failCount = failCountByShot.get(shotId) ?? 0
      let prompt = rulePrompt
      let promptSource: 'shotDesign' | 'db_fallback' | 'llm_rewrite' = spec
        ? 'shotDesign'
        : 'db_fallback'
      if (failCount >= AUTO_GENERATION_GIVE_UP_THRESHOLD) {
        const rewritten = await rewriteRoughStoryboardPromptViaLLM({
          previousPrompt: rulePrompt,
          shotType: (s.shot_type as string) ?? 'MS',
          attempt: failCount + 1,
        })
        if (rewritten) {
          prompt = rewritten
          promptSource = 'llm_rewrite'
        }
      }

      // seed 정책: 재생성(force=사람의 명시적 클릭)은 매 호출 다른 seed 로 변주("다시 굴리기" — 같은
      //   프롬프트라도 새 느낌). 파이프라인 첫 생성(!force)은 프로젝트 고정 seed 로 패널 간 톤 통일 유지. (2026-06-25)
      const seed = force
        ? Math.floor(Math.random() * 2_000_000_000)
        : seedFromProjectId(projectId)
      const { request_id, model } = await falImageSubmit({
        // previz 스케치 — 비용/속도 우선 경량 모델 (모델 ID 의 진실은 fal.ts)
        model: ROUGH_STORYBOARD_IMAGE_MODEL,
        prompt,
        // negative_prompt 미전달 — klein 은 CFG/negative 미지원(스키마 확인, 2026-07-13). 차단 의도는
        //   buildRoughStoryboardPrompt 의 긍정문(FIGURE_RULE·CU_FRONT·SINGLE_FRONT·PANEL_STYLE)으로 이관.
        seed,
        aspect_ratio: '16:9',
        webhookUrl: resolveWebhookUrl(),
      })
      const job = await createGenerationJob({
        projectId,
        requestId: request_id,
        model,
        kind: 'shot_rough_storyboard',
        target: { workspaceId: project.workspace_id, writerShotId: shotId },
        // 재생성 프롬프트를 회수 가능하게 저장(이전엔 미저장이라 DB에서 못 봤음).
        inputSnapshot: { prompt, promptSource, safeMode, seed },
      })
      submitted.push({
        shotId,
        jobId: job.id,
        promptSource,
        safeMode,
      })
    }

    return NextResponse.json({ ok: true, data: { submitted, skipped } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[writer/rough-storyboard]', msg)
    return NextResponse.json(
      { ok: false, error: { code: 'internal', message: msg } },
      { status: 500 },
    )
  }
}
