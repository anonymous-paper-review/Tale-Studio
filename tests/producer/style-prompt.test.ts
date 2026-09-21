// 복원 시점과 새 기획의 준비 전환을 구분해 필요한 때만 스타일 창을 연다.
import { describe, expect, it } from 'vitest'
import { becameReadyForStyle, stylePromptDecision } from '@/lib/producer-style-prompt'

const ready = { projectId: 'p1', loaded: true, storyReady: true, reachedStage: 'producer', styleAnchorKey: null }
const idle = { projectId: 'p1', stage: 'producer', loading: false, approvalBusy: false, hasStyle: false, catalogReady: true }
describe('스타일 창 표시 시점', () => {
  it('복원된 프로젝트는 준비 완료여도 스타일 창을 자동으로 열지 않는다', () => {
    expect(becameReadyForStyle(null, ready)).toBe(false)
    expect(becameReadyForStyle({ ...ready, loaded: false, storyReady: false }, ready)).toBe(false)
    expect(becameReadyForStyle(ready, ready)).toBe(false)
  })
  it('같은 새 기획에서 이야기가 준비되는 순간에만 스타일을 안내한다', () => {
    const previous = { ...ready, storyReady: false }
    expect(becameReadyForStyle(previous, ready)).toBe(true)
    expect(becameReadyForStyle(previous, { ...ready, reachedStage: 'artist' })).toBe(false)
    expect(becameReadyForStyle(previous, { ...ready, styleAnchorKey: 'watercolor' })).toBe(false)
    expect(becameReadyForStyle(previous, { ...ready, projectId: 'p2' })).toBe(false)
  })
  it('응답과 목록 로딩 중에는 기다리고 승인 처리 중에는 자동 안내를 폐기한다', () => {
    expect(stylePromptDecision('p1', idle)).toBe('open')
    expect(stylePromptDecision('p1', { ...idle, loading: true })).toBe('wait')
    expect(stylePromptDecision('p1', { ...idle, catalogReady: false })).toBe('wait')
    expect(stylePromptDecision('p1', { ...idle, approvalBusy: true })).toBe('discard')
  })
  it('이전 프로젝트나 다른 단계의 안내와 이미 선택한 스타일 안내는 폐기한다', () => {
    expect(stylePromptDecision('p2', idle)).toBe('discard')
    expect(stylePromptDecision('p1', { ...idle, stage: 'writer' })).toBe('discard')
    expect(stylePromptDecision('p1', { ...idle, hasStyle: true })).toBe('discard')
  })
})
