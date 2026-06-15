// writer_runs DB 헬퍼 (서버리스 웹훅 체이닝 상태 저장소).
//
// writer 파이프라인을 단계 단위(/api/writer/step 자가 호출)로 돌리면서, 각 step 이 별도
// 서버리스 인스턴스라 메모리/파일이 공유 안 된다 → 단계 중간 산출물(state jsonb)과 진행률을
// writer_runs 행에 누적한다. 옛 PipelineLogger 파일 로깅을 대체.
//
// 접근은 전부 supabaseAdmin (service_role). writer_runs 는 RLS ENABLE + policy 없음 = 서버 전용.
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PipelineInput } from '@/lib/writer/types/pipeline';
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
export interface WriterRunStatusLight {
  status: WriterRunStatus;
  current_stage: string | null;
  completed_units: number;
  total_units: number;
  error: string | null;
  updated_at: string;
  created_at: string;
}

const STATUS_LIGHT_COLUMNS =
  'status,current_stage,completed_units,total_units,error,updated_at,created_at';

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
 * run 을 failed 로 마킹 (error 메시지 포함).
 */
export async function markFailed(id: string, errorMessage: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('writer_runs')
    .update({ status: 'failed', error: errorMessage, updated_at: new Date().toISOString() })
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
