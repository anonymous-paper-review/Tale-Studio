import { describe, it, expect } from 'vitest'
import { shouldBackfill, shouldDeleteThumb } from '../scripts/backfill-filter.mjs'

// 소급 썸네일 생성 대상 필터 — 화면에 안 뜨는 생성용 임시 파일을 걸러낸다.
// 제외 목록 방식이라 "정상 화면 이미지가 통과하는가"가 회귀의 핵심이다.

describe('shouldBackfill — 제외 패턴', () => {
  it('배치 스토리보드 생성용 참조 시트(real_grid_ref_*)를 거른다', () => {
    expect(shouldBackfill('ws/proj/shots/real_grid_ref_s1v2.png')).toBe(false)
  })

  it('단건 스토리보드 생성용 참조 띠(_storyboard_ref_strip)를 거른다', () => {
    expect(shouldBackfill('ws/proj/shots/s1v2_storyboard_ref_strip.png')).toBe(false)
  })

  it('생성 모델용 고정 템플릿(templates/)을 거른다', () => {
    expect(shouldBackfill('templates/character-template.png')).toBe(false)
  })

  it('원본 업로드(uploads/)는 화면 노출 확인 전까지 보류한다', () => {
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
  ])('%s 는 백필 대상이다', (path) => {
    expect(shouldBackfill(path)).toBe(true)
  })

  it('프로젝트 하위가 아닌 루트 파일도 기본 통과 (제외 목록 원칙)', () => {
    expect(shouldBackfill('shared/logo.png')).toBe(true)
  })
})

describe('shouldDeleteThumb — 잘못 만들어진 썸네일 삭제 판정 (cleanup-excluded-thumbs)', () => {
  it('생성용 임시 재료에 붙은 썸네일은 삭제 대상이다 (141개 대표 케이스)', () => {
    expect(shouldDeleteThumb('ws/proj/shots/real_grid_ref_s1v2_thumb.webp')).toBe(true)
    expect(shouldDeleteThumb('ws/proj/shots/s1v2_storyboard_ref_strip_thumb.webp')).toBe(true)
    expect(shouldDeleteThumb('templates/character-template_thumb.webp')).toBe(true)
    expect(shouldDeleteThumb('ws/proj/uploads/u1/original_thumb.webp')).toBe(true)
  })

  it('화면에 뜨는 정상 썸네일은 절대 삭제하지 않는다', () => {
    expect(shouldDeleteThumb('ws/proj/shots/s1v2_rough_start_thumb.webp')).toBe(false)
    expect(shouldDeleteThumb('ws/proj/shots/s1v2_storyboard_start_thumb.webp')).toBe(false)
    expect(shouldDeleteThumb('ws/proj/characters/c1/view_main_thumb.webp')).toBe(false)
  })

  it('썸네일이 아닌 파일(원본)은 경로가 제외 패턴이어도 삭제 대상이 아니다', () => {
    expect(shouldDeleteThumb('ws/proj/shots/real_grid_ref_s1v2.png')).toBe(false)
    expect(shouldDeleteThumb('ws/proj/uploads/u1/original.png')).toBe(false)
  })
})

describe('격자 원본 — 화면에 안 뜨므로 축소본을 만들지 않는다', () => {
  const WS = 'ws-1/proj-1/shots'

  it('배치 격자 원본을 제외한다', () => {
    expect(shouldBackfill(`${WS}/real_grid_22a7791a-cea0-4216-9857-d130963727c1.png`)).toBe(false)
    expect(shouldBackfill(`${WS}/rough_grid_b6654f02-6b3a-4c6e-ac44-663706f46b18.png`)).toBe(false)
  })

  it('참조 시트도 계속 제외한다 (real_grid_ 규칙이 삼키지 않는지 확인)', () => {
    expect(shouldBackfill(`${WS}/real_grid_ref_v1-abc.png`)).toBe(false)
  })

  it('격자에 잘못 붙은 축소본은 삭제 대상이다', () => {
    expect(shouldDeleteThumb(`${WS}/rough_grid_b6654f02_thumb.webp`)).toBe(true)
    expect(shouldDeleteThumb(`${WS}/real_grid_22a7791a_thumb.webp`)).toBe(true)
  })

  it('샷 프레임은 격자 규칙에 걸리지 않는다', () => {
    // `_rough_start` 같은 이름이 rough_grid_ 규칙에 잘못 잡히면 화면 그림이 통째로 빠진다.
    expect(shouldBackfill(`${WS}/v1-abc_rough_start.png`)).toBe(true)
    expect(shouldBackfill(`${WS}/v1-abc_rough_direction.png`)).toBe(true)
    expect(shouldBackfill(`${WS}/v1-abc_storyboard_end.png`)).toBe(true)
    expect(shouldDeleteThumb(`${WS}/v1-abc_rough_start_thumb.webp`)).toBe(false)
  })
})
