// writer_runs DB 헬퍼 (서버리스 웹훅 체이닝 상태 저장소).
//
// writer 파이프라인을 단계 단위(/api/writer/step 자가 호출)로 돌리면서, 각 step 이 별도
// 서버리스 인스턴스라 메모리/파일이 공유 안 된다 → 단계 중간 산출물(state jsonb)과 진행률을
// writer_runs 행에 누적한다. 옛 PipelineLogger 파일 로깅을 대체.
//
// 접근은 전부 supabaseAdmin (service_role). writer_runs 는 RLS ENABLE + policy 없음 = 서버 전용.
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PipelineInput } from '@/lib/writer/types/pipeline';
import type { Json } from '@/types/database';
import { castContractToCharacters } from '@/lib/writer/cast-contract';

export type WriterRunStatus = 'running' | 'completed' | 'failed';

// state jsonb 의 최소 보장 형태. 구체 필드(genre/scenes/...)는 steps.ts 의 WriterRunState 가 정의.
// run-store ↔ steps 순환 import 를 피하려고 여기선 input 만 알고 나머지는 통과시킨다.
export interface WriterRunStateBase {
  input: PipelineInput;
  [key: string]: unknown;
}

export interface WriterRunRow {
  id: string;
  project_id: string;
  status: WriterRunStatus;
  current_stage: string | null;
  completed_units: number;
  total_units: number;
  state: WriterRunStateBase;
  error: string | null;
  created_at: string;
  updated_at: string;
}

// status 라우트용 경량 컬럼 (무거운 state 블롭 제외).
// 단계별 소요시간 1건 (steps.ts 가 state._timings 에 기록).
export interface StageTiming {
  ms: number;
  attempts: number;
  endedAt: string;
}

export interface WriterRunStatusLight {
  status: WriterRunStatus;
  current_stage: string | null;
  completed_units: number;
  total_units: number;
  error: string | null;
  updated_at: string;
  created_at: string;
  // state._timings (jsonb) — 단계별 소요시간. 없으면 null.
  timings: Record<string, StageTiming> | null;
}

const STATUS_LIGHT_COLUMNS =
  'status,current_stage,completed_units,total_units,error,updated_at,created_at,timings:state->_timings';

/**
 * 새 run 행 삽입 (status 'running', state={input}, completed_units 0).
 * 반환: 삽입된 id + 초기 state.
 */
export async function createRun(
  projectId: string,
  input: PipelineInput,
  totalUnits: number,
): Promise<{ id: string; state: WriterRunStateBase }> {
  const state: WriterRunStateBase = { input };
  // producer-story-gate §3: producer 확정값 seed → s0(genre)/s2(characters) step 이 자연 생략.
  if (input.genre) state.genre = input.genre;
  if (input.cast) state.characters = castContractToCharacters(input.cast);
  // V축 재설계: 월드/세팅 seed (s2 = characters + 월드). producer 가 background 로 전달 (유저 입력, 원천).
  if (input.background) state.world = input.background;
  const { data, error } = await supabaseAdmin
    .from('writer_runs')
    .insert({
      project_id: projectId,
      status: 'running',
      completed_units: 0,
      total_units: totalUnits,
      state,
    })
    .select('id, state')
    .single();

  if (error || !data) {
    throw new Error(`createRun failed: ${error?.message ?? 'no row returned'}`);
  }
  return { id: data.id as string, state: (data.state as WriterRunStateBase) ?? state };
}

/**
 * 프로젝트의 최신 run 행 (created_at desc). 없으면 null.
 */
export async function getActiveRun(projectId: string): Promise<WriterRunRow | null> {
  const { data, error } = await supabaseAdmin
    .from('writer_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getActiveRun failed: ${error.message}`);
  return (data as WriterRunRow | null) ?? null;
}

/**
 * 정체된 run 의 projectId 목록 — status='running' 인데 updated_at 이 staleMs 이상 갱신 안 됨.
 *   서버측 keepalive(instrumentation)가 자가-체이닝이 끊긴 파이프라인을 재발사하는 데 쓴다.
 *   staleMs 는 한 step 의 maxDuration(300s)보다 크게 잡아 "아직 살아있는 step" 오인 재발사를 피한다.
 */
export async function listStalledRunningProjects(staleMs: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const { data, error } = await supabaseAdmin
    .from('writer_runs')
    .select('project_id')
    .eq('status', 'running')
    .lt('updated_at', cutoff);
  if (error || !data) return [];
  return [...new Set((data as Array<{ project_id: string }>).map((r) => r.project_id))];
}

/**
 * state + 진행률 필드 업데이트 (updated_at = now()).
 */
export async function saveRunState(
  id: string,
  state: WriterRunStateBase,
  fields: { completed_units: number; current_stage: string | null },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('writer_runs')
    .update({
      state,
      completed_units: fields.completed_units,
      current_stage: fields.current_stage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(`saveRunState failed: ${error.message}`);
}

/**
 * run 을 completed 로 마킹.
 */
export async function markCompleted(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('writer_runs')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`markCompleted failed: ${error.message}`);
}

/**
 * 한 LLM 호출의 진단 스냅샷 (실패 원인 추적용 — error_detail 에 적재).
 */
export interface WriterErrorCall {
  provider: string
  model: string
  error?: string
  finish_reason?: string
  duration_ms: number
  input_chars: number
  output_chars: number
  prompt: string
  response: string
}

export interface WriterErrorDetail {
  stage?: string
  message: string
  at: string
  calls: WriterErrorCall[]
}

/**
 * run 을 failed 로 마킹 (error 메시지 + 선택적 진단 detail 포함).
 *   detail 은 직전 LLM 호출들(prompt/response/error)을 담아 "왜 실패했나"를 DB 에 영속화한다
 *   (서버리스에선 FS raw 로그가 no-op 이라 이게 유일한 durable 진단 — error-logging-mvp).
 */
export async function markFailed(
  id: string,
  errorMessage: string,
  detail?: WriterErrorDetail,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('writer_runs')
    .update({
      status: 'failed',
      error: errorMessage,
      error_detail: (detail ?? null) as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(`markFailed failed: ${error.message}`);
}

/**
 * writer 파이프라인이 실제로 완료됐을 때만 projects.current_stage 를 producer→writer 로 전진.
 *   - 정상 경로는 핸드오프(saveAndHandoff)가 이미 낙관적으로 writer 로 올린다 — 여기는
 *     게이트백으로 producer 에 묶였던 프로젝트의 재실행 완료를 풀어주는 보강 경로.
 *   - 이미 writer 이상으로 진행된 프로젝트는 건드리지 않는다(`.eq('current_stage','producer')` 가드 → 다운그레이드 없음).
 *   - 실패(markFailed)는 호출하지 않으므로, writer 가 죽으면 DB 는 producer 로 남아 게이트가 producer 로 돌린다.
 * best-effort — 실패해도 throw 하지 않는다(파이프라인 완료 자체를 막지 않음).
 */
export async function advanceProjectStageAfterWriter(projectId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('projects')
      .update({ current_stage: 'writer' })
      .eq('id', projectId)
      .eq('current_stage', 'producer');
    if (error) {
      console.error('[run-store] advanceProjectStageAfterWriter failed:', error.message);
    }
  } catch (e) {
    console.error('[run-store] advanceProjectStageAfterWriter error:', e);
  }
}

/**
 * 진행률 폴링용 경량 조회 — 무거운 state 블롭은 SELECT 하지 않는다.
 * 프로젝트의 최신 run 행. 없으면 null.
 */
export async function getRunStatusLight(
  projectId: string,
): Promise<WriterRunStatusLight | null> {
  const { data, error } = await supabaseAdmin
    .from('writer_runs')
    .select(STATUS_LIGHT_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getRunStatusLight failed: ${error.message}`);
  return (data as WriterRunStatusLight | null) ?? null;
}

// ── 예상 총 소요시간 추정(#c4 2026-07-14) ───────────────────────────────────
// 과거 완료 run들의 실측(경과시간 = updated_at - created_at; 완료 전이가 마지막 update)을
// 근거로 현 프로젝트의 예상 총 소요시간을 낸다. 러닝타임(projects.settings.playtime)이
// 있는 run들은 초당 소요율 평균 × 현 러닝타임으로 스케일, 없으면 절대 시간 평균.
// 실행 기록이 하나도 없으면 null — UI는 예상 시간을 숨긴다(실측 축적 전까지 비움).
export interface RunEtaEstimate {
  totalMs: number;
  basedOnRuns: number;
}

export async function estimateRunTotalMs(
  projectId: string,
): Promise<RunEtaEstimate | null> {
  const { data: runs, error } = await supabaseAdmin
    .from('writer_runs')
    .select('id, project_id, created_at, updated_at')
    .eq('status', 'completed')
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error || !runs?.length) return null;

  const projectIds = [...new Set([...runs.map((r) => r.project_id), projectId])];
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id, settings')
    .in('id', projectIds);
  const playtimeOf = (id: string): number | null => {
    const settings = projects?.find((p) => p.id === id)?.settings as
      | { playtime?: unknown }
      | null
      | undefined;
    const v = settings?.playtime;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  };

  const durations: number[] = [];
  const perSecondRates: number[] = [];
  for (const run of runs) {
    const dur = Date.parse(run.updated_at) - Date.parse(run.created_at);
    // 5초 미만/음수는 시계 왜곡·수동 조작 잔재로 보고 제외.
    if (!Number.isFinite(dur) || dur < 5_000) continue;
    durations.push(dur);
    const runtime = playtimeOf(run.project_id);
    if (runtime) perSecondRates.push(dur / runtime);
  }
  if (durations.length === 0) return null;

  // 중앙값 — 중단됐다 한참 뒤 완료된 run(수 시간짜리 경과) 같은 아웃라이어에 강건하게.
  const median = (xs: number[]) => {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const currentRuntime = playtimeOf(projectId);
  const totalMs =
    currentRuntime && perSecondRates.length > 0
      ? median(perSecondRates) * currentRuntime
      : median(durations);

  return { totalMs: Math.round(totalMs), basedOnRuns: durations.length };
}
