// Claude 클라이언트 (검증 전용)
import Anthropic from '@anthropic-ai/sdk';
import { recordRawCall } from './raw_collector';
import { repairJson } from './json_repair';
import { withLlmRetry } from './retry';

const apiKey = process.env.CLAUDE_API_KEY;
if (!apiKey) {
  console.warn('CLAUDE_API_KEY not set');
}

const client = new Anthropic({ apiKey: apiKey || '' });

let callCount = 0;
export function getClaudeCallCount() {
  return callCount;
}
export function resetClaudeCallCount() {
  callCount = 0;
}

export interface ClaudeCallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export async function claudeGenerate(
  userPrompt: string,
  opts: ClaudeCallOptions = {}
): Promise<string> {
  callCount++;
  const model = opts.model ?? 'claude-sonnet-4-6';
  const started = Date.now();

  let text = '';
  let stopReason: string | undefined;
  let error: string | undefined;
  // 쿼터 회계(#llm-quota 2026-08-10) — 프로바이더 보고 토큰(문자수 추정 대체).
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  // Claude 5 계열(opus-5/sonnet-5/fable-5 등) 차이 흡수(#p2-maxmodel 2026-08-05 실측):
  //   ① temperature deprecated — 전달 시 400. ② 기본으로 thinking 블록을 먼저 반환하며
  //   thinking 토큰이 max_tokens 를 함께 소모 → 바닥을 32k 로 올려 본문 절단을 막는다.
  const isClaude5 = /^claude-[a-z]+-5/.test(model);

  try {
    const params = {
      model,
      max_tokens: isClaude5 ? Math.max(opts.maxTokens ?? 4096, 32000) : (opts.maxTokens ?? 4096),
      ...(isClaude5 ? {} : { temperature: opts.temperature ?? 0.3 }),
      system: opts.system,
      messages: [{ role: 'user', content: userPrompt }] as const,
    };
    // Claude 5 는 max_tokens 바닥(32k) 때문에 SDK 가 비스트리밍을 거부("Streaming is required
    //   for operations that may take longer than 10 minutes") — 스트리밍 수집으로 동일 응답을 얻는다.
    const response = await withLlmRetry<Anthropic.Messages.Message>(
      async () =>
        isClaude5
          ? await client.messages.stream(params as never).finalMessage()
          : await client.messages.create(params as never),
      'claude',
    );

    stopReason = response.stop_reason ?? undefined;
    inputTokens = response.usage?.input_tokens;
    outputTokens = response.usage?.output_tokens;
    // thinking 등 비텍스트 블록을 건너뛰고 텍스트 블록 전체를 이어붙인다.
    text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) {
      throw new Error(
        `No text block in response (types: ${response.content.map((b) => b.type).join(',')})`,
      );
    }

    if (stopReason === 'max_tokens') {
      throw new Error(
        `Claude response truncated (max_tokens=${opts.maxTokens ?? 4096}). Increase maxTokens or reduce input.`
      );
    }

    return text;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    recordRawCall({
      timestamp: new Date().toISOString(),
      provider: 'claude',
      model,
      systemInstruction: opts.system,
      prompt: userPrompt,
      response: text,
      duration_ms: Date.now() - started,
      stop_reason: stopReason,
      error,
      input_chars: (opts.system?.length ?? 0) + userPrompt.length,
      output_chars: text.length,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });
  }
}

export async function claudeGenerateJson<T>(
  userPrompt: string,
  opts: ClaudeCallOptions = {}
): Promise<T> {
  // JSON 출력을 강제하는 시스템 프롬프트 추가
  const jsonSystem =
    (opts.system ?? '') +
    '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no commentary. Start with { and end with }.';

  const text = await claudeGenerate(userPrompt, { ...opts, system: jsonSystem });
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      return repairJson<T>(text);
    } catch (repairErr) {
      const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
      throw new Error(`Claude JSON parse failed: ${msg}`);
    }
  }
}
