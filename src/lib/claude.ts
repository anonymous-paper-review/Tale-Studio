import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const MODEL = 'claude-sonnet-4-6'

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
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: toClaudeRole(m.role) as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages,
    temperature,
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type')
  return block.text
}

/** Single-turn JSON generation — parses and returns typed result */
export async function claudeJSON<T = unknown>(
  system: string,
  userMessage: string,
  temperature = 0.3,
): Promise<T> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: `${system}\n\nIMPORTANT: Output ONLY valid JSON. No markdown fences, no explanation.`,
    messages: [{ role: 'user', content: userMessage }],
    temperature,
  })

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
