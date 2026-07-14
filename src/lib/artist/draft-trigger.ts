// writer v2Design 직후 artist 초안(프로듀서 캐릭터 main + 로케이션 wide_shot) 서버사이드 트리거(C1).
//
// 원칙(#57 amend / architecture §5): 빈칸 채우기는 자율(멱등) — 차 있으면 skip. 차 있는 것 교체(재생성)는 사람만.
//   projects.design_tokens 존재가 하드 게이트다. 새 트리거 경로는 lookFingerprint=null / look_present=false 잡을 만들지 않는다.
//   대표 main 1장 + wide_shot 1장만 생성한다(4방향/추가 뷰는 사람 선별 이후 — 비용 튜닝).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { falImageSubmit, type FalImageOptions } from '@/lib/writer/llm/fal'
import { createGenerationJob, hasQueuedCharacterViewJob, hasQueuedWorldShotJob } from '@/lib/generation-jobs'
import { resolveWebhookUrl, resolveWebhookBaseUrl } from '@/lib/fal/webhook-url'
import { buildCharacterMainPrompt, buildCharacterTurnaroundPrompt } from '@/lib/artist/turnaround'
import { CHARACTER_VIEW_COLUMNS } from '@/types/asset'
import {
  computeImageSourceHash,
  computeLookFingerprint,
  computeWorldImageSourceHash,
  type LookTokens,
} from '@/lib/image-provenance'
import { applyStyleAnchor, resolveStyleAnchorByKey } from '@/lib/style-anchor'
import {
  buildWorldShotPromptForLocation,
  mapLocationRowToManifestLocation,
  type LocationRowForWorldPrompt,
} from '@/lib/artist/world-prompt'
import { submitWorldShotJob } from '@/lib/artist/world-submit'

const DRAFT_MODEL = 'openai/gpt-image-2'

interface DraftCharacterRow {
  character_id: string
  name: string
  role: string | null
  appearance: string | null
  costume: string | string[] | null
  view_main: string | null
  entity_type: string | null
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
 * 프로젝트 프로듀서 캐릭터들의 대표 main 초안을 서버에서 생성(빈칸만, 멱등). v2Design 직후 1회.
 *   멱등 3조건 — 하나라도 참이면 skip:
 *     (a) characters.view_main 이미 존재(차 있음 — 교체는 사람만),
 *     (b) main 슬롯 character_image_candidates 이미 존재,
 *     (c) main 슬롯에 status=queued character_view 잡 존재(submit~finalize 윈도우 재핸드오프 중복 차단).
 *   각 캐릭터 submit 실패는 흡수(throw 금지) — 자동 재시도 루프 없음, 클라가 generation_jobs 에러를 배지로 표시(AC4).
 */
export async function triggerCharacterDrafts(
  projectId: string,
): Promise<DraftTriggerResult> {
  const result: DraftTriggerResult = { submitted: 0, skipped: 0, failed: 0 }
  try {
    const [{ data: chars }, { data: project }] = await Promise.all([
      supabaseAdmin
        .from('characters')
        .select('character_id, name, role, appearance, costume, view_main, entity_type')
        .eq('project_id', projectId)
        .eq('origin', 'producer'),
      supabaseAdmin
        .from('projects')
        .select('design_tokens, workspace_id, style_anchor_key')
        .eq('id', projectId)
        .maybeSingle(),
    ])
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
    const anchor = await resolveStyleAnchorByKey(project?.style_anchor_key)

    for (const c of chars as DraftCharacterRow[]) {
      // (a) 대표 이미지 이미 있음
      if (c.view_main) {
        result.skipped++
        continue
      }
      // (b) main 후보 이미 존재
      const { data: existingCandidate } = await supabaseAdmin
        .from('character_image_candidates')
        .select('id')
        .eq('project_id', projectId)
        .eq('character_id', c.character_id)
        .eq('view', 'main')
        .limit(1)
      if (existingCandidate && existingCandidate.length > 0) {
        result.skipped++
        continue
      }
      // (c) main 슬롯 queued 잡 존재
      if (await hasQueuedCharacterViewJob(projectId, c.character_id, 'main')) {
        result.skipped++
        continue
      }

      try {
        const lookFingerprint = computeLookFingerprint(designTokens, c.costume, project?.style_anchor_key ?? null)
        // 사람 = 턴어라운드 시트: 캐릭터 템플릿(public asset)을 reference 로 넣은 I2I(edit) — 버튼 경로(generate-sheet)와 정합.
        //   base URL 없으면 동일 프롬프트 T2I(3:2) 폴백. 사물 = 단일 포트레이트(1:1). (#7)
        const isPerson = c.entity_type !== 'object'
        const promptInput = {
          name: c.name,
          appearance: c.appearance ?? c.name,
          role: c.role ?? undefined,
        }
        const prompt = isPerson
          ? buildCharacterTurnaroundPrompt(promptInput)
          : buildCharacterMainPrompt(promptInput)
        const base = resolveWebhookBaseUrl()
        const templateUrl = isPerson && base ? `${base}/character-template.png` : null
        let submitOpts: FalImageOptions = templateUrl
          ? { model: 'openai/gpt-image-2/edit', prompt, reference_image_urls: [templateUrl], webhookUrl }
          : { model: DRAFT_MODEL, prompt, aspect_ratio: isPerson ? '3:2' : '1:1', webhookUrl }
        if (anchor) {
          const { webhookUrl: wh, ...anchorable } = submitOpts
          const anchored = templateUrl
            ? applyStyleAnchor(anchor, anchorable, 'turnaround', { pinAspectRatio: '16:9' })
            : applyStyleAnchor(anchor, anchorable, 'single')
          submitOpts = { ...anchored, webhookUrl: wh }
        }
        const { request_id, model } = await falImageSubmit(submitOpts)
        await createGenerationJob({
          projectId,
          requestId: request_id,
          model,
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
            source_hash: computeImageSourceHash(c.appearance, lookFingerprint),
            // 외형만의 지문(룩 무관) — look-pending vs edited 구분용(027).
            appearance_hash: computeImageSourceHash(c.appearance, null),
            look_present: lookFingerprint != null,
            style_anchor_key: anchor?.key ?? null,
          },
          target: {
            workspaceId: project?.workspace_id ?? undefined,
            characterId: c.character_id,
            view: 'main',
            column: CHARACTER_VIEW_COLUMNS.main,
          },
        })
        result.submitted++
      } catch (e) {
        // 실패 흡수(AC4) — 자동 재시도 루프 금지. 클라가 generation_jobs 에러를 카드 배지로 표시.
        result.failed++
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
        .select('workspace_id, style_anchor_key')
        .eq('id', projectId)
        .maybeSingle(),
    ])
    if (!locations?.length) return result

    const anchor = await resolveStyleAnchorByKey(project?.style_anchor_key)

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
        await submitWorldShotJob({
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
        result.submitted++
      } catch (e) {
        result.failed++
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

export async function triggerAssetDrafts(
  projectId: string,
): Promise<AssetDraftTriggerResult> {
  const zero = () => zeroDraftResult()
  try {
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('design_tokens')
      .eq('id', projectId)
      .maybeSingle()

    if (error) throw error
    if (project?.design_tokens == null) {
      console.warn('[v2design-trigger] design_tokens absent — skipping (stalled path)')
      return { skipped_no_look: true, characters: zero(), worlds: zero() }
    }
  } catch (e) {
    console.warn(
      '[v2design-trigger] design_tokens absent — skipping (stalled path)',
      e instanceof Error ? e.message : e,
    )
    return { skipped_no_look: true, characters: zero(), worlds: zero() }
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
  return { characters, worlds }
}
