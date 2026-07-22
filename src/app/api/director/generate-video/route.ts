import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { fal } from '@fal-ai/client'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { getGenerationJobById, userOwnsProject } from '@/lib/generation-jobs'
import { checkUserQuota, quotaExceededBody } from '@/lib/generation-quota'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { buildBestEffortFalRequestCapturePatch } from '@/lib/fal/observability'
import {
  VIDEO_MODELS,
  clampDuration,
  normalizeProvider,
  type VideoModelKey,
} from '@/lib/video-models'
import {
  attachProviderRequestToReservedVideoJob,
  markDirectorVideoAttemptFailed,
  reserveDirectorVideoRegeneration,
  reserveDirectorVideoTake,
} from '@/lib/director-video-takes'
import {
  DirectorVideoCompletionPersistenceError,
  finalizeShotVideoJob,
} from '@/lib/fal/finalize'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'
import type { CameraConfig, CameraPreset } from '@/types'

fal.config({ credentials: () => process.env.FAL_KEY ?? '' })

// reference-to-video는 레퍼런스 이미지가 필수. 레퍼런스 없는 T2V는 이 Kling 엔드포인트로 폴백.
const FAL_T2V_FALLBACK_MODEL = 'fal-ai/kling-video/v2.1/master/text-to-video'

export const maxDuration = 300

type VideoProvider = 'fal' | 'local'
type GenerationMethod = 'T2V' | 'I2V'

type FalVideoSubmitRequest = {
  model: string
  input: Record<string, unknown>
}
type VideoSubmission = {
  taskId: string
  provider: VideoProvider
  model: string
}

function isJsonValue(value: unknown): value is Json {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.values(value).every(isJsonValue)
}

function canonicalJson(value: Json): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value)
    if (typeof serialized !== 'string') throw new Error('Validated JSON primitive has no canonical representation')
    return serialized
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => {
    const child = value[key]
    if (!isJsonValue(child)) throw new Error('Validated JSON object contains an invalid value')
    return `${JSON.stringify(key)}:${canonicalJson(child)}`
  }).join(',')}}`
}

function snapshotValueMatches(snapshot: Record<string, unknown>, candidate: Record<string, unknown>): boolean {
  return [
    'prompt', 'full_prompt', 'camera', 'duration_seconds', 'aspect_ratio', 'generation_method',
    'provider', 'model', 'resolved_model_key', 'reference_image_url', 'reference_image_urls',
    'movement_preset', 'camera_preset', 'fal_request', 'new_take_metadata',
  ].every((key) => {
    const snapshotHasKey = Object.prototype.hasOwnProperty.call(snapshot, key)
    const candidateHasKey = Object.prototype.hasOwnProperty.call(candidate, key)
    if (!snapshotHasKey || !candidateHasKey) return snapshotHasKey === candidateHasKey
    return isJsonValue(snapshot[key]) && isJsonValue(candidate[key])
      && canonicalJson(snapshot[key]) === canonicalJson(candidate[key])
  })
}

function requireReservedVideoSnapshot(job: { input_snapshot?: Json; provider?: string; model: string }) {
  const snapshot = job.input_snapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Reserved video job has no immutable input snapshot')
  }
  const input = snapshot as Record<string, unknown>
  if (typeof input.full_prompt !== 'string' || (input.generation_method !== 'T2V' && input.generation_method !== 'I2V')) {
    throw new Error('Reserved video job has an invalid immutable input snapshot')
  }
  if (job.provider === 'local') {
    return {
      input,
      provider: 'local' as const,
      model: input.generation_method === 'I2V' ? 'hunyuan-i2v' : 'hunyuan-t2v',
    }
  }
  const falRequest = input.fal_request
  if (
    job.provider !== 'fal' ||
    !falRequest ||
    typeof falRequest !== 'object' ||
    Array.isArray(falRequest) ||
    typeof (falRequest as { model?: unknown }).model !== 'string' ||
    !(falRequest as { model: string }).model ||
    !(falRequest as { input?: unknown }).input ||
    typeof (falRequest as { input: unknown }).input !== 'object' ||
    Array.isArray((falRequest as { input: unknown }).input)
  ) {
    throw new Error('Reserved video job has an invalid immutable FAL input snapshot')
  }
  const request = falRequest as FalVideoSubmitRequest
  return { input, provider: 'fal' as const, model: request.model, falRequest: request }
}

/* ── FAL.ai T2V fallback (레퍼런스 이미지 없음) ── */
function buildFalT2VFallbackRequest(
  prompt: string,
  durationSeconds: number,
  aspectRatio: string,
): FalVideoSubmitRequest {
  return {
    model: FAL_T2V_FALLBACK_MODEL,
    input: {
      prompt,
      negative_prompt: 'blurry, low quality, distorted, deformed',
      duration: durationSeconds >= 10 ? '10' : '5',
      aspect_ratio: aspectRatio ?? '16:9',
    },
  }
}

/* ── FAL.ai reference-to-video (레지스트리 기반, #5) ──
   V2 refs(#real-strip 2026-07-22): imageUrls 가 [START, END] 2장이면 시작·끝 구도 고정 —
   전 모델 refParam 이 image_urls 배열이라 스키마 변경 없이 원소만 늘어난다. */
function buildFalReferenceToVideoRequest(
  modelKey: VideoModelKey,
  prompt: string,
  imageUrls: string[],
  durationSeconds: number,
  aspectRatio: string,
): FalVideoSubmitRequest {
  const spec = VIDEO_MODELS[modelKey]
  if (!spec.endpoint) throw new Error('FAL reference-to-video endpoint missing')
  const input: Record<string, unknown> = {
    prompt,
    negative_prompt: 'blurry, low quality, distorted, deformed',
    [spec.refParam]: imageUrls,
  }

  // duration: flexible=정수(clamp), fixed(veo)='8s'
  if (spec.duration.mode === 'fixed') {
    input.duration = spec.duration.value
  } else {
    input.duration = clampDuration(spec, durationSeconds)
  }

  // audio: 토글 있는 모델만, 기본 OFF
  if (spec.audioParam) {
    input[spec.audioParam] = spec.audioDefault
  }

  // resolution: 노출하는 모델만 기본 해상도
  if (spec.resolutions.length > 0) {
    input.resolution = spec.defaultResolution
  }

  // aspect_ratio: kling-o3는 미노출(확실치 않아 omit), 그 외 전달
  if (modelKey !== 'kling-o3') {
    input.aspect_ratio = aspectRatio ?? '16:9'
  }

  return { model: spec.endpoint, input }
}

async function submitFalReferenceToVideo(
  request: FalVideoSubmitRequest,
  webhookUrl?: string,
) {
  const { request_id } = await fal.queue.submit(
    request.model,
    webhookUrl ? { input: request.input, webhookUrl } : { input: request.input },
  )
  return {
    taskId: request_id,
    provider: 'fal' as const,
    model: request.model,
  }
}

type LocalVideoModel = 'hunyuan-t2v' | 'hunyuan-i2v'

class AmbiguousVideoSubmissionError extends Error {
  constructor(
    readonly requestId?: string,
    readonly status?: number,
    cause?: unknown,
  ) {
    super('Video provider submission outcome is unknown; the reserved attempt was left queued', { cause })
    this.name = 'AmbiguousVideoSubmissionError'
  }
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isAmbiguousSubmitError(error: unknown): error is Error & { request_id?: unknown; requestId?: unknown; status?: unknown } {
  if (!(error instanceof Error)) return false
  if (providerRequestIdFromError(error)) return true
  const rawStatus = (error as unknown as { status?: unknown }).status
  const status = typeof rawStatus === 'number' ? rawStatus : undefined
  return error.name === 'AbortError' || error instanceof TypeError || (status !== undefined && isTransientStatus(status))
}

function providerRequestIdFromError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = (error as { request_id?: unknown; requestId?: unknown }).request_id
    ?? (error as { requestId?: unknown }).requestId
  return typeof value === 'string' && value ? value : undefined
}

async function submitLocalVideo(
  path: '/hunyuan/t2v' | '/hunyuan/i2v',
  body: Record<string, unknown>,
  model: LocalVideoModel,
): Promise<VideoSubmission> {
  const baseUrl = process.env.TAILSCALE_VIDEO_API_URL
  if (!baseUrl) throw new Error('TAILSCALE_VIDEO_API_URL is not configured')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 290_000)
  try {
    let response: Response
    try {
      response = await fetch(new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error
        ? (error as { status?: unknown }).status
        : undefined
      throw new AmbiguousVideoSubmissionError(undefined, typeof status === 'number' ? status : undefined, error)
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      if (isTransientStatus(response.status)) {
        throw new AmbiguousVideoSubmissionError(undefined, response.status, new Error(text))
      }
      throw new Error(`Local ${model} error (${response.status}): ${text}`)
    }
    const data = await response.json() as { output_url?: string }
    if (typeof data.output_url !== 'string' || !data.output_url) throw new Error('output_url missing from server response')
    const taskId = new URL(data.output_url, baseUrl).toString()
    try {
      assertTrustedLocalTaskUrl(taskId)
    } catch (error) {
      if (error instanceof RecoveryInputError) {
        throw new Error(`Local provider returned invalid output URL: ${error.message}`)
      }
      throw error
    }
    return { taskId, provider: 'local', model }
  } finally {
    clearTimeout(timeout)
  }
}


class RecoveryInputError extends Error {
  constructor(readonly status: 400 | 409, message: string) {
    super(message)
    this.name = 'RecoveryInputError'
  }
}

type RecoveryReceiptPayload = {
  projectId: string
  jobId: string
  provider: VideoProvider
  taskId: string
  model: string
  exp: number
}

function recoverySecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for video recovery receipts')
  return secret
}

function encodeReceipt(payload: RecoveryReceiptPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', `director-video-recovery:${recoverySecret()}`).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function decodeReceipt(receipt: unknown): RecoveryReceiptPayload {
  if (typeof receipt !== 'string' || receipt.length > 4096) throw new RecoveryInputError(400, 'Invalid recovery receipt')
  const [encoded, signature, extra] = receipt.split('.')
  if (!encoded || !signature || extra) throw new RecoveryInputError(400, 'Invalid recovery receipt')
  const expected = createHmac('sha256', `director-video-recovery:${recoverySecret()}`).update(encoded).digest()
  const supplied = Buffer.from(signature, 'base64url')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new RecoveryInputError(400, 'Invalid recovery receipt')
  let payload: unknown
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) } catch { throw new RecoveryInputError(400, 'Invalid recovery receipt') }
  if (!payload || typeof payload !== 'object') throw new RecoveryInputError(400, 'Invalid recovery receipt')
  const value = payload as RecoveryReceiptPayload
  if (typeof value.projectId !== 'string' || typeof value.jobId !== 'string' ||
    (value.provider !== 'fal' && value.provider !== 'local') || typeof value.taskId !== 'string' ||
    !value.taskId || typeof value.model !== 'string') throw new RecoveryInputError(400, 'Invalid recovery receipt')
  if (typeof value.exp !== 'number' || value.exp < Date.now()) throw new RecoveryInputError(409, 'Recovery receipt has expired')
  return value
}

function assertTrustedLocalTaskUrl(taskId: string): void {
  const configured = process.env.TAILSCALE_VIDEO_API_URL
  if (!configured) throw new RecoveryInputError(400, 'TAILSCALE_VIDEO_API_URL is not configured')
  let task: URL
  let base: URL
  try { task = new URL(taskId); base = new URL(configured) } catch { throw new RecoveryInputError(400, 'Invalid local recovery task URL') }
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`
  if (task.origin !== base.origin || !(task.pathname === base.pathname || task.pathname.startsWith(basePath))) {
    throw new RecoveryInputError(400, 'Local recovery task URL is outside the configured provider')
  }
}

function sanitizeProviderEvidence(error: unknown, providerStatus: number | undefined): { cause: string; code: string } {
  const rawCause = error instanceof Error ? error.message : String(error)
  const cause = rawCause.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
  const rawCode = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined
  const code = typeof rawCode === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(rawCode)
    ? rawCode
    : providerStatus !== undefined
      ? `HTTP_${providerStatus}`
      : 'AMBIGUOUS_SUBMISSION'
  return { cause: cause || 'Provider submission outcome is unknown', code }
}

async function recordAmbiguousVideoSubmission(
  projectId: string,
  jobId: string,
  providerStatus: number | undefined,
  evidence: { cause: string; code: string },
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc('record_director_video_submission_resolution', {
    p_project_id: projectId,
    p_job_id: jobId,
    p_provider_status: providerStatus ?? null,
    p_cause: evidence.cause,
    p_code: evidence.code,
  })
  if (error) throw error
  if (!data) throw new Error('Reserved video job recovery resolution CAS did not match')
}

export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  let reservation: { video_clip_id: string; job_id: string; take_number: number; replayed: boolean } | null = null
  let projectId = ''
  try {
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = (await req.json()) as {
      shotId?: string; projectId?: string; writerShotId?: string | null; prompt?: string; camera?: CameraConfig
      durationSeconds?: number; aspectRatio?: string; generationMethod?: GenerationMethod; provider?: VideoProvider
      model?: string; referenceImageUrl?: string; referenceImageUrls?: string[]; movementPreset?: string | null
      cameraPreset?: CameraPreset | null
      idempotencyKey?: string; videoClipId?: string; takeLabel?: string | null; override?: Json; canvasPosition?: Json | null
      recoveryReceipt?: string
    }
    const { prompt, camera, durationSeconds, aspectRatio, generationMethod = 'T2V', provider, model,
      referenceImageUrl, movementPreset, cameraPreset, idempotencyKey, videoClipId, takeLabel, override, canvasPosition,
      recoveryReceipt } = body
    // V2 refs(#real-strip): [START, END] 등 다중 레퍼런스. referenceImageUrl(단일)과 병행 수신 —
    //   단일은 I2V 판별·스냅샷 하위호환 축, 배열은 실제 제출 레퍼런스로 우선.
    const referenceImageUrlsV2 = Array.isArray(body.referenceImageUrls)
      ? body.referenceImageUrls.filter((u): u is string => typeof u === 'string' && !!u).slice(0, 4)
      : undefined
    const writerShotId = body.writerShotId ?? body.shotId
    projectId = body.projectId ?? ''
    if (!projectId || !writerShotId || !prompt || !idempotencyKey) {
      return NextResponse.json({ error: 'projectId, shotId, prompt, and idempotencyKey are required' }, { status: 400 })
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return NextResponse.json({ error: 'idempotencyKey must be a UUID' }, { status: 400 })
    }
    if (generationMethod === 'I2V' && !referenceImageUrl) return NextResponse.json({ error: 'referenceImageUrl is required for I2V' }, { status: 400 })
    if (!(await userOwnsProject(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [{ data: project, error: projectError }, { data: shot, error: shotError }] = await Promise.all([
      supabaseAdmin.from('projects').select('workspace_id').eq('id', projectId).maybeSingle(),
      supabaseAdmin.from('shots').select('shot_id').eq('project_id', projectId).eq('shot_id', writerShotId).maybeSingle(),
    ])
    if (projectError) throw projectError
    if (shotError) throw shotError
    if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    if (!shot) return NextResponse.json({ error: 'writerShotId does not belong to project' }, { status: 400 })
    const replayQuery = supabaseAdmin
      .from('generation_jobs')
      .select('id, video_clip_id, target')
      .eq('project_id', projectId)
      .eq('kind', 'shot_video')
      .eq('idempotency_key', idempotencyKey)
    const { data: existingReplay, error: replayError } = videoClipId
      ? await replayQuery.eq('video_clip_id', videoClipId).maybeSingle()
      : await replayQuery.contains('target', { retakeMode: 'new_take' }).maybeSingle()
    if (replayError) throw replayError
    if (videoClipId) {
      const { data: clip, error } = await supabaseAdmin.from('video_clips').select('id, shot_id').eq('id', videoClipId).eq('project_id', projectId).is('deleted_at', null).maybeSingle()
      if (error) throw error
      if (!clip || clip.shot_id !== writerShotId) return NextResponse.json({ error: 'videoClipId does not belong to writerShotId' }, { status: 400 })
    }
    const replayTarget = existingReplay && typeof existingReplay.target === 'object' && existingReplay.target !== null && !Array.isArray(existingReplay.target)
      ? existingReplay.target as Record<string, unknown>
      : null
    const exactReplay = Boolean(existingReplay) && (
      videoClipId
        ? replayTarget?.retakeMode === 'regeneration' &&
          replayTarget?.writerShotId === writerShotId &&
          replayTarget?.videoClipId === videoClipId
        : replayTarget?.retakeMode === 'new_take' && replayTarget?.writerShotId === writerShotId
    )
    if (existingReplay && !exactReplay) {
      return NextResponse.json({ error: 'idempotencyKey is already reserved for a different video operation' }, { status: 409 })
    }
    if (recoveryReceipt && !exactReplay) {
      return NextResponse.json(
        { error: 'recoveryReceipt can only recover an existing reservation' },
        { status: 409 },
      )
    }
    if (!exactReplay) {
      const quota = await checkUserQuota(user.id)
      if (!quota.ok) return NextResponse.json(quotaExceededBody(quota), { status: 429 })
    }

    const modelKey: VideoModelKey = model != null ? normalizeProvider(model) : provider === 'local' ? 'local' : normalizeProvider('')
    const isLocal = modelKey === 'local'
    const dur = durationSeconds ?? 5
    const submitRefUrls = referenceImageUrl
      ? referenceImageUrlsV2?.length
        ? referenceImageUrlsV2
        : [referenceImageUrl]
      : null
    const { fullPrompt, prompt_parts: promptParts } = buildVideoPrompt({
      prompt,
      camera,
      movementPreset,
      cameraPreset,
      generationMethod,
      modelKey,
      durationSeconds: dur,
      startEndReference: (submitRefUrls?.length ?? 0) >= 2,
    })
    const falSubmitRequest = isLocal
      ? null
      : submitRefUrls
        ? buildFalReferenceToVideoRequest(modelKey, fullPrompt, submitRefUrls, dur, aspectRatio ?? '16:9')
        : buildFalT2VFallbackRequest(fullPrompt, dur, aspectRatio ?? '16:9')
    const falCapture = falSubmitRequest
      ? buildBestEffortFalRequestCapturePatch(falSubmitRequest.input, falSubmitRequest.model)
      : {}
    const normalizedNewTakeMetadata = {
      take_label: takeLabel ?? null,
      override: override ?? {},
      canvas_position: canvasPosition ?? null,
    }
    const inputSnapshot = {
      prompt,
      full_prompt: fullPrompt,
      prompt_parts: promptParts,
      camera: camera ?? null,
      duration_seconds: dur,
      aspect_ratio: aspectRatio ?? '16:9',
      generation_method: generationMethod,
      provider: provider ?? null,
      model: model ?? null,
      resolved_model_key: modelKey,
      reference_image_url: referenceImageUrl ?? null,
      // 배열 키는 존재할 때만 — 구버전 예약 잡의 리플레이 비교(snapshotValueMatches)와 호환.
      ...(referenceImageUrlsV2?.length ? { reference_image_urls: referenceImageUrlsV2 } : {}),
      movement_preset: movementPreset ?? null,
      camera_preset: cameraPreset ?? null,
      ...(videoClipId ? {} : { new_take_metadata: normalizedNewTakeMetadata }),
      ...falCapture,
      ...(falSubmitRequest ? { fal_model: falSubmitRequest.model, fal_request: falSubmitRequest } : {}),
    } as unknown as Json

    reservation = videoClipId
      ? await reserveDirectorVideoRegeneration({ projectId, videoClipId, model: modelKey, target: { workspaceId: project.workspace_id, shotId: writerShotId, writerShotId, videoClipId, retakeMode: 'regeneration' }, idempotencyKey, inputSnapshot, userId: user.id, workspaceId: project.workspace_id, provider: isLocal ? 'local' : 'fal', actor: 'ui' })
      : await reserveDirectorVideoTake({ projectId, shotId: writerShotId, model: modelKey, target: { workspaceId: project.workspace_id, shotId: writerShotId, writerShotId, retakeMode: 'new_take' }, idempotencyKey, inputSnapshot, userId: user.id, workspaceId: project.workspace_id, provider: isLocal ? 'local' : 'fal', actor: 'ui', takeLabel: normalizedNewTakeMetadata.take_label as string | null, override: normalizedNewTakeMetadata.override, canvasPosition: normalizedNewTakeMetadata.canvas_position })
    const reservedJob = await getGenerationJobById(reservation.job_id)
    if (!reservedJob) throw new Error('Reserved video job not found')
    const response = { shotId: writerShotId, jobId: reservation.job_id, videoClipId: reservation.video_clip_id, takeNumber: reservation.take_number, replayed: reservation.replayed, provider: reservedJob.provider ?? (isLocal ? 'local' : 'fal'), model: reservedJob.model, taskId: reservedJob.request_id.startsWith('reserved:') ? undefined : reservedJob.request_id }
    if (reservedJob.status !== 'queued') {
      return NextResponse.json({ ...response, status: reservedJob.status })
    }
    if (!reservedJob.request_id.startsWith('reserved:')) {
      return NextResponse.json({ ...response, status: 'generating' })
    }
    const reservedSubmission = requireReservedVideoSnapshot(reservedJob)
    const storedSnapshot = (
      !videoClipId &&
      reservation.replayed &&
      !Object.prototype.hasOwnProperty.call(reservedSubmission.input, 'new_take_metadata')
    )
      ? { ...reservedSubmission.input, new_take_metadata: normalizedNewTakeMetadata }
      : reservedSubmission.input
    if (!snapshotValueMatches(storedSnapshot, inputSnapshot as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'idempotencyKey replay does not match the reserved video input' }, { status: 409 })
    }
    let result: VideoSubmission
    if (recoveryReceipt) {
      const receipt = decodeReceipt(recoveryReceipt)
      if (
        receipt.projectId !== projectId ||
        receipt.jobId !== reservation.job_id ||
        receipt.provider !== reservedSubmission.provider ||
        receipt.model !== reservedSubmission.model
      ) {
        return NextResponse.json({ error: 'Recovery receipt does not match this reserved job' }, { status: 409 })
      }
      if (receipt.provider === 'local') assertTrustedLocalTaskUrl(receipt.taskId)
      result = { taskId: receipt.taskId, provider: receipt.provider, model: receipt.model }
    } else {
      if (reservation.replayed) {
        const resolution = reservedJob.response_snapshot && typeof reservedJob.response_snapshot === 'object' && !Array.isArray(reservedJob.response_snapshot)
          ? (reservedJob.response_snapshot as { submission_resolution?: { state?: unknown } }).submission_resolution
          : undefined
        const manualRecoveryRequired = resolution?.state === 'manual_recovery_required'
        return NextResponse.json(
          {
            error: manualRecoveryRequired
              ? 'Video provider submission requires manual recovery; retrying could duplicate paid work'
              : 'Reserved video submission state is unknown; a valid recovery receipt is required',
            jobId: reservation.job_id,
            videoClipId: reservation.video_clip_id,
            takeNumber: reservation.take_number,
            status: 'queued',
            retryable: false,
            ...(manualRecoveryRequired ? { unresolved: true, resolution: 'manual_recovery_receipt_required' } : {}),
          },
          { status: 409 },
        )
      }
      const snapshotMethod = reservedSubmission.input.generation_method as GenerationMethod
      const snapshotPrompt = reservedSubmission.input.full_prompt as string
      const snapshotReferenceImageUrl = reservedSubmission.input.reference_image_url
      try {
        result = reservedSubmission.provider === 'local'
          ? snapshotMethod === 'I2V'
            ? typeof snapshotReferenceImageUrl === 'string'
              ? await submitLocalVideo('/hunyuan/i2v', { prompt: snapshotPrompt, image_url: snapshotReferenceImageUrl }, 'hunyuan-i2v')
              : await Promise.reject(new Error('Reserved I2V video job has no reference image'))
            : await submitLocalVideo('/hunyuan/t2v', { prompt: snapshotPrompt, enable_step_distill: false }, 'hunyuan-t2v')
          : await submitFalReferenceToVideo(
              reservedSubmission.falRequest,
              resolveWebhookUrl(),
            )
      } catch (error) {
        if (error instanceof AmbiguousVideoSubmissionError || isAmbiguousSubmitError(error)) {
          const requestId = error instanceof AmbiguousVideoSubmissionError
            ? error.requestId
            : providerRequestIdFromError(error)
          if (requestId) {
            result = { taskId: requestId, provider: reservedSubmission.provider, model: reservedSubmission.model }
          } else {
            const providerStatus = error instanceof AmbiguousVideoSubmissionError
              ? error.status
              : typeof error === 'object' && error !== null && 'status' in error && typeof (error as { status?: unknown }).status === 'number'
                ? (error as { status: number }).status
                : undefined
            const cause = error instanceof AmbiguousVideoSubmissionError ? error.cause : error
            const evidence = sanitizeProviderEvidence(cause, providerStatus)
            console.error('[director/generate-video] ambiguous provider submission:', {
              provider: reservedSubmission.provider,
              status: providerStatus,
              cause: evidence.cause,
              code: evidence.code,
            })
            try {
              await recordAmbiguousVideoSubmission(projectId, reservation.job_id, providerStatus, evidence)
            } catch (persistenceError) {
              console.error(
                '[director/generate-video] ambiguous submission resolution persistence failed:',
                persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
              )
              return NextResponse.json({
                error: 'Video provider submission outcome is unknown; retrying could duplicate paid work',
                jobId: reservation.job_id,
                videoClipId: reservation.video_clip_id,
                takeNumber: reservation.take_number,
                status: 'queued',
                retryable: true,
                unresolved: true,
                resolution: 'manual_recovery_receipt_required',
                providerStatus,
              }, { status: 503 })
            }
            return NextResponse.json({
              error: 'Video provider submission outcome is unknown; retrying could duplicate paid work',
              jobId: reservation.job_id,
              videoClipId: reservation.video_clip_id,
              takeNumber: reservation.take_number,
              status: 'queued',
              retryable: false,
              unresolved: true,
              resolution: 'manual_recovery_receipt_required',
              providerStatus,
            }, { status: 503 })
          }
        } else {
          throw error
        }
      }
    }
    try {
      await attachProviderRequestToReservedVideoJob(projectId, reservation.job_id, result.taskId, { provider: result.provider, model: result.model })
    } catch (attachmentError) {
      const error = attachmentError instanceof Error ? attachmentError.message : String(attachmentError)
      console.error('[director/generate-video] provider request attachment failed:', error)
      const recoveryReceipt = encodeReceipt({
        projectId,
        jobId: reservation.job_id,
        provider: result.provider,
        taskId: result.taskId,
        model: result.model,
        exp: Date.now() + 15 * 60_000,
      })
      return NextResponse.json({
        error,
        jobId: reservation.job_id,
        videoClipId: reservation.video_clip_id,
        takeNumber: reservation.take_number,
        recoveryReceipt,
        provider: result.provider,
        model: result.model,
        status: 'generating',
        retryable: true,
      }, { status: 500 })
    }
    if (result.provider === 'local') {
      const job = await getGenerationJobById(reservation.job_id)
      if (!job) throw new Error('Submitted local video job not found')
      const url = await finalizeShotVideoJob(job, result.taskId)
      return NextResponse.json({ ...response, taskId: result.taskId, provider: result.provider, model: result.model, status: 'completed', url })
    }
    return NextResponse.json({ ...response, taskId: result.taskId, provider: result.provider, model: result.model, status: 'generating' })
  } catch (err) {
    if (err instanceof RecoveryInputError) return NextResponse.json({ error: err.message }, { status: err.status })
    const errMsg = err instanceof Error ? err.message : String(err)
    if (err instanceof DirectorVideoCompletionPersistenceError && reservation && projectId) {
      console.error('[director/generate-video] completion persistence failed:', errMsg)
      return NextResponse.json({
        error: errMsg,
        jobId: reservation.job_id,
        videoClipId: reservation.video_clip_id,
        takeNumber: reservation.take_number,
        status: 'generating',
        retryable: true,
      }, { status: 500 })
    }
    if (reservation && projectId) {
      try {
        await markDirectorVideoAttemptFailed(projectId, reservation.job_id, errMsg)
      } catch (transitionErr) {
        const transitionMsg = transitionErr instanceof Error ? transitionErr.message : String(transitionErr)
        console.error('[director/generate-video] submission failed:', errMsg)
        console.error('[director/generate-video] failure transition failed:', transitionMsg)
        return NextResponse.json({
          error: errMsg,
          transitionError: transitionMsg,
          jobId: reservation.job_id,
          videoClipId: reservation.video_clip_id,
          takeNumber: reservation.take_number,
          status: 'generating',
          retryable: true,
        }, { status: 500 })
      }
      console.error('[director/generate-video]', errMsg)
      return NextResponse.json({
        error: errMsg,
        jobId: reservation.job_id,
        videoClipId: reservation.video_clip_id,
        takeNumber: reservation.take_number,
        status: 'failed',
      }, { status: 500 })
    }
    console.error('[director/generate-video]', errMsg)
    const duplicateActiveAttempt = /clip already has a queued attempt|idempotency mismatch/i.test(errMsg)
    return NextResponse.json({ error: errMsg }, { status: duplicateActiveAttempt ? 409 : 500 })
  }
}
