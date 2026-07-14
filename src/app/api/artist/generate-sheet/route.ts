// 캐릭터 단일 뷰 생성 (crop 폐기 / front 통합, 2026-06-05)
//
// main = 정면 풀바디 대표 포트레이트(T2I, 이전 front 역할 겸함). back/sideLeft/sideRight = main 을
// reference 로 한 image-to-image(openai/gpt-image-2/edit). 한 번에 한 뷰만 생성한다 — 호출자(artist-store)가
// concurrency 를 제어하며 캐릭터/뷰 단위로 병렬 호출한다.
//
// DB 디자인 토큰(characters.appearance/costume + projects.design_tokens)으로 프롬프트 조립.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { falImageSubmit, type FalImageOptions } from '@/lib/writer/llm/fal'
import {
  createGenerationJob,
  countFailedJobsForTarget,
  hasQueuedCharacterViewJob,
  AUTO_GENERATION_GIVE_UP_THRESHOLD,
  listFailedCharacterViewJobs,
  type GenerationJobActor,
} from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl, resolveWebhookBaseUrl } from '@/lib/fal/webhook-url'
import {
  buildCharacterMainPrompt,
  buildCharacterTurnaroundPrompt,
  buildCharacterViewPrompt,
  type CharacterPromptInput,
  type DirectionalView,
} from '@/lib/artist/turnaround'
import {
  CHARACTER_VIEW_COLUMNS,
  CHARACTER_VIEW_KEYS,
  type CharacterViewKey,
} from '@/types/asset'
import { computeImageSourceHash, computeLookFingerprint } from '@/lib/image-provenance'
import { SAFE_RETRY_CAP } from '@/lib/artist/safe-retry'
import { applyStyleAnchor, resolveStyleAnchorByKey } from '@/lib/style-anchor'

export const runtime = 'nodejs'
// submit만 하고 끝 — 실제 생성은 fal 큐에서 진행, 완료는 webhook(/poll reconcile)이 처리.
export const maxDuration = 60

// projects.design_tokens JSONB shape (008_svc_design_tokens.sql 주석 기준, 부분)
interface DesignTokens {
  l1?: {
    art_style?: string
    shape_language?: string
    line_quality?: string
    texture_philosophy?: string
    character_proportion?: string
  }
  palette?: { primary?: string; secondary?: string; accent?: string }
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // 멀티유저 쿼터 (Phase 3): 유저 in-flight 작업이 상한이면 429.
    const quota = await checkUserQuota(user.id)
    if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })

    const { projectId, characterId, view, actor, instruction, safeMode } = (await req.json()) as {
      projectId?: string
      characterId?: string
      view?: CharacterViewKey
      actor?: string
      instruction?: string // 재생성 시 유저 델타(merge) — 룩 토대 위에 덮음(AC13).
      safeMode?: boolean // 모더레이션 우회 재시도(#A) — 직전 실패가 moderation-class 인 슬롯에만 적용.
    }
    // 클라이언트 진입점 귀속 — 'chat'(글로벌 채팅 updates)만 구분, 그 외는 전부 'ui'.
    const jobActor: GenerationJobActor = actor === 'chat' ? 'chat' : 'ui'
    if (!projectId || !characterId || !view) {
      return NextResponse.json(
        { error: 'projectId, characterId, view required' },
        { status: 400 },
      )
    }
    if (!CHARACTER_VIEW_KEYS.includes(view)) {
      return NextResponse.json({ error: `invalid view: ${view}` }, { status: 400 })
    }

    // give-up 게이트: 자율 first-fill(actor='auto')은 같은 슬롯(캐릭터×뷰) 실패가 임계값 이상이면
    //   멈춘다(무한 재시도·fal 과금 차단). 사람의 명시적 재생성(ui/chat)은 통과 → 회복(architecture §5).
    if (actor === 'auto') {
      const failed = await countFailedJobsForTarget(projectId, 'character_view', {
        characterId,
        column: CHARACTER_VIEW_COLUMNS[view],
      })
      if (failed >= AUTO_GENERATION_GIVE_UP_THRESHOLD) {
        console.warn(
          `[artist/generate-sheet] give-up: ${characterId}/${view} 실패 ${failed}회 누적 → 자동 생성 skip`,
        )
        return NextResponse.json({ ok: true, skipped: true, reason: 'gave_up', failed })
      }
    }

    // 중복 제출 가드(DB-authoritative): 같은 슬롯(캐릭터×뷰)에 이미 queued 잡이 있으면 새 fal 제출 생략.
    //   in-memory generatingViews 는 remount 에 소실되므로 서버 DB 가 진실. 온보딩 "진행" 재클릭/
    //   탭 복귀 시 in-flight 슬롯의 이중 과금을 막는다. 정당한 재생성(비-queued 슬롯)은 그대로 통과.
    if (await hasQueuedCharacterViewJob(projectId, characterId, view)) {
      return NextResponse.json({ ok: true, status: 'queued', deduped: true, view })
    }

    // safe-mode 자격/상한(#A): 요청 시 슬롯의 최근 실패를 본다 — moderation-class 실패에만 safe transform 적용,
    //   일반 실패는 원본 프롬프트로 재시도(충실도 보존). ui/chat 은 SAFE_RETRY_CAP 으로 비용 ceiling(give-up 미적용).
    let effectiveSafeMode = false
    if (safeMode === true) {
      const failures = await listFailedCharacterViewJobs(projectId)
      const slot = failures.find((f) => f.characterId === characterId && f.view === view)
      if (slot) {
        if ((jobActor === 'ui' || jobActor === 'chat') && slot.safeFailCount >= SAFE_RETRY_CAP) {
          return NextResponse.json({ ok: true, skipped: true, reason: 'capped', safeFailCount: slot.safeFailCount })
        }
        effectiveSafeMode = slot.moderation
      }
    }

    // 1. 프로젝트(workspace + 디자인 토큰) + 캐릭터 로드 (view_main = i2i reference)
    const [{ data: project }, { data: character }] = await Promise.all([
      supabaseAdmin
        .from('projects')
        .select('workspace_id, design_tokens, style_anchor_key')
        .eq('id', projectId)
        .single(),
      supabaseAdmin
        .from('characters')
        .select('character_id, name, role, appearance, costume, view_main, entity_type')
        .eq('project_id', projectId)
        .eq('character_id', characterId)
        .single(),
    ])
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    if (!character) return NextResponse.json({ error: 'character not found' }, { status: 404 })
    const anchor = await resolveStyleAnchorByKey(project.style_anchor_key)

    const dt = (project.design_tokens ?? {}) as DesignTokens
    const palette = [dt.palette?.primary, dt.palette?.secondary, dt.palette?.accent].filter(
      (x): x is string => !!x,
    )
    const input: CharacterPromptInput = {
      name: character.name,
      appearance: character.appearance ?? character.name,
      role: character.role ?? undefined,
      costumes: character.costume ?? undefined,
      // 앵커 존재 시 art_style 토큰 억제 (2026-07-14 실측, docs/style-anchor-art-style-authority.md §9-2):
      //   art_style 값에 매체어가 실리면(예: dark_cinematic_realism) 앵커 이미지를 이겨 매체 전이가 깨진다
      //   (d6208bba 거인 실사화 재현 2/2 → 토큰 제거로 카툰 복원 2/2). 앵커가 곧 art style authority 이므로
      //   무조건 생략(값 검사 없이 단순·안전). 분위기는 palette·외모 텍스트가 유지. 앵커 없으면 기존 그대로(no-op).
      artStyle: anchor ? undefined : dt.l1?.art_style,
      shapeLanguage: dt.l1?.shape_language,
      lineQuality: dt.l1?.line_quality,
      texturePhilosophy: dt.l1?.texture_philosophy,
      characterProportion: dt.l1?.character_proportion,
      palette,
      delta: typeof instruction === 'string' ? instruction : undefined,
      safeMode: effectiveSafeMode,
    }

    // 2. 프롬프트 + 모델 결정
    //    main → 깨끗한 T2I. 방향 뷰 → view_main 을 reference 로 한 i2i(edit). main 없으면 T2I fallback.
    const refMain = character.view_main as string | null
    const webhookUrl = resolveWebhookUrl()
    let submitOpts: FalImageOptions
    let styleAnchorMode: 'turnaround' | 'single' | null = null
    if (view === 'main') {
      const isPerson = character.entity_type !== 'object'
      if (isPerson) {
        // 사람 = 턴어라운드 시트: 캐릭터 모델시트 템플릿(public asset)을 reference 로 넣어 그 레이아웃에
        //   캐릭터를 채우는 I2I(edit). fal 이 fetch 가능한 public URL 필요 → base 없으면(로컬) T2I 폴백. (#7)
        const base = resolveWebhookBaseUrl()
        const templateUrl = base ? `${base}/character-template.png` : null
        if (templateUrl) {
          styleAnchorMode = 'turnaround'
          submitOpts = {
            model: 'openai/gpt-image-2/edit',
            prompt: buildCharacterTurnaroundPrompt(input),
            reference_image_urls: [templateUrl],
            webhookUrl,
            // aspect_ratio 생략 → edit 모델이 템플릿 비율(≈16:9)을 따름
          }
        } else {
          styleAnchorMode = 'single'
          submitOpts = {
            model: 'openai/gpt-image-2',
            prompt: buildCharacterTurnaroundPrompt(input),
            aspect_ratio: '3:2',
            webhookUrl,
          }
        }
      } else {
        styleAnchorMode = 'single'
        // 사물 = 단일 대표 포트레이트(1:1).
        submitOpts = {
          model: 'openai/gpt-image-2',
          prompt: buildCharacterMainPrompt(input),
          aspect_ratio: '1:1',
          webhookUrl,
        }
      }
    } else {
      const prompt = buildCharacterViewPrompt(input, view as DirectionalView)
      submitOpts = refMain
        ? {
            model: 'openai/gpt-image-2/edit',
            prompt,
            reference_image_urls: [refMain],
            webhookUrl,
          } // aspect_ratio 생략 → edit 모델이 reference 비율을 따름
        : { model: 'openai/gpt-image-2', prompt, aspect_ratio: '1:1', webhookUrl }
    }
    if (anchor && styleAnchorMode) {
      const { webhookUrl: wh, ...anchorable } = submitOpts
      const anchored =
        styleAnchorMode === 'turnaround'
          ? applyStyleAnchor(anchor, anchorable, 'turnaround', { pinAspectRatio: '16:9' })
          : applyStyleAnchor(anchor, anchorable, 'single')
      submitOpts = { ...anchored, webhookUrl: wh }
    }

    // 3. fal 큐에 submit (비동기). 완료는 webhook(/poll reconcile)이 storage 업로드 + DB 갱신.
    const { request_id, model } = await falImageSubmit(submitOpts)
    // provenance(#57): 생성 입력(외모) 지문을 submit 시점에 함께 계산해 input_snapshot 에 동봉.
    //   착지 시 finalize 가 이 지문으로 character_image_candidates 행을 남긴다(분리 금지 — architecture §5).
    // 룩(전역 토큰 + 의상) 지문 — 룩 부재 시 null(레거시 동일). 룩 도착 후 룩 미반영 초안이 stale로 판정(AC6/7).
    const lookFingerprint = computeLookFingerprint(dt, character.costume, project.style_anchor_key)
    const inputSnapshot: Record<string, unknown> = {
      ...submitOpts,
      source_hash: computeImageSourceHash(character.appearance, lookFingerprint),
      // 외형만의 지문(룩 무관) — look-pending vs edited 구분용(027). finalize 가 후보에 영속.
      appearance_hash: computeImageSourceHash(character.appearance, null),
      look_present: lookFingerprint != null,
      safe_mode: effectiveSafeMode,
      style_anchor_key: anchor?.key ?? null,
    }
    delete inputSnapshot.webhookUrl

    // 4. generation_jobs 행 생성 — 완료 시 무엇을 갱신할지(target) 기록.
    const column = CHARACTER_VIEW_COLUMNS[view]
    const job = await createGenerationJob({
      projectId,
      requestId: request_id,
      model,
      kind: 'character_view',
      actor: jobActor,
      userId: user.id,
      workspaceId: project.workspace_id,
      provider: 'fal',
      inputSnapshot,
      target: {
        workspaceId: project.workspace_id,
        characterId,
        view,
        column,
      },
    })

    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued', view })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-sheet]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
