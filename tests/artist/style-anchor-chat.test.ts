// D12 — 채팅이 이름/느낌으로 고른 스타일 앵커 키를 카탈로그 검증 후 즉시 반영한다 (2026-08-31 오너).
//   "스타일 피커에서 골라주세요"라고 사용자를 앱 화면으로 되돌려보내던 것의 대체 경로.
import { beforeEach, describe, expect, it } from 'vitest'
import { useProducerStore, type StyleAnchor } from '@/stores/producer-store'

const catalog: StyleAnchor[] = [
  {
    key: 'jp_anime',
    label: '일본 애니',
    medium: '2d_anime',
    imageUrl: null,
    previewUrl: null,
    subtitle: null,
  },
  {
    key: 'real_jp_melo',
    label: '일본 멜로',
    medium: 'live_action',
    imageUrl: null,
    previewUrl: null,
    subtitle: 'Japanese melodrama grade',
  },
]

beforeEach(() => {
  useProducerStore.getState().reset()
})

describe('applyStyleAnchorKeyFromChat', () => {
  it('applies a catalog key through setStyleAnchor', async () => {
    const applied: Array<string | null> = []
    useProducerStore.setState({
      styleAnchors: catalog,
      setStyleAnchor: async (key) => {
        applied.push(key)
      },
    })

    const outcome = await useProducerStore.getState().applyStyleAnchorKeyFromChat('jp_anime')

    expect(outcome).toBe('applied')
    expect(applied).toEqual(['jp_anime'])
  })

  it('rejects a key the catalog does not have — the model must not invent anchors', async () => {
    const applied: Array<string | null> = []
    useProducerStore.setState({
      styleAnchors: catalog,
      setStyleAnchor: async (key) => {
        applied.push(key)
      },
      // 카탈로그가 이미 실려 있으므로 loadStyleAnchors 는 호출되지 않아야 한다.
      loadStyleAnchors: async () => {
        throw new Error('should not reload a loaded catalog')
      },
    })

    const outcome = await useProducerStore
      .getState()
      .applyStyleAnchorKeyFromChat('ghibli_style_invented')

    expect(outcome).toBe('unknown_key')
    expect(applied).toEqual([])
  })
})
