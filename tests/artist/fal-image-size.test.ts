// 이미지 크기 요청은 모델 약속에 맞추고, 화면 형식별 시트 크기를 정확히 지킨다 (#fal-canvas 2026-08-17)
import { describe, it, expect } from 'vitest'
import { buildFalImageInput } from '@/lib/writer/llm/fal'
import { realSheetCanvas } from '@/lib/director/storyboard-strip'

// #fal-canvas (2026-08-17) — image_size 배선 계약.
//   실측 근거: 'WxH' 문자열은 fal(gpt-image-2/edit)이 422 로 거부(프로덕션 40/40 전멸,
//   a003a8c6), {width,height} 객체는 4/4 수락 + 요청 치수 그대로 반환(비네이티브는 64배수
//   스냅: 1536x643→1536x640). 시트 캔버스는 프로듀서 포맷 파생 — 세로 캔버스에서도 4×3
//   레이아웃 유지 + 패널 세로 재구도 실측(T2).

const EDIT = 'openai/gpt-image-2/edit'

describe('buildFalImageInput — 이미지 크기와 비율을 모델 약속에 맞춘다', () => {
  it('기존 그림을 고칠 때 가로×세로를 지정하면 숫자 크기로 전달한다', () => {
    const input = buildFalImageInput({ prompt: 'p', image_size: '1536x1024' }, EDIT)
    expect(input.image_size).toEqual({ width: 1536, height: 1024 })
  })

  it('기존 그림을 고칠 때 정해진 크기 이름은 그대로 사용한다', () => {
    const input = buildFalImageInput({ prompt: 'p', image_size: 'landscape_4_3' }, EDIT)
    expect(input.image_size).toBe('landscape_4_3')
  })

  it('기존 그림을 고칠 때 크기를 생략하면 화면 비율에 맞는 기본 크기를 사용한다 (기존 약속 유지)', () => {
    expect(buildFalImageInput({ prompt: 'p', aspect_ratio: '16:9' }, EDIT).image_size).toBe(
      'landscape_16_9',
    )
    expect(buildFalImageInput({ prompt: 'p' }, EDIT).image_size).toBe('auto')
  })

  it('Flux 그림 모델은 가로×세로를 그대로 반영하고, 생략하면 16:9 크기를 사용한다', () => {
    const flux = 'fal-ai/flux-2/klein/9b'
    expect(buildFalImageInput({ prompt: 'p', image_size: '1024x1536' }, flux).image_size).toEqual({
      width: 1024,
      height: 1536,
    })
    expect(buildFalImageInput({ prompt: 'p' }, flux).image_size).toBe('landscape_16_9')
  })

  it('Grok 그림 모델은 크기 설정을 받지 않으므로 크기를 보내지 않는다', () => {
    const input = buildFalImageInput(
      { prompt: 'p', image_size: '1024x1536' },
      'xai/grok-imagine-image',
    )
    expect('image_size' in input).toBe(false)
  })
})

describe('buildFalImageInput — 새 이미지 모델마다 크기와 비율을 다르게 적용한다', () => {
  const NANO = 'fal-ai/nano-banana'
  const NANO_EDIT = 'fal-ai/nano-banana/edit'
  const SEEDREAM = 'fal-ai/bytedance/seedream/v4/text-to-image'
  const SEEDREAM_EDIT = 'fal-ai/bytedance/seedream/v4/edit'

  it('새 그림을 만들 때 화면 비율은 그대로 사용하고 참고 그림과 별도 크기는 보내지 않는다', () => {
    const input = buildFalImageInput({ prompt: 'p', aspect_ratio: '1:1' }, NANO)
    expect(input.aspect_ratio).toBe('1:1')
    expect('image_urls' in input).toBe(false)
    expect('image_size' in input).toBe(false)
  })

  it('기존 그림을 고칠 때 참고 그림을 사용하고 자동 비율은 따로 보내지 않는다', () => {
    const input = buildFalImageInput(
      { prompt: 'p', aspect_ratio: 'auto', reference_image_urls: ['a.png', 'b.png'] },
      NANO_EDIT,
    )
    expect(input.image_urls).toEqual(['a.png', 'b.png'])
    expect('aspect_ratio' in input).toBe(false)
  })

  it('nano-banana-2로 새 그림을 만들면 설명과 화면 비율만 보낸다 (#owner-default 2026-09-02)', () => {
    const input = buildFalImageInput({ prompt: 'p', aspect_ratio: '3:2', seed: 7, negative_prompt: 'x' }, 'fal-ai/nano-banana-2')
    expect(input).toEqual({ prompt: 'p', aspect_ratio: '3:2' })
  })

  it('nano-banana-2로 기존 그림을 고칠 때 설명과 참고 그림만 보내 비율을 따라간다', () => {
    const input = buildFalImageInput(
      { prompt: 'p', aspect_ratio: '16:9', reference_image_urls: ['tpl.png', 'face.png'] },
      'fal-ai/nano-banana-2/edit',
    )
    expect(input).toEqual({ prompt: 'p', image_urls: ['tpl.png', 'face.png'] })
  })

  it('seedream으로 새 그림을 만들 때 화면 비율에 맞는 크기를 사용한다', () => {
    const input = buildFalImageInput({ prompt: 'p', aspect_ratio: '16:9' }, SEEDREAM)
    expect(input.image_size).toBe('landscape_16_9')
    expect('aspect_ratio' in input).toBe(false)
  })

  it('seedream에서 크기를 생략하면 모델 기본 정사각형을 사용한다', () => {
    expect('image_size' in buildFalImageInput({ prompt: 'p' }, SEEDREAM)).toBe(false)
  })

  it('seedream으로 기존 그림을 고칠 때 참고 그림과 가로×세로 크기를 올바르게 전달한다', () => {
    const input = buildFalImageInput(
      { prompt: 'p', image_size: '1024x1536', reference_image_urls: ['t.png'] },
      SEEDREAM_EDIT,
    )
    expect(input.image_urls).toEqual(['t.png'])
    expect(input.image_size).toEqual({ width: 1024, height: 1536 })
  })
})

describe('realSheetCanvas — 프로듀서 화면 형식에 맞는 실사 시트 크기 (#sheet-formats 2차: 4포맷 전부 스펙)', () => {
  it('그리드 시트는 모든 화면 형식에서 칸 비율을 맞추고 빈 여백을 없앤다', () => {
    expect(realSheetCanvas('horizontal_16:9', 'grid4')).toBe('2880x1280') // #hd-grid 상향(오너 ③D)
    expect(realSheetCanvas('vertical_9:16', 'grid4')).toBe('1152x1536')
    expect(realSheetCanvas('square_1:1', 'grid4')).toBe('1344x1024')
    expect(realSheetCanvas('cinema_2.39:1', 'grid4')).toBe('2400x880') // #cinema-row-pitch 확대 추종
  })

  it('화면 형식을 알 수 없는 예전 프로젝트만 이전 시트 크기를 유지한다', () => {
    expect(realSheetCanvas(null, 'grid4')).toBe('1536x1024')
    expect(realSheetCanvas(null, 'strip1')).toBe('1024x1536')
  })

  it('세로 화면 형식의 스트립은 세 칸을 가로로 놓고, 나머지는 세로로 쌓는다', () => {
    expect(realSheetCanvas('horizontal_16:9', 'strip1')).toBe('1024x1712')
    expect(realSheetCanvas('cinema_2.39:1', 'strip1')).toBe('1024x1296')
    expect(realSheetCanvas('vertical_9:16', 'strip1')).toBe('1536x896')
    expect(realSheetCanvas('square_1:1', 'strip1')).toBe('640x1792')
  })
})
