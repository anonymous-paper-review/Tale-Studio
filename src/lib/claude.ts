import Anthropic from '@anthropic-ai/sdk'
import { logTiming } from './timing'

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
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: toClaudeRole(m.role) as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const t0 = performance.now()
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages,
    temperature,
  })
  const u = response.usage
  logTiming(
    'llm',
    `${label} model=${MODEL} in=${u.input_tokens} out=${u.output_tokens} ${(performance.now() - t0).toFixed(0)}ms`,
  )

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')
  return block.text
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
