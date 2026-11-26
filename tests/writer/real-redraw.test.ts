// Storyboard 실사 카드 한 장 다시 그리기(채팅 O7) — Director 샷 상세 [이미지 고치기]와 같은 서버 요청 · 같은 글을 보내고, 못 맡긴 까닭과 끝남을 돌려주는지 검사한다
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  refresh: vi.fn(),
  quota: vi.fn((_status: number, _body: unknown) => true),
  poll: vi.fn(async (_jobId: string) => 'https://img/new.png'),
}))
vi.mock('@/lib/generation-queue', () => ({ refreshGenerationQueue: calls.refresh }))
vi.mock('@/lib/generation-quota-toast', () => ({ notifyIfQuotaExceeded: calls.quota }))
vi.mock('@/lib/generation-jobs-client', () => ({ pollGenerationJob: calls.poll }))

import { promptWithChange } from '@/lib/director/shot-detail'
import { writerDirectorPromptSource } from '@/features/director/hooks/use-writer-director-sync'
import { redrawRequestBody, redrawStoryboardImage } from '@/lib/storyboard/redraw-image'

// 이 시험을 위해 지은 샷 — 풍부한 그림 글(prompt)이 있는 샷과 없는 샷.
const rich = { shotId: 'sh_01_02', prompt: 'Mina, wet hair, looks back at the bus stop', actionDescription: '미나가 돌아본다' }
const plain = { shotId: 'sh_01_03', prompt: undefined, actionDescription: 'Mina runs to the bus' }

let reply: { status: number; body: unknown }
let sent: Array<{ url: string; body: Record<string, unknown> }>

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear()
  reply = { status: 200, body: { ok: true, jobId: 'job-1', status: 'queued', mode: 'strip3' } }
  sent = []
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('채팅이 맡기는 실사 다시 그리기', () => {
  // 왜(오너 O7 · 리드 "지시문을 바꾸는 고침은 리드에게"): Director 상세의 "바꾸고 싶은 점"과 글자까지 같은 글이라야 같은 그림 규칙(main d4f57647)을 탄다.
  it('채팅의 다시 그리기는 Director 샷 상세 [이미지 고치기]와 같은 서버 요청에 같은 글(샷 그림 글 + 바꿀 점)을 싣는다', async () => {
    await redrawStoryboardImage({ projectId: 'p1', shot: rich, change: 'Make her expression sadder' })
    expect(sent[0].url).toBe('/api/director/generate-storyboard')
    expect(sent[0].body).toEqual({
      projectId: 'p1',
      writerShotId: 'sh_01_02',
      prompt: promptWithChange(writerDirectorPromptSource(rich), 'Make her expression sadder'),
    })
  })

  // 왜(정상 경로 고정): 직접 더한 샷처럼 그림 글이 없는 샷은 Director 와 같이 샷 글(액션)에 바꿀 점을 붙인다.
  it('샷 그림 글이 없는 샷은 샷 글에 바꿀 점을 붙여 보낸다', () => {
    expect(redrawRequestBody('p1', plain, 'Rain heavier').prompt).toBe('Mina runs to the bus\n\nChange from the previous image: Rain heavier')
  })

  // 왜(오너 O7 "그 카드에만 기다림"): 카드 기다림은 작업 큐가 진실이다 — 맡기자마자 큐를 읽어야 다음 조회(4초)를 기다리지 않고 카드가 바뀐다.
  it('다시 그리기를 맡기면 바로 작업 큐를 다시 읽어 그 카드에 기다림이 뜨게 한다', async () => {
    const outcome = await redrawStoryboardImage({ projectId: 'p1', shot: rich, change: 'sadder' })
    expect(outcome).toMatchObject({ ok: true, jobId: 'job-1' })
    expect(calls.refresh).toHaveBeenCalledTimes(1)
  })

  // 왜: 서버는 같은 샷을 그리는 작업이 있으면 새로 맡지 않고 그 작업 번호를 돌려준다 — 그대로 두면 바꿀 점이 말없이 버려진다.
  it('이미 그리는 중인 샷을 다시 그리라고 하면 새로 맡기지 않고 그리는 중이라고 돌려준다', async () => {
    reply = { status: 200, body: { ok: true, jobId: 'job-0', status: 'queued', replayed: true } }
    expect(await redrawStoryboardImage({ projectId: 'p1', shot: rich, change: 'sadder' })).toEqual({ ok: false, reason: 'busy' })
  })

  // 왜(#ref-gate): 인물 시트가 없으면 서버가 그리지 않는다 — 누구 시트가 없는지 사람에게 알려야 Artist 에서 채운다.
  it('인물 시트가 없는 샷이면 다시 그리지 않고 서버가 준 까닭을 돌려준다', async () => {
    reply = { status: 409, body: { error: 'Mina 시트가 없어요', code: 'missing_character_sheets', missing: [] } }
    expect(await redrawStoryboardImage({ projectId: 'p1', shot: rich, change: 'sadder' })).toEqual({ ok: false, reason: 'missing_sheets', message: 'Mina 시트가 없어요' })
  })

  // 왜(#quota-toast · #creem-moderation): 자리 부족 · 내용 규칙은 일곱 진입점이 같은 공용 안내를 쓴다 — 여기서 따로 말하지 않는다.
  it('동시 생성 자리가 없거나 내용 규칙에 걸리면 공용 안내를 띄우고 멈춘다', async () => {
    reply = { status: 429, body: { error: 'quota', code: 'user_limit' } }
    expect(await redrawStoryboardImage({ projectId: 'p1', shot: rich, change: 'sadder' })).toEqual({ ok: false, reason: 'quota' })
    expect(calls.quota).toHaveBeenCalledWith(429, { error: 'quota', code: 'user_limit' })
  })

  // 왜: 맡긴 뒤 fal 에서 실패하면 카드는 옛 그림으로 돌아갈 뿐이라 — 끝남을 돌려줘야 채팅이 못 그렸다고 알린다.
  it('맡긴 그림이 실패로 끝나면 끝남을 실패로 돌려준다', async () => {
    calls.poll.mockRejectedValueOnce(new Error('fal failed'))
    const outcome = await redrawStoryboardImage({ projectId: 'p1', shot: rich, change: 'sadder' })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) await expect(outcome.done).resolves.toBe('failed')
  })
})
