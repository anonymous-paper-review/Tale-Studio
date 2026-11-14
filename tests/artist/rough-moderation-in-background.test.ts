// Artist 에서 러프를 뒤로 그리다 내용 검사(moderation)로 걸린 샷은 한 묶음에 한 번, 샷 목록과 함께 알려 준다
import { describe, expect, it, vi } from 'vitest'
import { drawRoughsInBackground } from '@/lib/artist/background-roughs'

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

/** 첫 묶음에서 j1(s3 · s4)과 j2(s5)를 받고, 둘째 묶음에서 더 낼 것이 없다고 답하는 서버. */
function server() {
  return vi.fn()
    .mockResolvedValueOnce(reply(200, { ok: true, data: { submitted: [{ shotId: 's3', jobId: 'j1' }, { shotId: 's4', jobId: 'j1' }, { shotId: 's5', jobId: 'j2' }], remaining: 0 } }))
    .mockResolvedValueOnce(reply(200, { ok: true, data: { submitted: [], remaining: 0 } }))
}

describe('Artist 에서 뒤로 그리는 러프의 내용 검사 실패', () => {
  it('묶음 안의 잡이 내용 검사로 실패하면 그 잡이 맡은 샷들을 묶음이 끝난 뒤 한 번에 알려 준다', async () => {
    // 왜: 그림 그리기가 조용히 끝나 Artist 머리 표시만 사라지고 어디에도 말이 없었다. 한 묶음의 실패는 한 번에 모아야 채팅이 도배되지 않는다.
    const onModerationFailed = vi.fn()
    const poll = vi.fn(async (jobId: string) => {
      if (jobId === 'j1') throw new Error('[moderation] {"detail":[{"type":"content_policy_violation"}]}')
      if (jobId === 'j2') throw new Error('[moderation] flagged by safety checker')
    })

    await drawRoughsInBackground('p1', { fetchImpl: server(), poll, isAborted: () => false, onModerationFailed })

    expect(onModerationFailed).toHaveBeenCalledTimes(1)
    expect(onModerationFailed).toHaveBeenCalledWith(['s3', 's4', 's5'])
  })

  it('내용 검사가 아닌 실패(시간 초과 · 일반 실패)는 알리지 않고, 걸린 잡이 없으면 부르지 않는다', async () => {
    // 왜: 시간 초과까지 "내용 검사에 걸렸다"고 하면 사용자가 엉뚱하게 설명을 고친다. 정상 경로에는 알림이 없어야 한다.
    const onModerationFailed = vi.fn()
    const poll = vi.fn(async (jobId: string) => {
      if (jobId === 'j1') throw new Error('Generation is taking longer than expected. It may still finish in the background.')
      if (jobId === 'j2') throw new Error('Generation failed')
    })

    await drawRoughsInBackground('p1', { fetchImpl: server(), poll, isAborted: () => false, onModerationFailed })
    expect(onModerationFailed).not.toHaveBeenCalled()

    await drawRoughsInBackground('p1', { fetchImpl: server(), poll: async () => undefined, isAborted: () => false, onModerationFailed })
    expect(onModerationFailed).not.toHaveBeenCalled()
  })

  it('걸린 잡이 하나뿐이면 그 잡의 샷만 알리고 나머지는 지금처럼 이어 그린다', async () => {
    // 왜: 한 잡이 걸렸다고 같은 묶음의 잘 그려진 샷까지 실패로 말하면 안 된다. 알림이 그리기 흐름을 막지도 않는다.
    const onModerationFailed = vi.fn()
    const poll = vi.fn(async (jobId: string) => {
      if (jobId === 'j2') throw new Error('[moderation] flagged')
    })

    const outcome = await drawRoughsInBackground('p1', { fetchImpl: server(), poll, isAborted: () => false, onModerationFailed })

    expect(outcome).toBe('done')
    expect(onModerationFailed).toHaveBeenCalledWith(['s5'])
  })

  it('알림 함수를 주지 않아도 그리기는 지금처럼 돈다', async () => {
    // 왜: 알림은 덤이다 — 없다고 펌프가 멈추거나 던지면 안 된다(기존 호출부 호환).
    const poll = vi.fn(async () => { throw new Error('[moderation] flagged') })

    await expect(drawRoughsInBackground('p1', { fetchImpl: server(), poll, isAborted: () => false })).resolves.toBe('done')
  })
})
