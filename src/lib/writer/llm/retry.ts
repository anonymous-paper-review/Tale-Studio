// LLM 호출 transient 에러 재시도 (503/429/502/504/네트워크)
// 영구 에러(400/401/403, JSON 파싱, schema 위반)는 즉시 throw.

const TRANSIENT_PATTERNS: RegExp[] = [
  /\b(503|502|504|429)\b/,
  /high demand/i,
  /overloaded/i,
  /rate[- ]?limit/i,
  /resource.*exhausted/i,
  /too many requests/i,
  /service unavailable/i,
  /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket hang up/i,
  // per-request timeout / AbortController (절전·네트워크 stall 로 매달린 호출을 끊은 경우).
  /\baborted\b|AbortError|timed?[ -]?out|\btimeout\b|deadline exceeded/i,
];

export function isTransientLlmError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return TRANSIENT_PATTERNS.some((p) => p.test(msg));
}

export async function withLlmRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 4,
  baseMs = 1500,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === maxAttempts || !isTransientLlmError(e)) throw e;
      const waitMs = baseMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[${label}] transient (attempt ${attempt}/${maxAttempts}, retry in ${waitMs}ms): ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
