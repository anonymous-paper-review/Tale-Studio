import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTION_GUARD_MS,
  claimAction,
  releaseAction,
  resetActionGuard,
} from '@/lib/action-guard'

describe('claimAction — 연타 방어 창', () => {
  beforeEach(() => resetActionGuard())

  it('첫 요청은 통과시킨다', () => {
    expect(claimAction('storyboard:shot-1', 1_000)).toBe(true)
  })

  it('창 안의 두 번째 요청은 버린다', () => {
    claimAction('storyboard:shot-1', 1_000)
    expect(claimAction('storyboard:shot-1', 1_000)).toBe(false)
    expect(claimAction('storyboard:shot-1', 1_999)).toBe(false)
  })

  it('창이 지나면 다시 통과시킨다', () => {
    claimAction('storyboard:shot-1', 1_000)
    expect(claimAction('storyboard:shot-1', 1_000 + ACTION_GUARD_MS)).toBe(true)
  })

  it('창은 키마다 따로다 — 다른 샷은 서로를 막지 않는다', () => {
    expect(claimAction('storyboard:shot-1', 1_000)).toBe(true)
    expect(claimAction('storyboard:shot-2', 1_000)).toBe(true)
  })

  it('같은 키면 어느 버튼에서 왔든 같은 창을 공유한다', () => {
    // 캔버스 노드와 그리드 카드가 같은 샷의 생성을 가리키는 상황.
    expect(claimAction('storyboard:shot-1', 1_000)).toBe(true)
    expect(claimAction('storyboard:shot-1', 1_050)).toBe(false)
  })

  it('버튼 층(ui:)과 store 층은 서로의 창을 막지 않는다', () => {
    // 두 층이 같은 키를 쓰면 훅이 창을 잡은 직후 store 가 자기 창에 막혀 생성이 아예
    //   시작되지 않는다. useGuardedAction 이 ui: 네임스페이스를 강제하는 이유.
    expect(claimAction('ui:artist:character:c1:main', 1_000)).toBe(true)
    expect(claimAction('artist:character:c1:main', 1_000)).toBe(true)
  })

  it('막힌 요청은 창을 연장하지 않는다 — 연타 중에도 첫 클릭 기준으로 만료된다', () => {
    claimAction('storyboard:shot-1', 1_000)
    claimAction('storyboard:shot-1', 1_400) // 버려짐
    claimAction('storyboard:shot-1', 1_800) // 버려짐
    expect(claimAction('storyboard:shot-1', 2_000)).toBe(true)
  })

  it('release 하면 창이 남아 있어도 즉시 다시 통과한다 (실패 후 재시도)', () => {
    claimAction('storyboard:shot-1', 1_000)
    releaseAction('storyboard:shot-1')
    expect(claimAction('storyboard:shot-1', 1_010)).toBe(true)
  })

  it('키가 많이 쌓이면 만료된 것만 정리하고 살아있는 창은 지키지 않는다', () => {
    for (let i = 0; i < 600; i++) claimAction(`old:${i}`, 1_000)
    // 창이 지난 뒤 새 키를 넣으면 옛 키들이 정리된다.
    expect(claimAction('fresh', 1_000 + ACTION_GUARD_MS)).toBe(true)
    // 정리 후에도 판정은 그대로 — 방금 넣은 키는 여전히 막힌다.
    expect(claimAction('fresh', 1_000 + ACTION_GUARD_MS)).toBe(false)
  })
})
