// 진짜 Claude SDK 를 로컬 가짜 서버에 물려, 스트리밍으로 받은 구조화 출력 · 잘린 답 · 시간 예산 초과를 우리 복구 길로 다룬다(검토 b 2026-11-11)
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

// 가짜 서버가 이번 요청에 돌려줄 답 — 글 조각들과 끝난 까닭. hang 이면 첫 이벤트만 보내고 답을 끝내지 않는다.
let reply: { blocks: string[]; stop: string; hang?: boolean } = { blocks: [], stop: 'end_turn' }
let requests = 0
let server: Server
const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

beforeAll(async () => {
  server = createServer((req, res) => {
    requests += 1
    req.resume()
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.write(sse('message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }))
      if (reply.hang) return
      reply.blocks.forEach((text, index) => {
        res.write(sse('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }))
        res.write(sse('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text } }))
        res.write(sse('content_block_stop', { type: 'content_block_stop', index }))
      })
      res.write(sse('message_delta', { type: 'message_delta', delta: { stop_reason: reply.stop, stop_sequence: null }, usage: { output_tokens: 20 } }))
      res.write(sse('message_stop', { type: 'message_stop' }))
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const { port } = server.address() as { port: number }
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`
  process.env.CLAUDE_API_KEY = 'test-only-key'
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
beforeEach(() => {
  requests = 0
})

// 클라이언트는 모듈을 처음 읽을 때 만들어지므로, 가짜 서버 주소를 넣은 뒤에 읽는다.
const claude = () => import('@/lib/writer/llm/claude')
const Shape = z.object({ a: z.number() })

describe('Claude 스트리밍 — 진짜 SDK', () => {
  // 왜: 예비 길(s0 · s1 의 Gemini → Claude)은 구조화 출력을 켠다. SDK 가 끝에서 JSON 검사를 먼저 하면 서술이 섞인 답을 우리 복구 전에 버렸다.
  it('구조화 출력 답이 글 조각 둘(서술 + JSON)로 와도 SDK 가 먼저 거절하지 않고 JSON 을 읽는다', async () => {
    reply = { blocks: ['Let me check the structure first.', '{"a": 1}'], stop: 'end_turn' }
    const { claudeGenerateJson } = await claude()
    await expect(claudeGenerateJson<{ a: number }>('구조를 줘', { model: 'claude-sonnet-4-6', zodSchema: Shape })).resolves.toEqual({ a: 1 })
  })

  // 왜: 잘린 답을 SDK 가 "Unexpected end of JSON input"으로 먼저 끊으면 왜 잘렸는지(답 한도) 기록이 남지 않는다.
  it('구조화 출력 답이 답 한도에서 잘리면 "Claude response truncated"로 알리고 끝난 까닭(max_tokens)을 기록에 남긴다', async () => {
    reply = { blocks: ['{"a": [1, 2'], stop: 'max_tokens' }
    const { claudeGenerateJson } = await claude()
    const { getPendingRawCalls } = await import('@/lib/writer/llm/raw_collector')
    await expect(claudeGenerateJson('구조를 줘', { model: 'claude-sonnet-4-6', zodSchema: Shape })).rejects.toThrow(/Claude response truncated/)
    expect(getPendingRawCalls().at(-1)?.stop_reason).toBe('max_tokens')
    expect(requests).toBe(1)
  })

  // 왜: 샷 점검이 함수 수명(300초)에 잘리면 같은 유료 호출을 다시 사고 세 번이면 Writer 가 실패한다 — 정한 때가 지나면 기다리지 않는다.
  it('시간 예산 안에 Claude 답이 끝나지 않으면 기다리지 않고 재시도 없이 끊는다', async () => {
    reply = { blocks: [], stop: 'end_turn', hang: true }
    const { claudeGenerateJson } = await claude()
    const started = Date.now()
    await expect(claudeGenerateJson('점검해 줘', { model: 'claude-sonnet-4-6', maxTokens: 32000, deadlineMs: Date.now() + 300 })).rejects.toThrow(/time budget/)
    expect(Date.now() - started).toBeLessThan(3000)
    expect(requests).toBe(1)
  })
})
