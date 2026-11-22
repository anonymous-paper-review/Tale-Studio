// 소품 그림 작업(D7, 2026-11-22) 서버 도우미 — 그릴 소품 · 프로젝트 읽기, 그리는 중 · 실패 목록, 제출(자리 예약 → fal 제출 → 접수 저장).
//   배경(world_shot)의 도우미(generation-jobs · world-submit)와 같은 규칙을 생성 종류 prop_image 로 옮겼다.
//   service-role 전용 — 호출 라우트가 주인 확인을 먼저 한다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  classifyFalFailure,
  confirmGenerationJobReceipt,
  rejectGenerationJobReservation,
  reserveGenerationJob,
  type GenerationJob,
  type GenerationJobActor,
  type GenerationJobTarget,
} from '@/lib/generation-jobs'
import { STALE_QUEUED_MS } from '@/lib/generation-job-timing'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'
import { moderatedSubmitInput, type ModerationReceipt } from '@/lib/moderation/creem'
import { recordModerationPass } from '@/lib/api/moderation'
import type { PropImagePlan } from '@/lib/artist/prop-image-plan'

export interface PropDrawingContext {
  prop: { prop_id: string; name: string; appearance: string | null; image_url: string | null } | null
  project: { workspace_id: string; style_anchor_key: string | null; custom_style_anchor: unknown; settings?: unknown } | null
  /** 같은 id 의 인물 행이 있다 — 예전 저장 고장. 어느 그림을 고칠지 몰라 그리지 않는다. */
  personClash: boolean
}

export async function loadPropDrawingContext(projectId: string, propId: string): Promise<PropDrawingContext> {
  const [prop, project, person] = await Promise.all([
    supabaseAdmin.from('props').select('prop_id, name, appearance, image_url').eq('project_id', projectId).eq('prop_id', propId).maybeSingle(),
    supabaseAdmin.from('projects').select('workspace_id, style_anchor_key, custom_style_anchor, settings').eq('id', projectId).maybeSingle(),
    supabaseAdmin.from('characters').select('character_id').eq('project_id', projectId).eq('character_id', propId).maybeSingle(),
  ])
  const failed = prop.error ?? project.error ?? person.error
  if (failed) throw failed
  return {
    prop: prop.data ?? null,
    project: (project.data as PropDrawingContext['project']) ?? null,
    personClash: !!person.data,
  }
}

/** STALE_QUEUED_MS 안에 들어온 대기 작업인가 — 시각이 없으면 막 들어온 것으로 본다(generation-jobs freshQueued 와 같다). */
function freshQueued(row: { created_at?: unknown }, now = Date.now()): boolean {
  if (typeof row.created_at !== 'string') return true
  const at = Date.parse(row.created_at)
  return !Number.isFinite(at) || now - at < STALE_QUEUED_MS
}

async function queuedPropJobs(projectId: string): Promise<Array<{ id: string; target: GenerationJobTarget; created_at?: string }>> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, target, created_at')
    .eq('project_id', projectId)
    .eq('kind', 'prop_image')
    .eq('status', 'queued')
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; target: unknown; created_at?: string }>)
    .filter((row) => freshQueued(row))
    .map((row) => ({ id: row.id, target: (row.target ?? {}) as GenerationJobTarget, created_at: row.created_at }))
}

/** 멱등 가드: 이 소품을 그리는 대기 작업이 이미 있는가. */
export async function hasQueuedPropImageJob(projectId: string, propId: string): Promise<boolean> {
  return (await queuedPropJobs(projectId)).some((row) => row.target.propId === propId)
}

/** 새로고침 뒤 같은 소품을 다시 발주하지 않고 확인할 작업 목록. */
export async function listQueuedPropImageJobs(projectId: string): Promise<Array<{ propId: string; jobId: string }>> {
  return (await queuedPropJobs(projectId)).flatMap((row) => (row.target.propId ? [{ propId: row.target.propId, jobId: row.id }] : []))
}

export interface PropImageFailure {
  propId: string
  error: string | null
  failCount: number
  safeFailCount: number
  moderation: boolean
}

/** 최근 24시간, 지금 실패 상태인 소품(가장 최근 작업이 failed) — 카드 "그림 실패" · 안전 재시도 상한의 근거. 배경과 같은 규칙. */
export async function listFailedPropImageJobs(projectId: string): Promise<PropImageFailure[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('target, error, status, input_snapshot, created_at')
    .eq('project_id', projectId)
    .eq('kind', 'prop_image')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (error) throw error
  type Row = { target: GenerationJobTarget | null; error: string | null; status: string; input_snapshot: { safe_mode?: boolean } | null }
  const byProp = new Map<string, PropImageFailure & { latestFailed: boolean }>()
  for (const row of (data ?? []) as Row[]) {
    const propId = row.target?.propId
    if (!propId) continue
    let slot = byProp.get(propId)
    if (!slot) {
      slot = { propId, error: row.error, failCount: 0, safeFailCount: 0, moderation: classifyFalFailure(row.error) === 'moderation', latestFailed: row.status === 'failed' }
      byProp.set(propId, slot)
    }
    if (row.status === 'failed') {
      slot.failCount++
      if (row.input_snapshot?.safe_mode === true) slot.safeFailCount++
    }
  }
  return [...byProp.values()].filter((slot) => slot.latestFailed).map(({ latestFailed, ...slot }) => {
    void latestFailed
    return slot
  })
}

export interface SubmitPropImageJobInput {
  projectId: string
  propId: string
  plan: PropImagePlan
  /** 생김새 + 그림체 지문(lib/artist/prop-image propImageStamp) — 마무리가 props.source_hash 로 적는다. */
  stamp: string
  actor: GenerationJobActor
  userId: string | null
  workspaceId: string
  styleAnchorKey: string | null
  safeMode: boolean
  chatTraceId: string | null
  moderation: ModerationReceipt
}

/** 자리 예약이 먼저다(#generation-capacity-trigger 2026-09-14) — 제출을 먼저 하면 트리거가 거절한 순간 이미 유료 요청이 나간 뒤다. */
export async function submitPropImageJob(input: SubmitPropImageJobInput): Promise<GenerationJob> {
  const { submit, model, modelKey } = input.plan
  const job = await reserveGenerationJob({
    projectId: input.projectId,
    model,
    kind: 'prop_image',
    actor: input.actor,
    userId: input.userId,
    workspaceId: input.workspaceId,
    provider: 'fal',
    inputSnapshot: {
      prompt: submit.prompt,
      aspect_ratio: submit.aspect_ratio,
      ...(submit.image_size ? { image_size: submit.image_size } : {}),
      ...(submit.reference_image_urls ? { reference_image_urls: submit.reference_image_urls } : {}),
      model,
      source_hash: input.stamp,
      style_anchor_key: input.styleAnchorKey,
      image_model: modelKey,
      ...(input.safeMode ? { safe_mode: true } : {}),
    },
    chatTraceId: input.chatTraceId,
    target: { workspaceId: input.workspaceId, propId: input.propId },
  })
  recordModerationPass(input.moderation, { projectId: input.projectId, kind: 'prop_image', userId: input.userId, jobId: job.id })
  try {
    // 외부 접수는 한 번뿐이다 — 응답을 잃은 호출을 재시도로 복제하지 않는다(배경 · 러프와 같은 이유).
    const receipt = await falImageSubmit(moderatedSubmitInput({ ...submit, webhookUrl: resolveWebhookUrl() }, input.moderation), { retry: false, falKeyId: job.fal_key_id })
    try {
      await confirmGenerationJobReceipt(job.id, input.projectId, receipt)
    } catch (error) {
      console.error('[prop-submit] accepted receipt could not be saved:', job.id, error instanceof Error ? error.message : String(error))
    }
    return { ...job, request_id: receipt.request_id, model: receipt.model, fal_key_id: receipt.fal_key_id }
  } catch (error) {
    // 확정 거절(4xx)만 예약을 닫는다. 통신 오류 · 5xx 는 이미 접수됐을 수 있어 예약을 남긴다(submit-rejection.ts).
    if (isDefiniteSubmitRejection(error)) await rejectGenerationJobReservation(job.id, input.projectId, error instanceof Error ? error.message : String(error))
    throw error
  }
}
