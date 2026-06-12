import Anthropic from '@anthropic-ai/sdk'
import { logTiming } from './timing'
import { CHAT_COMPACTION_TRIGGER_TOKENS } from './constants'

const MODEL = 'claude-sonnet-4-6'

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic()
  return _client
}

interface HistoryMessage {
  role: 'user' | 'model' | 'assistant'
  content: string
}

function toClaudeRole(role: string): 'user' | 'assistant' {
  return role === 'user' ? 'user' : 'assistant'
}

/** Multi-turn chat — returns assistant text */
export async function claudeChat(
  system: string,
  history: HistoryMessage[],
  userMessage: string,
  temperature = 0.7,
  label = 'chat',
): Promise<string> {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    ...history.map((m) => ({
      role: toClaudeRole(m.role),
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const t0 = performance.now()
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages,
    temperature,
    // 멀티턴 프롬프트 캐싱 (chat-context-management Phase 1) — top-level auto-cache가
    //   마지막 cacheable block(= 마지막 user 턴)에 breakpoint를 둔다. 다음 턴에는 그 이전
    //   prefix(system + 이전 히스토리)가 캐시 read 대상이 되어 2턴째부터 입력 비용/지연이 준다.
    //   캐시 무효 방지: volatile 컨텍스트(canvasContext/currentSettings/에셋 요약)는 라우트에서
    //   이미 마지막 user 턴에 prepend하므로 system prefix는 안정적이다. Sonnet 4.6 최소 캐시
    //   prefix 2048 토큰 — 짧은 초기 대화는 silent 미캐시(에러 아님).
    cache_control: { type: 'ephemeral' },
    // 서버사이드 compaction 안전망 (chat-context-management Phase 2) — 단일 요청 입력이
    //   600K 토큰(1M 창의 60%)에 닿으면 API가 과거 이력을 요약 블록으로 압축해 brick(컨텍스트
    //   한도 400)을 막는다. 평소엔 윈도잉으로 입력이 수만 토큰이라 트리거에 안 닿는 — 병리적
    //   장기 세션 전용 보험. 캐리오버(블록 영속화)는 안전망 용도엔 불필요해 미적용(매 턴 history는
    //   DB에서 윈도잉 재조립 → 압축 요약을 재전송하지 않으나, 그 경로에선 트리거에 닿지 않음).
    betas: ['compact-2026-01-12'],
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
  })
  const u = response.usage
  logTiming(
    'llm',
    `${label} model=${MODEL} in=${u.input_tokens} out=${u.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} ${(performance.now() - t0).toFixed(0)}ms`,
  )

  // compaction이 켜지면 응답 content에 compaction 블록이 끼어 content[0]이 text가 아닐 수
  //   있다 — text 블록을 찾아서 반환한다.
  const textBlock = response.content.find((b) => b.type === 'text')
  if (textBlock?.type !== 'text') throw new Error('Unexpected response type')
  return textBlock.text
}

/** Single-turn JSON generation — parses and returns typed result */
export async function claudeJSON<T = unknown>(
  system: string,
  userMessage: string,
  temperature = 0.3,
  label = 'json',
): Promise<T> {
  const t0 = performance.now()
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: `${system}\n\nIMPORTANT: Output ONLY valid JSON. No markdown fences, no explanation.`,
    messages: [{ role: 'user', content: userMessage }],
    temperature,
  })
  const u = response.usage
  logTiming(
    'llm',
    `${label} model=${MODEL} in=${u.input_tokens} out=${u.output_tokens} ${(performance.now() - t0).toFixed(0)}ms`,
  )

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')

  // Strip markdown fences if present
  const text = block.text
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  return JSON.parse(text) as T
}
