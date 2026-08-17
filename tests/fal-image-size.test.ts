import { describe, it, expect } from 'vitest'
import { buildFalImageInput } from '@/lib/writer/llm/fal'
import { realSheetCanvas } from '@/lib/director/storyboard-strip'

// #fal-canvas (2026-08-17) — image_size 배선 계약.
//   실측 근거: 'WxH' 문자열은 fal(gpt-image-2/edit)이 422 로 거부(프로덕션 40/40 전멸,
//   a003a8c6), {width,height} 객체는 4/4 수락 + 요청 치수 그대로 반환(비네이티브는 64배수
//   스냅: 1536x643→1536x640). 시트 캔버스는 프로듀서 포맷 파생 — 세로 캔버스에서도 4×3
//   레이아웃 유지 + 패널 세로 재구도 실측(T2).

const EDIT = 'openai/gpt-image-2/edit'

describe('buildFalImageInput — image_size 정규화', () => {
  it("edit 모델: 'WxH' 는 {width,height} 객체로 변환된다 (문자열 그대로는 422 실측)", () => {
    const input = buildFalImageInput({ prompt: 'p', image_size: '1536x1024' }, EDIT)
    expect(input.image_size).toEqual({ width: 1536, height: 1024 })
  })

  it('edit 모델: preset 문자열은 그대로 통과한다', () => {
    const input = buildFalImageInput({ prompt: 'p', image_size: 'landscape_4_3' }, EDIT)
    expect(input.image_size).toBe('landscape_4_3')
  })

  it('edit 모델: image_size 미지정이면 aspect_ratio 유도 preset (기존 계약 유지)', () => {
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: '16:9' }, EDIT).image_size).toBe(
      'landscape_16_9',
    )
    expect(buildFalImageInput({ prompt: 'p' }, EDIT).image_size).toBe('auto')
  })

  it("flux 계열: 명시 'WxH' 를 객체로 존중, 미지정이면 preset ('auto' 미지원 → 16:9)", () => {
    const flux = 'fal-ai/flux-2/klein/9b'
    expect(buildFalImageInput({ prompt: 'p', image_size: '1024x1536' }, flux).image_size).toEqual({
      width: 1024,
      height: 1536,
    })
    expect(buildFalImageInput({ prompt: 'p' }, flux).image_size).toBe('landscape_16_9')
  })

  it('grok: image_size 는 스키마에 없어 어떤 값이든 전송하지 않는다 (422 방어)', () => {
    const input = buildFalImageInput(
      { prompt: 'p', image_size: '1024x1536' },
      'xai/grok-imagine-image',
    )
    expect('image_size' in input).toBe(false)
  })
})

describe('realSheetCanvas — 프로듀서 포맷 → 실사 시트 캔버스', () => {
  it('그리드: 캔버스 방향 = 포맷 방향 (vertical 세로 시트 실측 T2, cinema 2.4:1 실측 T4)', () => {
    expect(realSheetCanvas('horizontal_16:9', 'grid4')).toBe('1536x1024')
    expect(realSheetCanvas('vertical_9:16', 'grid4')).toBe('1024x1536')
    expect(realSheetCanvas('square_1:1', 'grid4')).toBe('1024x1024')
    expect(realSheetCanvas('cinema_2.39:1', 'grid4')).toBe('1536x640')
  })

  it('그리드: 포맷 미상(구 프로젝트 null)은 종전 가로 시트 유지 — 하위 호환', () => {
    expect(realSheetCanvas(null, 'grid4')).toBe('1536x1024')
  })

  it('스트립: 3행 적층 레이아웃이 지배 — 포맷 불문 세로 고정', () => {
    expect(realSheetCanvas('horizontal_16:9', 'strip1')).toBe('1024x1536')
    expect(realSheetCanvas('vertical_9:16', 'strip1')).toBe('1024x1536')
    expect(realSheetCanvas(null, 'strip1')).toBe('1024x1536')
  })
})
