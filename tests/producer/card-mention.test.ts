// 카드와 @언급을 고르면 이름과 대상을 헷갈리지 않게 보여준다
import { describe, expect, it } from 'vitest'
import {
  castMentions,
  backgroundMentions,
  activeMentionRefs,
  mentionLabelForModifierClick,
  sceneShotMentionRef,
  sceneShotMentions,
  toggleMentionToken,
} from '@/lib/card-mention'

describe('castMentions (이름이 없는 카드도 화면용 이름을 정한다)', () => {
  it('이름이 있으면 이름과 종류를 함께 안내한다', () => {
    const r = castMentions([
      { localId: 'a', name: '카르타', entityType: 'person' },
      { localId: 'b', name: '은빛 반지', entityType: 'object' },
    ])
    expect(r).toEqual([
      { ref: 'a', label: '카르타', hint: '인물' },
      { ref: 'b', label: '은빛 반지', hint: '사물' },
    ])
  })

  it('이름이 없으면 종류를 드러내는 이름으로 같은 대상을 가리킨다', () => {
    const r = castMentions([{ localId: 'x1', name: '', entityType: 'person' }])
    expect(r[0]).toEqual({ ref: 'x1', label: '이름 미정 인물', hint: '인물' })
  })

  it('같은 종류에 이름 없는 카드가 여러 개면 번호를 붙여 구분한다', () => {
    const r = castMentions([
      { localId: 'p1', entityType: 'person' },
      { localId: 'p2', entityType: 'person' },
      { localId: 'o1', entityType: 'object' },
    ])
    expect(r.map((m) => m.label)).toEqual(['이름 미정 인물', '이름 미정 인물 2', '이름 미정 사물'])
    expect(r.map((m) => m.ref)).toEqual(['p1', 'p2', 'o1'])
  })

  it('배경 이름이 없으면 화면에서 구분할 이름을 대신 붙인다', () => {
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

describe('activeMentionRefs (입력에 적힌 @언급 대상을 가려낸다)', () => {
  const items = [
    { ref: 'a', label: '카르타' },
    { ref: 'p1', label: '이름 미정 인물' },
    { ref: 'p2', label: '이름 미정 인물 2' },
  ]
  it('글에 적힌 @언급 대상만 찾아낸다', () => {
    expect(activeMentionRefs('@카르타 외모 바꿔줘', items)).toEqual(['a'])
  })
  it('@언급을 지우면 해당 카드가 더 이상 선택되지 않는다', () => {
    expect(activeMentionRefs('외모 바꿔줘', items)).toEqual([])
  })
  it('번호가 붙은 이름을 입력하면 비슷한 이름의 카드와 섞지 않는다', () => {
    expect(activeMentionRefs('@이름 미정 인물 2 이름 정해줘', items)).toEqual(['p2'])
  })
  it('서로 다른 @언급을 여러 개 적으면 모두 찾아낸다', () => {
    expect(activeMentionRefs('@카르타 와 @이름 미정 인물 비교', items).sort()).toEqual(['a', 'p1'])
  })
})

describe('toggleMentionToken (대본 줄을 눌러 @언급을 넣고 뺀다)', () => {
  it('입력이 비어 있으면 선택한 대상을 한 칸 띄워 넣는다', () => {
    expect(toggleMentionToken('', 'L5')).toBe('@L5 ')
  })

  it('기존 글 뒤에 대상을 한 칸 띄워 덧붙인다', () => {
    expect(toggleMentionToken('이거 고쳐줘', 'L5')).toBe('이거 고쳐줘 @L5 ')
    expect(toggleMentionToken('앞 @L3 ', 'L5')).toBe('앞 @L3 @L5 ')
  })

  it('같은 대상을 다시 누르면 @언급을 빼고 띄어쓰기를 정돈한다', () => {
    expect(toggleMentionToken('@L5 ', 'L5')).toBe('')
    expect(toggleMentionToken('앞 @L5 뒤', 'L5')).toBe('앞 뒤')
    expect(toggleMentionToken('@L5 @L6 ', 'L5')).toBe('@L6')
  })

  it('L5를 다시 눌러도 비슷한 L51은 건드리지 않는다', () => {
    // L5 없음 → 붙임 (L51 을 L5 로 오인해 지우지 않는다)
    expect(toggleMentionToken('@L51 고쳐', 'L5')).toBe('@L51 고쳐 @L5 ')
    // 둘 다 있을 때 L5 만 제거, L51 보존
    expect(toggleMentionToken('@L5 @L51 ', 'L5')).toBe('@L51')
  })
})

describe('장면과 샷을 언급한다', () => {
  // #internal-id-scrub(2026-08-26, 오너 E5): 옛 계약("라벨에 id 포함으로 중복 구분")을 뒤집는다 —
  //   내부 id 는 어떤 사용자 표면에도 안 보인다. 식별은 ref 가 전담하고, 규칙 생성명(Scene N ·
  //   Shot N.M)은 구조상 유일해 실사용 중복이 없다(합성 중복 라벨은 라벨 충돌을 허용).
  it('화면 이름에 내부 식별값을 넣지 않고 같은 이름도 따로 구분한다', () => {
    const mentions = sceneShotMentions([
      { kind: 'scene', id: 'sc_a', label: 'Scene 1' },
      { kind: 'scene', id: 'sc_b', label: 'Scene 1' },
      { kind: 'shot', id: 'sh_a', label: 'Shot 1' },
    ])
    expect(mentions.map((item) => item.label)).toEqual(['Scene 1', 'Scene 1', 'Shot 1'])
    for (const item of mentions) {
      expect(item.label).not.toMatch(/\b(sc|sh)_[a-z0-9]/i)
    }
    expect(mentions.map((item) => item.ref)).toEqual([
      sceneShotMentionRef('writer', 'scene', 'sc_a'),
      sceneShotMentionRef('writer', 'scene', 'sc_b'),
      sceneShotMentionRef('writer', 'shot', 'sh_a'),
    ])
    expect(activeMentionRefs(`@${mentions[2].label}`, mentions)).toEqual([mentions[2].ref])
    expect(activeMentionRefs('@Scene 9', mentions)).toEqual([])
  })

  it('Director Previz와 Real 대상을 서로 따로 구분한다', () => {
    const targets = [{ kind: 'shot' as const, id: 'sh_1', label: 'Shot 1' }]
    const previz = sceneShotMentions(targets, 'previz')[0]
    const real = sceneShotMentions(targets, 'real')[0]
    expect(previz.label).toContain('Previz')
    expect(real.label).toContain('Real')
    expect(previz.ref).not.toBe(real.ref)
  })

  it('알려진 대상을 보조키와 함께 누를 때만 이름을 돌려준다', () => {
    const target = { ref: 'writer:shot:sh_1', label: 'Shot Shot 1 · sh_1', hint: '샷' }
    expect(mentionLabelForModifierClick({ ctrlKey: true, metaKey: false }, target)).toBe(
      target.label,
    )
    expect(mentionLabelForModifierClick({ ctrlKey: false, metaKey: false }, target)).toBeNull()
    expect(mentionLabelForModifierClick({ ctrlKey: true, metaKey: false }, null)).toBeNull()
  })
})
