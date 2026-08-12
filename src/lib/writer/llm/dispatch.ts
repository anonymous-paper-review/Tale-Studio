// 다중 provider dispatcher (S/V/C 축별로 다른 모델 사용 가능)
import { geminiGenerateJson } from './gemini';
import { claudeGenerateJson } from './claude';
import { openaiGenerateJson } from './openai';
import { localGenerateJson } from './local';
import { LossyRepairError } from './json_repair';
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
  // enforceSchema: provider 가 지원하면(현재 claude) 생성 자체를 스키마로 강제
  //   (output_config.format — gemini mime 등가물). 스키마가 프롬프트 필드 전집합일 때만 켠다
  //   — 부분 스키마 강제는 스키마 밖 필드를 생성에서 억압해 하류 데이터를 소실시킨다.
  enforceSchema?: boolean;
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
  }
  return result;
}

async function generateJsonRaw<T>(
  prompt: string,
  cfg: LlmAxisConfig,
  opts: DispatchOptions = {},
): Promise<T> {
  // #p4-websearch 그라운딩 경로(2026-08-12 개정 — 접지 모델 우선, claude 는 폴백).
  //   접지 콜의 모델 선택은 gemini.ts 의 GROUNDING_MODEL 핀이 한다. 여기서 하는 일은 그게 실패했을
  //   때 claude 로 떨어뜨리는 것뿐이다(아래 catch).
  //
  //   왜 뒤집었나(실측 probe-grounding-models.mjs, flash 5종 × 2조합):
  //     제품 경로(googleSearch + JSON mime)에서 접지가 **실제로 발화한 모델은 preview 하나**다 —
  //     3.5-flash·3.1-flash-lite 는 3.6 과 같은 무신호 양상(에러 없이 groundingMetadata 부재),
  //     2.5-flash 는 조합 자체를 API 가 거부한다. 그런데 preview 는 18.7s 인데 claude 경유는
  //     풀런 실측에서 154.6s·144.2s 였고 **그 두 콜 다 접지가 안 붙었다**(web_search_tool_result 부재).
  //     즉 종전 라우팅은 8배 비싼 값을 내고 목적(접지)은 3콜 중 1콜만 달성하고 있었다.
  //   preview 의 모델 수명 리스크는 실재하지만, 그 처방은 "사라지기 전부터 느린 길로 다니기"가
  //     아니라 "사라지면 그때 떨어지기"다 — 404/에러 시 claude 폴백이 그 역할을 한다.
  //   부수 효과: 접지 콜이 early-return 을 타지 않게 되어 손실 복구 재호출·모더레이션 폴백의
  //     보호를 함께 받는다(종전엔 둘 다 건너뛰었다).
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
    //
    // 접지 폴백(2026-08-12): GROUNDING_MODEL(preview)이 소멸(404)하거나 죽으면 접지 콜이 통째로
    //   실패한다. 그때만 claude 로 떨어진다 — 평시엔 8배 빠른 preview 를 쓰고, 수명 리스크는
    //   여기서 흡수한다. 두 폴백이 같은 처방(=claude 재시도)이라 한 갈래로 합친다.
    const msg = e instanceof Error ? e.message : String(e);
    const moderationBlocked = cfg.provider === 'gemini' && msg.includes('PROHIBITED_CONTENT');
    const groundingFailed = cfg.provider === 'gemini' && opts.webSearch === true;
    if (moderationBlocked || groundingFailed) {
      const fb = DEFAULT_MODELS.C;
      console.warn(
        `[dispatch] ${moderationBlocked ? 'gemini PROHIBITED_CONTENT' : '접지 모델 실패'} → ` +
          `${fb.provider}/${fb.model} 폴백 재시도 (프롬프트 ${prompt.length}자): ${msg.slice(0, 140)}`,
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
        zodSchema: opts.enforceSchema ? opts.schema : undefined,
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
