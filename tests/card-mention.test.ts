import { describe, expect, it } from 'vitest'
import {
  castMentions,
  backgroundMentions,
  activeMentionRefs,
  toggleMentionToken,
} from '@/lib/card-mention'

describe('castMentions (@mention labels incl. empty cards)', () => {
  it('uses the name when present, type as hint', () => {
    const r = castMentions([
      { localId: 'a', name: '카르타', entityType: 'person' },
      { localId: 'b', name: '은빛 반지', entityType: 'object' },
    ])
    expect(r).toEqual([
      { ref: 'a', label: '카르타', hint: '인물' },
      { ref: 'b', label: '은빛 반지', hint: '사물' },
    ])
  })

  it('gives unnamed cards a fallback label and keeps stable ref', () => {
    const r = castMentions([{ localId: 'x1', name: '', entityType: 'person' }])
    expect(r[0]).toEqual({ ref: 'x1', label: '이름 미정 인물', hint: '인물' })
  })

  it('disambiguates multiple unnamed of same type with an index', () => {
    const r = castMentions([
      { localId: 'p1', entityType: 'person' },
      { localId: 'p2', entityType: 'person' },
      { localId: 'o1', entityType: 'object' },
    ])
    expect(r.map((m) => m.label)).toEqual(['이름 미정 인물', '이름 미정 인물 2', '이름 미정 사물'])
    expect(r.map((m) => m.ref)).toEqual(['p1', 'p2', 'o1'])
  })

  it('backgroundMentions falls back for unnamed backgrounds', () => {
    const r = backgroundMentions([
      { localId: 'b1', name: '네온 골목' },
      { localId: 'b2', name: '' },
    ])
    expect(r).toEqual([
      { ref: 'b1', label: '네온 골목', hint: '배경' },
      { ref: 'b2', label: '이름 미정 배경', hint: '배경' },
    ])
  })
})

describe('activeMentionRefs (input text -> mentioned card refs)', () => {
  const items = [
    { ref: 'a', label: '카르타' },
    { ref: 'p1', label: '이름 미정 인물' },
    { ref: 'p2', label: '이름 미정 인물 2' },
  ]
  it('extracts refs for @mentions present in the text', () => {
    expect(activeMentionRefs('@카르타 외모 바꿔줘', items)).toEqual(['a'])
  })
  it('returns empty when the mention is removed', () => {
    expect(activeMentionRefs('외모 바꿔줘', items)).toEqual([])
  })
  it('does not confuse a prefix label with the longer indexed one', () => {
    expect(activeMentionRefs('@이름 미정 인물 2 이름 정해줘', items)).toEqual(['p2'])
  })
  it('handles multiple distinct mentions', () => {
    expect(activeMentionRefs('@카르타 와 @이름 미정 인물 비교', items).sort()).toEqual(['a', 'p1'])
  })
})

describe('toggleMentionToken (script line click add/remove)', () => {
  it('appends the token to empty input', () => {
    expect(toggleMentionToken('', 'L5')).toBe('@L5 ')
  })

  it('appends after existing text with a single separating space', () => {
    expect(toggleMentionToken('이거 고쳐줘', 'L5')).toBe('이거 고쳐줘 @L5 ')
    expect(toggleMentionToken('앞 @L3 ', 'L5')).toBe('앞 @L3 @L5 ')
  })

  it('removes the token on re-toggle and tidies whitespace', () => {
    expect(toggleMentionToken('@L5 ', 'L5')).toBe('')
    expect(toggleMentionToken('앞 @L5 뒤', 'L5')).toBe('앞 뒤')
    expect(toggleMentionToken('@L5 @L6 ', 'L5')).toBe('@L6')
  })

  it('is prefix-safe: toggling L5 never touches L51', () => {
    // L5 없음 → 붙임 (L51 을 L5 로 오인해 지우지 않는다)
    expect(toggleMentionToken('@L51 고쳐', 'L5')).toBe('@L51 고쳐 @L5 ')
    // 둘 다 있을 때 L5 만 제거, L51 보존
    expect(toggleMentionToken('@L5 @L51 ', 'L5')).toBe('@L51')
  })
})
