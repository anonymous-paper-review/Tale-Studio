import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useArtistStore } from '@/stores/artist-store'
import { computeImageSourceHash, computeLookFingerprint } from '@/lib/image-provenance'
import type { CharacterAsset } from '@/types/asset'

// refreshLookPendingDrafts(온보딩 "진행" 단일 진입점): look-pending 초안 + writer-추가 무이미지
//   캐릭터의 main 만 재생성 대상으로 골라 generateCharacterView('main') 호출. fresh/object-아님 무관.

const A = '백금발 소녀'
const lookV1 = computeLookFingerprint({ l1: { art_style: 'dark_gothic' } }, null)!
const apptA = computeImageSourceHash(A, null) // 외형-only (= 핸드오프 초안 source/appearance hash)

function mkChar(over: Partial<CharacterAsset> & { characterId: string }): CharacterAsset {
  return {
    name: over.characterId,
    views: { main: null, back: null, sideLeft: null, sideRight: null },
    entityType: 'person',
    viewCandidates: {},
    fixedPrompt: A,
    ...over,
  } as CharacterAsset
}

describe('refreshLookPendingDrafts', () => {
  beforeEach(() => {
    useArtistStore.setState({ characterAssets: [] })
  })

  it('look-pending 초안 + writer-무이미지만 main 재생성, fresh/producer-무이미지 제외', async () => {
    const calls: Array<[string, string]> = []
    // generateCharacterView 스텁 — 실제 fetch 대신 호출 기록.
    useArtistStore.setState({
      generateCharacterView: (async (id: string, view: string) => {
        calls.push([id, view])
      }) as never,
      characterAssets: [
        // look-pending: 룩 도착 전 초안(source=appearance-only), 현재 룩 lookV1 → stale=look-pending
        mkChar({
          characterId: 'lookpending',
          lookFingerprint: lookV1,
          views: { main: 'u', back: null, sideLeft: null, sideRight: null },
          viewCandidates: { main: [{ id: 'c1', url: 'u', sourceHash: apptA, appearanceHash: apptA, isSelected: true, generatedAt: '2026-01-01' }] },
        }),
        // fresh: 현재 룩으로 만든 후보 → stale 아님 → 제외
        mkChar({
          characterId: 'fresh',
          lookFingerprint: lookV1,
          views: { main: 'u', back: null, sideLeft: null, sideRight: null },
          viewCandidates: { main: [{ id: 'c2', url: 'u', sourceHash: computeImageSourceHash(A, lookV1), appearanceHash: apptA, isSelected: true, generatedAt: '2026-01-01' }] },
        }),
        // writer-추가 무이미지 → 포함
        mkChar({ characterId: 'writernew', origin: 'writer', lookFingerprint: lookV1 }),
        // producer 무이미지(후보 없음) → classify fresh(sourceHash null), writerNoMain false → 제외
        mkChar({ characterId: 'producernew', origin: 'producer', lookFingerprint: lookV1 }),
      ],
    })

    await useArtistStore.getState().refreshLookPendingDrafts()

    const ids = calls.map((c) => c[0]).sort()
    expect(ids).toEqual(['lookpending', 'writernew'])
    expect(calls.every((c) => c[1] === 'main')).toBe(true)
  })

  it('대상 없으면 아무 것도 호출 안 함', async () => {
    const fn = vi.fn(async () => {})
    useArtistStore.setState({
      generateCharacterView: fn as never,
      characterAssets: [
        mkChar({
          characterId: 'fresh',
          lookFingerprint: lookV1,
          views: { main: 'u', back: null, sideLeft: null, sideRight: null },
          viewCandidates: { main: [{ id: 'c', url: 'u', sourceHash: computeImageSourceHash(A, lookV1), appearanceHash: apptA, isSelected: true, generatedAt: '2026-01-01' }] },
        }),
      ],
    })
    await useArtistStore.getState().refreshLookPendingDrafts()
    expect(fn).not.toHaveBeenCalled()
  })
})
