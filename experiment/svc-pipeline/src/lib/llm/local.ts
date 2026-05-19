// 로컬 모델 클라이언트 (vLLM/sglang/lmstudio 등 OpenAI 호환 엔드포인트)
// 예: Pro6000 서버의 Qwen3.6 (포트 8000/8001)
import { recordRawCall } from './raw_collector';
import { repairJson } from './json_repair';

let callCount = 0;
export function getLocalCallCount() {
  return callCount;
}
export function resetLocalCallCount() {
  callCount = 0;
}

export interface LocalCallOptions {
  baseUrl: string;  // 필수, 예: "http://100.89.172.50:8000"
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  expectJson?: boolean;
}

export async function localGenerate(
  userPrompt: string,
  opts: LocalCallOptions,
): Promise<string> {
  if (!opts.baseUrl) throw new Error('local provider requires baseUrl');
  callCount++;
  const model = opts.model ?? 'qwen3.6';
  const url = `${opts.baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
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
      max_tokens: opts.maxTokens ?? 8192,
    };
    if (opts.expectJson) body.response_format = { type: 'json_object' };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(`Local ${url} ${r.status}: ${errText.slice(0, 500)}`);
    }
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    };
    text = data.choices?.[0]?.message?.content ?? '';
    finishReason = data.choices?.[0]?.finish_reason;
    if (!text) throw new Error(`Local returned empty content (finish_reason=${finishReason})`);
    return text;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    recordRawCall({
      timestamp: new Date().toISOString(),
      provider: 'local',
      model: `${model}@${opts.baseUrl}`,
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

export async function localGenerateJson<T>(
  userPrompt: string,
  opts: Omit<LocalCallOptions, 'expectJson'>,
): Promise<T> {
  const text = await localGenerate(userPrompt, { ...opts, expectJson: true });
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      return repairJson<T>(text);
    } catch (repairErr) {
      const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
      throw new Error(`Local JSON parse failed: ${msg}`);
    }
  }
}
