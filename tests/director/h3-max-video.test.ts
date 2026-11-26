// 영상 모델 H3 Max · H3 Max Turbo 를 고를 수 있고, 고르면 그 모델의 fal 칸 이름(첫 · 마지막 장면 · 참고 그림 · 글 다시 쓰기 · 768P/1080P)으로 보낸다 (오너 2026-11-26 D4)
import { describe, expect, it } from 'vitest'
import { DEFAULT_VIDEO_MODEL, FAL_VIDEO_MODEL_ORDER, VIDEO_MODELS, clampDuration, normalizeProvider } from '@/lib/video-models'
import { buildFalReferenceToVideoRequest } from '@/lib/director/fal-video-request'
import { computeIgnoredFields } from '@/lib/fal/model-schemas'
import { nextVideoFallbackModel } from '@/lib/director/video-fallback'
import { madeVideoResolution } from '@/lib/director-video-takes'
import { buildVideoPrompt } from '@/lib/director/video-prompt'

const START = 'https://example.test/start.png'
const END = 'https://example.test/end.png'
const REF = 'https://example.test/hana-sheet.png'

describe('H3 Max 계열 영상 모델', () => {
  it('영상 모델 목록에 H3 Max · H3 Max Turbo 가 있고 기본 모델은 그대로 Seedance 2.0 이다', () => {
    // 왜: 오너 2026-11-26 D4 "영상모델 H3 Max 계열 추가" — 목록은 샷 상세 영상 고치기 · 노드 보기 영상 패널 · 독립 영상이 함께 쓴다.
    expect(FAL_VIDEO_MODEL_ORDER).toContain('h3-max')
    expect(FAL_VIDEO_MODEL_ORDER).toContain('h3-max-turbo')
    expect(VIDEO_MODELS['h3-max'].label).toBe('H3 Max')
    expect(VIDEO_MODELS['h3-max-turbo'].label).toBe('H3 Max Turbo')
    expect(normalizeProvider('h3-max')).toBe('h3-max')
    expect(normalizeProvider('h3-max-turbo')).toBe('h3-max-turbo')
    expect(DEFAULT_VIDEO_MODEL).toBe('seedance')
    expect(FAL_VIDEO_MODEL_ORDER[0]).toBe('seedance')
  })

  it('H3 Max 로 만들면 H3 Max 입구에 시작 그림을 첫 장면 칸, 끝 그림을 마지막 장면 칸에 싣는다', () => {
    // 왜: 오너 D4 — H3 Max 는 영상이 정확히 그 그림으로 시작하고 끝나게 하는 칸(image_url · end_image_url)이 따로 있다.
    const request = buildFalReferenceToVideoRequest('h3-max', 'A quiet harbor at dawn', [START, END], 5, '16:9', '720p', ['start', 'end'])
    expect(request.model).toBe('minimax/h3-max/reference-to-video')
    expect(request.input).toMatchObject({ prompt: 'A quiet harbor at dawn', image_url: START, end_image_url: END })
  })

  it('H3 Max Turbo 는 첫 · 마지막 장면 칸 없이 시작 · 끝 그림을 참고 그림 목록에 싣는다', () => {
    // 왜: fal 스키마(11/26) — Turbo 에는 image_url · end_image_url 칸이 없다. 없는 칸에 실으면 fal 이 조용히 버린다.
    const request = buildFalReferenceToVideoRequest('h3-max-turbo', 'x', [START, END], 5, '16:9', '720p', ['start', 'end'])
    expect(request.model).toBe('minimax/h3-max-turbo/reference-to-video')
    expect(request.input.reference_image_urls).toEqual([START, END])
    expect(request.input).not.toHaveProperty('image_url')
    expect(request.input).not.toHaveProperty('end_image_url')
  })

  it('H3 요청에는 모델이 받지 않는 칸(흐림 방지 문구 · 소리 켜기)이 없다', () => {
    // 왜: fal 은 모르는 칸을 조용히 버린다 — 다른 모델에 붙이는 negative_prompt · generate_audio 를 H3 에는 보내지 않는다(소리는 H3 이 늘 같이 만든다).
    for (const key of ['h3-max', 'h3-max-turbo'] as const) {
      const request = buildFalReferenceToVideoRequest(key, 'x', [START, END, REF], 5, '9:16', '1080p', ['start', 'end', 'ref'])
      expect(computeIgnoredFields(request.input, request.model), key).toEqual([])
      expect(request.input, key).not.toHaveProperty('negative_prompt')
      expect(request.input, key).not.toHaveProperty('generate_audio')
    }
  })

  it('H3 Max Turbo 는 시작 그림을 참고 그림 1번으로 싣고 지시문이 그 그림을 첫 장면이라고 말한다', () => {
    // 왜: 리드 2026-11-26 — Turbo 에는 첫 장면 칸이 없다. 시작 그림을 참고 그림 1번에 두고, 지시문의 그림 순서 문장이 그 그림이 샷의 시작이라고 알린다
    //   (지금 지시문 그대로 — 새 문장을 더하지 않는다). 손으로 이은 참고 그림이 있어도 시작 그림이 맨 앞이다.
    const roles = ['start', 'ref', 'end'] as const
    const request = buildFalReferenceToVideoRequest('h3-max-turbo', 'x', [START, REF, END], 5, '16:9', '720p', [...roles])
    expect((request.input.reference_image_urls as string[])[0]).toBe(START)
    const { fullPrompt } = buildVideoPrompt({ prompt: 'A woman waits at the crosswalk.', generationMethod: 'I2V', modelKey: 'h3-max-turbo', durationSeconds: 5, referenceImageRoles: [...roles] })
    expect(fullPrompt).toContain('image 1 = START')
    expect(fullPrompt).toContain('The START image is the beginning of the shot')
  })

  it('H3 Max 는 참고 그림 목록에도 시작 · 끝 · 참고 그림을 순서대로 싣는다', () => {
    // 왜: H3 참고 영상 입구는 참고 그림이 0장이면 거절한다(2026-10-12 실제 호출 422). 지시문의 "image 1 = START, image 2 = END"도 이 목록 순서를 가리킨다.
    const request = buildFalReferenceToVideoRequest('h3-max', 'x', [START, END, REF], 5, '16:9', '720p', ['start', 'end', 'ref'])
    expect(request.input.reference_image_urls).toEqual([START, END, REF])
  })

  it('H3 Max 에는 가운데 장면 칸을 보내지 않는다', () => {
    // 왜: Director 의 가운데 장은 화살표를 그린 설명 그림이다 — 영상의 가운데 장면으로 넣으면 화살표가 영상에 나온다.
    const request = buildFalReferenceToVideoRequest('h3-max', 'x', [START, END], 5, '16:9', '720p', ['start', 'end'])
    expect(request.input).not.toHaveProperty('middle_image_url')
    expect(request.input).not.toHaveProperty('middle_frame_time')
  })

  it('H3 은 지시문을 다시 쓰지 않게 보낸다', () => {
    // 왜: 우리 지시문(움직임 약속 · 대사 원문)을 그대로 쓰게 한다 — 대체 모델 미니맥스와 같은 값. prompt_expansion_mode 는 H3 의 필수 칸이다.
    for (const key of ['h3-max', 'h3-max-turbo'] as const) {
      expect(buildFalReferenceToVideoRequest(key, 'x', [START], 5, '16:9', '720p', ['start']).input.prompt_expansion_mode, key).toBe('disabled')
    }
  })

  it('H3 에서 720p 를 고르면 768P, 1080p 를 고르면 1080P 로 만든다', () => {
    // 왜: H3 에는 720P 가 없고 가장 가까운 기본값이 768P 다. 단추는 다른 모델과 같은 720p · 1080p 둘이다.
    expect(buildFalReferenceToVideoRequest('h3-max', 'x', [START], 5, '16:9', '720p', ['start']).input.resolution).toBe('768P')
    expect(buildFalReferenceToVideoRequest('h3-max', 'x', [START], 5, '16:9', '1080p', ['start']).input.resolution).toBe('1080P')
    expect(buildFalReferenceToVideoRequest('h3-max-turbo', 'x', [START], 5, '16:9', null, ['start']).input.resolution).toBe('768P')
  })

  it('H3 영상 길이는 1~15초 정수로 맞춘다', () => {
    // 왜: 다른 모델과 같은 길이 셈(정수) — H3 은 0.92~15초를 받는다.
    expect(clampDuration(VIDEO_MODELS['h3-max'], 0.4)).toBe(1)
    expect(clampDuration(VIDEO_MODELS['h3-max'], 2.6)).toBe(3)
    expect(clampDuration(VIDEO_MODELS['h3-max-turbo'], 30)).toBe(15)
    expect(buildFalReferenceToVideoRequest('h3-max', 'x', [START], 2, '16:9', '720p', ['start']).input.duration).toBe(2)
  })

  it('H3 에는 프로젝트 화면비를 보낸다', () => {
    // 왜: 세로 · 정사각 프로젝트가 가로 영상으로 나오지 않게 — 프로젝트 화면비(16:9 · 9:16 · 1:1)는 모두 H3 이 받는 값이다.
    for (const ratio of ['16:9', '9:16', '1:1']) {
      expect(buildFalReferenceToVideoRequest('h3-max-turbo', 'x', [START], 5, ratio, '720p', ['start']).input.aspect_ratio).toBe(ratio)
    }
  })

  it('H3 참고 그림은 9장까지만 싣는다', () => {
    // 왜: fal 스키마(11/26) reference_image_urls 는 9장까지 — 넘치면 요청이 통째로 거절된다. 앞(시작 · 끝)부터 남기고 뒤 참고 그림을 덜어 낸다.
    const many = Array.from({ length: 12 }, (_, i) => `https://example.test/ref-${i}.png`)
    const request = buildFalReferenceToVideoRequest('h3-max-turbo', 'x', [START, END, ...many], 5, '16:9', '720p', ['start', 'end', ...many.map(() => 'ref')])
    expect(request.input.reference_image_urls).toEqual([START, END, ...many.slice(0, 7)])
  })

  it('역할을 모르는 예전 요청은 H3 Max 에서 첫 그림을 시작, 마지막 그림을 끝 장면으로 본다', () => {
    // 왜: 역할 기록이 없는 예전 예약을 다시 낼 때도 지시문("첫 그림 = START, 마지막 그림 = END")과 같은 그림이 첫 · 마지막 장면 칸에 들어가야 한다.
    const request = buildFalReferenceToVideoRequest('h3-max', 'x', [START, END], 5, '16:9', '720p')
    expect(request.input).toMatchObject({ image_url: START, end_image_url: END, reference_image_urls: [START, END] })
    const single = buildFalReferenceToVideoRequest('h3-max', 'x', [START], 5, '16:9', '720p')
    expect(single.input).toMatchObject({ image_url: START, reference_image_urls: [START] })
    expect(single.input).not.toHaveProperty('end_image_url')
  })

  it('H3 Max 로 고른 Take 가 실패하면 같은 H3 Max(대체 미니맥스)는 건너뛰고 Happy Horse 로 넘어간다', () => {
    // 왜: 대체 "미니맥스"가 바로 H3 Max 다 — 같은 모델로 한 번 더 돌리지 않는다. Turbo 가 실패하면 지금처럼 미니맥스(H3 Max)부터.
    expect(nextVideoFallbackModel(['h3-max'], true)).toBe('happy-horse')
    expect(nextVideoFallbackModel(['h3-max-turbo'], true)).toBe('minimax')
    expect(nextVideoFallbackModel(['seedance'], true)).toBe('minimax')
  })

  it('H3 Max · Turbo 를 직접 골라 1080p 로 만든 Take 에는 1080p 표시가 붙고, 대체 미니맥스가 만든 Take 에는 붙지 않는다', () => {
    // 왜: 대체 미니맥스는 늘 768P 로 만든다(표시 안 붙음) — 사람이 H3 를 직접 고른 1080p 는 1080P 로 만들었으니 표시가 맞아야 한다.
    const take = { url: 'https://media.test/take.mp4', storage_path: null }
    const job = (model: string, resolved: string) => ({ id: 'j1', status: 'completed', model, result_url: take.url, resolution: '1080p', resolved_model_key: resolved })
    expect(madeVideoResolution(take, job('minimax/h3-max/reference-to-video', 'h3-max'))).toBe('1080p')
    expect(madeVideoResolution(take, job('minimax/h3-max-turbo/reference-to-video', 'h3-max-turbo'))).toBe('1080p')
    expect(madeVideoResolution(take, job('minimax/h3-max/reference-to-video', 'h3-max-turbo'))).toBeNull()
    expect(madeVideoResolution(take, job('minimax/h3-max/image-to-video', 'seedance'))).toBeNull()
  })
})
