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
}

let calls: RawLlmCall[] = [];
let seqCounter = 0;

export function recordRawCall(call: Omit<RawLlmCall, 'seq'>): void {
  seqCounter += 1;
  calls.push({ seq: seqCounter, ...call });
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
}
