// 채팅 복구의 진행 상태·사용량·중단과 요청 전체 한도를 전달한다
import { describe, expect, it, vi } from 'vitest'
import { createChatRequestSession, readChatResponse } from '@/lib/chat-response'
import { withChatRecovery } from '@/lib/chat-response-server'

const usage = (outputTokens = 20) => ({ model: 'claude-sonnet-5-5', inputTokens: 10, outputTokens, durationMs: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, stopReason: 'max_tokens' })
function streamed(events: unknown[]) {
  const bytes = new TextEncoder().encode(events.map(e => JSON.stringify(e)).join('\n') + '\n')
  return new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
    controller.close()
  } }), { headers: { 'content-type': 'application/x-ndjson' } })
}

describe('채팅 복구 전달', () => {
  it('서버 시간 제한으로 중단하면 이미 반환된 미완성 설명을 오류와 함께 보존한다', async () => {
    // 왜: 시간 초과 안내로 바꾸면서 복구 중 생성한 문장까지 지우면 안 된다.
    vi.useFakeTimers()
    try {
      const pending = withChatRecovery(new Request('http://local/chat', { headers: { 'x-chat-time-remaining': '1' } }), async () => {
        await new Promise(resolve => setTimeout(resolve, 2))
        return Response.json({ error: '중단', partialReply: '여기까지 작성했어요.' }, { status: 500 })
      })
      await vi.advanceTimersByTimeAsync(3)
      const response = await pending
      expect(response.status).toBe(504)
      expect(await response.json()).toMatchObject({ partialReply: '여기까지 작성했어요.' })
    } finally { vi.useRealTimers() }
  })
  it('복구 진행 중이면 사용량과 진행 상태를 먼저 받고 완성된 답변만 돌려준다', async () => {
    // 왜: 한글이 네트워크 조각 경계에서 깨지거나 중간 데이터가 저장 응답으로 쓰이면 안 된다.
    const onUsage = vi.fn(), onRecovery = vi.fn()
    const result = await readChatResponse(streamed([
      { type: 'usage', usage: usage() }, { type: 'recovery', attempt: 1, mode: 'continue' },
      { type: 'result', status: 200, body: { reply: '이어서 완성했어요.' } },
    ]), { onUsage, onRecovery })
    expect(result).toEqual({ status: 200, payload: { reply: '이어서 완성했어요.' } })
    expect(onUsage).toHaveBeenCalledExactlyOnceWith(usage())
    expect(onRecovery).toHaveBeenCalledExactlyOnceWith({ attempt: 1, mode: 'continue' })
  })
  it('연결이 완성 응답 전에 끊기면 중간 결과를 성공으로 돌려주지 않는다', async () => {
    // 왜: 진행 이벤트만 받은 요청을 빈 성공으로 저장하면 작업이 유실된다.
    await expect(readChatResponse(streamed([{ type: 'usage', usage: usage() }]))).rejects.toThrow(/interrupted/i)
  })
  it('이전 형식의 응답이면 모든 모델 호출 사용량을 한 번씩만 센다', async () => {
    // 왜: 점진 배포와 테스트의 JSON 응답도 마지막 호출만 세거나 중복 계산하면 안 된다.
    const onUsage = vi.fn()
    await readChatResponse(Response.json({ reply: '완료', modelUsages: [usage(), usage(30)], toolUsage: usage(30) }), { onUsage })
    expect(onUsage.mock.calls.map(call => call[0].outputTokens)).toEqual([20, 30])
  })
  it('서버가 복구 중이면 진행 이벤트를 보내고 원래 실패 상태도 보존한다', async () => {
    // 왜: 스트림 HTTP 성공 상태 때문에 내부의 인증·모델 실패를 성공으로 오인하면 안 된다.
    const response = await withChatRecovery(new Request('http://local/chat', { headers: { accept: 'application/x-ndjson' } }), async context => {
      context.onUsage(usage())
      await context.recovery.onRecovery?.({ attempt: 1, mode: 'retry' })
      return Response.json({ error: '실패', partialReply: '미완성 설명' }, { status: 500 })
    })
    const onRecovery = vi.fn(), onUsage = vi.fn()
    const result = await readChatResponse(response, { onRecovery, onUsage })
    expect(result).toMatchObject({ status: 500, payload: { error: '실패', partialReply: '미완성 설명' } })
    expect(onRecovery).toHaveBeenCalledOnce()
    expect(onUsage).toHaveBeenCalledOnce()
  })
  it('남은 복구 횟수와 출력량을 보내면 다음 도구 단계에서도 같은 예산을 사용한다', async () => {
    // 왜: 도구 호출마다 복구 횟수와 비용 한도가 초기화되면 요청 전체 제한이 무의미하다.
    const fetcher = vi.fn().mockResolvedValueOnce(streamed([
      { type: 'usage', usage: usage(64000) }, { type: 'recovery', attempt: 1, mode: 'retry' },
      { type: 'usage', usage: usage(1000) }, { type: 'result', status: 200, body: { reply: '확인' } },
    ])).mockResolvedValueOnce(Response.json({ reply: '완료' }))
    const request = createChatRequestSession({ signal: new AbortController().signal, fetch: fetcher })
    await request('/chat', { message: '설정 변경' })
    await request('/chat', { message: '설정 변경', toolMessages: [] })
    const headers = new Headers(fetcher.mock.calls[1][1].headers)
    expect(headers.get('x-chat-recovery-remaining')).toBe('1')
    expect(headers.get('x-chat-output-remaining')).toBe('255000')
  })
  it('전체 출력 예산을 사용하면 다음 모델 호출을 시작하지 않는다', async () => {
    // 왜: 정상 도구 호출도 요청 전체 출력 제한에 포함해야 한다.
    const fetcher = vi.fn().mockResolvedValue(Response.json({ reply: '확인', toolUsage: usage(320000) }))
    const request = createChatRequestSession({ signal: new AbortController().signal, fetch: fetcher })
    await request('/chat', {})
    await expect(request('/chat', {})).rejects.toThrow(/output budget/i)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('사용자가 중단하면 다음 호출을 시작하지 않는다', async () => {
    // 왜: 복구 사이에 누른 중단이 무시되면 이미 취소한 요청이 계속 진행된다.
    const controller = new AbortController(), fetcher = vi.fn()
    const request = createChatRequestSession({ signal: controller.signal, fetch: fetcher })
    controller.abort()
    await expect(request('/chat', {})).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('남은 예산 헤더가 비정상이면 서버는 호출 전에 거절한다', async () => {
    // 왜: 음수나 소수 예산을 모델 제공자에게 보내면 안 된다.
    const handler = vi.fn()
    const response = await withChatRecovery(new Request('http://local/chat', { headers: { 'x-chat-output-remaining': '-1' } }), handler)
    expect(response.status).toBe(400)
    expect(handler).not.toHaveBeenCalled()
  })
})
