// writer v2Design 직후 artist 초안(인물 main 시트 + 로케이션 wide_shot) 서버사이드 트리거(C1).
//
// 원칙(#57 amend / architecture §5): 빈칸 채우기는 자율(멱등) — 차 있으면 skip. 차 있는 것 교체(재생성)는 사람만.
//   projects.design_tokens 존재가 하드 게이트다. 새 트리거 경로는 lookFingerprint=null / look_present=false 잡을 만들지 않는다.
//   대표 main 1장 + wide_shot 1장만 생성한다(4방향/추가 뷰는 사람 선별 이후 — 비용 튜닝).
// #ref-gate(2026-09-02, 실측 겨울_4): 옛 트리거는 프로듀서 출신 인물만 그렸고 writer 출신(오픈캐스트)은 Artist
//   탭에 들어가야 클라가 채웠다 — 그래서 writer 완료 직후 Director 로 가면 시트 0장인 채 실사가 돌았다.
//   시트는 writer 완료의 일부로 서버가 전 인물에 대해 시작한다(생성 순서의 근본 수리). 클라 자동 채움은
//   실패 회복용 폴백으로 남는다(queued 는 서버 dedupe, 완료분은 main 있음으로 skip).
//   모델은 Artist 와 같은 레지스트리 기본(#owner-default) — 예전 하드코딩 gpt-image-2 는 08-31 결정과 어긋났다.
//   프롬프트 입력도 라우트와 같은 조립(의상·디자인 토큰·팔레트 포함, sheet-prompt-input.ts).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { falImageSubmit, type FalImageOptions } from '@/lib/writer/llm/fal'
import { createGenerationJob, hasQueuedCharacterViewJob, hasQueuedWorldShotJob } from '@/lib/generation-jobs'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'
import { resolveCharacterPromptInput, type SheetDesignTokens } from '@/lib/artist/sheet-prompt-input'
import { DEFAULT_IMAGE_MODEL, resolveImageEndpoint } from '@/lib/image-models'
import { CHARACTER_VIEW_COLUMNS } from '@/types/asset'
import {
  computeImageSourceHash,
  computeLookFingerprint,
  computeWorldImageSourceHash,
  type LookTokens,
} from '@/lib/image-provenance'
import { applyStyleAnchor, resolveStyleAnchor } from '@/lib/style-anchor'
import { templateAssetUrl } from '@/lib/storage/template-asset'
import {
  buildWorldShotPromptForLocation,
  mapLocationRowToManifestLocation,
  type LocationRowForWorldPrompt,
} from '@/lib/artist/world-prompt'
import { submitWorldShotJob } from '@/lib/artist/world-submit'
import { recordWriterObservabilityEvent } from '@/lib/writer/debug-events'
import { checkGenerationCapacity } from '@/lib/generation-quota'

interface DraftCharacterRow {
  character_id: string
  name: string
  role: string | null
  costume: string | string[] | null
  entity_type: string | null
}

interface DraftAppearanceRow {
  character_id: string
  appearance_key: string
  appearance: string | null
  costume?: string[] | string | null
  sheet_url: string | null
}

interface DraftLocationRow extends LocationRowForWorldPrompt {
  location_id: string
  name: string
  visual_description: string | null
  style_description: string | null
  lighting_direction: string | null
  lighting_sources: string[] | null
  time_of_day: string | null
  purpose: string | null
  props: string[] | null
  wide_shot: string | null
}

export interface DraftTriggerResult {
  submitted: number
  skipped: number
  failed: number
}

export interface AssetDraftTriggerResult {
  skipped_no_look?: true
  characters: DraftTriggerResult
  worlds: DraftTriggerResult
}

/**
 * 프로젝트 인물(사람) 전원의 대표 main 초안을 서버에서 생성(빈칸만, 멱등). v2Design 직후 1회.
 *   (#ref-gate 2026-09-02: 프로듀서 출신만 → 전 인물. writer 출신도 Director 진입 전에 시트가 있어야 한다.)
 *   멱등 3조건 — 하나라도 참이면 skip:
 *     (a) 기본 모습의 sheet_url 이미 존재(차 있음 — 교체는 사람만),
 *     (b) 기본 모습 main 슬롯 character_image_candidates 이미 존재,
 *     (c) 기본 모습 main 슬롯에 status=queued character_view 잡 존재(submit~finalize 윈도우 재핸드오프 중복 차단).
 *   각 캐릭터 submit 실패는 흡수(throw 금지) — 자동 재시도 루프 없음, 클라가 generation_jobs 에러를 배지로 표시(AC4).
 */
export async function triggerCharacterDrafts(
  projectId: string,
): Promise<DraftTriggerResult> {
  const result: DraftTriggerResult = { submitted: 0, skipped: 0, failed: 0 }
  try {
    const [{ data: chars }, { data: appearances, error: appearancesError }, { data: project }] = await Promise.all([
      supabaseAdmin
        .from('characters')
        .select('character_id, name, role, costume, entity_type')
        .eq('project_id', projectId),
      supabaseAdmin
        .from('character_appearances')
        .select('character_id, appearance_key, appearance, costume, sheet_url')
        .eq('project_id', projectId)
        .eq('is_default', true),
      supabaseAdmin
        .from('projects')
        .select('design_tokens, workspace_id, style_anchor_key, custom_style_anchor')
        .eq('id', projectId)
        .maybeSingle(),
    ])
    if (appearancesError) throw appearancesError
    if (!chars?.length) return result

    // v2Design trigger path is gated by triggerAssetDrafts, so design_tokens should be present here.
    const designTokens = (project?.design_tokens ?? null) as LookTokens | null

    if (designTokens == null) {
      // 방어(R1): 룩 부재 시 look_present=false 잡 생성 금지. 정상 경로는 triggerAssetDrafts 가 이미 게이트하지만,
      //   직접 호출/오용도 안전하게 skip 처리한다.
      console.warn(`[draft-trigger] ${projectId} — design_tokens absent, skipping character drafts (defense gate)`)
      return { submitted: 0, skipped: chars.length, failed: 0 }
    }
    const webhookUrl = resolveWebhookUrl()
    const anchor = await resolveStyleAnchor(project)
    const defaultAppearances = new Map<string, DraftAppearanceRow>()
    for (const appearance of appearances ?? []) {
      const row = appearance as DraftAppearanceRow
      if (defaultAppearances.has(row.character_id)) {
        throw new Error(`Character ${row.character_id} has multiple default appearances`)
      }
      defaultAppearances.set(row.character_id, row)
    }

    for (const c of chars as DraftCharacterRow[]) {
      if (c.entity_type === 'object') {
        result.skipped++
        continue
      }
      const defaultAppearance = defaultAppearances.get(c.character_id)
      if (!defaultAppearance) {
        result.failed++
        console.error(`[draft-trigger] ${projectId}/${c.character_id}: default appearance missing`)
        continue
      }
      // (a) 대표 이미지 이미 있음
      if (defaultAppearance.sheet_url) {
        result.skipped++
        continue
      }
      // (b) main 후보 이미 존재
      const { data: existingCandidate } = await supabaseAdmin
        .from('character_image_candidates')
        .select('id')
        .eq('project_id', projectId)
        .eq('character_id', c.character_id)
        .eq('appearance_key', defaultAppearance.appearance_key)
        .eq('view', 'main')
        .limit(1)
      if (existingCandidate && existingCandidate.length > 0) {
        result.skipped++
        continue
      }
      // (c) main 슬롯 queued 잡 존재
      if (await hasQueuedCharacterViewJob(projectId, c.character_id, defaultAppearance.appearance_key, 'main')) {
        result.skipped++
        continue
      }

      try {
        const lookFingerprint = computeLookFingerprint(designTokens, c.costume, project?.style_anchor_key ?? null)
        // 턴어라운드 시트: 캐릭터 템플릿(public asset)을 reference 로 넣은 I2I(edit) — 버튼 경로(generate-sheet)와 정합.
        // base URL 없으면 동일 프롬프트 T2I(3:2) 폴백.
        // 라우트(generate-sheet)와 같은 입력 조립 — 의상·디자인 토큰·팔레트까지(sheet-prompt-input.ts).
        const promptInput = resolveCharacterPromptInput({
          character: { name: c.name, role: c.role },
          appearance: {
            appearance: defaultAppearance.appearance,
            costume: defaultAppearance.costume ?? c.costume,
          },
          designTokens: designTokens as unknown as SheetDesignTokens,
          hasAnchor: !!anchor,
        })
        const prompt = buildCharacterTurnaroundPrompt(promptInput)
        // 템플릿은 스토리지에서 (template-asset.ts 주석 참고).
        const templateUrl = await templateAssetUrl('character-template.png')
        // 모델 = Artist 기본(레지스트리) — 템플릿이 있으면 edit 갈래, 없으면 T2I 폴백.
        let submitOpts: FalImageOptions = templateUrl
          ? { model: resolveImageEndpoint(DEFAULT_IMAGE_MODEL, true).endpoint, prompt, reference_image_urls: [templateUrl], webhookUrl }
          : { model: resolveImageEndpoint(DEFAULT_IMAGE_MODEL, false).endpoint, prompt, aspect_ratio: '3:2', webhookUrl }
        if (anchor) {
          const { webhookUrl: wh, ...anchorable } = submitOpts
          const anchored = templateUrl
            ? applyStyleAnchor(anchor, anchorable, 'turnaround', { pinAspectRatio: '16:9' })
            : applyStyleAnchor(anchor, anchorable, 'single')
          submitOpts = { ...anchored, webhookUrl: wh }
        }
        await recordWriterObservabilityEvent(projectId, 'fal_submit_started', {
          source: 'writer_v2_design',
          kind: 'character_view',
          characterId: c.character_id,
          view: 'main',
        })
        let falResult: { request_id: string; model: string; fal_key_id: string }
        try {
          falResult = await falImageSubmit(submitOpts)
        } catch (error) {
          await recordWriterObservabilityEvent(projectId, 'fal_submit_failed', {
            source: 'writer_v2_design',
            kind: 'character_view',
            characterId: c.character_id,
            view: 'main',
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
        const { request_id, model, fal_key_id } = falResult
        const job = await createGenerationJob({
          projectId,
          requestId: request_id,
          model,
          falKeyId: fal_key_id,
          kind: 'character_view',
          actor: 'writer',
          provider: 'fal',
          inputSnapshot: {
            model,
            prompt: submitOpts.prompt,
            ...(submitOpts.reference_image_urls
              ? { reference_image_urls: submitOpts.reference_image_urls }
              : {}),
            ...(submitOpts.aspect_ratio ? { aspect_ratio: submitOpts.aspect_ratio } : {}),
            source_hash: computeImageSourceHash(defaultAppearance.appearance, lookFingerprint),
            // 외형만의 지문(룩 무관) — look-pending vs edited 구분용(027).
            appearance_hash: computeImageSourceHash(defaultAppearance.appearance, null),
            look_present: lookFingerprint != null,
            style_anchor_key: anchor?.key ?? null,
          },
          target: {
            workspaceId: project?.workspace_id ?? undefined,
            characterId: c.character_id,
            appearanceKey: defaultAppearance.appearance_key,
            view: 'main',
            column: CHARACTER_VIEW_COLUMNS.main,
          },
        })
        await recordWriterObservabilityEvent(
          projectId,
          'fal_submit_accepted',
          {
            source: 'writer_v2_design',
            kind: 'character_view',
            characterId: c.character_id,
            view: 'main',
            model,
            requestId: request_id,
          },
          { generationJobId: job.id },
        )
        result.submitted++
      } catch (e) {
        // 실패 흡수(AC4) — 자동 재시도 루프 금지. 클라가 generation_jobs 에러를 카드 배지로 표시.
        result.failed++
        await recordWriterObservabilityEvent(projectId, 'route_failed', {
          source: 'writer_v2_design',
          kind: 'character_view',
          characterId: c.character_id,
          view: 'main',
          error: e instanceof Error ? e.message : String(e),
        })
        console.error(
          `[draft-trigger] ${projectId}/${c.character_id}:main submit failed:`,
          e instanceof Error ? e.message : e,
        )
      }
    }
  } catch (e) {
    // 전체 흡수 — 핸드오프/파이프라인을 막지 않는다(best-effort).
    console.error(
      `[draft-trigger] ${projectId} failed:`,
      e instanceof Error ? e.message : e,
    )
  }
  console.log(
    `[draft-trigger] ${projectId} — submitted ${result.submitted}, skipped ${result.skipped}, failed ${result.failed}`,
  )
  return result
}

/**
 * 프로젝트 로케이션 wide_shot 초안을 서버에서 생성(빈칸만, 멱등). v2Design 직후 1회.
 *   멱등 2조건 — wide_shot 이 비어있는 행만 select 하고, 같은 슬롯 queued world_shot 잡이 있으면 skip.
 *   각 로케이션 submit 실패는 흡수(throw 금지) — status.assets stalled/retry path 가 회복한다.
 */
export async function triggerWorldDrafts(
  projectId: string,
): Promise<DraftTriggerResult> {
  const result: DraftTriggerResult = { submitted: 0, skipped: 0, failed: 0 }
  try {
    const [{ data: locations }, { data: project }] = await Promise.all([
      supabaseAdmin
        .from('locations')
        .select(
          'location_id, name, visual_description, style_description, lighting_direction, lighting_sources, time_of_day, purpose, props, wide_shot',
        )
        .eq('project_id', projectId)
        .is('wide_shot', null),
      supabaseAdmin
        .from('projects')
        .select('workspace_id, style_anchor_key, custom_style_anchor')
        .eq('id', projectId)
        .maybeSingle(),
    ])
    if (!locations?.length) return result

    const anchor = await resolveStyleAnchor(project)

    for (const location of locations as DraftLocationRow[]) {
      if (location.wide_shot) {
        result.skipped++
        continue
      }
      if (await hasQueuedWorldShotJob(projectId, location.location_id, 'wide_shot')) {
        result.skipped++
        continue
      }

      try {
        const builtPrompt = buildWorldShotPromptForLocation(
          mapLocationRowToManifestLocation(location),
          null,
          null,
          'wideShot',
        )
        await recordWriterObservabilityEvent(projectId, 'fal_submit_started', {
          source: 'writer_v2_design',
          kind: 'world_shot',
          locationId: location.location_id,
          view: 'wide_shot',
        })
        let job: Awaited<ReturnType<typeof submitWorldShotJob>>
        try {
          job = await submitWorldShotJob({
            projectId,
            locationId: location.location_id,
            column: 'wide_shot',
            prompt: builtPrompt,
            aspectRatio: '16:9',
            sourceHash: computeWorldImageSourceHash(builtPrompt),
            actor: 'writer',
            workspaceId: project?.workspace_id ?? undefined,
            anchor,
          })
        } catch (error) {
          await recordWriterObservabilityEvent(projectId, 'fal_submit_failed', {
            source: 'writer_v2_design',
            kind: 'world_shot',
            locationId: location.location_id,
            view: 'wide_shot',
            error: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
        await recordWriterObservabilityEvent(
          projectId,
          'fal_submit_accepted',
          {
            source: 'writer_v2_design',
            kind: 'world_shot',
            locationId: location.location_id,
            view: 'wide_shot',
            model: job.model,
            requestId: job.request_id,
          },
          { generationJobId: job.id },
        )
        result.submitted++
      } catch (e) {
        result.failed++
        await recordWriterObservabilityEvent(projectId, 'route_failed', {
          source: 'writer_v2_design',
          kind: 'world_shot',
          locationId: location.location_id,
          view: 'wide_shot',
          error: e instanceof Error ? e.message : String(e),
        })
        console.error(
          `[draft-trigger] ${projectId}/${location.location_id}:wide_shot submit failed:`,
          e instanceof Error ? e.message : e,
        )
      }
    }
  } catch (e) {
    console.error(
      `[draft-trigger] ${projectId} world failed:`,
      e instanceof Error ? e.message : e,
    )
  }
  console.log(
    `[draft-trigger] ${projectId} worlds — submitted ${result.submitted}, skipped ${result.skipped}, failed ${result.failed}`,
  )
  return result
}

function zeroDraftResult(): DraftTriggerResult {
  return { submitted: 0, skipped: 0, failed: 0 }
}

/**
 * 서버 초안 트리거 진입 전 용량 사전 점검(#B, 2026-09-02 관문 복원 범위 확장) — 이 트리거는
 *   자율 잡이라(사람이 안 누른다) 429 관측이 없으면 다른 생성이 슬롯을 다 쓴 상태에서도
 *   조용히 실패한다. 막힌 상태면 제출 전역을 스킵하고 asset_trigger_blocked(reason:'quota')
 *   이벤트로 기록한다.
 *   회복 경로는 기존 그대로: artist 탭 진입(autoGenerateBaseImages 자동) + 재시도(retry-drafts 버튼) —
 *   이 트리거가 이번엔 채우지 못한 빈칸 생성은 그 경로가 다음 번에 다시 도달해 자율적으로 채운다(멱등).
 */
async function checkAssetDraftCapacity(
  projectId: string,
  workspaceId: string,
): Promise<boolean> {
  try {
    const { data: workspace, error } = await supabaseAdmin
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .maybeSingle()
    if (error) throw error
    const ownerId = workspace?.owner_id as string | undefined
    if (!ownerId) return true // 사용자를 식별할 수 없으면 fail-open(관측 없어도 생성은 허용)
    const quota = await checkGenerationCapacity(ownerId, 'image')
    if (!quota.ok) {
      await recordWriterObservabilityEvent(projectId, 'asset_trigger_blocked', {
        source: 'writer_v2_design',
        reason: 'quota',
        scope: quota.scope,
        queued: quota.queued,
        limit: quota.limit,
      })
      return false
    }
    return true
  } catch {
    return true // 조회 진단 실패는 fail-open — 진단 장애가 파이프라인을 막으면 안 된다.
  }
}

export async function triggerAssetDrafts(
  projectId: string,
): Promise<AssetDraftTriggerResult> {
  const zero = () => zeroDraftResult()
  await recordWriterObservabilityEvent(projectId, 'asset_trigger_started', {
    source: 'writer_v2_design',
  })
  let workspaceId: string | null = null
  try {
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('design_tokens, workspace_id')
      .eq('id', projectId)
      .maybeSingle()

    if (error) throw error
    if (project?.design_tokens == null) {
      console.warn('[v2design-trigger] design_tokens absent — skipping (stalled path)')
      await recordWriterObservabilityEvent(projectId, 'asset_trigger_blocked', {
        source: 'writer_v2_design',
        reason: 'design_tokens_absent',
      })
      return { skipped_no_look: true, characters: zero(), worlds: zero() }
    }
    workspaceId = (project.workspace_id as string | undefined) ?? null
  } catch (e) {
    console.warn(
      '[v2design-trigger] design_tokens absent — skipping (stalled path)',
      e instanceof Error ? e.message : e,
    )
    await recordWriterObservabilityEvent(projectId, 'asset_trigger_blocked', {
      source: 'writer_v2_design',
      reason: 'design_tokens_lookup_failed',
    })
    return { skipped_no_look: true, characters: zero(), worlds: zero() }
  }

  // #B(2026-09-02): design_tokens 확인 직후, 제출 전에 1회 용량 사전 체크. 막히면 제출 전체
  //   스킵하고 정상 반환(파이프라인 비차단 유지) — 중간 초과는 수용(개별 submit 단위 재검사 없음).
  if (workspaceId && !(await checkAssetDraftCapacity(projectId, workspaceId))) {
    return { characters: zero(), worlds: zero() }
  }

  const [characters, worlds] = await Promise.all([
    triggerCharacterDrafts(projectId).catch((e) => {
      console.error(
        `[v2design-trigger] ${projectId} character drafts failed:`,
        e instanceof Error ? e.message : e,
      )
      return zero()
    }),
    triggerWorldDrafts(projectId).catch((e) => {
      console.error(
        `[v2design-trigger] ${projectId} world drafts failed:`,
        e instanceof Error ? e.message : e,
      )
      return zero()
    }),
  ])

  console.log(
    `[v2design-trigger] ${projectId} — chars ${characters.submitted}/${characters.skipped}/${characters.failed}, worlds ${worlds.submitted}/${worlds.skipped}/${worlds.failed}`,
  )
  await recordWriterObservabilityEvent(projectId, 'asset_trigger_completed', {
    source: 'writer_v2_design',
    characters,
    worlds,
  })
  return { characters, worlds }
}
