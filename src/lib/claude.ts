import Anthropic from '@anthropic-ai/sdk'
import { logTiming } from './timing'
import { CHAT_COMPACTION_TRIGGER_TOKENS } from './constants'

const MODEL = 'claude-sonnet-4-6'

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
  // #p4-websearch(2026-08-06): 서버 웹서치 툴 — 오마쥬/레퍼런스 요청("기생충 계단 씬처럼")을
  //   실제 검색으로 접지. 서버 실행 툴이라 tool loop 불필요, 응답에 검색 블록이 끼어도
  //   아래 텍스트 추출이 text 블록만 이어붙인다. 단계 확대 방침: produce 채팅부터.
  opts?: { webSearch?: boolean },
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
    ...(opts?.webSearch
      ? { tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 3 }] }
      : {}),
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

  // compaction/웹서치가 켜지면 응답 content에 비텍스트 블록이 끼고, 검색 시엔 텍스트가
  //   여러 블록으로 나뉠 수 있다(검색 전 서두 + 검색 후 본문) — 전 텍스트 블록을 이어붙인다.
  const text = response.content
    .filter((b): b is Extract<(typeof response.content)[number], { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('')
  if (!text) throw new Error('Unexpected response type')
  return text
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
