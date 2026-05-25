// OpenAI 클라이언트 (S/V/C 어느 축이든 사용 가능)
import { recordRawCall } from './raw_collector';
import { repairJson } from './json_repair';
import { withLlmRetry } from './retry';

const apiKey = process.env.OPENAI_API_KEY;

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

  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (opts.systemInstruction) {
      messages.push({ role: 'system', content: opts.systemInstruction });
    }
    messages.push({ role: 'user', content: userPrompt });

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
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
    };
    text = data.choices?.[0]?.message?.content ?? '';
    finishReason = data.choices?.[0]?.finish_reason;
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
      return repairJson<T>(text);
    } catch (repairErr) {
      const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
      throw new Error(`OpenAI JSON parse failed: ${msg}`);
    }
  }
}
