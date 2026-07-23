// generation_jobs 테이블 서버 헬퍼 (FAL 비동기 작업 상태 관리).
//
// 모든 접근은 service-role(supabaseAdmin)로만 — RLS ON + policy 없음이라 클라이언트 직접 접근 불가.
// 프론트는 GET /api/generation-jobs/[id] (소유권 체크) 경유로만 상태를 읽는다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

export type GenerationJobKind =
  | 'character_view'
  | 'world_shot'
  | 'shot_storyboard'
  | 'shot_rough_storyboard'
  | 'shot_video'
  | 'shot_previz_video'
export type GenerationJobStatus = 'queued' | 'completed' | 'failed'
/** 잡 트리거 주체 — ui(직접 조작) | chat(글로벌 채팅 updates) | writer(핸드오프 파이프라인) */
export type GenerationJobActor = 'ui' | 'chat' | 'writer'

export interface GenerationJobTarget {
  workspaceId?: string
  // character_view: characters[column] 갱신
  characterId?: string
  view?: string
  column?: string // character_view: view_* / world_shot: wide_shot|establishing_shot
  // world_shot: locations[column] 갱신
  locationId?: string
  // shot_video: legacy jobs may mirror shots.video_url; v2 linked jobs target a logical video take.
  shotId?: string
  writerShotId?: string
  videoClipId?: string
  retakeMode?: 'new_take' | 'regeneration'
  // shot_rough_storyboard 그리드(#rough-grid 2026-07-22): 잡 1개 = 그리드 1장 = 샷 최대 4개.
  //   열 순서와 배열 순서가 1:1 — finalize 가 셀을 잘라 각 샷에 배분한다. (writerShotId 단일은 구버전 경로)
  writerShotIds?: string[]
  gridVariant?: 'grid4' | 'strip1'
}

export interface GenerationJob {
  id: string
  project_id: string
  request_id: string
  model: string
  kind: GenerationJobKind
  status: GenerationJobStatus
  /** 읽기 경로(웹훅/폴링)는 actor 를 select 하지 않으므로 optional — 생성/활동 로그 경로만 채워진다. */
  actor?: GenerationJobActor
  user_id?: string | null
  workspace_id?: string | null
  provider?: string
  input_snapshot?: Json
  response_snapshot?: Json | null
  target: GenerationJobTarget
  video_clip_id: string | null
  idempotency_key: string | null
  result_url: string | null
  error: string | null
  submitted_at?: string | null
  completed_at?: string | null
  attempts?: number
  last_error?: string | null
}

// Read/finalize paths intentionally select only the fields they consume. Provider is authoritative for
// local-vs-FAL reconciliation; actor/runtime metadata is selected only by activity/quota callsites.
const COLUMNS =
  'id, project_id, request_id, model, kind, status, target, video_clip_id, idempotency_key, provider, input_snapshot, response_snapshot, result_url, error'

// 웹훅 finalize/폴링 경로가 의존하는 컬럼 집합(회귀 가드용 export). finalize 는 job.target.workspaceId 와
//   job.input_snapshot.source_hash 를 읽으므로 둘 다 반드시 포함돼야 한다(누락 시 후보 source_hash=null → stale 무력화).
export const GENERATION_JOB_COLUMNS = COLUMNS

export const STALE_QUEUED_MS = 10 * 60 * 1000

function toJsonSnapshot(value: unknown): Json {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
      throw new Error('snapshot cannot be represented as JSON')
    }
    return JSON.parse(serialized) as Json
  } catch (error) {
    throw new Error('generation job snapshot serialization failed', { cause: error })
  }
}

function toJsonObjectSnapshot(value: unknown): { [key: string]: Json | undefined } {
  const snapshot = toJsonSnapshot(value)
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('generation job snapshot must be a JSON object')
  }
  return snapshot
}


async function resolveJobOwnership(input: {
  projectId: string
  workspaceId?: string | null
  userId?: string | null
}): Promise<{ workspaceId: string | null; userId: string | null }> {
  let workspaceId = input.workspaceId ?? null
  let userId = input.userId ?? null

  if (!workspaceId) {
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('workspace_id')
      .eq('id', input.projectId)
      .maybeSingle()
    if (error) throw error
    workspaceId = (project?.workspace_id as string | undefined) ?? null
  }

  if (workspaceId && !userId) {
    const { data: workspace, error } = await supabaseAdmin
      .from('workspaces')
      .select('owner_id')
      .eq('id', workspaceId)
      .maybeSingle()
    if (error) throw error
    userId = (workspace?.owner_id as string | undefined) ?? null
  }

  return { workspaceId, userId }
}

export async function createGenerationJob(input: {
  projectId: string
  requestId: string
  model: string
  kind: GenerationJobKind
  target: GenerationJobTarget
  /** 생략 시 'ui' (DB default와 동일) */
  actor?: GenerationJobActor
  /** 멀티유저 quota/fairness 집계 기준. 생략 시 workspace owner를 best-effort로 해석. */
  userId?: string | null
  /** workspace quota/운영 조회 기준. 생략 시 project에서 best-effort로 해석. */
  workspaceId?: string | null
  /** 현재는 fal이 기본. 향후 provider 다변화 대비. */
  provider?: string
  /** provider submit 입력 스냅샷. webhook URL/secret 같은 runtime 값은 호출자가 제외한다. */
  inputSnapshot?: unknown
}): Promise<GenerationJob> {
  if (input.kind === 'shot_video') {
    throw new Error('shot_video jobs must be created by a director video reservation')
  }
  const ownership = await resolveJobOwnership({
    projectId: input.projectId,
    workspaceId: input.workspaceId ?? input.target.workspaceId,
    userId: input.userId,
  })
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .insert({
      project_id: input.projectId,
      request_id: input.requestId,
      model: input.model,
      kind: input.kind,
      target: input.target,
      actor: input.actor ?? 'ui',
      user_id: ownership.userId,
      workspace_id: ownership.workspaceId,
      provider: input.provider ?? 'fal',
      input_snapshot: toJsonSnapshot(input.inputSnapshot === undefined ? {} : input.inputSnapshot),
      submitted_at: now,
      attempts: 1,
      status: 'queued',
    })
    .select(`${COLUMNS}, actor`)
    .single()
  if (error) throw error
  return data as GenerationJob
}

/**
 * 멱등 가드(C1): 해당 슬롯(project+character+view)에 status=queued character_view 잡이 이미 있는가.
 *   핸드오프 초안 submit~finalize 윈도우의 재핸드오프 중복 제출을 차단한다.
 */
export async function hasQueuedCharacterViewJob(
  projectId: string,
  characterId: string,
  view: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, target')
    .eq('project_id', projectId)
    .eq('kind', 'character_view')
    .eq('status', 'queued')
  if (error) throw error
  if (!data) throw new Error('generation job queued-character query returned no data')
  return data.some((row) => {
    const t = (row.target ?? {}) as GenerationJobTarget
    return t.characterId === characterId && t.view === view
  })
}

/**
 * 멱등 가드: 해당 슬롯(project+location+column)에 status=queued world_shot 잡이 이미 있는가.
 */
export async function hasQueuedWorldShotJob(
  projectId: string,
  locationId: string,
  column: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, target')
    .eq('project_id', projectId)
    .eq('kind', 'world_shot')
    .eq('status', 'queued')
  if (error) throw error
  if (!data) throw new Error('generation job queued-world query returned no data')
  return data.some((row) => {
    const t = (row.target ?? {}) as GenerationJobTarget
    return t.locationId === locationId && t.column === column
  })
}

// fal 실패 메시지 분류(best-effort) — 모더레이션/콘텐츠정책류 vs 일반. safe-mode 재시도 자격 판정에 쓴다.
//   오분류 시 generic 으로 떨어져 원본 프롬프트 재시도(안전 측). 키워드는 fal/openai 모더레이션 문구 기준.
const MODERATION_KEYWORDS =
  /moderation|safety|content[ _-]?policy|content_policy|\bblocked\b|nsfw|prohibited|flagged|violat|disallow/i

export function classifyFalFailure(message: string | null | undefined): 'moderation' | 'generic' {
  return message && MODERATION_KEYWORDS.test(message) ? 'moderation' : 'generic'
}

export interface CharacterViewFailure {
  characterId: string
  view: string
  error: string | null
  /** 슬롯의 24h 누적 실패 수(표시용). */
  failCount: number
  /** safe-mode(우회) 시도 실패 수 — SAFE_RETRY_CAP 게이트 기준(auto give-up 실패와 분리). */
  safeFailCount: number
  moderation: boolean
}

/**
 * 최근 24h 기준, **현재 실패 상태인** character_view 슬롯 목록(슬롯=characterId+view).
 *   슬롯의 최신 잡이 'failed' 일 때만 포함 → 성공 회복(완료/큐) 후엔 빠진다(거짓-실패 방지, P1).
 *   safeFailCount = input_snapshot.safe_mode=true 인 실패 수(우회 재시도 cap 기준, auto 실패와 분리, P2).
 *   owner 확인은 호출 라우트가 한다(service-role 직접 조회). reload-survivable 실패 노출용.
 */
export async function listFailedCharacterViewJobs(projectId: string): Promise<CharacterViewFailure[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('target, error, status, input_snapshot, created_at')
    .eq('project_id', projectId)
    .eq('kind', 'character_view')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!data) throw new Error('generation job failed-character query returned no data')
  type Row = {
    target: GenerationJobTarget | null
    error: string | null
    status: string
    input_snapshot: { safe_mode?: boolean } | null
  }
  const bySlot = new Map<string, CharacterViewFailure & { _latestSeen: boolean }>()
  for (const row of data as Row[]) {
    const t = row.target ?? {}
    if (!t.characterId || !t.view) continue
    const key = `${t.characterId}\u0000${t.view}`
    let slot = bySlot.get(key)
    if (!slot) {
      // 첫 행 = 최신. 최신이 failed 가 아니면(완료/큐) 이 슬롯은 현재 실패 아님 → 비실패로 표시(집계 제외).
      slot = {
        characterId: t.characterId,
        view: t.view,
        error: row.error,
        failCount: 0,
        safeFailCount: 0,
        moderation: classifyFalFailure(row.error) === 'moderation',
        _latestSeen: row.status === 'failed',
      }
      bySlot.set(key, slot)
    }
    if (row.status === 'failed') {
      slot.failCount++
      if (row.input_snapshot?.safe_mode === true) slot.safeFailCount++
    }
  }
  return [...bySlot.values()]
    .filter((s) => s._latestSeen) // 최신 잡이 failed 인 슬롯만(회복된 슬롯 제외)
    .map(({ _latestSeen, ...s }) => {
      void _latestSeen
      return s
    })
}

/** queued 인 character_view main 잡 목록(클라가 [id] reconcile 로 마무리할 대상). */
export async function listQueuedMainJobs(
  projectId: string,
): Promise<Array<{ characterId: string; jobId: string }>> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, target')
    .eq('project_id', projectId)
    .eq('kind', 'character_view')
    .eq('status', 'queued')
  if (error) throw error
  if (!data) throw new Error('generation job queued-main query returned no data')
  const out: Array<{ characterId: string; jobId: string }> = []
  for (const row of data as Array<{ id: string; target: GenerationJobTarget | null }>) {
    const t = row.target ?? {}
    if (t.view === 'main' && t.characterId) out.push({ characterId: t.characterId, jobId: row.id as string })
  }
  return out
}

/**
 * 활동 로그 조회 — 프로젝트의 최근 24시간 잡 N개 (chat-aware-regeneration: 채팅 컨텍스트 빌더용).
 * 24h 창: 오래된 실패 잡이 매 턴 컨텍스트에 반복 주입되는 노이즈 방지.
 */
export async function listRecentGenerationJobs(
  projectId: string,
  limit = 12,
): Promise<Array<GenerationJob & { created_at: string }>> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select(`${COLUMNS}, actor, created_at`)
    .eq('project_id', projectId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  if (!data) throw new Error('generation job recent query returned no data')
  return data as Array<GenerationJob & { created_at: string }>
}

export async function getGenerationJobById(
  id: string,
): Promise<GenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as GenerationJob | null) ?? null
}

export async function getGenerationJobByRequestId(
  requestId: string,
): Promise<GenerationJob | null> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select(COLUMNS)
    .eq('request_id', requestId)
    .maybeSingle()
  if (error) throw error
  return (data as GenerationJob | null) ?? null
}


export async function patchGenerationJobResponseSnapshotByRequestId(
  requestId: string,
  patch: unknown,
): Promise<void> {
  if (typeof requestId !== 'string' || !requestId.trim()) throw new Error('generation job request ID must be nonblank')
  const patchSnapshot = toJsonObjectSnapshot(patch)
  const { error } = await supabaseAdmin.rpc('patch_generation_job_response_snapshot', {
    p_request_id: requestId,
    p_patch: patchSnapshot,
  })
  if (error) throw error
}

export class GenerationJobTerminalTransitionError extends Error {
  constructor(id: string, status: string | null) {
    super(status
      ? `generation job ${id} cannot transition from ${status}`
      : `generation job ${id} was not found during terminal transition`)
    this.name = 'GenerationJobTerminalTransitionError'
  }
}

export class GenerationJobLinkedVideoTerminalizationError extends Error {
  constructor(id: string) {
    super(`linked shot_video job ${id} must be terminalized by a director video attempt RPC`)
    this.name = 'GenerationJobLinkedVideoTerminalizationError'
  }
}

async function ensureTerminalTransition(
  id: string,
  expectedStatus: 'completed' | 'failed',
  expectedResultUrl: string | null,
  expectedError: string | null,
  data: unknown,
  error: unknown,
): Promise<void> {
  if (error) throw error
  if (data) return

  const { data: current, error: currentError } = await supabaseAdmin
    .from('generation_jobs')
    .select('kind, video_clip_id, status, result_url, error, last_error')
    .eq('id', id)
    .maybeSingle()
  if (currentError) throw currentError
  const job = current as {
    kind?: string
    video_clip_id?: string | null
    status?: string
    result_url?: string | null
    error?: string | null
    last_error?: string | null
  } | null
  const status = job?.status ?? null
  if (job?.kind === 'shot_video' && job.video_clip_id !== null && job.video_clip_id !== undefined) {
    throw new GenerationJobLinkedVideoTerminalizationError(id)
  }
  if (
    status === expectedStatus
    && job?.result_url === expectedResultUrl
    && job?.error === expectedError
    && (expectedStatus === 'completed' || job?.last_error === expectedError)
  ) return
  throw new GenerationJobTerminalTransitionError(id, status)
}

export async function completeGenerationJob(
  id: string,
  resultUrl: string,
): Promise<void> {
  if (!resultUrl.trim()) throw new Error('generation job result URL must be nonblank')
  // CAS: queued일 때만 완료로 전이 — 동시/지연 webhook이 터미널 상태를 덮어쓰지 못하게.
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .update({
      status: 'completed',
      result_url: resultUrl,
      error: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'queued')
    .is('video_clip_id', null)
    .select('id')
    .maybeSingle()
  await ensureTerminalTransition(id, 'completed', resultUrl, null, data, error)
}

export async function failGenerationJob(
  id: string,
  message: string,
): Promise<void> {
  const errorMessage = message.trim().slice(0, 1000)
  if (!errorMessage) throw new Error('generation job failure evidence must be nonblank')
  // CAS: queued일 때만 실패로 전이 — 이미 완료된 작업을 늦은 ERROR webhook이 덮어쓰지 못하게.
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .update({
      status: 'failed',
      error: errorMessage,
      last_error: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'queued')
    .is('video_clip_id', null)
    .select('id')
    .maybeSingle()
  await ensureTerminalTransition(id, 'failed', null, errorMessage, data, error)
}

/**
 * 자율 생성 give-up 게이트 임계값 — 같은 슬롯(target)으로 실패가 이만큼 쌓이면 자율 재생성을 멈춘다.
 *   "빈칸 자율 채움은 실패를 배지로 남기고 무한 재시도하지 않는다"(architecture §5). 사람의 명시적
 *   행동(actor='ui'/'chat' 또는 force)은 이 게이트를 통과한다 — 회복은 항상 명시적.
 *   2 = 일시적 fal 실패 1회는 자동 재시도하되, 결정론적 실패(모더레이션·잘못된 입력)는 곧 멈춤.
 */
export const AUTO_GENERATION_GIVE_UP_THRESHOLD = 2

/**
 * 같은 target 으로 누적된 실패 잡 수 (give-up 게이트용). target 부분일치(JSONB @>):
 *   world_shot={locationId,column} / character_view={characterId,column} / 러프보드={writerShotId} 등.
 *   별도 상태 저장 없이 '실패 잡의 존재가 진실'(architecture §0)을 그대로 집계한다.
 *   게이트는 비용 방어 — 조회 실패 시 생성이 진행되지 않도록 실패를 호출자에게 전파한다.
 */
export async function countFailedJobsForTarget(
  projectId: string,
  kind: GenerationJobKind,
  target: Partial<GenerationJobTarget>,
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('kind', kind)
    .eq('status', 'failed')
    .contains('target', target)
  if (error) throw error
  if (count === null) throw new Error('generation job failed-target count returned no count')
  return count
}

/**
 * 유저가 현재 in-flight(queued)로 보유한 생성 작업 수 (chat-proactive-copilot Phase 3 — 멀티유저 쿼터).
 * generation_jobs.user_id 로 직접 집계한다. 정확히 알려진 이전 스키마의 user_id schema-cache
 * 오류에서만 workspace→project 2-hop을 사용하며, 그 fallback의 모든 조회 오류도 전파한다.
 */
const LEGACY_USER_ID_SCHEMA_ERROR = {
  code: 'PGRST204',
  message: "Could not find the 'user_id' column of 'generation_jobs' in the schema cache",
} as const

function isLegacyUserIdSchemaError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && 'message' in error
    && error.code === LEGACY_USER_ID_SCHEMA_ERROR.code
    && error.message === LEGACY_USER_ID_SCHEMA_ERROR.message
}

export async function countQueuedJobsByUser(userId: string): Promise<number> {
  const direct = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'queued')
  if (!direct.error) {
    if (direct.count === null) throw new Error('generation job user quota count returned no count')
    return direct.count
  }
  if (!isLegacyUserIdSchemaError(direct.error)) throw direct.error

  const { data: workspaces, error: workspacesError } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
  if (workspacesError) throw workspacesError
  if (!workspaces) throw new Error('generation job workspace quota query returned no data')
  const workspaceIds = workspaces.map((w) => w.id as string)
  if (workspaceIds.length === 0) return 0

  const { data: projects, error: projectsError } = await supabaseAdmin
    .from('projects')
    .select('id')
    .in('workspace_id', workspaceIds)
  if (projectsError) throw projectsError
  if (!projects) throw new Error('generation job project quota query returned no data')
  const projectIds = projects.map((p) => p.id as string)
  if (projectIds.length === 0) return 0

  const { count, error: countError } = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .eq('status', 'queued')
  if (countError) throw countError
  if (count === null) throw new Error('generation job fallback quota count returned no count')
  return count
}

/** project → workspace.owner_id == userId 소유권 확인 (인증 polling 라우트에서 사용). */
export async function userOwnsProject(
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('workspace_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) throw projectError
  if (!project?.workspace_id) return false
  const { data: ws, error: workspaceError } = await supabaseAdmin
    .from('workspaces')
    .select('owner_id')
    .eq('id', project.workspace_id)
    .maybeSingle()
  if (workspaceError) throw workspaceError
  return !!ws && ws.owner_id === userId
}
