// generation_jobs 테이블 서버 헬퍼 (FAL 비동기 작업 상태 관리).
//
// 모든 접근은 service-role(supabaseAdmin)로만 — RLS ON + policy 없음이라 클라이언트 직접 접근 불가.
// 프론트는 GET /api/generation-jobs/[id] (소유권 체크) 경유로만 상태를 읽는다.
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { GenerationBatchRow } from '@/lib/generation-batches'
import { normalizeFailureEvidence } from '@/lib/fal/error-evidence'
import type { Json } from '@/types/database'
import { isChatTraceId } from '@/lib/chat-trace'

export type GenerationJobKind =
  | 'character_view'
  | 'world_shot'
  | 'shot_storyboard'
  | 'storyboard_real_grid' // #real-grid: 실사 4샷 일괄(1콜 시트→크롭 분배). 개별 재생성은 shot_storyboard 유지
  | 'shot_rough_storyboard'
  | 'shot_video'
  | 'shot_previz_video'
export type GenerationJobStatus = 'queued' | 'completed' | 'failed'
/** 잡 트리거 주체 — ui(직접 조작) | chat(글로벌 채팅 updates) | writer(핸드오프 파이프라인) */
export type GenerationJobActor = 'ui' | 'chat' | 'writer'

export interface GenerationJobTarget {
  workspaceId?: string
  // character_view: character_appearances의 정확한 모습 슬롯 갱신
  characterId?: string
  appearanceKey?: string
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
  /** 약속 I4(2026-09-04): 실사가 참조한 러프의 generatedAt — 러프가 바뀌면 "러프 바뀜" 판정의 근거. */
  roughGeneratedAt?: number
  /** 배치(그리드) 잡: 샷별 러프 generatedAt. */
  roughGeneratedAtByShot?: Record<string, number>
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
  chat_trace_id?: string | null
  /** 제출에 사용된 fal 키 id(#fal-key-pool) — 조회 계열이 같은 키의 client 로만 fal 잡을 볼 수 있어 필수. */
  fal_key_id: string
}

// Read/finalize paths intentionally select only the fields they consume. Provider is authoritative for
// local-vs-FAL reconciliation; actor/runtime metadata is selected only by activity/quota callsites.
const COLUMNS =
  'id, project_id, request_id, model, kind, status, target, video_clip_id, idempotency_key, provider, input_snapshot, response_snapshot, result_url, error, chat_trace_id, fal_key_id'

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
  /** 채팅이 직접 시작한 생성이면 해당 채팅 trace와 연결한다. */
  chatTraceId?: string | null
  /** submit 시 pickFalKey() 가 고른 키 id(#fal-key-pool) — 조회 경로가 이 값의 client 를 쓴다. */
  falKeyId: string
}): Promise<GenerationJob> {
  if (input.kind === 'shot_video') {
    throw new Error('shot_video jobs must be created by a director video reservation')
  }
  if (
    input.kind === 'character_view' &&
    (!input.target.workspaceId || !input.target.characterId || !input.target.appearanceKey || !input.target.view)
  ) {
    throw new Error('character_view job target requires workspaceId/characterId/appearanceKey/view')
  }
  if (input.chatTraceId && !isChatTraceId(input.chatTraceId)) {
    throw new Error('chat trace ID must be a UUID')
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
      chat_trace_id: input.chatTraceId ?? null,
      fal_key_id: input.falKeyId,
      submitted_at: now,
      attempts: 1,
      status: 'queued',
    })
    .select(`${COLUMNS}, actor`)
    .single()
  if (error) throw error
  if (input.chatTraceId) {
    const { error: traceError } = await supabaseAdmin
      .from('chat_traces')
      .update({
        pending_proposal: false,
        generation_status: 'queued',
        updated_at: now,
      })
      .eq('trace_id', input.chatTraceId)
      .eq('project_id', input.projectId)
    if (traceError) {
      // Job 생성은 이미 성공했다. 관측 갱신 실패가 유료 작업을 실패로
      // 보이게 만들지 않도록 로그만 남기고 상태 집계는 linked job으로 복구한다.
      console.error('[generation-jobs] chat trace queue update failed:', traceError)
    }
  }
  return data as GenerationJob
}

/** RPC 예약으로 만들어진 영상 잡에 뒤늦게 채팅 trace를 연결한다. */
export async function linkGenerationJobToChatTrace(
  projectId: string,
  jobId: string,
  chatTraceId: string,
): Promise<void> {
  if (!isChatTraceId(chatTraceId)) throw new Error('chat trace ID must be a UUID')
  const { error } = await supabaseAdmin
    .from('generation_jobs')
    .update({ chat_trace_id: chatTraceId, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('project_id', projectId)
  if (error) throw error
  const { error: traceError } = await supabaseAdmin
    .from('chat_traces')
    .update({
      pending_proposal: false,
      generation_status: 'queued',
      updated_at: new Date().toISOString(),
    })
    .eq('trace_id', chatTraceId)
    .eq('project_id', projectId)
  if (traceError) {
    console.error('[generation-jobs] chat trace queue update failed:', traceError)
  }
}

/**
 * 멱등 가드(C1): 해당 슬롯(project+character+appearance+view)에 status=queued character_view 잡이 이미 있는가.
 *   핸드오프 초안 submit~finalize 윈도우의 재핸드오프 중복 제출을 차단한다.
 */
export async function hasQueuedCharacterViewJob(
  projectId: string,
  characterId: string,
  appearanceKey: string,
  view: string,
): Promise<boolean> {
  if (!appearanceKey) throw new Error('character_view queued lookup requires appearanceKey')
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
    return t.characterId === characterId && t.appearanceKey === appearanceKey && t.view === view
  })
}

/**
 * 멱등 가드: 해당 슬롯(project+location+column)에 status=queued world_shot 잡이 이미 있는가.
 */
export async function hasQueuedWorldShotJob(
  projectId: string,
  locationId: string,
  column: string,
  /** 약속 C10: 배경 모습(변형) 키 — null/undefined 는 기본 모습. 변형과 기본은 서로 다른 슬롯이다. */
  appearanceKey?: string | null,
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
    return t.locationId === locationId && t.column === column && (t.appearanceKey ?? null) === (appearanceKey ?? null)
  })
}

// fal 실패 메시지 분류(best-effort) — 모더레이션/콘텐츠정책류 vs 일반. safe-mode 재시도 자격 판정에 쓴다.
//   오분류 시 generic 으로 떨어져 원본 프롬프트 재시도(안전 측). 키워드는 fal/openai 모더레이션 문구 기준.
const MODERATION_KEYWORDS =
  /moderation|safety|content[ _-]?policy|content_policy|\bblocked\b|nsfw|prohibited|flagged|violat|disallow/i

// #error-class(2026-08-13): 실패 원인 분류 — 클래스별 재시도 정책(P2/P3)의 측정 기반.
//   프로덕션 실패 51건 전수 집계에서 도출한 분류이고, 규칙의 예문은 전부 실측 메시지다.
//   순서가 곧 우선순위 — 구체 클래스가 먼저 먹는다(soft 가 moderation 키워드보다 앞 등).
//   'unknown' 은 분류 실패가 아니라 "아직 패턴을 모르는 실패"라는 축적 대상 데이터다.
export type JobErrorClass =
  | 'billing' // 잔액/결제 — 재시도 무의미, 오너 행동 필요 ("fal 잔액 소진")
  | 'data_ref' // 참조 이미지 접근 불가 — 우리 데이터 결함 ("image URL is not accessible")
  | 'moderation_soft' // 빈/검은 산출 — 비결정적, 재시도 가치 ("image too small — blank/moderated")
  | 'moderation' // 명시 콘텐츠 정책 — 프롬프트 수정 필요 (fal content_policy_violation)
  | 'infra' // 우리 인프라 정리 — webhook 유실 좀비, superseded ("stale queued reaped")
  | 'provider' // 프로바이더 일시 장애 — 재시도 가치 (5xx/429/타임아웃/결과 결함)
  | 'bad_request' // 불투명 400 + 422 스키마 거부 — 요청 자체가 틀림, 재시도 무가치 (#fal-canvas 실측 40건: image_size 'WxH' 문자열 거부가 unknown 으로 새던 구멍)
  | 'unknown'

const JOB_ERROR_CLASS_RULES: Array<[JobErrorClass, RegExp]> = [
  ['billing', /잔액|balance|billing|insufficient.{0,12}(credit|fund)/i],
  ['data_ref', /image url is not accessible|failed to load the image|input\.image_urls/i],
  ['moderation_soft', /image too small|blank\/moderated/i],
  ['moderation', MODERATION_KEYWORDS],
  ['infra', /stale queued reaped|superseded|좀비/i],
  [
    'provider',
    /\b(429|500|502|503|504|529)\b|rate.?limit|timeout|timed out|overloaded|ECONN|no (image|video) url in webhook payload|invalid video url|unavailable/i,
  ],
  // 422 는 data_ref(참조 이미지 접근 불가도 422로 옴)가 먼저 매칭된 뒤의 잔여 = 스키마 거부.
  ['bad_request', /^bad request$|status=4(00|22)\b|unprocessable entity/i],
]

export function classifyJobError(message: string | null | undefined): JobErrorClass {
  const m = (message ?? '').trim()
  if (!m) return 'unknown'
  for (const [cls, re] of JOB_ERROR_CLASS_RULES) if (re.test(m)) return cls
  return 'unknown'
}

export function classifyFalFailure(message: string | null | undefined): 'moderation' | 'generic' {
  return classifyJobError(message) === 'moderation' ? 'moderation' : 'generic'
}

export interface CharacterViewFailure {
  characterId: string
  appearanceKey: string
  view: string
  error: string | null
  /** 슬롯의 24h 누적 실패 수(표시용). */
  failCount: number
  /** safe-mode(우회) 시도 실패 수 — SAFE_RETRY_CAP 게이트 기준(auto give-up 실패와 분리). */
  safeFailCount: number
  moderation: boolean
}

/**
 * 최근 24h 기준, **현재 실패 상태인** character_view 슬롯 목록(슬롯=characterId+appearanceKey+view).
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
    if (!t.characterId || !t.appearanceKey || !t.view) {
      throw new Error('character_view failure row missing characterId/appearanceKey/view')
    }
    const key = `${t.characterId}\u0000${t.appearanceKey}\u0000${t.view}`
    let slot = bySlot.get(key)
    if (!slot) {
      // 첫 행 = 최신. 최신이 failed 가 아니면(완료/큐) 이 슬롯은 현재 실패 아님 → 비실패로 표시(집계 제외).
      slot = {
        characterId: t.characterId,
        appearanceKey: t.appearanceKey,
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

/** 배경(world_shot) 슬롯의 현재 실패 상태 — 약속 B8·B9(2026-09-04), 캐릭터 CharacterViewFailure 대칭. */
export interface WorldShotFailure {
  locationId: string
  column: string
  /** 배경 모습(변형) 키 — null 은 기본 모습. */
  appearanceKey: string | null
  error: string | null
  failCount: number
  safeFailCount: number
  moderation: boolean
}

/**
 * 최근 24h 기준, 현재 실패 상태인 world_shot 슬롯(locationId+column) 목록. 슬롯의 최신 잡이 failed 일 때만
 *   포함되고, safeFailCount 는 input_snapshot.safe_mode=true 인 실패 수(우회 재시도 cap 기준).
 */
export async function listFailedWorldShotJobs(projectId: string): Promise<WorldShotFailure[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('target, error, status, input_snapshot, created_at')
    .eq('project_id', projectId)
    .eq('kind', 'world_shot')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (error) throw error
  if (!data) throw new Error('generation job failed-world query returned no data')
  type Row = {
    target: GenerationJobTarget | null
    error: string | null
    status: string
    input_snapshot: { safe_mode?: boolean } | null
  }
  const bySlot = new Map<string, WorldShotFailure & { _latestSeen: boolean }>()
  for (const row of data as Row[]) {
    const t = row.target ?? {}
    if (!t.locationId) continue // 레거시 행(타깃 없음)은 슬롯이 아니다
    const column = t.column ?? 'wide_shot'
    const appearanceKey = t.appearanceKey ?? null
    const key = `${t.locationId}\u0000${column}\u0000${appearanceKey ?? ''}`
    let slot = bySlot.get(key)
    if (!slot) {
      slot = {
        locationId: t.locationId,
        column,
        appearanceKey,
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
    .filter((s) => s._latestSeen)
    .map(({ _latestSeen, ...s }) => {
      void _latestSeen
      return s
    })
}

/** 진행 중 잡 1건 — 클라가 "무엇이 도는 중인지"를 복원하는 데 필요한 최소 필드. */
export interface ActiveGenerationJob {
  id: string
  kind: GenerationJobKind
  target: GenerationJobTarget
  /** 제출 시각(epoch ms) — 경과시간 표시가 remount 에도 리셋되지 않게 하는 durable 기준점. */
  startedAt: number | null
}

/**
 * 프로젝트의 진행 중(queued) 잡 전량 (#queue-restore).
 *
 * "생성 중"은 별도 플래그가 아니라 queued 잡의 존재로 도출한다(architecture §0). 컴포넌트 로컬
 *   상태(러프보드 panelJobs 등)는 탭을 떠나면 증발하므로, 돌아왔을 때 진행 애니메이션을 되살리는
 *   유일한 근거가 이 목록이다. STALE_QUEUED_MS 를 넘긴 잡은 웹훅이 유실된 유령이라 제외한다
 *   (회수는 active 라우트의 ghost sweep — fal/reconcile.reconcileGhostQueuedJobs — 이 맡는다) —
 *   그걸 세면 영원히 도는 스피너가 된다.
 */
export async function listActiveGenerationJobs(
  projectId: string,
): Promise<ActiveGenerationJob[]> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, kind, target, submitted_at, created_at')
    .eq('project_id', projectId)
    .eq('status', 'queued')
    .gte('created_at', new Date(Date.now() - STALE_QUEUED_MS).toISOString())
  if (error) throw error
  return (data ?? []).map((row) => {
    const ts = (row.submitted_at ?? row.created_at) as string | null
    const parsed = ts ? Date.parse(ts) : NaN
    return {
      id: row.id as string,
      kind: row.kind as GenerationJobKind,
      target: (row.target as GenerationJobTarget | null) ?? {},
      startedAt: Number.isNaN(parsed) ? null : parsed,
    }
  })
}

/**
 * 약속 D(2026-09-04): 핀·배지·버튼 숫자의 근거 행 — 최근 24h 의 잡(도는 것·끝난 것). 요약은 generation-batches 의
 *   순수 함수가 한다(클라·서버 공용). 500행 상한 — 배지·배치 창(2분)에는 충분하다.
 */
export async function listRecentGenerationJobRows(projectId: string): Promise<GenerationBatchRow[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, kind, status, target, created_at, updated_at')
    .eq('project_id', projectId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as GenerationJobKind,
    status: row.status as GenerationJobStatus,
    target: (row.target as GenerationJobTarget | null) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
  }))
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
    if (t.view === 'main' && t.characterId) {
      if (!t.appearanceKey) throw new Error('queued character_view main job missing appearanceKey')
      out.push({ characterId: t.characterId, jobId: row.id as string })
    }
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
  const errorMessage = normalizeFailureEvidence(message).slice(0, 1000)
  if (!errorMessage) throw new Error('generation job failure evidence must be nonblank')
  // CAS: queued일 때만 실패로 전이 — 이미 완료된 작업을 늦은 ERROR webhook이 덮어쓰지 못하게.
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .update({
      status: 'failed',
      error: errorMessage,
      last_error: errorMessage,
      error_class: classifyJobError(errorMessage), // #error-class — 클래스별 재시도 정책의 측정 기반
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
 * #error-class(2026-08-13, 오너 정책): give-up 예산을 소모하지 않는 클래스 — 일시 인프라 실패
 * (프로바이더 5xx/결과 결함, webhook 유실 정리)는 빈칸 자율 채움이 백그라운드에서 계속 다시
 * 시도한다. 게이트가 세는 것은 "내용적 실패"(모더레이션·잘못된 입력·불명 400·미태깅)뿐.
 * moderation 은 면제하지 않는다 — 같은 프롬프트는 같은 거부라 재시도가 아니라 사람의 수정이 답.
 */
export const GIVE_UP_EXEMPT_CLASSES: ReadonlySet<string> = new Set(['provider', 'infra'])

/**
 * 같은 target 으로 누적된 실패 잡 수 (give-up 게이트용). target 부분일치(JSONB @>):
 *   world_shot={locationId,column} / character_view={characterId,column} / 러프보드={writerShotId} 등.
 *   별도 상태 저장 없이 '실패 잡의 존재가 진실'(architecture §0)을 그대로 집계한다.
 *   게이트는 비용 방어 — 조회 실패 시 생성이 진행되지 않도록 실패를 호출자에게 전파한다.
 *   면제 클래스는 JS 로 거른다(슬롯당 실패는 소수 — postgrest or/not.in 문법 리스크 회피).
 *   미태깅(null)은 보수적으로 센다(게이트가 약해지는 방향의 실수 방지).
 */
export async function countFailedJobsForTarget(
  projectId: string,
  kind: GenerationJobKind,
  target: Partial<GenerationJobTarget>,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('error_class')
    .eq('project_id', projectId)
    .eq('kind', kind)
    .eq('status', 'failed')
    .contains('target', target)
  if (error) throw error
  if (!data) throw new Error('generation job failed-target count returned no data')
  return data.filter(
    (r) => !GIVE_UP_EXEMPT_CLASSES.has(((r as { error_class?: string | null }).error_class) ?? ''),
  ).length
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

// 쿼터 집계의 신선도 컷(#quota-staleness 2026-08-05): webhook 유실로 queued 에 영원히 남은
//   좀비가 유저 쿼터를 영구 점유해 모든 생성이 429 로 잠기던 실측(12좀비 > 상한 8 → 러프 전면 불능).
//   정상 fal 잡은 수 분 내 종결된다 — 이보다 훨씬 관대한 창 밖의 queued 는 죽은 것으로 간주.
const QUOTA_COUNT_WINDOW_MIN = 30

export async function countQueuedJobsByUser(
  userId: string,
  kinds?: readonly GenerationJobKind[],
): Promise<number> {
  const cutoffIso = new Date(Date.now() - QUOTA_COUNT_WINDOW_MIN * 60_000).toISOString()
  let directQuery = supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'queued')
    .gte('created_at', cutoffIso)
  if (kinds?.length) directQuery = directQuery.in('kind', kinds as string[])
  const direct = await directQuery
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

  let fallbackQuery = supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .eq('status', 'queued')
    .gte('created_at', cutoffIso) // 신선도 컷 — direct 경로와 동일 규칙(#quota-staleness)
  if (kinds?.length) fallbackQuery = fallbackQuery.in('kind', kinds as string[])
  const { count, error: countError } = await fallbackQuery
  if (countError) throw countError
  if (count === null) throw new Error('generation job fallback quota count returned no count')
  return count
}

/**
 * 전역 in-flight(queued) 작업 수 — 유저 구분 없이 전부 (#global-semaphore 2026-08-25).
 *
 * 유저 쿼터(countQueuedJobsByUser)가 막는 것은 "한 유저의 독점"뿐이라, 유저가 늘면 합계가
 *   fal 계정 동시 실행 한도를 넘는다(유저당 6 × 5명 = 30 > 20). 넘긴 분은 거부가 아니라 fal
 *   큐에서 대기하므로 터지진 않지만, 뒤에 온 유저의 첫 요청이 앞 유저의 잔여 큐 뒤에 서서
 *   체감 대기가 분 단위로 늘어난다(head-of-line blocking). 그 합계를 세는 눈이 여기다.
 *
 * 신선도 컷은 유저 쿼터와 **같은 창**을 쓴다(QUOTA_COUNT_WINDOW_MIN). 전역 게이트에서 좀비의
 *   대가는 유저 쿼터보다 크다 — 유저 쿼터의 좀비는 그 유저만 잠그지만, 여기 좀비는 전원을
 *   잠근다(2026-08-05 실측: 12좀비 > 상한 8 → 러프 전면 불능. 그 사고의 전역판을 미리 막는다).
 */
export async function countQueuedJobsGlobal(): Promise<number> {
  const cutoffIso = new Date(Date.now() - QUOTA_COUNT_WINDOW_MIN * 60_000).toISOString()
  const { count, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .gte('created_at', cutoffIso)
  if (error) throw error
  if (count === null) throw new Error('generation job global inflight count returned no count')
  return count
}

/**
 * 키별 in-flight(queued) 수 (#fal-key-pool) — pickFalKey 의 least-loaded 배분 기준.
 *   countQueuedJobsGlobal 과 같은 비종결 status 집합 + 신선도 컷(QUOTA_COUNT_WINDOW_MIN)을 쓴다 —
 *   좋비(webhook 유실)가 키의 여유를 영구히 0으로 보이게 만들어 그 키만 계속 쓰이는 쓰림을 막는다.
 */
export async function countQueuedJobsByKey(falKeyId: string): Promise<number> {
  const cutoffIso = new Date(Date.now() - QUOTA_COUNT_WINDOW_MIN * 60_000).toISOString()
  const { count, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .eq('fal_key_id', falKeyId)
    .gte('created_at', cutoffIso)
  if (error) throw error
  if (count === null) throw new Error('generation job key inflight count returned no count')
  return count
}

// ── 큐 콘솔 (#queue-console 2026-08-18, 오너 지시 "Queue 를 시각적으로 보고 관리") ──

export interface QueueConsoleJob {
  id: string
  project_id: string
  kind: GenerationJobKind
  status: GenerationJobStatus
  model: string
  error: string | null
  error_class: string | null
  request_id: string
  created_at: string
  completed_at: string | null
}

const QUEUE_CONSOLE_COLUMNS =
  'id, project_id, kind, status, model, error, error_class, request_id, created_at, completed_at'

/**
 * 오너의 전 프로젝트 잡을 콘솔용으로 조회. 운영 관심사(queued·failed)는 시간 창 없이 전부
 * (좀비는 본질적으로 오래된 행이라 "최근 N" 창에 밀려 안 보이면 콘솔의 존재 이유가 사라진다),
 * completed 는 최근 100 개만 — 맥락용.
 * 소유권 경계는 workspace.owner_id 체인(countQueuedJobsByUser 폴백 경로와 동일 규칙).
 */
export async function listQueueConsoleJobs(userId: string): Promise<{
  jobs: QueueConsoleJob[]
  projectTitles: Record<string, string>
}> {
  const { data: workspaces, error: wsError } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('owner_id', userId)
  if (wsError) throw wsError
  const wsIds = (workspaces ?? []).map((w) => w.id as string)
  if (wsIds.length === 0) return { jobs: [], projectTitles: {} }

  const { data: projects, error: prjError } = await supabaseAdmin
    .from('projects')
    .select('id, title')
    .in('workspace_id', wsIds)
  if (prjError) throw prjError
  const projectTitles: Record<string, string> = {}
  for (const p of projects ?? []) projectTitles[p.id as string] = ((p.title as string) || 'Untitled')
  const projectIds = Object.keys(projectTitles)
  if (projectIds.length === 0) return { jobs: [], projectTitles }

  const [open, recent] = await Promise.all([
    supabaseAdmin
      .from('generation_jobs')
      .select(QUEUE_CONSOLE_COLUMNS)
      .in('project_id', projectIds)
      .in('status', ['queued', 'failed'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('generation_jobs')
      .select(QUEUE_CONSOLE_COLUMNS)
      .in('project_id', projectIds)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  if (open.error) throw open.error
  if (recent.error) throw recent.error
  const jobs = [...(open.data ?? []), ...(recent.data ?? [])] as unknown as QueueConsoleJob[]
  jobs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  return { jobs, projectTitles }
}

/** 콘솔 상세 — 잡의 전체 흔적(스냅샷·타임라인·시도 이력·오류 클래스)까지 한 행으로. */
export async function getQueueConsoleJobDetail(
  id: string,
): Promise<(GenerationJob & { created_at?: string; updated_at?: string; error_class?: string | null }) | null> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select(
      `${GENERATION_JOB_COLUMNS}, error_class, actor, created_at, updated_at, submitted_at, completed_at, attempts, last_error`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as (GenerationJob & { created_at?: string; updated_at?: string; error_class?: string | null }) | null) ?? null
}

/** 콘솔 삭제 실행부 — 상태 가드(queued·failed 만)는 라우트가 잡 조회 후 판정한다. */
export async function deleteGenerationJobById(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from('generation_jobs').delete().eq('id', id)
  if (error) throw error
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
