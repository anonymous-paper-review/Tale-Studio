// LLM 호출 transient 에러 재시도 (503/429/502/504/네트워크)
// 영구 에러(400/401/403, JSON 파싱, schema 위반)는 즉시 throw.
import { noteRateLimitHit } from './raw_collector';

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

// 쿼터 초과(429/RESOURCE_EXHAUSTED)만 따로 판별한다(#llm-quota 2026-08-10).
//   과부하(503)와 한 덩어리로 묶으면 "우리가 한도를 넘었나"를 영영 알 수 없다. Gemini 는
//   RPM/TPM/RPD 중 무엇에 걸렸는지를 에러 본문(quota metric/violation)에 담아 주므로
//   그 본문은 잘라 버리지 않고 남긴다 — 한도 튜닝의 유일한 단서다.
const QUOTA_PATTERNS: RegExp[] = [
  /\b429\b/,
  /resource.*exhausted/i,
  /rate[- ]?limit/i,
  /too many requests/i,
  /quota/i,
];

export function isQuotaLlmError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return QUOTA_PATTERNS.some((p) => p.test(msg));
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
      const quota = isQuotaLlmError(e);
      if (quota) noteRateLimitHit();
      if (attempt === maxAttempts || !isTransientLlmError(e)) throw e;
      const waitMs = baseMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
      const msg = e instanceof Error ? e.message : String(e);
      // 쿼터 에러는 어떤 한도(RPM/TPM/RPD)에 걸렸는지가 본문 뒤쪽에 있어 120자로 자르면 사라진다.
      console.warn(
        `[${label}] ${quota ? 'QUOTA' : 'transient'} (attempt ${attempt}/${maxAttempts}, retry in ${waitMs}ms): ${msg.slice(0, quota ? 800 : 120)}`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
