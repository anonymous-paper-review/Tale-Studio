// Lumi 채팅 말풍선에서 id 를 이름으로 바꿀 때 이름(The Keeper)의 관사가 겹치지 않는지 검사한다
import { describe, expect, it } from 'vitest'
import { scrubInternalIdsInProse } from '@/lib/display-names'

const NAMES = new Map([['keeper', 'The Keeper'], ['char_1', 'Mina']])

describe('채팅 말풍선 이름', () => {
  // 왜: 리드 2026-11-10(B2 추가) — 말풍선은 id 를 차례로 바꿔 "the keeper" → "the The Keeper", "The keeper" → "The The Keeper"가 됐다.
  it('채팅 말풍선의 id 를 이름으로 바꿀 때 관사가 겹치지 않고 이미 쓴 이름은 그대로 둔다', () => {
    expect(scrubInternalIdsInProse('I think the keeper should fix the radio.', NAMES)).toBe('I think The Keeper should fix the radio.')
    expect(scrubInternalIdsInProse('The keeper smiles.', NAMES)).toBe('The Keeper smiles.')
    expect(scrubInternalIdsInProse('The Keeper smiles at char_1.', NAMES)).toBe('The Keeper smiles at Mina.')
  })
})
