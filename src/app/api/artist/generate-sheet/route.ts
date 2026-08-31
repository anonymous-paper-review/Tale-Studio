// 캐릭터 단일 뷰 생성 (crop 폐기 / front 통합, 2026-06-05)
//
// main = 정면 풀바디 대표 포트레이트(T2I, 이전 front 역할 겸함). back/sideLeft/sideRight = main 을
// reference 로 한 image-to-image(openai/gpt-image-2/edit). 한 번에 한 뷰만 생성한다 — 호출자(artist-store)가
// concurrency 를 제어하며 캐릭터/뷰 단위로 병렬 호출한다.
//
// DB 디자인 토큰(characters.appearance/costume + projects.design_tokens)으로 프롬프트 조립.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { requireProjectAccess } from '@/lib/api/guard'
import { falImageSubmit, type FalImageOptions } from '@/lib/writer/llm/fal'
import {
  createGenerationJob,
  countFailedJobsForTarget,
  hasQueuedCharacterViewJob,
  AUTO_GENERATION_GIVE_UP_THRESHOLD,
  listFailedCharacterViewJobs,
  type GenerationJobActor,
} from '@/lib/generation-jobs'
import { checkGenerationCapacity } from '@/lib/generation-quota'
import { quotaRejectionResponse } from '@/lib/api/quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
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
import { applyStyleAnchor, resolveStyleAnchor, tokenUnlessMediaWord } from '@/lib/style-anchor'
import { templateAssetUrl } from '@/lib/storage/template-asset'
import { normalizeImageModelKey, resolveImageEndpoint } from '@/lib/image-models'

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
    const { projectId, characterId, appearanceKey, view, actor, instruction, safeMode, model: modelInput } =
      (await req.json()) as {
        projectId?: string
        characterId?: string
        appearanceKey?: string
        view?: CharacterViewKey
        actor?: string
        instruction?: string // 재생성 시 유저 델타(merge) — 룩 토대 위에 덮음(AC13).
        safeMode?: boolean // 모더레이션 우회 재시도(#A) — 직전 실패가 moderation-class 인 슬롯에만 적용.
        model?: string // 이미지 생성 모델 선택(image-models 레지스트리 키). 미지정/미상은 기본 모델.
      }
    // 선택 모델 정규화 — 유효하지 않으면 기본(gpt-image-2). reference 유무에 따라 아래에서 t2i/edit 갈래를 고른다.
    const modelKey = normalizeImageModelKey(modelInput)
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 })
    }
    // 소유자만 — 로그인만으로 남의 프로젝트 조작 가능하던 구멍 (#access-audit 2026-08-15)
    const access = await requireProjectAccess(req, projectId)
    if (!access.ok) return access.response
    if (!characterId || !appearanceKey || !view) {
      return NextResponse.json(
        { error: 'characterId, appearanceKey, view required' },
        { status: 400 },
      )
    }
    if (!CHARACTER_VIEW_KEYS.includes(view)) {
      return NextResponse.json({ error: `invalid view: ${view}` }, { status: 400 })
    }

    // 멀티유저 동시성 게이트: 유저 상한 + 전역 fal 슬롯(#global-semaphore). 둘 중 하나라도 차면 429.
    const quota = await checkGenerationCapacity(access.userId!, 'image')
    if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'character_view', userId: access.userId })

    // 클라이언트 진입점 귀속 — 'chat'(글로벌 채팅 updates)만 구분, 그 외는 전부 'ui'.
    const jobActor: GenerationJobActor = actor === 'chat' ? 'chat' : 'ui'

    // 존재 및 소유권은 비용·중복 게이트보다 먼저 확인한다. 잘못된 모습 키가 다른 슬롯 응답으로 숨으면 안 된다.
    const { data: requestedAppearance, error: requestedAppearanceError } = await supabaseAdmin
      .from('character_appearances')
      .select('appearance_key')
      .eq('project_id', projectId)
      .eq('character_id', characterId)
      .eq('appearance_key', appearanceKey)
      .maybeSingle()
    if (requestedAppearanceError) throw requestedAppearanceError
    if (!requestedAppearance) {
      return NextResponse.json({ error: 'appearance not found' }, { status: 404 })
    }

    // give-up 게이트: 자율 first-fill(actor='auto')은 같은 슬롯(캐릭터×뷰) 실패가 임계값 이상이면
    //   멈춘다(무한 재시도·fal 과금 차단). 사람의 명시적 재생성(ui/chat)은 통과 → 회복(architecture §5).
    if (actor === 'auto') {
      const failed = await countFailedJobsForTarget(projectId, 'character_view', {
        characterId,
        appearanceKey,
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
    if (await hasQueuedCharacterViewJob(projectId, characterId, appearanceKey, view)) {
      return NextResponse.json({ ok: true, status: 'queued', deduped: true, appearanceKey, view })
    }

    // safe-mode 자격/상한(#A): 요청 시 슬롯의 최근 실패를 본다 — moderation-class 실패에만 safe transform 적용,
    //   일반 실패는 원본 프롬프트로 재시도(충실도 보존). ui/chat 은 SAFE_RETRY_CAP 으로 비용 ceiling(give-up 미적용).
    let effectiveSafeMode = false
    if (safeMode === true) {
      const failures = await listFailedCharacterViewJobs(projectId)
      const slot = failures.find(
        (f) => f.characterId === characterId && f.appearanceKey === appearanceKey && f.view === view,
      )
      if (slot) {
        if ((jobActor === 'ui' || jobActor === 'chat') && slot.safeFailCount >= SAFE_RETRY_CAP) {
          return NextResponse.json({ ok: true, skipped: true, reason: 'capped', safeFailCount: slot.safeFailCount })
        }
        effectiveSafeMode = slot.moderation
      }
    }

    // 1. 프로젝트, 캐릭터, 요청한 모습과 명시적 기본 모습을 로드한다.
    const [{ data: project }, { data: character }, { data: appearance }, { data: defaultAppearance }] =
      await Promise.all([
        supabaseAdmin
          .from('projects')
          .select('workspace_id, design_tokens, style_anchor_key, custom_style_anchor')
          .eq('id', projectId)
          .single(),
        supabaseAdmin
          .from('characters')
          .select('character_id, name, role, entity_type')
          .eq('project_id', projectId)
          .eq('character_id', characterId)
          .single(),
        supabaseAdmin
          .from('character_appearances')
          .select('appearance_key, is_default, appearance, costume, sheet_url, portrait_url')
          .eq('project_id', projectId)
          .eq('character_id', characterId)
          .eq('appearance_key', appearanceKey)
          .maybeSingle(),
        supabaseAdmin
          .from('character_appearances')
          .select('appearance_key, is_default, appearance, costume, sheet_url, portrait_url')
          .eq('project_id', projectId)
          .eq('character_id', characterId)
          .eq('is_default', true)
          .maybeSingle(),
      ])
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    if (!character) return NextResponse.json({ error: 'character not found' }, { status: 404 })
    if (!appearance) return NextResponse.json({ error: 'appearance not found' }, { status: 404 })
    if (!defaultAppearance) {
      return NextResponse.json({ error: 'default appearance not found' }, { status: 404 })
    }
    if (!appearance.is_default && !defaultAppearance.portrait_url) {
      return NextResponse.json(
        { error: 'default appearance portrait is required for non-default appearance generation' },
        { status: 409 },
      )
    }
    const anchor = await resolveStyleAnchor(project)

    const dt = (project.design_tokens ?? {}) as DesignTokens
    const palette = [dt.palette?.primary, dt.palette?.secondary, dt.palette?.accent].filter(
      (x): x is string => !!x,
    )
    const input: CharacterPromptInput = {
      name: character.name,
      appearance: appearance.appearance ?? character.name,
      role: character.role ?? undefined,
      costumes: appearance.costume ?? undefined,
      // 앵커 존재 시 매체어 토큰만 정밀 드롭(#F-004 B4 2026-08-12 — 2026-07-14 통짜 억제 결정의
      //   **명시적 번복**): 옛 규칙은 art_style 을 무조건 생략했는데, 실측(dc531572)에서 억제된 것이
      //   앵커에 부합하는 유일한 토큰(3d_animation)이고 정작 매체어(texture: photorealistic)는
      //   살아남아 앵커를 이겼다 — 취지가 정확히 뒤집힌 배치. 새 규칙: 매체어를 품은 토큰만 드롭
      //   (dark_cinematic_realism 류 — 2026-07-14 실측의 교훈은 그대로 보존), 무해한 토큰은 유지.
      //   앵커 없으면 기존 그대로(no-op).
      artStyle: anchor ? tokenUnlessMediaWord(dt.l1?.art_style) : dt.l1?.art_style,
      shapeLanguage: anchor ? tokenUnlessMediaWord(dt.l1?.shape_language) : dt.l1?.shape_language,
      lineQuality: anchor ? tokenUnlessMediaWord(dt.l1?.line_quality) : dt.l1?.line_quality,
      texturePhilosophy: anchor
        ? tokenUnlessMediaWord(dt.l1?.texture_philosophy)
        : dt.l1?.texture_philosophy,
      characterProportion: anchor
        ? tokenUnlessMediaWord(dt.l1?.character_proportion)
        : dt.l1?.character_proportion,
      palette,
      delta: typeof instruction === 'string' ? instruction : undefined,
      safeMode: effectiveSafeMode,
    }

    // 2. 프롬프트 + 모델 결정. 비기본 모습은 같은 캐릭터의 기본 모습 portrait만 정체성 기준으로 쓴다.
    const baseFaceUrl = appearance.is_default ? null : (defaultAppearance.portrait_url as string)
    const refMain = appearance.sheet_url as string | null
    const webhookUrl = resolveWebhookUrl()
    let submitOpts: FalImageOptions
    let styleAnchorMode: 'turnaround' | 'single' | null = null
    if (view === 'main') {
      const isPerson = character.entity_type !== 'object'
      if (isPerson) {
        // 사람 = 턴어라운드 시트: 캐릭터 모델시트 템플릿을 reference 로 넣어 그 레이아웃에
        //   캐릭터를 채우는 I2I(edit). 템플릿은 스토리지에서 온다 — 앱 public URL(터널)에 걸면
        //   터널이 죽을 때 fal 이 못 받아 전량 실패한다(template-asset.ts). 업로드 실패 시만 T2I 폴백.
        const templateUrl = await templateAssetUrl('character-template.png')
        // 선택 모델의 edit 갈래 — reference(템플릿·기준얼굴)를 실을 수 있는가. 미지원 모델은 isEdit=false.
        const { endpoint, isEdit } = resolveImageEndpoint(modelKey, !!templateUrl)
        if (templateUrl && isEdit) {
          styleAnchorMode = 'turnaround'
          // 정체성 참조: 템플릿(레이아웃) 다음으로 얼굴을 빌려주는 이미지들을 붙인다.
          //   - baseFaceUrl: 비기본 모습(젊은 시절 등)이 기본 모습 얼굴을 계승(#g4 연속성).
          //   - refMain(#reref 2026-08-31): 재생성 시 이 모습의 직전 시트 — 얼굴이 매번 바뀌는 것을 막는다.
          //     첫 생성(refMain 없음)은 템플릿만 — 기존 동작 그대로. 델타(instruction)가 우선이라 요청 변경은 반영된다.
          const identityRefs = [
            ...(baseFaceUrl ? [baseFaceUrl] : []),
            ...(refMain ? [refMain] : []),
          ]
          submitOpts = {
            model: endpoint,
            prompt: buildCharacterTurnaroundPrompt(input, {
              hasBaseFace: !!baseFaceUrl,
              hasPriorRender: !!refMain,
            }),
            // 템플릿이 첫 장(레이아웃 기준), 그 뒤가 정체성 이미지(기준얼굴·직전 시트).
            //   순서가 뒤바뀌면 모델이 얼굴 이미지를 레이아웃으로 오인한다.
            reference_image_urls: [templateUrl, ...identityRefs],
            webhookUrl,
            // aspect_ratio 생략 → edit 모델이 템플릿 비율(≈16:9)을 따름
          }
        } else {
          // 비기본 모습은 기준 얼굴 참조가 필수 — reference 미지원 모델을 골랐거나 템플릿이 없으면 막는다.
          if (baseFaceUrl && !isEdit) {
            return NextResponse.json(
              { error: 'selected image model does not support the identity reference required for a non-default appearance' },
              { status: 409 },
            )
          }
          if (baseFaceUrl) {
            throw new Error('character template is required for non-default appearance identity reference')
          }
          styleAnchorMode = 'single'
          submitOpts = {
            model: endpoint,
            prompt: buildCharacterTurnaroundPrompt(input),
            aspect_ratio: '3:2',
            webhookUrl,
          }
        }
      } else {
        styleAnchorMode = 'single'
        // 사물 = 단일 대표 포트레이트(1:1). reference 없음 → 선택 모델의 T2I 갈래.
        const { endpoint } = resolveImageEndpoint(modelKey, false)
        submitOpts = {
          model: endpoint,
          prompt: buildCharacterMainPrompt(input),
          aspect_ratio: '1:1',
          webhookUrl,
        }
      }
    } else {
      const prompt = buildCharacterViewPrompt(input, view as DirectionalView)
      const references = [refMain, baseFaceUrl].filter((url): url is string => !!url)
      const { endpoint, isEdit } = resolveImageEndpoint(modelKey, references.length > 0)
      submitOpts = isEdit
        ? {
            model: endpoint,
            prompt,
            reference_image_urls: references,
            webhookUrl,
          } // aspect_ratio 생략 → edit 모델이 reference 비율을 따른다.
        : { model: endpoint, prompt, aspect_ratio: '1:1', webhookUrl }
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
    const lookFingerprint = computeLookFingerprint(dt, appearance.costume, project.style_anchor_key)
    const inputSnapshot: Record<string, unknown> = {
      ...submitOpts,
      appearance_key: appearanceKey,
      source_hash: computeImageSourceHash(appearance.appearance, lookFingerprint),
      // 외형만의 지문(룩 무관) — look-pending vs edited 구분용(027). finalize 가 후보에 영속.
      appearance_hash: computeImageSourceHash(appearance.appearance, null),
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
      userId: access.userId!,
      workspaceId: project.workspace_id,
      provider: 'fal',
      inputSnapshot,
      target: {
        workspaceId: project.workspace_id,
        characterId,
        appearanceKey,
        view,
        column,
      },
    })

    return NextResponse.json({ ok: true, jobId: job.id, status: 'queued', appearanceKey, view })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[artist/generate-sheet]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
