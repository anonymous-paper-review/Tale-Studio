// LLM 호출 전문 아카이브(#llm-archive 2026-08-10) — llm_calls 테이블에 prompt/response 원문을 남긴다.
//
// 왜 필요한가: 서버리스에선 FS 로깅이 통째로 no-op 이라(logger/index.ts) writer 텍스트 스테이지의
//   LLM 입출력이 어디에도 남지 않았다. 이미지·영상은 generation_jobs.input_snapshot 으로 입력이
//   보존되지만 텍스트 축은 산출물(state)만 남고 "무엇을 물어봤는지"가 사라진다.
//   진단·회귀 분석·프롬프트 실험의 근거가 되는 자료라 durable 하게 남긴다.
//
// 계약:
//   - best-effort. 실패는 절대 파이프라인을 죽이지 않는다(로그만).
//   - projectId 가 DB UUID 일 때만 기록한다(로컬 하네스 run 은 skip).
//   - 킬 스위치: LLM_ARCHIVE_DISABLED=1 이면 즉시 no-op.
//   - 본문은 상한을 둔다 — 비정상적으로 큰 응답 하나가 행을 터뜨리지 않게.
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { RawLlmCall } from '@/lib/writer/llm/raw_collector'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 한 필드 상한. v4 프롬프트가 ~8KB, 응답이 ~30KB 수준이라 넉넉하다. */
const MAX_FIELD = 200_000

function clip(s: string | undefined | null): string {
  if (!s) return ''
  return s.length > MAX_FIELD ? `${s.slice(0, MAX_FIELD)}\n…[truncated ${s.length - MAX_FIELD} chars]` : s
}

export function llmArchiveEnabled(): boolean {
  return process.env.LLM_ARCHIVE_DISABLED !== '1'
}

/**
 * flush 된 raw 콜들을 llm_calls 에 기록한다. 호출자는 await 하되 실패를 흡수한다.
 * @param runId writer_runs.id (#run-id 2026-08-12) — 어느 런의 기록인지 구분. 로컬 하네스
 *   run(writer_runs 행 없음)은 null. 기존 행(이 컬럼 도입 전 기록)도 null — backfill 안 함.
 * @returns 기록한 행 수 (skip/실패 시 0)
 */
export async function archiveRawCalls(
  projectId: string,
  stage: string,
  calls: RawLlmCall[],
  runId: string | null = null,
): Promise<number> {
  if (!llmArchiveEnabled()) return 0
  if (!UUID_RE.test(projectId)) return 0   // 핸드오프 외 run — DB project 없음
  if (!calls.length) return 0

  const rows = calls.map((c) => ({
    project_id: projectId,
    run_id: runId,
    stage,
    seq: c.seq,
    provider: c.provider,
    model: c.model,
    system_instruction: clip(c.systemInstruction),
    prompt: clip(c.prompt),
    response: clip(c.response),
    duration_ms: Math.round(c.duration_ms ?? 0),
    input_chars: c.input_chars ?? null,
    output_chars: c.output_chars ?? null,
    input_tokens: c.input_tokens ?? null,
    output_tokens: c.output_tokens ?? null,
    finish_reason: c.finish_reason ?? null,
    stop_reason: c.stop_reason ?? null,
    error: c.error ?? null,
    called_at: c.timestamp,
  }))

  try {
    const { error } = await supabaseAdmin.from('llm_calls').insert(rows)
    if (error) throw new Error(error.message)
    return rows.length
  } catch (e) {
    // 아카이브 실패가 생성 파이프라인을 막지 않는다 — 드러내되 삼킨다.
    console.warn(`[llm-archive] ${stage} ${rows.length}건 기록 실패:`, e instanceof Error ? e.message : e)
    return 0
  }
}
