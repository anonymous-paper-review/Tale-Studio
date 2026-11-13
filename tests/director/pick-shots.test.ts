// Director 카드 · 노드 몸통을 눌러 샷을 고르고, 위쪽 단추 · 예상이 고른 샷 기준이 되는지 (시안 D2 406:4588 · R 416:4941, 오너 2026-11-14)
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', async () => {
  const { translate } = await import('@/lib/i18n/translate')
  return { translate, useT: () => (text: string, params?: Record<string, string | number>) => translate('ko', text, params) }
})

import { useDirectorCanvasStore } from '@/stores/director-store'
import { effectivePickedIds, imageButtonMode, nextPickAll, remakeImageShotIds } from '@/lib/director/toolbar-work'
import { PickAllBar } from '@/features/director/shot-status'
import type { DirectorShotState } from '@/lib/director/shot-state'

beforeEach(() => {
  useDirectorCanvasStore.setState({ projectId: 'p1', pickedShotIds: [] })
})

describe('고르기', () => {
  it('카드를 눌러 고르면 고른 샷에 들어가고, 다시 누르면 빠진다', () => {
    // 왜: 시안 D2 "카드를 눌러 고르기" · R "카드·노드 몸통 = 고르기".
    const store = useDirectorCanvasStore.getState()
    store.togglePickedShot('a')
    store.togglePickedShot('b')
    expect(useDirectorCanvasStore.getState().pickedShotIds).toEqual(['a', 'b'])
    useDirectorCanvasStore.getState().togglePickedShot('a')
    expect(useDirectorCanvasStore.getState().pickedShotIds).toEqual(['b'])
  })

  it('다른 프로젝트로 가면 고름이 풀린다', () => {
    // 왜: 고름은 한때 쓰는 것이라 저장하지 않는다(혼자 정한 것 d).
    useDirectorCanvasStore.getState().setPickedShots(['a', 'b'])
    useDirectorCanvasStore.getState().setProjectId('p2')
    expect(useDirectorCanvasStore.getState().pickedShotIds).toEqual([])
  })

  it('전체 체크는 보이는 샷을 모두 고르고, 이미 모두 골랐으면 고름을 푼다', () => {
    // 왜: 시안 D2 "4개 중 4개 선택".
    expect(nextPickAll(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c'])
    expect(nextPickAll(['a', 'b', 'c'], ['a'])).toEqual(['a', 'b', 'c'])
    expect(nextPickAll(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([])
  })

  it('상태 고르기로 숨긴 샷은 고름에서 빠진다', () => {
    // 왜: 안 보이는 샷을 만들지 않게(혼자 정한 것 c).
    expect([...effectivePickedIds(['a', 'b', 'c'], ['a', 'c'])]).toEqual(['a', 'c'])
  })
})

describe('고른 샷 기준 단추', () => {
  const states = new Map<string, DirectorShotState>([
    ['a', 'image_needed'],
    ['b', 'image_done'],
    ['c', 'video_done'],
    ['d', 'image_generating'],
  ])

  it('고른 샷에 이미지가 없는 샷이 있으면 [이미지 만들기]는 그 샷만 만든다', () => {
    // 왜: 시안 D2 "위 버튼이 고른 샷에만" — 결정 페이지 추천(고른 샷 중 이미지 없는 샷만).
    expect(imageButtonMode(states, new Set(['a', 'b']))).toEqual({ mode: 'make', shotIds: ['a'] })
  })

  it('고른 샷이 모두 이미지가 있으면 [이미지 다시 만들기 · N]이 되어 고른 샷을 다시 만든다', () => {
    // 왜: 8/27 오너 "하나씩 하는 거 짜쳐서 전체 재생성" 길을 고르기로 남긴다(전체 체크 → 다시 만들기). 만드는 중인 샷은 빼고 센다.
    expect(remakeImageShotIds(states, new Set(['b', 'c', 'd']))).toEqual(['b', 'c'])
    expect(imageButtonMode(states, new Set(['b', 'c', 'd']))).toEqual({ mode: 'remake', shotIds: ['b', 'c'] })
  })

  it('아무것도 고르지 않았으면 [이미지 만들기]는 이미지가 없는 샷 전부를 센다', () => {
    // 왜: 시안 D1 "이미지 만들기 · 4".
    expect(imageButtonMode(states, new Set())).toEqual({ mode: 'make', shotIds: ['a'] })
  })
})

describe('2줄 왼쪽 고르기 줄', () => {
  it('고른 샷이 없으면 "전체 N개", 있으면 "N개 중 M개 선택"과 [선택 풀기]를 보인다', () => {
    // 왜: 시안 D1 "전체 4개" · D2 "4개 중 4개 선택 [선택 풀기]".
    const none = renderToStaticMarkup(createElement(PickAllBar, { total: 4, picked: 0, onToggleAll: () => {}, onClear: () => {} }))
    expect(none).toContain('전체 4개')
    expect(none).not.toContain('선택 풀기')
    const some = renderToStaticMarkup(createElement(PickAllBar, { total: 4, picked: 2, onToggleAll: () => {}, onClear: () => {} }))
    expect(some).toContain('4개 중 2개 선택')
    expect(some).toContain('선택 풀기')
    expect(some).toContain('aria-checked="mixed"')
  })
})
