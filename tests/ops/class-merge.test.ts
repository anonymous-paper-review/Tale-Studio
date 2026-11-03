// v3 글자 크기 · 그림자 이름(text-label · shadow-panel 등)이 글자 색 · 다른 그림자와 함께 쓰여도 클래스 합치기에서 지워지지 않는지 검사한다 (2026-11-03 v3 디자인)
import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'

describe('클래스 합치기(cn)', () => {
  it('v3 글자 크기 이름은 글자 색과 같이 써도 둘 다 남는다', () => {
    // 왜: 합치기 도구는 모르는 text-* 이름을 글자 색으로 본다 — text-label 과 text-foreground 를 같이 쓰면 글자 크기가 소리 없이 사라진다.
    for (const size of ['text-tag', 'text-micro', 'text-meta', 'text-caption', 'text-label', 'text-chat', 'text-body', 'text-prose', 'text-title', 'text-display']) {
      expect(cn(size, 'text-foreground').split(' '), size).toEqual([size, 'text-foreground'])
      expect(cn('text-subtle-foreground', size).split(' '), size).toEqual(['text-subtle-foreground', size])
    }
  })

  it('v3 글자 크기끼리는 뒤의 것이 이긴다', () => {
    // 왜: 컴포넌트 기본 크기(text-label)를 쓰는 곳에서 className 으로 바꾸면(text-caption) 바꾼 쪽이 보여야 한다.
    expect(cn('text-label', 'text-caption')).toBe('text-caption')
    expect(cn('text-base md:text-label', 'text-chat')).toBe('md:text-label text-chat')
  })

  it('v3 그림자 이름은 다른 그림자를 덮고, 그림자 색과는 함께 남는다', () => {
    // 왜: shadow-panel 을 그림자 색으로 잘못 읽으면 shadow-sm 과 둘 다 남거나, 색과 겹쳐 지워진다.
    expect(cn('shadow-sm', 'shadow-panel')).toBe('shadow-panel')
    expect(cn('shadow-panel', 'shadow-black/40').split(' ')).toEqual(['shadow-panel', 'shadow-black/40'])
  })

  it('v3 그라데이션 바탕(bg-stage-badge 등)은 바탕색 · 글자 색과 같이 써도 지워지지 않는다', () => {
    // 왜: 합치기 도구가 bg-stage-badge 를 바탕색으로 보면, 뒤에 bg-card 같은 바탕색이 오거나 앞에 있을 때 둘 중 하나를 지운다.
    for (const image of ['bg-stage-badge', 'bg-stage-gradient', 'bg-pearl-vivid', 'bg-art-placeholder']) {
      expect(cn(image, 'bg-card').split(' '), image).toEqual([image, 'bg-card'])
      expect(cn('bg-card', image).split(' '), image).toEqual(['bg-card', image])
    }
    expect(cn('text-gradient', 'text-foreground').split(' ')).toEqual(['text-gradient', 'text-foreground'])
  })
})
