// 끝 장을 다시 그리는 방식이 서버 한 곳에서 정해지고, 샷 설계의 옛 움직임 글을 싣지 않는지 검사한다(D10 · 2026-11-22, ② 는 오너 Q1 · Q3)
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { END_FRAME_METHOD, endFramePlan } from '@/lib/writer/directing-edit'

// 이 시험을 위해 지은 러프 세 장 — 연출 장은 사람이 화살표를 고친 것이다.
const FRAMES = { start: 'https://media.test/r/start.png', direction: 'https://media.test/r/direction-edited.png', end: 'https://media.test/r/end.png' }
const LINE = 'The figure on the left turns around and walks toward the camera.'

describe('끝 장 다시 그리기의 재료', () => {
  // 왜: 끝 장은 고친 화살표를 따라야 한다 — 샷 설계의 옛 움직임 글(행동 글 · 카메라 무브)을 함께 실으면 고친 화살표와 다툰다(D10 피드백 7의 뿌리).
  //   끝 장 계획은 읽은 줄과 샷 길이만 받는다 — 행동 글 · 샷 설계를 받는 칸이 없다.
  it('끝 장을 다시 그릴 때 샷 설계의 옛 움직임 글(행동 글 · 카메라 무브)은 넣지 않는다', () => {
    const plan = endFramePlan(FRAMES, END_FRAME_METHOD, { line: LINE, seconds: 6 })
    expect(plan.prompt).toContain(LINE)
    expect(plan.prompt).not.toMatch(/dolly|Doyun|도윤/i)
    expect(plan.userText).toBe(LINE)
  })

  // 왜: 옛 요청과 [이 장만 다시 만들기](끝) · 물음의 [다시 그리기]가 다른 길로 그리면 같은 "끝 장 다시 그리기"가 다른 그림을 낸다.
  //   2026-11-22 문장 바꿈(오너 Q1 · Q3 · 비동기 길): 예전 '옛 [저장 후 END 재생성] 요청과 끝 장 [이 장만 다시 만들기]는 같은 그림 AI · 같은 문장 · 같은 참고 그림으로 그린다'.
  it('옛 [저장 후 END 재생성] 요청과 끝 장 [이 장만 다시 만들기]는 같은 끝 장 작업 길로 보낸다', () => {
    const route = readFileSync('src/app/api/writer/rough-directing-edit/route.ts', 'utf8')
    expect(route).toMatch(/body\.action === 'regenerate-end' \|\| \(body\.action === 'regenerate-frame' && body\.frame === 'end'\)/)
    expect(route.match(/regenerateEndFrame\(/g)?.length).toBe(1)
  })

  // 왜(오너 Q1 · Q3 "2번으로 해줘"): 끝 장은 읽는 AI 가 연출 장을 한 줄로 읽고, GPT Image 2 가 시작 장과 그 줄로 그린다. 바꿀 때는 이 한 곳만 바꾼다.
  //   2026-11-22 문장 바꿈(오너 Q1 · Q3): 예전 '… 오너가 고르기 전까지는 고친 가운데 장 한 장과 정해진 문장으로 그린다'.
  it('끝 장을 그리는 방식은 서버 한 곳에서 정하고, 오너가 고른 ②(읽은 한 줄과 시작 장, GPT Image 2)로 그린다', () => {
    expect(END_FRAME_METHOD).toBe('read-then-draw')
    const plan = endFramePlan(FRAMES, END_FRAME_METHOD, { line: LINE, seconds: 6 })
    expect(plan.model).toBe('openai/gpt-image-2/edit')
    expect(plan.refs).toEqual([FRAMES.start])
    expect(plan.prompt).toMatch(/at the moment this movement has fully completed over 6 seconds/)
    // 예전 방식(고친 연출 장 한 장 + 정해진 문장, Grok)은 고를 수 있게 남겨 둔다.
    expect(endFramePlan(FRAMES, 'direction-only')).toMatchObject({ model: 'xai/grok-imagine-image/edit', refs: [FRAMES.direction], userText: null })
  })
})
