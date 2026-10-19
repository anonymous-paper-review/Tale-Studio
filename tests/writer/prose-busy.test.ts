// 리뉴얼 1차: Writer 는 산문 초안을 쓰는 동안과 산문을 고치는 동안 화면 전체를 진행 표시로 잠근다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { proseBusy } from '@/lib/prose/busy'

describe('Writer AI 작업 중 잠금', () => {
  // 왜: 프로토타입 E5 — 산문 초안을 쓰는 동안 "자료 정리 · 이야기 뼈대 · 씬 스토리 쓰기" 중 어디인지 보여 준다.
  it('산문 초안을 쓰는 동안 지금 하는 일을 세 줄 중 하나로 보여 준다', () => {
    expect(proseBusy({ draftLive: true, phase: 'writing', currentStage: 'dramaturgy', requestPending: false })).toEqual({ kind: 'draft', step: 0 })
    expect(proseBusy({ draftLive: true, phase: 'writing', currentStage: 'narrativeStructure', requestPending: false })).toEqual({ kind: 'draft', step: 1 })
    expect(proseBusy({ draftLive: true, phase: 'writing', currentStage: 'storyCheck', requestPending: false })).toEqual({ kind: 'draft', step: 2 })
  })

  // 왜: 프로토타입 W2 "산문을 고치고 있어요" — 세 가지 안을 쓰는 동안과 수정안을 쓰는 동안 화면을 잠근다.
  it('세 가지 안이나 수정안을 쓰는 동안 화면을 잠근다', () => {
    expect(proseBusy({ draftLive: true, phase: 'gate', proposal: { status: 'generating', variants: [{}, {}, {}] }, requestPending: false })).toEqual({ kind: 'rewrite' })
    expect(proseBusy({ draftLive: true, phase: 'gate', proposal: { status: 'generating' }, requestPending: false })).toEqual({ kind: 'revise' })
    expect(proseBusy({ draftLive: true, phase: 'gate', proposal: null, requestPending: true })).toEqual({ kind: 'revise' })
  })

  // 왜: 안이 다 나오면 잠금을 풀고 고르게 한다.
  it('안이 다 나오면 잠금을 푼다', () => {
    expect(proseBusy({ draftLive: true, phase: 'gate', proposal: { status: 'ready', variants: [{}] }, requestPending: false })).toBeNull()
    expect(proseBusy({ draftLive: true, phase: 'gate', proposal: { status: 'failed' }, requestPending: false })).toBeNull()
  })

  // 왜: 확정한 산문을 다시 열 때(뒷단계가 도는 중이어도) Writer 화면은 잠그지 않는다 — 읽고 복사할 수 있다.
  it('확정한 산문은 뒷단계가 도는 동안에도 잠그지 않는다', () => {
    expect(proseBusy({ draftLive: false, phase: 'continuing', currentStage: 'decoupage', requestPending: false })).toBeNull()
    expect(proseBusy({ draftLive: false, phase: 'writing', currentStage: 'scenes', requestPending: false })).toBeNull()
  })
})
