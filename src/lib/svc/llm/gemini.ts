// Gemini 클라이언트 (생성 전용)
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { recordRawCall } from './raw_collector';
import { repairJson } from './json_repair';
import { withLlmRetry } from './retry';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('GEMINI_API_KEY not set');
}

const client = new GoogleGenerativeAI(apiKey || '');

let callCount = 0;
export function getGeminiCallCount() {
  return callCount;
}
export function resetGeminiCallCount() {
  callCount = 0;
}

export interface GeminiCallOptions {
  modelName?: string;
  systemInstruction?: string;
  expectJson?: boolean;
  temperature?: number;
}

export async function geminiGenerate(
  userPrompt: string,
  opts: GeminiCallOptions = {}
): Promise<string> {
  callCount++;
  const modelName = opts.modelName ?? 'gemini-3-flash-preview';
  const started = Date.now();
  const mime = opts.expectJson ? 'application/json' : 'text/plain';

  const model: GenerativeModel = client.getGenerativeModel({
    model: modelName,
    systemInstruction: opts.systemInstruction,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      responseMimeType: mime,
    },
  });

  let text = '';
  let finishReason: string | undefined;
  let error: string | undefined;
  try {
    const result = await withLlmRetry(() => model.generateContent(userPrompt), 'gemini');
    finishReason = result.response.candidates?.[0]?.finishReason;
    text = result.response.text();

    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new Error(`Gemini stopped abnormally: ${finishReason}`);
    }
    if (!text || text.trim().length === 0) {
      throw new Error(`Gemini returned empty response (finishReason=${finishReason})`);
    }
    return text;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    recordRawCall({
      timestamp: new Date().toISOString(),
      provider: 'gemini',
      model: modelName,
      systemInstruction: opts.systemInstruction,
      prompt: userPrompt,
      response: text,
      duration_ms: Date.now() - started,
      response_mime: mime,
      finish_reason: finishReason,
      error,
      input_chars: (opts.systemInstruction?.length ?? 0) + userPrompt.length,
      output_chars: text.length,
    });
  }
}

export async function geminiGenerateJson<T>(
  userPrompt: string,
  opts: Omit<GeminiCallOptions, 'expectJson'> = {}
): Promise<T> {
  const text = await geminiGenerate(userPrompt, { ...opts, expectJson: true });
  try {
    return JSON.parse(text) as T;
  } catch {
    // 마크다운 fence / 미종료 문자열 / 잘린 배열-객체 복구 시도
    try {
      return repairJson<T>(text);
    } catch (repairErr) {
      const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
      throw new Error(`Gemini JSON parse failed: ${msg}`);
    }
  }
}
