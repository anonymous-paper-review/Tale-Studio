// Gemini 클라이언트 (생성 전용)
import {
  GoogleGenerativeAI,
  GenerativeModel,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/generative-ai';
import { recordRawCall } from './raw_collector';
import { repairJson } from './json_repair';
import { withLlmRetry } from './retry';

// TALE_ 우선 — 표준 이름은 Bun 기반 CLI가 .env.local에서 크리덴셜로 오인 수집 (src/lib/claude.ts 참조)
const apiKey = process.env.TALE_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('GEMINI_API_KEY not set');
}

const client = new GoogleGenerativeAI(apiKey || '');

// 창작(다크/폭력/공포 픽션) 도구 — 기본 안전필터가 정상적인 서사(납치/유혈/공포 등)를
//   PROHIBITED_CONTENT 로 차단해 파이프라인을 죽인다(2026-06-28 shotCheck 실패). 전 카테고리 BLOCK_NONE.
//   주의: 일부 코어 안전(아동 성착취 등)은 BLOCK_NONE 으로도 비활성화 불가(구글 비설정 영역).
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));

// per-request 타임아웃 — 절전/네트워크 stall 로 호출이 무한정 매달리는 것 방지.
//   초과 시 SDK 가 AbortError 를 던지고, retry 분류기가 transient 로 보아 재시도한다.
//   (없으면 dev 에서 맥 절전 시 한 step 이 수십 분간 hang — writer hang 회귀 케이스.)
const GEMINI_REQUEST_TIMEOUT_MS = 120_000;

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
  // #p4-websearch: googleSearch 그라운딩 — 스토리 축(s1/s3)의 오마쥬/레퍼런스 접지.
  webSearch?: boolean;
}

// #p4-websearch 그라운딩 모델 핀(2026-08-11 실측): gemini-3.6-flash 는 googleSearch 가 실동작하지 않는다 —
//   JSON mime 동반 시 200 + 빈 candidates(finishReason 없음), mime 해제·스키마 동반 우회 시엔 응답은 오나
//   검색이 발화하지 않음(groundingMetadata 부재). preview 는 두 조합 모두 정상 접지(webSearchQueries 실존).
//   Google 포럼 스태프 "Investigating" 상태의 리그레션 — 해소 확인 시 이 핀 제거.
//   webSearch 요청 = 접지가 목적이므로 axisConfig 모델보다 우선한다.
//   2026-08-11 오너 결정: 제품 경로(dispatch.generateJson)는 webSearch 를 claude web_search 로
//   라우팅한다 — 이 핀은 geminiGenerate 를 직접 호출하는 실험/도구용 2차 방어로 유지.
//   증거: research/experiments/t0-dramaturgy-36flash-outage/probe-result.md
const GROUNDING_MODEL = 'gemini-3-flash-preview';

export async function geminiGenerate(
  userPrompt: string,
  opts: GeminiCallOptions = {}
): Promise<string> {
  callCount++;
  const modelName = opts.webSearch ? GROUNDING_MODEL : (opts.modelName ?? 'gemini-3.6-flash');
  const started = Date.now();
  const mime = opts.expectJson ? 'application/json' : 'text/plain';

  const model: GenerativeModel = client.getGenerativeModel({
    model: modelName,
    systemInstruction: opts.systemInstruction,
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      responseMimeType: mime,
    },
    safetySettings: SAFETY_SETTINGS,
    // #p4-websearch: googleSearch 그라운딩 (SDK 타입에 미등재 계열 — 런타임 계약은 API 소관).
    ...(opts.webSearch ? ({ tools: [{ googleSearch: {} }] } as never) : {}),
  });

  let text = '';
  let finishReason: string | undefined;
  let error: string | undefined;
  // 쿼터 회계(#llm-quota 2026-08-10): Gemini 는 RPM/TPM/RPD 를 프로젝트 단위로 재므로
  //   문자수 추정이 아니라 응답이 보고한 실제 토큰을 남긴다(TPM 은 입력 토큰 기준).
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  try {
    const result = await withLlmRetry(
      () => model.generateContent(userPrompt, { timeout: GEMINI_REQUEST_TIMEOUT_MS }),
      'gemini',
    );
    finishReason = result.response.candidates?.[0]?.finishReason;
    const usage = result.response.usageMetadata;
    inputTokens = usage?.promptTokenCount;
    outputTokens = usage?.candidatesTokenCount;
    text = result.response.text();

    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new Error(`Gemini stopped abnormally: ${finishReason}`);
    }
    if (!text || text.trim().length === 0) {
      throw new Error(`Gemini returned empty response (finishReason=${finishReason})`);
    }
    // 접지 미발화 감시: webSearch 요청인데 groundingMetadata 가 없으면 조용한 기능 상실이다
    //   (3.6-flash 리그레션이 정확히 이 무신호 양상). throw 는 안 한다 — 모델이 검색 불요로
    //   판단하는 정상 경로가 있을 수 있어, 경고로 표면화만 한다.
    if (opts.webSearch && !(result.response.candidates?.[0] as { groundingMetadata?: unknown } | undefined)?.groundingMetadata) {
      console.warn(`[gemini] webSearch 요청됐으나 접지 미발화 (model=${modelName}, groundingMetadata 부재)`);
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
      input_tokens: inputTokens,
      output_tokens: outputTokens,
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
