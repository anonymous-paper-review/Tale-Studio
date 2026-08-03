import { describe, expect, it } from 'vitest'
import {
  slideDirectionBetween,
  stageIndexFromPathname,
} from '@/lib/stage-transition'

describe('stageIndexFromPathname', () => {
  it('스테이지 경로를 파이프라인 순서로 해석한다', () => {
    expect(stageIndexFromPathname('/studio/producer')).toBe(0)
    expect(stageIndexFromPathname('/studio/writer')).toBe(1)
    expect(stageIndexFromPathname('/studio/editor')).toBe(4)
  })
  it('쿼리·하위 경로가 붙어도 startsWith 로 매칭된다', () => {
    expect(stageIndexFromPathname('/studio/director')).toBe(3)
  })
  it('비스테이지 경로는 -1', () => {
    expect(stageIndexFromPathname('/login')).toBe(-1)
  })
})

describe('slideDirectionBetween', () => {
  it('순방향(파이프라인 진행)은 forward — 오른쪽에서 들어온다', () => {
    expect(slideDirectionBetween(0, 1)).toBe('forward')
    expect(slideDirectionBetween(0, 4)).toBe('forward')
  })
  it('역방향은 back — 왼쪽에서 들어온다', () => {
    expect(slideDirectionBetween(3, 0)).toBe('back')
  })
  it('초기 진입(이전 없음)·같은 stage·비스테이지는 연출 없음', () => {
    expect(slideDirectionBetween(null, 2)).toBe('none')
    expect(slideDirectionBetween(2, 2)).toBe('none')
    expect(slideDirectionBetween(-1, 2)).toBe('none')
    expect(slideDirectionBetween(2, -1)).toBe('none')
  })
})
