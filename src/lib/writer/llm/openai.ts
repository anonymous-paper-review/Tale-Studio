// OpenAI 클라이언트 (S/V/C 어느 축이든 사용 가능)
import { recordRawCall } from './raw_collector';
import { repairJsonStrict } from './json_repair';
import { withLlmRetry } from './retry';

// TALE_ 우선 — 표준 이름은 Bun 기반 CLI가 .env.local에서 크리덴셜로 오인 수집 (src/lib/claude.ts 참조)
const apiKey = process.env.TALE_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

let callCount = 0;
export function getOpenAICallCount() {
  return callCount;
}
export function resetOpenAICallCount() {
  callCount = 0;
}

export interface OpenAICallOptions {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  expectJson?: boolean;
}

export async function openaiGenerate(
  userPrompt: string,
  opts: OpenAICallOptions = {},
): Promise<string> {
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  callCount++;
  const model = opts.model ?? 'gpt-5-mini';
  const started = Date.now();

  let text = '';
  let finishReason: string | undefined;
  let error: string | undefined;
  // 쿼터 회계(#llm-quota 2026-08-10) — 프로바이더 보고 토큰(문자수 추정 대체).
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (opts.systemInstruction) {
      messages.push({ role: 'system', content: opts.systemInstruction });
    }
    messages.push({ role: 'user', content: userPrompt });

    // gpt-5*/o* 추론 계열: temperature(≠1) 거부 + max_tokens 대신 max_completion_tokens 요구.
    //   (#p2-maxmodel 2026-08-05 — gpt-5.6-sol 배선하며 정리. 구 모델은 기존 동작 유지.)
    const reasoningFamily = /^(gpt-5|o\d)/.test(model);
    const body: Record<string, unknown> = {
      model,
      messages,
      ...(reasoningFamily ? {} : { temperature: opts.temperature ?? 0.7 }),
    };
    if (opts.maxTokens) body[reasoningFamily ? 'max_completion_tokens' : 'max_tokens'] = opts.maxTokens;
    if (opts.expectJson) body.response_format = { type: 'json_object' };

    const r = await withLlmRetry(async () => {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`OpenAI ${resp.status}: ${errText.slice(0, 500)}`);
      }
      return resp;
    }, 'openai');

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`OpenAI ${r.status}: ${errText.slice(0, 500)}`);
    }
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    text = data.choices?.[0]?.message?.content ?? '';
    finishReason = data.choices?.[0]?.finish_reason;
    inputTokens = data.usage?.prompt_tokens;
    outputTokens = data.usage?.completion_tokens;
    if (!text) throw new Error(`OpenAI returned empty content (finish_reason=${finishReason})`);
    return text;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    recordRawCall({
      timestamp: new Date().toISOString(),
      provider: 'openai',
      model,
      systemInstruction: opts.systemInstruction,
      prompt: userPrompt,
      response: text,
      duration_ms: Date.now() - started,
      finish_reason: finishReason,
      error,
      input_chars: (opts.systemInstruction?.length ?? 0) + userPrompt.length,
      output_chars: text.length,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    });
  }
}

export async function openaiGenerateJson<T>(
  userPrompt: string,
  opts: Omit<OpenAICallOptions, 'expectJson'> = {},
): Promise<T> {
  const text = await openaiGenerate(userPrompt, { ...opts, expectJson: true });
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      return repairJsonStrict<T>(text);
    } catch (repairErr) {
      const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
      throw new Error(`OpenAI JSON parse failed: ${msg}`);
    }
  }
}
