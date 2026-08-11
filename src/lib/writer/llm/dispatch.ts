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
  S: { provider: 'gemini', model: 'gemini-3.6-flash' },
  V: { provider: 'gemini', model: 'gemini-3.6-flash' },
  C: { provider: 'claude', model: 'claude-sonnet-4-6' },
};

export interface DispatchOptions {
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  // #p4-websearch: 프로바이더별 웹 검색 접지 — gemini(googleSearch)/claude(web_search 툴).
  //   openai 는 후속(추론 계열의 검색 파라미터 계약 미확정). 스토리 축(s1/s3)부터 단계 확대.
  webSearch?: boolean;
}

export async function generateJson<T>(
  prompt: string,
  cfg: LlmAxisConfig,
  opts: DispatchOptions = {},
): Promise<T> {
  // #p4-websearch 그라운딩 라우팅(2026-08-11 오너 결정): gemini-3.6-flash 는 googleSearch 가
  //   실동작하지 않는다 — JSON mime 동반 시 200+빈 candidates, 단독 시 검색 미발화(실측, Google
  //   스태프 "Investigating" 리그레션). preview 핀은 모델 수명 리스크가 있어, 접지 콜은 web_search
  //   실동작이 확인된 C축 기본(claude)으로 보낸다. gemini 리그레션 해소 확인 시 이 라우팅 제거 검토.
  //   증거: research/experiments/t0-dramaturgy-36flash-outage/probe-result.md
  if (opts.webSearch && cfg.provider === 'gemini') {
    const g = DEFAULT_MODELS.C;
    console.warn(`[dispatch] webSearch → ${g.provider}/${g.model} 라우팅 (gemini 그라운딩 불능 우회)`);
    // s3 등 대형 JSON 응답 + 검색 결과 주입 감안 — claude 기본 max_tokens(4096) 바닥 확보.
    return dispatchOnce<T>(prompt, g, { ...opts, maxTokens: Math.max(opts.maxTokens ?? 0, 16000) });
  }
  try {
    return await dispatchOnce<T>(prompt, cfg, opts);
  } catch (e) {
    // 모더레이션 폴백(#moderation-fallback 2026-08-05): gemini 의 PROHIBITED_CONTENT 는
    //   safetySettings(BLOCK_NONE)로도 못 끄는 하드 필터 층 — 픽션 previz 텍스트(10대 주인공+
    //   추격/무기)가 확률적으로 걸리고, 씬 병렬 콜 1개 실패 = 런 전체 사망이었다(실측 2d47b311).
    //   동일 콜을 검열 층이 다른 C축 기본(claude)으로 1회 재시도. 실증: 같은 스토리를
    //   claude(opus-5/sonnet)가 정상 처리(#p2-maxmodel). 폴백도 실패하면 원 오류 의미로 표면화.
    const msg = e instanceof Error ? e.message : String(e);
    if (cfg.provider === 'gemini' && msg.includes('PROHIBITED_CONTENT')) {
      const fb = DEFAULT_MODELS.C;
      console.warn(
        `[dispatch] gemini PROHIBITED_CONTENT → ${fb.provider}/${fb.model} 폴백 재시도 (프롬프트 ${prompt.length}자)`,
      );
      // v4 등 대형 JSON 응답이 claude 기본 max_tokens(4096)에 절단되지 않게 바닥 확보.
      return dispatchOnce<T>(prompt, fb, { ...opts, maxTokens: Math.max(opts.maxTokens ?? 0, 16000) });
    }
    throw e;
  }
}

async function dispatchOnce<T>(
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
        webSearch: opts.webSearch,
      });
    case 'claude':
      return claudeGenerateJson<T>(prompt, {
        model: cfg.model,
        system: opts.systemInstruction,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        webSearch: opts.webSearch,
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
