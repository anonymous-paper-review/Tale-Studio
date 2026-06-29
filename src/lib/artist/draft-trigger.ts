// 핸드오프 직후 artist 초안(캐릭터 대표 main 1장) 서버사이드 트리거 — writer/start after()에서 1회 호출(C1).
//
// 원칙(#57 amend / architecture §5): 빈칸 채우기는 자율(멱등) — 차 있으면 skip. 차 있는 것 교체(재생성)는 사람만.
//   룩(projects.design_tokens)은 핸드오프 시점엔 아직 부재 → lookFingerprint=null → source_hash가 레거시와
//   바이트 동일(룩 미반영 초안, AC6). writer v2Design 도착 후 이 초안은 stale로 판정된다(AC7, C2).
//   대표 main 1장만 생성한다(4방향/디테일은 룩 확정·사람 선별 이후 — 비용 튜닝). 서버가 main 단일 생산자.
import { supabaseAdmin } from '@/lib/supabase/admin'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { createGenerationJob, hasQueuedCharacterViewJob } from '@/lib/generation-jobs'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { buildCharacterMainPrompt } from '@/lib/artist/turnaround'
import { CHARACTER_VIEW_COLUMNS } from '@/types/asset'
import {
  computeImageSourceHash,
  computeLookFingerprint,
  type LookTokens,
} from '@/lib/image-provenance'

const DRAFT_MODEL = 'openai/gpt-image-2'

interface DraftCharacterRow {
  character_id: string
  name: string
  role: string | null
  appearance: string | null
  costume: string | null
  view_main: string | null
}

export interface DraftTriggerResult {
  submitted: number
  skipped: number
  failed: number
}

/**
 * 프로젝트 캐릭터들의 대표 main 초안을 서버에서 생성(빈칸만, 멱등). 핸드오프 시 1회.
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
        .select('character_id, name, role, appearance, costume, view_main')
        .eq('project_id', projectId),
      supabaseAdmin
        .from('projects')
        .select('design_tokens, workspace_id')
        .eq('id', projectId)
        .maybeSingle(),
    ])
    if (!chars?.length) return result

    // 핸드오프 시점엔 보통 design_tokens 부재(writer v2Design 미완) → lookFingerprint=null.
    const designTokens = (project?.design_tokens ?? null) as LookTokens | null
    const webhookUrl = resolveWebhookUrl()

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
        const lookFingerprint = computeLookFingerprint(designTokens, c.costume)
        const prompt = buildCharacterMainPrompt({
          name: c.name,
          appearance: c.appearance ?? c.name,
          role: c.role ?? undefined,
        })
        const { request_id, model } = await falImageSubmit({
          model: DRAFT_MODEL,
          prompt,
          aspect_ratio: '1:1',
          webhookUrl,
        })
        await createGenerationJob({
          projectId,
          requestId: request_id,
          model,
          kind: 'character_view',
          actor: 'writer',
          provider: 'fal',
          inputSnapshot: {
            model,
            prompt,
            aspect_ratio: '1:1',
            source_hash: computeImageSourceHash(c.appearance, lookFingerprint),
            // 외형만의 지문(룩 무관) — look-pending vs edited 구분용(027).
            appearance_hash: computeImageSourceHash(c.appearance, null),
            look_present: lookFingerprint != null,
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
