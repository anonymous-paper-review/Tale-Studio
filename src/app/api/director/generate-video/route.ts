import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { resolveStyleAnchorByKey } from '@/lib/style-anchor'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { pickFalKey } from '@/lib/fal/keys'
import {
  type DialogueLine,
  type DialogueSpeaker,
  type VideoReferenceImageRole,
  buildVideoPrompt,
} from '@/lib/director/video-prompt'
import { loadShotDesignByMainId, resolveShotDesign } from '@/lib/writer/shot-design-state'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import { getGenerationJobById, linkGenerationJobToChatTrace, userOwnsProject } from '@/lib/generation-jobs'
import { isChatTraceId } from '@/lib/chat-trace'
import { chatTraceBelongsToProject } from '@/lib/chat-trace-server'
import { checkGenerationCapacity, checkProjectVideoBudget } from '@/lib/generation-quota'
import { quotaRejectionResponse, videoBudgetRejectionResponse } from '@/lib/api/quota'
import { deriveEnBatch } from '@/lib/writer/i18n/derive-en'
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
  updateDirectorVideoTakeMetadata,
} from '@/lib/director-video-takes'
import {
  isStandaloneVideoOwnerKey,
  normalizeStandaloneVideoConfig,
} from '@/lib/director/standalone-video'
import {
  DirectorVideoCompletionPersistenceError,
  finalizeShotVideoJob,
} from '@/lib/fal/finalize'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { holdTakesForVideoJob } from '@/lib/billing/take-hold'
import { takeCostForVideo } from '@/lib/billing/take-cost'
import { hasStoryboardImage } from '@/lib/director/storyboard-image'
import type { Json } from '@/types/database'
import type { CameraConfig, CameraPreset } from '@/types'
import type { StandaloneVideoConfig } from '@/types/director'

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
  /** fal 제출에만 존재(#fal-key-pool) — local 제출은 키 개념이 없다. */
  falKeyId?: string
}

class CharacterAppearanceContractError extends Error {}

function requireCharacterAppearanceKeys(value: unknown, shotId: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CharacterAppearanceContractError(`Character appearance contract error: shot ${shotId} has no character_appearance_keys snapshot`)
  }
  const entries = Object.entries(value)
  if (entries.some(([characterId, appearanceKey]) => !characterId || typeof appearanceKey !== 'string' || !appearanceKey.trim())) {
    throw new CharacterAppearanceContractError(`Character appearance contract error: shot ${shotId} has a malformed character_appearance_keys snapshot`)
  }
  return Object.fromEntries(entries.map(([characterId, appearanceKey]) => [characterId, appearanceKey.trim()]))
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
    'reference_image_roles',
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
    [spec.refParam]: imageUrls,
  }
  // happy-horse는 negative_prompt 미지원(모델 스키마) — 헛송신 제거(#tfix-fal-wiring 2026-08-11).
  //   고정 negative_prompt 계약 자체는 타 모델에서 유지(존폐는 별도 논의 — 카탈로그 B12).
  if (modelKey !== 'happy-horse') {
    input.negative_prompt = 'blurry, low quality, distorted, deformed'
  }

  // duration: flexible=정수(clamp), fixed(veo)='8s'
  if (spec.duration.mode === 'fixed') {
    input.duration = spec.duration.value
  } else {
    input.duration = clampDuration(spec, durationSeconds)
  }

  // audio: 토글 있는 모델만 — 현재 전 모델 audioDefault=true(91b83f6, 음성은 영상 생성기에
  //   맡긴다는 방침의 전제). 대사 절(#g7)이 가청 대사를 요구하므로 여기가 꺼지면 반쪽이 된다.
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
  const k = await pickFalKey()
  const { request_id } = await k.client.queue.submit(
    request.model,
    webhookUrl ? { input: request.input, webhookUrl } : { input: request.input },
  )
  return {
    taskId: request_id,
    provider: 'fal' as const,
    model: request.model,
    falKeyId: k.id,
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
      model?: string; referenceImageUrl?: string; referenceImageUrls?: string[]
      referenceImageRoles?: Array<'start' | 'end' | 'ref'>; movementPreset?: string | null
      cameraPreset?: CameraPreset | null
      idempotencyKey?: string; videoClipId?: string; takeLabel?: string | null; override?: Json; canvasPosition?: Json | null
      recoveryReceipt?: string; traceId?: string; actor?: string; standaloneVideoKey?: string
      standaloneConfig?: unknown
    }
    let {
      prompt,
      camera,
      durationSeconds,
      provider,
      model,
      cameraPreset,
    } = body
    const {
      aspectRatio,
      generationMethod = 'T2V',
      referenceImageUrl,
      movementPreset,
      idempotencyKey,
      videoClipId,
      takeLabel,
      override,
      canvasPosition,
      recoveryReceipt,
    } = body
    const standaloneVideoKey = body.standaloneVideoKey
    const standalone = standaloneVideoKey !== undefined
    // #u16 복원(2026-08-31 오너 지시): trace 영속화(chat_traces)와 헬퍼가 재착륙해 소속 검증이
    //   가능해졌다 — 이미지 라우트(스트립·배치)와 동일 계약으로 영상 라우트 배선을 복원한다.
    const traceId = body.traceId
    const jobActor = body.actor === 'chat' ? 'chat' : 'ui'
    if (traceId !== undefined && !isChatTraceId(traceId)) {
      return NextResponse.json({ error: 'Invalid request: traceId must be a UUID' }, { status: 400 })
    }
    // V2 refs(#real-strip): [START, END] 등 다중 레퍼런스. referenceImageUrl(단일)과 병행 수신 —
    //   단일은 I2V 판별·스냅샷 하위호환 축, 배열은 실제 제출 레퍼런스로 우선.
    const referenceImageUrlsV2 = Array.isArray(body.referenceImageUrls)
      ? body.referenceImageUrls.filter((u): u is string => typeof u === 'string' && !!u).slice(0, 4)
      : undefined
    const referenceImageRolesV2 = Array.isArray(body.referenceImageRoles)
      ? body.referenceImageRoles.length <= 4 &&
        body.referenceImageRoles.every(
          (role): role is VideoReferenceImageRole =>
            role === 'start' || role === 'end' || role === 'ref',
        )
        ? body.referenceImageRoles
        : undefined
      : undefined
    const alignedReferenceImageRoles =
      referenceImageUrlsV2?.length &&
      referenceImageRolesV2?.length === referenceImageUrlsV2.length
        ? referenceImageRolesV2
        : undefined
    let writerShotId = body.writerShotId ?? body.shotId
    projectId = body.projectId ?? ''
    if (
      !projectId
      || !idempotencyKey
      || (standalone
        ? !videoClipId || !isStandaloneVideoOwnerKey(standaloneVideoKey)
        : !writerShotId || !prompt)
    ) {
      return NextResponse.json({ error: 'Invalid request: projectId, shotId, prompt, and idempotencyKey are required' }, { status: 400 })
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return NextResponse.json({ error: 'Invalid request: idempotencyKey must be a UUID' }, { status: 400 })
    }
    if (generationMethod === 'I2V' && !referenceImageUrl) return NextResponse.json({ error: 'Invalid request: referenceImageUrl is required for I2V' }, { status: 400 })
    if (!(await userOwnsProject(projectId, user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (traceId && !(await chatTraceBelongsToProject(projectId, traceId))) {
      return NextResponse.json({ error: 'Invalid request: traceId does not belong to project' }, { status: 409 })
    }

    const [{ data: project, error: projectError }, { data: shot, error: shotError }] = await Promise.all([
      supabaseAdmin.from('projects').select('workspace_id, style_anchor_key').eq('id', projectId).maybeSingle(),
      // #motion-contract: dynamic_spec(모션 계약 소스) + design_ref(구버전 state 폴백 조인 키) 동봉.
      standalone
        ? Promise.resolve({ data: null, error: null })
        : supabaseAdmin.from('shots').select('shot_id, dynamic_spec, design_ref, dialogue_lines, character_appearance_keys, prompt, storyboard_image').eq('project_id', projectId).eq('shot_id', writerShotId).maybeSingle(),
    ])
    if (projectError) throw projectError
    if (shotError) throw shotError
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!standalone && !shot) return NextResponse.json({ error: 'Invalid request: writerShotId does not belong to project' }, { status: 400 })
    // #ref-gate(2026-09-02 오너 결정): writer 샷의 실사 영상은 실사 스토리보드(시작 프레임)가 있어야 한다 —
    //   클라가 준 프레임을 검사 없이 받던 무음 폴백 폐지. 409 code 로 막고 클라가 실사 완성을 기다렸다가 자동 재개.
    //   (러프 previz 영상은 별도 잡 종류 shot_previz_video / 별도 라우트라 이 게이트와 무관.)
    //   storyboard_image 는 JSONB {url, frames, status} — 판정은 hasStoryboardImage 한 곳(클라 대기 판정과 공유).
    if (!standalone && shot && !hasStoryboardImage(shot.storyboard_image)) {
      return NextResponse.json(
        {
          error: `The live-action storyboard is missing for shot ${writerShotId}. Generate it before the video.`,
          code: 'missing_storyboard',
          shotId: writerShotId,
        },
        { status: 409 },
      )
    }
    let standaloneConfig: StandaloneVideoConfig | null = null
    if (standalone) {
      const { data: clip, error } = await supabaseAdmin
        .from('video_clips')
        .select('id, shot_id')
        .eq('id', videoClipId)
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!clip || clip.shot_id !== standaloneVideoKey) {
        return NextResponse.json({ error: 'Invalid request: videoClipId does not belong to standaloneVideoKey' }, { status: 400 })
      }
      standaloneConfig = normalizeStandaloneVideoConfig(body.standaloneConfig)
      if (!standaloneConfig) {
        return NextResponse.json({ error: 'Standalone video configuration is invalid' }, { status: 400 })
      }
      if (!standaloneConfig.prompt) {
        return NextResponse.json(
          { error: 'Standalone video prompt is required' },
          { status: 400 },
        )
      }
      writerShotId = standaloneVideoKey!
      prompt = standaloneConfig.prompt
      camera = standaloneConfig.camera
      durationSeconds = standaloneConfig.durationSeconds
      provider = standaloneConfig.provider === 'local' ? 'local' : 'fal'
      model = standaloneConfig.provider
      cameraPreset = standaloneConfig.cameraPreset
    }
    if (!writerShotId || prompt === undefined) {
      return NextResponse.json({ error: 'Video generation input is incomplete' }, { status: 400 })
    }
    const characterAppearanceKeys = standalone
      ? {}
      : requireCharacterAppearanceKeys(shot!.character_appearance_keys, writerShotId)
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
    if (videoClipId && !standalone) {
      const { data: clip, error } = await supabaseAdmin.from('video_clips').select('id, shot_id').eq('id', videoClipId).eq('project_id', projectId).is('deleted_at', null).maybeSingle()
      if (error) throw error
      if (!clip || clip.shot_id !== writerShotId) return NextResponse.json({ error: 'Invalid request: videoClipId does not belong to writerShotId' }, { status: 400 })
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
      return NextResponse.json({ error: 'Invalid request: idempotencyKey is already reserved for a different video operation' }, { status: 409 })
    }
    if (recoveryReceipt && !exactReplay) {
      return NextResponse.json(
        { error: 'Invalid request: recoveryReceipt can only recover an existing reservation' },
        { status: 409 },
      )
    }
    if (!exactReplay) {
      // #f4: 프로젝트 총량(100)이 동시성보다 먼저 — "지금 바빠서"가 아니라 "예산 소진"은 더 강한 no 다.
      const budget = await checkProjectVideoBudget(projectId, user.id)
      if (!budget.ok) return videoBudgetRejectionResponse(budget, { projectId, kind: 'shot_video', userId: user.id })
      const quota = await checkGenerationCapacity(user.id, 'video')
      if (!quota.ok) return quotaRejectionResponse(quota, { projectId, kind: 'shot_video', userId: user.id })
    }

    const modelKey: VideoModelKey = model != null ? normalizeProvider(model) : provider === 'local' ? 'local' : normalizeProvider('')
    const isLocal = modelKey === 'local'
    const dur = durationSeconds ?? 5

    // #motion-contract: 모션 계약 소스 해석 — shots.dynamic_spec(신규 persist) 우선,
    //   구버전 프로젝트는 writer_runs.state.shotDesign 을 design_ref 로 조인(러프보드와 동일 패턴).
    //   둘 다 없으면 null → 계약 없는 레거시 프롬프트(기존 동작 그대로).
    //   replay/recovery(exactReplay)는 스냅샷 프롬프트를 재사용하므로 state 폴백을 건너뛴다.
    let dynamicSpec = standalone ? null : (shot!.dynamic_spec as ShotDynamicSpec | null) ?? null
    if (!standalone && !dynamicSpec && !exactReplay) {
      try {
        // #split-spec: ref 체계 프로젝트에서 ref 없는 샷(분할 자식)은 main-id 폴백 금지 —
        //   옆 샷 설계의 모션 계약이 잘못 붙는다. 그런 샷은 계약 없는 레거시 프롬프트로.
        const designRef = (shot!.design_ref as string | null) ?? null
        const { count } = await supabaseAdmin
          .from('shots')
          .select('shot_id', { count: 'exact', head: true })
          .eq('project_id', projectId)
          .not('design_ref', 'is', null)
        const designById = await loadShotDesignByMainId(projectId)
        dynamicSpec =
          resolveShotDesign(designById, { shotId: writerShotId, designRef }, (count ?? 0) > 0)
            ?.dynamicSpec ?? null
      } catch {
        dynamicSpec = null // best-effort — 계약 없이 진행
      }
    }

    const submitRefUrls = referenceImageUrl
      ? referenceImageUrlsV2?.length
        ? referenceImageUrlsV2
        : [referenceImageUrl]
      : null
    // 영상 카메라 기재 억제(#F-004 B7 2026-08-12) — 앵커 매체가 실사(live_action)가 아니면
    //   "shot on Arri Alexa, 35mm…" 기재 문구를 뺀다. 실측(dc531572, 3D 애니메이션 프로젝트):
    //   영상 프롬프트가 실사 카메라 촬영을 지시해 앵커 룩과 정면 충돌했다. 앵커가 없거나
    //   medium 미상은 기존 그대로(실사 프로젝트 동작 불변).
    const videoAnchor = await resolveStyleAnchorByKey(
      (project as { style_anchor_key?: string | null }).style_anchor_key ?? null,
    ).catch(() => null)
    const suppressGear = !!(videoAnchor?.medium && videoAnchor.medium !== 'live_action')
    // #w-c(2026-08-31 오너 확정, 실측 sh_02_09): 수동 샷(shots.prompt=NULL)은 한국어 액션
    //   원문이 그대로 영상 프롬프트로 흘러온다 — EN 파생은 previz 라우트에만 있었다(감사 W3).
    //   서버 최종 방어로 여기서 파생한다: 이미 영어면 deriveEnBatch 가 LLM 없이 통과라 파이프라인
    //   샷은 비용 0, 실패 항목은 맵에 없어 원문 폴백. 대사 원문은 dialogueClause 가 따로 싣는다.
    let promptEn = prompt
    try {
      const en = (await deriveEnBatch([{ id: 'p', native: prompt }], 'director video prompt')).get('p')
      if (en) promptEn = en
    } catch (err) {
      console.warn('[director/generate-video] EN derive skipped:', err instanceof Error ? err.message : err)
    }
    // #g7-speakers(2026-08-27 오너 확정): 대사 화자를 "이름 (외형 앵커)"로 접지 — 샷 프롬프트가
    //   캐릭터를 이름 없이 외형으로만 묘사하므로 이름만으로는 화면 속 누구인지 알 수 없다.
    //   대사에 characterId 가 실제로 있을 때만 조회(무대사 샷 비용 0·테스트 목 순서 불변),
    //   실패는 fail-open — 화자 표기는 정확도 보조지 유료 생성의 성립 조건이 아니다.
    // #direction-unify(2026-09-02 오너 실측 sh_01_02): 영상의 장면 프로즈가 shots.prompt = **첫 프레임 묘사**
    //   ("lying motionlessly, eyes closed")라 모션 계약과 싸우며 정지를 부추겼고, writer 의 연출 프로즈
    //   (dynamic_spec.motion_prompt — "opens eyes and turns head to scan")는 previz·영상 어디에도 안 실렸다.
    //   사용자가 프롬프트를 덮어쓰지 않았을 때(body == shots.prompt)만 motion_prompt 를 앞에 싣는다.
    const writerMotionPrompt = (() => {
      const mp = (shot?.dynamic_spec as { motion_prompt?: unknown } | null | undefined)?.motion_prompt
      return typeof mp === 'string' && mp.trim() ? mp.trim() : null
    })()
    const promptIsStoredComposition =
      !standalone && typeof shot?.prompt === 'string' && shot.prompt.trim() === prompt.trim()
    const promptForVideo =
      writerMotionPrompt && promptIsStoredComposition && !promptEn.includes(writerMotionPrompt)
        ? `${writerMotionPrompt} ${promptEn}`
        : promptEn
    const dialogueLines = !standalone && Array.isArray(shot!.dialogue_lines) ? (shot!.dialogue_lines as DialogueLine[]) : null
    let dialogueSpeakers: Record<string, DialogueSpeaker> | null = null
    const speakerIds = [...new Set(
      (dialogueLines ?? [])
        .filter((line) => (line?.text ?? '').trim() && (line?.characterId ?? '').trim())
        .map((line) => line.characterId!.trim()),
    )].sort()
    if (speakerIds.length) {
      const speakerPairs = speakerIds.map((characterId) => {
        const appearanceKey = characterAppearanceKeys[characterId]
        if (!appearanceKey) {
          throw new CharacterAppearanceContractError(`Character appearance contract error: dialogue speaker ${characterId} has no appearance snapshot`)
        }
        return { characterId, appearanceKey }
      })
      const [{ data: chars, error: charsError }, { data: appearanceRows, error: appearancesError }] = await Promise.all([
        supabaseAdmin.from('characters').select('character_id, name').eq('project_id', projectId).in('character_id', speakerIds),
        supabaseAdmin.from('character_appearances').select('character_id, appearance_key, appearance').eq('project_id', projectId).in('character_id', speakerIds).in('appearance_key', [...new Set(speakerPairs.map(({ appearanceKey }) => appearanceKey))]),
      ])
      if (charsError) throw charsError
      if (appearancesError) throw appearancesError
      const charsById = new Map((chars ?? []).map((character) => [character.character_id as string, character]))
      const appearancesByPair = new Map((appearanceRows ?? []).map((appearance) => [
        `${appearance.character_id as string}\u0000${appearance.appearance_key as string}`,
        appearance,
      ]))
      dialogueSpeakers = Object.fromEntries(speakerPairs.map(({ characterId, appearanceKey }) => {
        const character = charsById.get(characterId)
        const appearance = appearancesByPair.get(`${characterId}\u0000${appearanceKey}`)
        if (!character || typeof character.name !== 'string' || !character.name.trim()) {
          throw new CharacterAppearanceContractError(`Character appearance contract error: dialogue speaker ${characterId} has no character identity`)
        }
        if (!appearance || typeof appearance.appearance !== 'string' || !appearance.appearance.trim()) {
          throw new CharacterAppearanceContractError(`Character appearance contract error: ${characterId}/${appearanceKey} has no required appearance`)
        }
        return [characterId, { name: character.name, appearance: appearance.appearance }] as const
      }))
    }
    const { fullPrompt, prompt_parts: promptParts } = buildVideoPrompt({
      prompt: promptForVideo, // #direction-unify
      camera,
      movementPreset,
      cameraPreset: suppressGear ? null : cameraPreset,
      generationMethod,
      modelKey,
      durationSeconds: dur,
      startEndReference: (submitRefUrls?.length ?? 0) >= 2,
      ...(alignedReferenceImageRoles ? { referenceImageRoles: alignedReferenceImageRoles } : {}),
      dynamicSpec,
      // #g7 (2026-08-27 오너 확정: 음성은 영상 생성기에 맡긴다) — 대사를 프롬프트에 싣는다.
      //   DB 에 있는데 여태 아무도 읽지 않아 모델이 대사의 존재를 몰랐다.
      dialogueLines,
      dialogueSpeakers, // #g7-speakers
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
      ...(alignedReferenceImageRoles ? { reference_image_roles: alignedReferenceImageRoles } : {}),
      movement_preset: movementPreset ?? null,
      camera_preset: cameraPreset ?? null,
      ...(videoClipId ? {} : { new_take_metadata: normalizedNewTakeMetadata }),
      ...falCapture,
      ...(falSubmitRequest ? { fal_model: falSubmitRequest.model, fal_request: falSubmitRequest } : {}),
    } as unknown as Json

    reservation = videoClipId
      ? await reserveDirectorVideoRegeneration({ projectId, videoClipId, model: modelKey, target: { workspaceId: project.workspace_id, shotId: writerShotId, writerShotId, videoClipId, retakeMode: 'regeneration' }, idempotencyKey, inputSnapshot, userId: user.id, workspaceId: project.workspace_id, provider: isLocal ? 'local' : 'fal', actor: jobActor })
      : await reserveDirectorVideoTake({ projectId, shotId: writerShotId, model: modelKey, target: { workspaceId: project.workspace_id, shotId: writerShotId, writerShotId, retakeMode: 'new_take' }, idempotencyKey, inputSnapshot, userId: user.id, workspaceId: project.workspace_id, provider: isLocal ? 'local' : 'fal', actor: jobActor, takeLabel: normalizedNewTakeMetadata.take_label as string | null, override: normalizedNewTakeMetadata.override, canvasPosition: normalizedNewTakeMetadata.canvas_position })
    // #payments-phase-2 #gen-quota-atomic-gate: Take hold — 예약(RPC) 직후 원자 관문. replay 는
    //   이미 처음 시도에서 hold 된 같은 잡을 재사용하는 것이라 다시 hold 하지 않는다(중복 차감 방지).
    if (!reservation.replayed) {
      const holdAmount = takeCostForVideo(modelKey)
      const hold = await holdTakesForVideoJob({
        workspaceId: project.workspace_id as string,
        userId: user.id,
        jobId: reservation.job_id,
        amount: holdAmount,
        projectId,
      })
      if (!hold.ok && hold.insufficient) {
        try {
          await markDirectorVideoAttemptFailed(projectId, reservation.job_id, 'insufficient_takes')
        } catch (transitionErr) {
          console.error('[director/generate-video] insufficient-takes failure transition failed:', transitionErr instanceof Error ? transitionErr.message : transitionErr)
        }
        return NextResponse.json(
          { error: 'insufficient_takes', required: holdAmount, balance: hold.balance },
          { status: 402 },
        )
      }
    }
    if (traceId) {
      try {
        await linkGenerationJobToChatTrace(projectId, reservation.job_id, traceId)
      } catch (error) {
        // Trace 연결은 관측 기능이다. 영상 예약이 성공한 뒤 연결 실패가 생성 자체를
        // 실패로 보이게 만들면 유료 잡이 고아가 되므로 best-effort로 남긴다.
        console.error('[director/generate-video] trace link failed:', error)
      }
    }
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
      return NextResponse.json({ error: 'Invalid request: idempotencyKey replay does not match the reserved video input' }, { status: 409 })
    }
    if (standaloneConfig && videoClipId) {
      await updateDirectorVideoTakeMetadata(projectId, videoClipId, {
        override: standaloneConfig as unknown as Json,
      })
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
      await attachProviderRequestToReservedVideoJob(projectId, reservation.job_id, result.taskId, { provider: result.provider, model: result.model, falKeyId: result.falKeyId })
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
    if (err instanceof CharacterAppearanceContractError) return NextResponse.json({ error: err.message }, { status: 409 })
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
