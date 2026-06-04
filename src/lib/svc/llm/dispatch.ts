// 다중 provider dispatcher (S/V/C 축별로 다른 모델 사용 가능)
import { geminiGenerateJson } from './gemini';
import { claudeGenerateJson } from './claude';
import { openaiGenerateJson } from './openai';
import { localGenerateJson } from './local';
import type { LlmProvider } from './raw_collector';

export type { LlmProvider };

export interface LlmAxisConfig {
  provider: LlmProvider;
  model?: string;
  baseUrl?: string;  // local 전용
}

export interface PipelineModelsConfig {
  S: LlmAxisConfig;
  V: LlmAxisConfig;
  C: LlmAxisConfig;
}

export const DEFAULT_MODELS: PipelineModelsConfig = {
  S: { provider: 'gemini', model: 'gemini-3-flash-preview' },
  V: { provider: 'gemini', model: 'gemini-3-flash-preview' },
  C: { provider: 'claude', model: 'claude-sonnet-4-6' },
};

export interface DispatchOptions {
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function generateJson<T>(
  prompt: string,
  cfg: LlmAxisConfig,
  opts: DispatchOptions = {},
): Promise<T> {
  switch (cfg.provider) {
    case 'gemini':
      return geminiGenerateJson<T>(prompt, {
        modelName: cfg.model,
        systemInstruction: opts.systemInstruction,
        temperature: opts.temperature,
      });
    case 'claude':
      return claudeGenerateJson<T>(prompt, {
        model: cfg.model,
        system: opts.systemInstruction,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      });
    case 'openai':
      return openaiGenerateJson<T>(prompt, {
        model: cfg.model,
        systemInstruction: opts.systemInstruction,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      });
    case 'local':
      if (!cfg.baseUrl) throw new Error('local provider requires baseUrl');
      return localGenerateJson<T>(prompt, {
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        systemInstruction: opts.systemInstruction,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      });
  }
}

// 사람이 읽을 라벨 (UI/로그용)
export function describeAxisConfig(cfg: LlmAxisConfig): string {
  if (cfg.provider === 'local') {
    return `local(${cfg.model ?? 'qwen'}@${cfg.baseUrl ?? '?'})`;
  }
  return `${cfg.provider}/${cfg.model ?? 'default'}`;
}
