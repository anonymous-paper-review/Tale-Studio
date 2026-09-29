import Anthropic from '@anthropic-ai/sdk'
import { logTiming } from './timing'
import { CHAT_COMPACTION_TRIGGER_TOKENS } from './constants'
import type { ChatLlmUsage } from './chat-trace'
import { parseChatModelSettings, type ChatModelSettings } from './chat-model-settings'
import { CHAT_TOOL_GUIDE, type ChatToolContext } from './chat-tools/protocol'
import type { BetaMessageParam, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages'

const MODEL = 'claude-sonnet-5-5'
const MAX_OUTPUT_TOKENS = 32000
// 도구 후 최신 프로젝트/이미지 문맥을 재조립하므로 이전 문맥에 묶인 사고만 API에서 제외한다.
// SDK 0.80 타입에는 block_binding이 없지만 원본 블록은 그대로 전달하는 공식 beta 필드다.
const CHAT_THINKING = { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } } as const

let _client: Anthropic | null = null
function getClient(): Anthropic {
  // TALE_ 우선 — 표준 이름(ANTHROPIC_API_KEY)은 cwd에서 실행되는 Bun 기반 CLI(gjc 등)가
  //   .env.local에서 크리덴셜로 오인 수집하므로 로컬은 TALE_ 이름만 둔다(프로덕션은 표준 이름 폴백).
  if (!_client)
    _client = new Anthropic({
      apiKey: process.env.TALE_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
    })
  return _client
}

interface HistoryMessage {
  role: 'user' | 'model' | 'assistant'
  content: string
}

/**
 * 마지막 user 턴에만 실리는 이미지 블록. 히스토리는 DB 에서 텍스트로 재조립되므로
 * 이미지는 다음 턴에 자연히 빠진다 — 매 턴 재전송으로 비용이 붇는 일이 없다.
 * base64 가 아니라 URL 소스를 쓰므로 요청 본문 크기 한도와도 무관하다.
 */
type UserContent =
  | string
  | Array<
      | { type: 'image'; source: { type: 'url'; url: string } }
      | { type: 'text'; text: string }
    >

function toClaudeRole(role: string): 'user' | 'assistant' {
  return role === 'user' ? 'user' : 'assistant'
}

/** Multi-turn chat — returns assistant text */
export async function claudeChat(
  system: string,
  history: HistoryMessage[],
  userMessage: string,
  _temperature = 0.7,
  label = 'chat',
  // #p4-websearch(2026-08-06): 서버 웹서치 툴 — 오마쥬/레퍼런스 요청("기생충 계단 씬처럼")을
  //   실제 검색으로 접지. 서버 실행 툴이라 tool loop 불필요, 응답에 검색 블록이 끼어도
  //   아래 텍스트 추출이 text 블록만 이어붙인다. 단계 확대 방침: produce 채팅부터.
  // #p1-attach(2026-08-13): imageUrls — 프로듀서 첨부(웹툰·레퍼런스) 판독 경로.
  //   전처리(슬라이싱·스토리지 업로드)는 api/produce/ingest 가 끝내고 URL 만 넘어온다.
  //   "이미지 먼저, 텍스트 나중" 배치는 Anthropic 권장 순서다.
  opts?: {
    webSearch?: boolean
    imageUrls?: string[]
    onUsage?: (usage: ChatLlmUsage) => void | PromiseLike<void>
    appTools?: ChatToolContext
    signal?: AbortSignal
    modelSettings?: ChatModelSettings
  },
): Promise<string> {
  // 기존 호출 순서는 유지하지만 Claude 5.5가 지원하지 않는 temperature는 보내지 않는다.
  void _temperature
  const modelSettings = parseChatModelSettings(opts?.modelSettings)
  if (!modelSettings) throw new Error('Invalid chat model settings')
  const imageUrls = opts?.imageUrls ?? []
  const userContent: UserContent = imageUrls.length
    ? [
        ...imageUrls.map((url) => ({
          type: 'image' as const,
          source: { type: 'url' as const, url },
        })),
        { type: 'text' as const, text: userMessage },
      ]
    : userMessage

  const messages: BetaMessageParam[] = [
    ...history.map((m) => ({
      role: toClaudeRole(m.role),
      content: m.content,
    })),
    { role: 'user', content: userContent },
    ...(opts?.appTools?.messages ?? []),
  ]

  const t0 = performance.now()
  const request: MessageCreateParamsNonStreaming = {
    model: modelSettings.model,
    // 사고 토큰도 출력 한도를 쓰므로 사고와 답변을 위한 여유를 둔다. 실제 생성한 토큰만 청구된다.
    max_tokens: MAX_OUTPUT_TOKENS,
    system: system + (opts?.appTools ? CHAT_TOOL_GUIDE : ''),
    messages,
    output_config: { effort: modelSettings.effort },
    thinking: CHAT_THINKING,
    ...(opts?.webSearch || opts?.appTools
      ? { tools: [
          ...(opts?.webSearch ? [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 3 }] : []),
          ...(opts?.appTools?.tools ?? []),
        ] }
      : {}),
    // 멀티턴 프롬프트 캐싱 (chat-context-management Phase 1) — top-level auto-cache가
    //   마지막 cacheable block(= 마지막 user 턴)에 breakpoint를 둔다. 다음 턴에는 그 이전
    //   prefix(system + 이전 히스토리)가 캐시 read 대상이 되어 2턴째부터 입력 비용/지연이 준다.
    //   캐시 무효 방지: volatile 컨텍스트(canvasContext/currentSettings/에셋 요약)는 라우트에서
    //   이미 마지막 user 턴에 prepend하므로 system prefix는 안정적이다.
    cache_control: { type: 'ephemeral' },
    // 서버사이드 compaction 안전망 (chat-context-management Phase 2) — 단일 요청 입력이
    //   600K 토큰(1M 창의 60%)에 닿으면 API가 과거 이력을 요약 블록으로 압축해 brick(컨텍스트
    //   한도 400)을 막는다. 평소엔 윈도잉으로 입력이 수만 토큰이라 트리거에 안 닿는 — 병리적
    //   장기 세션 전용 보험. 캐리오버(블록 영속화)는 안전망 용도엔 불필요해 미적용(매 턴 history는
    //   DB에서 윈도잉 재조립 → 압축 요약을 재전송하지 않으나, 그 경로에선 트리거에 닿지 않음).
    betas: ['compact-2026-01-12', 'thinking-binding-controls-2026-08-01'],
    context_management: {
      edits: [
        {
          type: 'compact_20260112',
          trigger: {
            type: 'input_tokens',
            value: CHAT_COMPACTION_TRIGGER_TOKENS,
          },
        },
      ],
    },
  }
  // 32k 요청은 SDK가 비스트리밍으로 받지 않는다. 완성된 메시지까지 모아 기존 반환 계약을 유지한다.
  const response = await getClient().beta.messages.stream(request, { signal: opts?.signal }).finalMessage()
  const u = response.usage
  const durationMs = performance.now() - t0
  logTiming(
    'llm',
    `${label} model=${response.model} effort=${modelSettings.effort} thinking=${modelSettings.thinking} in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} stop_reason=${response.stop_reason ?? 'null'}${imageUrls.length ? ` img=${imageUrls.length}` : ''} ${durationMs.toFixed(0)}ms`,
  )

  // compaction/웹서치가 켜지면 응답 content에 비텍스트 블록이 끼고, 검색 시엔 텍스트가
  //   여러 블록으로 나뉠 수 있다(검색 전 서두 + 검색 후 본문) — 전 텍스트 블록을 이어붙인다.
  const text = response.content
    .filter((b): b is Extract<(typeof response.content)[number], { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const hasToolTurn = opts?.appTools && (response.content.some(b => b.type === 'tool_use') || response.stop_reason === 'pause_turn')
  const usage: ChatLlmUsage = {
    model: response.model,
    durationMs,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
    stopReason: response.stop_reason,
    effort: modelSettings.effort,
    thinking: modelSettings.thinking,
  }
  try {
    const callbackResult = opts?.onUsage?.(usage)
    if (callbackResult !== undefined) await Promise.resolve(callbackResult).catch(() => undefined)
  } catch {
    // Usage reporting must never turn a successful chat response into a failure.
  }

  if (response.stop_reason === 'max_tokens') throw new Error('Chat response reached its output limit. The response was not completed; retry with lower effort.')
  if (hasToolTurn) {
    opts.appTools!.turn = { content: response.content as unknown as import('./chat-tools/protocol').ToolBlock[], stopReason: response.stop_reason ?? '' }
  }
  if (!text && !hasToolTurn) throw new Error('Unexpected response type')
  return text
}

/** Single-turn JSON generation — parses and returns typed result */
export async function claudeJSON<T = unknown>(
  system: string,
  userMessage: string,
  _temperature = 0.3,
  label = 'json',
): Promise<T> {
  void _temperature
  const t0 = performance.now()
  const response = await getClient().messages.stream({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: `${system}\n\nIMPORTANT: Output ONLY valid JSON. No markdown fences, no explanation.`,
    messages: [{ role: 'user', content: userMessage }],
    thinking: { type: 'adaptive' },
  }).finalMessage()
  const u = response.usage
  logTiming(
    'llm',
    `${label} model=${MODEL} in=${u.input_tokens} out=${u.output_tokens} ${(performance.now() - t0).toFixed(0)}ms`,
  )

  if (response.stop_reason === 'max_tokens') throw new Error('JSON response reached its output limit. The response was not completed.')
  const body = response.content
    .filter((block): block is Extract<(typeof response.content)[number], { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (!body) throw new Error('Unexpected response type')

  // Strip markdown fences if present
  const text = body
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  return JSON.parse(text) as T
}
