// 빠르게 같은 작업을 눌러도 중복 요청을 막고, 다른 샷의 요청은 따로 처리한다
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTION_GUARD_MS,
  claimAction,
  releaseAction,
  resetActionGuard,
} from '@/lib/action-guard'

describe('claimAction — 빠른 중복 요청 방지', () => {
  beforeEach(() => resetActionGuard())

  it('처음 누른 요청은 통과시킨다', () => {
    expect(claimAction('storyboard:shot-1', 1_000)).toBe(true)
  })

  it('같은 작업을 빠르게 다시 누르면 두 번째 요청은 막는다', () => {
    claimAction('storyboard:shot-1', 1_000)
    expect(claimAction('storyboard:shot-1', 1_000)).toBe(false)
    expect(claimAction('storyboard:shot-1', 1_999)).toBe(false)
  })

  it('잠시 기다린 뒤 다시 누르면 요청을 통과시킨다', () => {
    claimAction('storyboard:shot-1', 1_000)
    expect(claimAction('storyboard:shot-1', 1_000 + ACTION_GUARD_MS)).toBe(true)
  })

  it('서로 다른 샷이면 각 요청을 모두 통과시킨다', () => {
    expect(claimAction('storyboard:shot-1', 1_000)).toBe(true)
    expect(claimAction('storyboard:shot-2', 1_000)).toBe(true)
  })

  it('같은 샷을 어느 버튼에서 눌러도 짧은 중복 방지 시간을 함께 적용한다', () => {
    // 캔버스 노드와 그리드 카드가 같은 샷의 생성을 가리키는 상황.
    expect(claimAction('storyboard:shot-1', 1_000)).toBe(true)
    expect(claimAction('storyboard:shot-1', 1_050)).toBe(false)
  })

  it('화면 버튼과 내부 작업이 같은 샷이어도 서로의 요청을 막지 않는다', () => {
    // 두 층이 같은 키를 쓰면 훅이 창을 잡은 직후 store 가 자기 창에 막혀 생성이 아예
    //   시작되지 않는다. useGuardedAction 이 ui: 네임스페이스를 강제하는 이유.
    expect(claimAction('ui:artist:character:c1:main', 1_000)).toBe(true)
    expect(claimAction('artist:character:c1:main', 1_000)).toBe(true)
  })

  it('막힌 요청은 중복 방지 시간을 늘리지 않아 처음 누른 뒤 정해진 때 다시 허용한다', () => {
    claimAction('storyboard:shot-1', 1_000)
    claimAction('storyboard:shot-1', 1_400) // 버려짐
    claimAction('storyboard:shot-1', 1_800) // 버려짐
    expect(claimAction('storyboard:shot-1', 2_000)).toBe(true)
  })

  it('실패한 요청을 마치면 곧바로 다시 시도할 수 있다 (실패 후 재시도)', () => {
    claimAction('storyboard:shot-1', 1_000)
    releaseAction('storyboard:shot-1')
    expect(claimAction('storyboard:shot-1', 1_010)).toBe(true)
  })

  it('요청 기록이 많이 쌓여도 지난 기록만 치우고 아직 유효한 요청은 지킨다', () => {
    for (let i = 0; i < 600; i++) claimAction(`old:${i}`, 1_000)
    // 창이 지난 뒤 새 키를 넣으면 옛 키들이 정리된다.
    expect(claimAction('fresh', 1_000 + ACTION_GUARD_MS)).toBe(true)
    // 정리 후에도 판정은 그대로 — 방금 넣은 키는 여전히 막힌다.
    expect(claimAction('fresh', 1_000 + ACTION_GUARD_MS)).toBe(false)
  })
})
