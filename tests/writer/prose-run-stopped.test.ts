// 산문을 넘긴 뒤 실행이 멈췄으면 Writer 화면에도 멈춘 이유와 [이어서 다시 시도]를 보인다 (리뉴얼 1차 검토 2026-10-19)
import { describe, expect, it } from 'vitest'
import { handedRunStopped } from '@/lib/prose/busy'

describe('Writer 화면의 이어서 다시 시도', () => {
  it('산문을 넘긴 뒤 실행이 멈췄으면 Writer 화면에 이어서 다시 시도를 보인다', () => {
    // 왜: 리뉴얼 전에 넘긴 프로젝트가 장면을 쓰다 실패하면 Writer 화면이 그 프로젝트의 자리다 — 예전 Producer 의 다시 실행 안내가 없어져 길이 없었다.
    expect(handedRunStopped({ draftLive: false, phase: 'failed' })).toBe(true)
  })

  it('산문 초안을 쓰다 실패한 것은 이어서 다시 시도 대신 산문 자리의 [다시 시도]가 맡는다', () => {
    // 왜: 초안 실패는 재료 · 조건을 그대로 두고 처음부터 다시 쓴다 — 두 버튼이 같이 보이면 무엇을 눌러야 할지 모른다.
    expect(handedRunStopped({ draftLive: true, phase: 'failed' })).toBe(false)
  })

  it('실행이 멈추지 않았으면 보이지 않는다', () => {
    // 왜: 정상 경로 고정 — 쓰는 중 · 확정 대기 · 다 만든 프로젝트에는 다시 시도가 없다.
    for (const phase of ['before', 'writing', 'gate', 'continuing', 'done'] as const) {
      expect(handedRunStopped({ draftLive: false, phase }), phase).toBe(false)
    }
  })
})
