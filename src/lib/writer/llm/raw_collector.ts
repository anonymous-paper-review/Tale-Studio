// LLM 호출의 모든 input/output을 자동 기록하는 컬렉터
// 호출 측에서 flush해서 파일로 저장

export type LlmProvider = 'gemini' | 'claude' | 'openai' | 'local';

export interface RawLlmCall {
  seq: number;
  timestamp: string;
  provider: LlmProvider;
  model: string;
  systemInstruction?: string;
  prompt: string;
  response: string;
  duration_ms: number;
  error?: string;
  response_mime?: string;
  finish_reason?: string;
  stop_reason?: string;
  input_chars: number;
  output_chars: number;
  /** 프로바이더가 보고한 실제 토큰(쿼터 회계의 진실원). 미보고 프로바이더는 undefined. */
  input_tokens?: number;
  output_tokens?: number;
}

/**
 * 프로세스 수명 누적 사용량 — TPM/RPM 프로파일링용(#llm-quota 2026-08-10).
 *   flushRawCalls 는 콜 본문을 비우지만 이 누계는 유지된다. 호출자는 스테이지 전후 델타로 읽는다.
 *   Gemini 는 RPM/TPM/RPD 를 **프로젝트(=API 키가 속한 GCP 프로젝트) 단위**로 재는데 우리 계기는
 *   문자수뿐이라 한도 대비 여유를 계산할 수 없었다 — 실제 토큰을 프로바이더 응답에서 받아 누적한다.
 */
export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  inputChars: number;
  outputChars: number;
  /** 429/쿼터 초과로 재시도된 횟수 — 한도에 실제로 닿았는지의 유일한 지표. */
  rateLimitHits: number;
}

const totals: UsageTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  inputChars: 0,
  outputChars: 0,
  rateLimitHits: 0,
};

export function getUsageTotals(): UsageTotals {
  return { ...totals };
}

export function noteRateLimitHit(): void {
  totals.rateLimitHits += 1;
}

let calls: RawLlmCall[] = [];
let seqCounter = 0;

export function recordRawCall(call: Omit<RawLlmCall, 'seq'>): void {
  seqCounter += 1;
  calls.push({ seq: seqCounter, ...call });
  totals.calls += 1;
  totals.inputTokens += call.input_tokens ?? 0;
  totals.outputTokens += call.output_tokens ?? 0;
  totals.inputChars += call.input_chars;
  totals.outputChars += call.output_chars;
}

export function getPendingRawCalls(): RawLlmCall[] {
  return [...calls];
}

export function flushRawCalls(): RawLlmCall[] {
  const flushed = [...calls];
  calls = [];
  return flushed;
}

export function resetRawSeq(): void {
  seqCounter = 0;
  calls = [];
  totals.calls = 0;
  totals.inputTokens = 0;
  totals.outputTokens = 0;
  totals.inputChars = 0;
  totals.outputChars = 0;
  totals.rateLimitHits = 0;
}
