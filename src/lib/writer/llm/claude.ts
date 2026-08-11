// Claude 클라이언트 (검증 전용)
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { recordRawCall } from './raw_collector';
import { repairJson } from './json_repair';
import { withLlmRetry } from './retry';

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
  // #p4-websearch(2026-08-11): Anthropic web_search 서버 툴 — 검색 실행·결과 주입을 API 서버가
  //   수행(클라이언트 루프 불요). gemini 3.6-flash 그라운딩 불능 우회의 수신측 배선.
  webSearch?: boolean;
  // #p4-json-guard(2026-08-11): 구조화 출력 — output_config.format 으로 생성을 스키마에 강제
  //   (gemini responseMimeType 의 등가물+상위). web_search 와 병용 성립 실측(sonnet-4-6, 35.6s).
  //   zodOutputFormat 이 zod→JSON 스키마 변환과 미지원 제약 정리를 담당한다.
  zodSchema?: z.ZodType;
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
  // 쿼터 회계(#llm-quota 2026-08-10) — 프로바이더 보고 토큰(문자수 추정 대체).
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  // Claude 5 계열(opus-5/sonnet-5/fable-5 등) 차이 흡수(#p2-maxmodel 2026-08-05 실측):
  //   ① temperature deprecated — 전달 시 400. ② 기본으로 thinking 블록을 먼저 반환하며
  //   thinking 토큰이 max_tokens 를 함께 소모 → 바닥을 32k 로 올려 본문 절단을 막는다.
  const isClaude5 = /^claude-[a-z]+-5/.test(model);

  try {
    const params = {
      model,
      max_tokens: isClaude5 ? Math.max(opts.maxTokens ?? 4096, 32000) : (opts.maxTokens ?? 4096),
      ...(isClaude5 ? {} : { temperature: opts.temperature ?? 0.3 }),
      system: opts.system,
      messages: [{ role: 'user', content: userPrompt }] as const,
      // web_search_20260209: sonnet-4-6 GA 서버 툴(베타 헤더 불요). max_uses 로 검색 과금($10/1k) 상한.
      ...(opts.webSearch
        ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }] }
        : {}),
      ...(opts.zodSchema ? { output_config: { format: zodOutputFormat(opts.zodSchema) } } : {}),
    };
    // Claude 5 는 max_tokens 바닥(32k) 때문에 SDK 가 비스트리밍을 거부("Streaming is required
    //   for operations that may take longer than 10 minutes") — 스트리밍 수집으로 동일 응답을 얻는다.
    const response = await withLlmRetry<Anthropic.Messages.Message>(
      async () =>
        isClaude5
          ? await client.messages.stream(params as never).finalMessage()
          : await client.messages.create(params as never),
      'claude',
    );

    stopReason = response.stop_reason ?? undefined;
    inputTokens = response.usage?.input_tokens;
    outputTokens = response.usage?.output_tokens;
    // thinking 등 비텍스트 블록을 건너뛰고 텍스트 블록 전체를 이어붙인다.
    text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (!text) {
      throw new Error(
        `No text block in response (types: ${response.content.map((b) => b.type).join(',')})`,
      );
    }

    if (stopReason === 'max_tokens') {
      throw new Error(
        `Claude response truncated (max_tokens=${opts.maxTokens ?? 4096}). Increase maxTokens or reduce input.`
      );
    }
    // 서버 툴 루프가 반복 상한에서 멈춘 경우 — 본문이 미완성일 수 있어 실패로 표면화(무신호 방지).
    if (stopReason === 'pause_turn') {
      throw new Error('Claude server-tool loop paused (pause_turn) — 상위 재시도 필요');
    }
    // 접지 미발화 감시(#p4-websearch): webSearch 요청인데 검색 결과 블록이 없으면 조용한 기능
    //   상실이다(gemini 3.6-flash 리그레션과 같은 무신호 양상). 모델이 검색 불요로 판단하는
    //   정상 경로가 있어 throw 는 안 하고 경고로 표면화만 한다. gemini.ts 의 감시와 대칭.
    if (
      opts.webSearch &&
      !response.content.some((b) => (b as { type: string }).type === 'web_search_tool_result')
    ) {
      console.warn(`[claude] webSearch 요청됐으나 접지 미발화 (model=${model}, web_search_tool_result 부재)`);
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
      input_tokens: inputTokens,
      output_tokens: outputTokens,
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
    '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no code fences, no commentary. Start with { and end with }.' +
    // #p4-websearch(2026-08-11 실측): 검색 동반 시 최종 답변에 서술("검색 결과를 확인했습니다…")과
    //   ```json 펜스가 붙는다 — 검색 후 최종 메시지도 JSON only 임을 별도로 못 박는다(보조 방어).
    (opts.webSearch
      ? ' After using web search, your FINAL message must still be the JSON object only — no summary of search results, no preamble, no code fences.'
      : '');

  const text = await claudeGenerate(userPrompt, { ...opts, system: jsonSystem });
  try {
    return JSON.parse(text) as T;
  } catch {
    try {
      return repairJson<T>(text);
    } catch (repairErr) {
      // 최종 방어(#p4-websearch 실측): 서술이 JSON 을 감싼 형태("…반영하여, {…} ```")는 repairJson 이
      //   "not JSON-shaped"로 거부 — JSON 본체 구간만 잘라 한 번 더 복구를 시도한다.
      const start = text.search(/[{[]/);
      const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
      if (start >= 0 && end > start) {
        try {
          return repairJson<T>(text.slice(start, end + 1));
        } catch {
          // 아래 원 오류로 표면화
        }
      }
      const msg = repairErr instanceof Error ? repairErr.message : String(repairErr);
      throw new Error(`Claude JSON parse failed: ${msg}`);
    }
  }
}
