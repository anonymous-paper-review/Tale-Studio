// 리뉴얼 1차: Writer 는 산문 초안을 쓰는 동안과 산문을 고치는 동안 화면 전체를 진행 표시로 잠근다 (2026-10-19)
import { describe, expect, it } from 'vitest'
import { proseBusy, proseStartOffered } from '@/lib/prose/busy'

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

describe('Writer에 들어온 직후 진행 상태를 읽기 전', () => {
  it('산문 진행 상태를 아직 읽지 못했으면 초안을 쓰는 중으로 보고 잠근다', () => {
    // 왜: Writer에 들어온 직후 약 2초 동안 잠금 없이 '산문 쓰기' 단추와 채팅 입력이 열렸다(디자이너 QA 1차 #07).
    //   시작 화면에서 초안을 쓰는 중에 Writer로 넘어오거나, 초안이 다 돼 Writer로 보내질 때 첫 화면부터 잠근다.
    //   어느 줄을 쓰는 중인지는 아직 모른다(step null) — 다 쓴 초안에서 넘어올 때 첫 줄부터 다시 쓰는 것처럼 보이지 않게.
    expect(proseBusy({ draftLive: true, phase: 'before', statusRead: false, requestPending: false })).toEqual({ kind: 'draft', step: null })
    // 읽고 나면 읽은 대로 — 다 쓴 초안(확정 대기)은 잠그지 않는다.
    expect(proseBusy({ draftLive: true, phase: 'gate', statusRead: true, proposal: null, requestPending: false })).toBeNull()
  })

  it('산문 진행 상태를 읽기 전에는 산문 쓰기 단추를 보이지 않는다', () => {
    // 왜: 진행 상태를 읽기 전에는 Writer가 아직 쓴 적이 없는 것처럼 보여 '산문 쓰기' 단추가 잠깐 열렸다(디자이너 QA 1차 #07).
    expect(proseStartOffered({ locked: false, storyReady: true, phase: 'before', statusRead: false })).toBe(false)
    // 읽어 보니 Writer가 시작한 적이 없을 때만 단추를 둔다.
    expect(proseStartOffered({ locked: false, storyReady: true, phase: 'before', statusRead: true })).toBe(true)
    expect(proseStartOffered({ locked: false, storyReady: true, phase: 'writing', statusRead: true })).toBe(false)
  })

  it('확정한 산문은 진행 상태를 읽는 중이어도 잠그지 않는다', () => {
    // 왜: 확정한 산문은 읽고 복사하는 화면이다 — 다시 열 때마다 잠금 화면이 번쩍이면 안 된다(디자이너 QA 1차 #07).
    expect(proseBusy({ draftLive: false, phase: 'before', statusRead: false, requestPending: false })).toBeNull()
  })
})

describe('산문 상태를 읽는 동안(검토 지적 15)', () => {
  it('진행 상태를 읽는 동안에는 잠금 화면을 띄우지 않고 단추와 입력만 막는다', async () => {
    // 왜: 채팅 탭으로 Writer 에 들어올 때마다 다 쓴 산문인데도 "산문 초안을 쓰고 있어요" 잠금 화면이 한 번 깜빡였다.
    const { proseBusy, proseOverlayOpen } = await import('@/lib/prose/busy')
    const checking = proseBusy({ draftLive: true, phase: 'before', statusRead: false, requestPending: false })
    expect(checking).not.toBeNull()
    expect(proseOverlayOpen(checking)).toBe(false)
    expect(proseOverlayOpen({ kind: 'draft', step: 1 })).toBe(true)
    expect(proseOverlayOpen({ kind: 'revise' })).toBe(true)
    expect(proseOverlayOpen(null)).toBe(false)
  })

  it('산문 본문을 읽지 못하면 저장된 씬 요약으로 대신 보인다', async () => {
    // 왜: 미리 보기 읽기가 계속 실패하면 확정 산문이 "불러오는 중…"에 멈췄다 — 예전처럼 저장된 요약이라도 보인다.
    const { proseRunState } = await import('@/lib/prose/busy')
    expect(proseRunState({ preview: null, previewFailed: false })).toBe('loading')
    expect(proseRunState({ preview: null, previewFailed: true })).toBe('none')
    expect(proseRunState({ preview: { started: true, engine: 'v1' }, previewFailed: false })).toBe('started')
    expect(proseRunState({ preview: { started: true, engine: 'v2' }, previewFailed: false })).toBe('none')
    expect(proseRunState({ preview: { started: false }, previewFailed: false })).toBe('none')
  })
})
