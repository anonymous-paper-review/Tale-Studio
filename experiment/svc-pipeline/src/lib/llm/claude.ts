// Claude 클라이언트 (검증 전용)
import Anthropic from '@anthropic-ai/sdk';
import { recordRawCall } from './raw_collector';
import { repairJson } from './json_repair';

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

  try {
    const response = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.3,
      system: opts.system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    stopReason = response.stop_reason ?? undefined;
    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error(`Unexpected content type: ${block.type}`);
    }
    text = block.text;

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
