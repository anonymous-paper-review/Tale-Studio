// Lumi 가 샷 그림 · 영상 고치기 부탁을 받으면 바꿀 점을 만들기 요청(change 칸)에 담아 넘기고, 샷 글은 다시 쓰지 않는다 (오너 2026-11-26 O5 · O8 — 고치기는 채팅으로, 지금 그림 바탕 · 움직임 글 지키기)
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  llmChat: vi.fn(),
  persistTrace: vi.fn(),
  userOwnsProject: vi.fn(),
}))
vi.mock('@/lib/supabase/auth', () => ({ getUser: mocks.getUser }))
vi.mock('@/lib/demo/guard-server', () => ({ demoWriteBlock: () => null }))
vi.mock('@/lib/llm', () => ({ llmChat: mocks.llmChat }))
vi.mock('@/lib/chat-trace-server', () => ({ persistChatTraceBestEffort: mocks.persistTrace }))
vi.mock('@/lib/generation-jobs', () => ({ userOwnsProject: mocks.userOwnsProject }))

import { POST } from '@/app/api/director/chat/route'

async function updatesOf(updates: unknown[]): Promise<unknown[]> {
  mocks.llmChat.mockResolvedValue(`Okay.\n\n\`\`\`json\n${JSON.stringify({ updates })}\n\`\`\``)
  const response = await POST(new Request('http://test/api/director/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: '@Real Shot 1 Fix the image and make it again: add rain', canvasContext: 'Scene_01 > shot-1' }),
  }))
  expect(response.status).toBe(200)
  return ((await response.json()) as { updates: unknown[] }).updates
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ id: 'user-1' })
  mocks.userOwnsProject.mockResolvedValue(false)
  mocks.persistTrace.mockResolvedValue(undefined)
})

describe('Lumi 답의 바꿀 점', () => {
  it('Lumi 가 샷 그림 만들기에 바꿀 점(change)을 담으면 그대로 넘기고, 빈 글이거나 샷을 정하지 않은 그림 만들기면 버린다', async () => {
    // 왜: 오너 O8 (a) — 바꿀 점이 따로 와야 그 샷의 지금 그림을 바탕으로 바꿀 점만 고친다. 샷을 정하지 않은 "빈 샷 전부"는 고치기가 아니다.
    expect(await updatesOf([
      { type: 'generateImage', id: 'dn_shot_1', change: '  Add raindrops on the window.  ' },
      { type: 'generateImage', id: 'dn_shot_2', change: '   ' },
      { type: 'generateImage', change: 'Add rain.' },
    ])).toEqual([
      { type: 'generateImage', id: 'dn_shot_1', change: 'Add raindrops on the window.' },
      { type: 'generateImage', id: 'dn_shot_2' },
      { type: 'generateImage' },
    ])
  })

  it('Lumi 가 영상 만들기에 바꿀 점(change)을 담으면 그대로 넘기고, 1000자를 넘으면 1000자까지만 넘긴다', async () => {
    // 왜: 오너 O8 (e)(f) — 바꿀 점이 따로 와야 샷 글을 그대로 두어 작가의 움직임 글이 남는다. 서버는 1000자 넘는 바꿀 점을 거절하므로 미리 줄인다.
    const updates = await updatesOf([
      { type: 'generateVideos', shotIds: ['dn_shot_1'], change: 'Make her walk more slowly.' },
      { type: 'generateVideos', change: 'y'.repeat(1200) },
    ])
    expect(updates[0]).toEqual({ type: 'generateVideos', shotIds: ['dn_shot_1'], change: 'Make her walk more slowly.' })
    expect(updates[1]).toEqual({ type: 'generateVideos', change: 'y'.repeat(1000) })
  })

  it('Lumi 지시문은 그림 · 영상 고치기 부탁이면 바꿀 점을 change 칸에 담고, 샷 글을 고쳐 달라는 말이 없으면 샷 글을 다시 쓰지 않게 한다', () => {
    // 왜: 샷 글을 다시 쓰면 글 카드 [적용]을 한 번 더 눌러야 하고, 바뀐 글이 저장된 샷 글과 달라져 다음 영상에서 작가의 움직임 글이 빠진다(O8 (e)).
    const route = readFileSync('src/app/api/director/chat/route.ts', 'utf8')
    expect(route).toContain('{"type":"generateImage","id":"<shotId>","change":"..."}')
    expect(route).toContain('{"type":"generateVideos","shotIds":["<shotId>", ...],"change":"..."}')
    expect(route).toContain("When the user asks to fix a shot's image or video, put what to change in \"change\" of generateImage or generateVideos for that shot. Do not rewrite the shot prompt with updateShot unless the user also asks to change the shot text.")
  })
})
