// 다중 provider dispatcher (S/V/C 축별로 다른 모델 사용 가능)
import { geminiGenerateJson } from './gemini';
import { claudeGenerateJson } from './claude';
import { openaiGenerateJson } from './openai';
import { localGenerateJson } from './local';
import { LossyRepairError } from './json_repair';
import { findUnknownFields, summarizeUnknownFields } from '@/lib/writer/pipeline/schemas';
import type { LlmProvider } from './raw_collector';
import type { z } from 'zod';

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
  // #p4-json-guard(2026-08-11): 파싱 후 구조 단언(zod) — 실패는 throw 로 표면화(무신호 금지),
  //   성공 시 산출물은 "원본 그대로" 반환한다(safeParse 는 게이트일 뿐, 변형/키 스트립 없음).
  //   enum 값 제약은 스키마에 넣지 않는다(Q16 오너 미결). 스키마 정본: pipeline/schemas.ts
  schema?: z.ZodType;
  // enforceSchema: provider 가 지원하면(현재 claude, gemini) 생성 자체를 스키마로 강제
  //   (claude output_config.format / gemini generationConfig.responseSchema). 스키마가 프롬프트
  //   필드 전집합일 때만 켠다 — 부분 스키마 강제는 스키마 밖 필드를 생성에서 억압해 하류 데이터를
  //   소실시킨다.
  enforceSchema?: boolean;
  // 미지 필드 기록(거부 아님, #p4-json-guard 후속 2026-08-12): schema 가 놓치는 optional 필드
  //   오타(key_dialouge 류)를 무신호로 두지 않기 위해 스키마 밖 키를 서버 로그에 남긴다(통과는
  //   시킨다 — schemas.ts 의 findUnknownFields 참조). 이번엔 씬 축(ScenesSchema/MergedRawSchema)
  //   에만 연결 — 다른 스테이지 스키마로 확대하려면 호출부에서 opt-in만 추가하면 된다.
  auditUnknownFields?: boolean;
}

export async function generateJson<T>(
  prompt: string,
  cfg: LlmAxisConfig,
  opts: DispatchOptions = {},
): Promise<T> {
  const result = await generateJsonRaw<T>(prompt, cfg, opts);
  if (opts.schema) {
    const v = opts.schema.safeParse(result);
    if (!v.success) {
      const issues = v.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join(' | ');
      throw new Error(`LLM 산출 스키마 위반 (${describeAxisConfig(cfg)}): ${issues}`);
    }
    if (opts.auditUnknownFields) {
      const report = findUnknownFields(opts.schema, result);
      if (report.size > 0) {
        console.warn(`[dispatch] 미지 필드 감지 (${describeAxisConfig(cfg)}) — ${summarizeUnknownFields(report)}`);
      }
    }
  }
  return result;
}

async function generateJsonRaw<T>(
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
    // 손실 복구 재호출(#p4-json-guard 2026-08-11). 응답이 중간에 끊겨 복구기가 뒤를 잘라내면
    //   데이터를 버리고도 파싱이 성립해 "정상"으로 통과한다(무신호 손실 — 8샷→2샷이 에러 0으로
    //   통과한 실사고의 기제). 같은 질문을 **한 번만** 다시 던진다.
    //   실측 빈도(2026-08-11 shotDesign 9런): 238콜 중 5콜 = 약 2% — 비용 증가는 그만큼이다.
    //   두 번째도 잘리면 살아남은 값(err.value)으로 진행한다 = 종전과 동일한 최악치.
    //   ⚠️ 이건 "왜 잘렸는지"를 고치지 않는다. 기대 개수를 아는 스테이지는 자체 개수 가드를
    //      함께 둬야 한다(v4_shots 의 judgeShotCount 가 그 예).
    if (e instanceof LossyRepairError) {
      console.warn(
        `[dispatch] 손실 복구 감지 → 재호출 1회 (${describeAxisConfig(cfg)}, ${e.message})`,
      );
      try {
        return await dispatchOnce<T>(prompt, cfg, opts);
      } catch (retryErr) {
        if (retryErr instanceof LossyRepairError) {
          console.error(
            `[dispatch] 재호출도 손실 복구 — 살아남은 값으로 진행 (${retryErr.message})`,
          );
          return retryErr.value as T;
        }
        throw retryErr;
      }
    }
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
        // #p4-json-guard 후속(2026-08-12): claude 와 대칭 배선 — 전엔 여기서 스키마 인자를 아예
        //   안 넘겨 gemini.ts 의 responseSchema 자리가 항상 비어 있었다(claude 에서만 강제 실동작).
        zodSchema: opts.enforceSchema ? opts.schema : undefined,
      });
    case 'claude':
      return claudeGenerateJson<T>(prompt, {
        model: cfg.model,
        system: opts.systemInstruction,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        webSearch: opts.webSearch,
        zodSchema: opts.enforceSchema ? opts.schema : undefined,
      });
    case 'openai':
      // #p4-json-guard 후속(2026-08-12): claude/gemini 와 같은 enforceSchema 누락이 여기도 있다
      //   — opts.schema 를 안 넘겨 openaiGenerateJson 이 구조 강제를 못 건다. 이번 범위 밖(오너
      //   지시) — 필요해지면 openai Structured Outputs(response_format json_schema)로 동일 패턴.
      return openaiGenerateJson<T>(prompt, {
        model: cfg.model,
        systemInstruction: opts.systemInstruction,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      });
    case 'local':
      // #p4-json-guard 후속: local 도 동일 누락(범위 밖) — 백엔드(vLLM/llama.cpp 등)마다 구조
      //   강제 계약이 달라 일반화 전에 대상 서버 확정이 먼저 필요하다.
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
