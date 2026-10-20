// 모습 그림을 다시 만들면 "최종 룩 반영 전 초안"으로 보이지 않고, 설명을 고치면 "바뀜"으로 보인다 (2026-10-20 팝업 e2e 에서 발견)
import { describe, expect, it } from 'vitest'
import { classifyLookImageStale, computeImageSourceHash, computeLookFingerprint } from '@/lib/image-provenance'

// 지금 저장 방식(Writer v2)은 인물의 의상 칸을 비워 두고 모습에만 의상을 둔다.
//   처음 자동으로 그린 그림은 인물 의상(빈칸)으로, 팝업 · 카드에서 다시 만든 그림은 그 모습의 의상으로 지문을 남긴다.
const tokens = { l1: { art_style: 'flat 2D anime' } }
const characterLook = computeLookFingerprint(tokens, null, 'jp_anime')
const appearanceLook = computeLookFingerprint(tokens, ['구겨진 흰색 와이셔츠', '풀린 네이비 블루 넥타이'], 'jp_anime')
const text = 'Tired office worker in his 30s with messy hair.'
const madeWith = (look: string | null, appearance = text) => ({
  sourceHash: computeImageSourceHash(appearance, look),
  appearanceHash: computeImageSourceHash(appearance, null),
})

describe('모습 그림의 상태', () => {
  it('팝업이나 카드에서 다시 만든 그림은 "최종 룩 반영 전 초안"으로 보이지 않는다', () => {
    // 왜: 다시 만든 그림에 늘 "재생성하면 최종 그림체로 다시 만들어요"가 붙어, 다시 만들어도 안내가 사라지지 않았다.
    //   고장: Writer v2 로 만든 프로젝트에서 인물 그림을 [다시 만들기]로 그린 뒤 상세를 열 때.
    expect(classifyLookImageStale(text, [characterLook, appearanceLook], madeWith(appearanceLook))).toBe('fresh')
  })

  it('처음 자동으로 그린 그림도 그대로 최신으로 본다', () => {
    // 왜: 정상 경로 고정 — 이번 수정으로 이미 있는 그림에 새 안내가 붙지 않는다.
    expect(classifyLookImageStale(text, [characterLook, appearanceLook], madeWith(characterLook))).toBe('fresh')
  })

  it('설명을 고치면 어느 쪽으로 그린 그림이든 "바뀜 · 다시 만들어야 반영"으로 본다', () => {
    // 왜: 팝업에서 설명을 고쳐 [적용]하면 그림은 그대로 두고 바뀐 것만 알린다(프로토타입 A7).
    const edited = 'Tired office worker in his 30s with messy hair and glasses.'
    expect(classifyLookImageStale(edited, [characterLook, appearanceLook], madeWith(appearanceLook))).toBe('edited')
    expect(classifyLookImageStale(edited, [characterLook, appearanceLook], madeWith(characterLook))).toBe('edited')
  })

  it('작품 스타일을 바꾸면 그 전에 그린 그림은 "최종 룩 반영 전 초안"으로 본다', () => {
    // 왜: 정상 경로 고정 — 스타일을 바꾼 뒤의 그림 갱신 안내(Q5)는 그대로다.
    const otherStyle = [computeLookFingerprint(tokens, null, 'watercolor'), computeLookFingerprint(tokens, ['구겨진 흰색 와이셔츠', '풀린 네이비 블루 넥타이'], 'watercolor')]
    expect(classifyLookImageStale(text, otherStyle, madeWith(appearanceLook))).toBe('look-pending')
  })
})
