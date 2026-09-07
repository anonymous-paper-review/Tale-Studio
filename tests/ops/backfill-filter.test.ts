// 화면에 보여야 하는 그림만 작은 미리보기로 만들고 임시 자료는 제외한다
import { describe, it, expect } from 'vitest'
import { shouldBackfill, shouldDeleteThumb } from '../../scripts/backfill-filter.mjs'

// 소급 썸네일 생성 대상 필터 — 화면에 안 뜨는 생성용 임시 파일을 걸러낸다.
// 제외 목록 방식이라 "정상 화면 이미지가 통과하는가"가 회귀의 핵심이다.

describe('shouldBackfill — 제외 패턴', () => {
  it('여러 장을 묶어 만든 스토리보드 재료는 화면용 미리보기를 만들지 않는다', () => {
    expect(shouldBackfill('ws/proj/shots/real_grid_ref_s1v2.png')).toBe(false)
  })

  it('한 장짜리 스토리보드 참고 그림은 화면용 미리보기를 만들지 않는다', () => {
    expect(shouldBackfill('ws/proj/shots/s1v2_storyboard_ref_strip.png')).toBe(false)
  })

  it('고정 템플릿은 화면용 미리보기를 만들지 않는다', () => {
    expect(shouldBackfill('templates/character-template.png')).toBe(false)
  })

  it('원본으로 올린 파일은 화면에 보일 때까지 미리보기를 만들지 않는다', () => {
    expect(shouldBackfill('ws/proj/uploads/u1/original.png')).toBe(false)
  })
})

describe('shouldBackfill — 정상 화면 이미지 통과', () => {
  it.each([
    'ws/proj/shots/s1v2_rough_start.png',
    'ws/proj/shots/s1v2_rough_direction.png',
    'ws/proj/shots/s1v2_rough_end.png',
    'ws/proj/shots/s1v2_storyboard_start.png',
    'ws/proj/shots/s1v2_storyboard_image.png',
    'ws/proj/characters/c1/view_main.png',
  ])('%s 는 화면용 미리보기를 만든다', (path) => {
    expect(shouldBackfill(path)).toBe(true)
  })

  it('프로젝트 밖의 그림도 화면에 쓰이면 미리보기를 만든다', () => {
    expect(shouldBackfill('shared/logo.png')).toBe(true)
  })
})

describe('shouldDeleteThumb — 화면에 필요 없는 작은 미리보기 삭제 (cleanup-excluded-thumbs)', () => {
  it('임시로 만든 자료의 작은 미리보기는 지운다 (141개 대표 케이스)', () => {
    expect(shouldDeleteThumb('ws/proj/shots/real_grid_ref_s1v2_thumb.webp')).toBe(true)
    expect(shouldDeleteThumb('ws/proj/shots/s1v2_storyboard_ref_strip_thumb.webp')).toBe(true)
    expect(shouldDeleteThumb('templates/character-template_thumb.webp')).toBe(true)
    expect(shouldDeleteThumb('ws/proj/uploads/u1/original_thumb.webp')).toBe(true)
  })

  it('화면에 보이는 정상 그림의 작은 미리보기는 절대 지우지 않는다', () => {
    expect(shouldDeleteThumb('ws/proj/shots/s1v2_rough_start_thumb.webp')).toBe(false)
    expect(shouldDeleteThumb('ws/proj/shots/s1v2_storyboard_start_thumb.webp')).toBe(false)
    expect(shouldDeleteThumb('ws/proj/characters/c1/view_main_thumb.webp')).toBe(false)
  })

  it('원본 그림은 이름이 제외 대상처럼 보여도 지우지 않는다', () => {
    expect(shouldDeleteThumb('ws/proj/shots/real_grid_ref_s1v2.png')).toBe(false)
    expect(shouldDeleteThumb('ws/proj/uploads/u1/original.png')).toBe(false)
  })
})

describe('격자 원본 — 화면에 안 뜨므로 축소본을 만들지 않는다', () => {
  const WS = 'ws-1/proj-1/shots'

  it('여러 장을 모은 격자 그림은 화면용 미리보기를 만들지 않는다', () => {
    expect(shouldBackfill(`${WS}/real_grid_22a7791a-cea0-4216-9857-d130963727c1.png`)).toBe(false)
    expect(shouldBackfill(`${WS}/rough_grid_b6654f02-6b3a-4c6e-ac44-663706f46b18.png`)).toBe(false)
  })

  it('참고용 격자 그림도 화면용 미리보기를 만들지 않는다', () => {
    expect(shouldBackfill(`${WS}/real_grid_ref_v1-abc.png`)).toBe(false)
  })

  it('격자 그림에 잘못 붙은 작은 미리보기는 지운다', () => {
    expect(shouldDeleteThumb(`${WS}/rough_grid_b6654f02_thumb.webp`)).toBe(true)
    expect(shouldDeleteThumb(`${WS}/real_grid_22a7791a_thumb.webp`)).toBe(true)
  })

  it('장면 그림은 격자로 잘못 분류하지 않는다', () => {
    // `_rough_start` 같은 이름이 rough_grid_ 규칙에 잘못 잡히면 화면 그림이 통째로 빠진다.
    expect(shouldBackfill(`${WS}/v1-abc_rough_start.png`)).toBe(true)
    expect(shouldBackfill(`${WS}/v1-abc_rough_direction.png`)).toBe(true)
    expect(shouldBackfill(`${WS}/v1-abc_storyboard_end.png`)).toBe(true)
    expect(shouldDeleteThumb(`${WS}/v1-abc_rough_start_thumb.webp`)).toBe(false)
  })
})
