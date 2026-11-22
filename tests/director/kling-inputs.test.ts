// Kling O3 영상 요청은 시작 · 끝 그림을 Kling 의 첫 · 마지막 장면 칸으로, 소리 · 화면비를 Kling 이 받는 칸 이름으로 보낸다 (fal 스키마 11/22 확인)
import { describe, expect, it } from 'vitest'
import { buildFalReferenceToVideoRequest } from '@/lib/director/fal-video-request'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { clampReferenceImages } from '@/lib/director/video-reference-frames'
import { computeIgnoredFields } from '@/lib/fal/model-schemas'
import { KLING_O3_AUDIO_ON, VIDEO_MODELS, frameSlotRoles } from '@/lib/video-models'

const START = 'https://media.test/shot_start.png'
const END = 'https://media.test/shot_end.png'
const REF = 'https://media.test/hero_sheet.png'

describe('혼자 정한 것', () => {
  // 왜: 지금은 시작 · 끝 그림이 Kling 의 "화풍 · 생김새 참고" 칸(image_urls)으로 가서, Kling 이 그 그림에서 시작하거나 끝난다는 보장이 없다.
  //   Kling 참고 입구에는 첫 장면(start_image_url) · 마지막 장면(end_image_url) 칸이 따로 있다.
  it('Kling O3 는 시작 · 끝 그림을 첫 장면 · 마지막 장면 칸으로, 참고 그림만 참고 칸으로 보낸다', () => {
    const request = buildFalReferenceToVideoRequest('kling-o3', 'x', [START, REF, END], 5, '16:9', null, ['start', 'ref', 'end'])

    expect(request.model).toBe('fal-ai/kling-video/o3/pro/reference-to-video')
    expect(request.input).toMatchObject({ start_image_url: START, end_image_url: END, image_urls: [REF] })
  })

  // 왜: fal 표에 참고 칸이 꼭 있어야 하는지 적혀 있지 않다 — 시작 · 끝만 있는 기본 방식에서 참고 칸이 비어 거절되지 않게,
  //   시작 그림을 생김새 참고로 한 장 넣는다(같은 그림이라 다른 인물 · 화풍이 섞이지 않는다).
  it('Kling O3 에 참고 그림이 없으면 시작 그림을 생김새 참고로 참고 칸에도 넣는다', () => {
    const request = buildFalReferenceToVideoRequest('kling-o3', 'x', [START, END], 5, '16:9', null, ['start', 'end'])

    expect(request.input).toMatchObject({ start_image_url: START, end_image_url: END, image_urls: [START] })
  })

  // 왜: 프레임 출처 · 역할을 보내지 않는 옛 화면 · 직접 호출 — 그 경로의 글("첫 참고 그림 = 시작")과 맞게 지금처럼 둔다.
  it('Kling O3 에 역할 없이 그림만 보낸 옛 요청은 지금처럼 참고 칸으로만 보낸다', () => {
    const request = buildFalReferenceToVideoRequest('kling-o3', 'x', [START, END], 5, '16:9')

    expect(request.input.image_urls).toEqual([START, END])
    expect(request.input).not.toHaveProperty('start_image_url')
    expect(request.input).not.toHaveProperty('end_image_url')
  })

  // 왜: 지금은 Kling 에 화면비를 아예 보내지 않아 Kling 기본값(16:9)으로 나온다 — 세로 · 정사각 프로젝트도 가로 영상이 됐다.
  //   Kling 이 받지 않는 값(예: 4:3)을 보내면 요청이 거절될 수 있어 그때는 보내지 않는다.
  it('Kling O3 는 프로젝트 화면비를 보내고, Kling 이 받지 않는 화면비면 보내지 않는다', () => {
    for (const ratio of ['16:9', '9:16', '1:1']) {
      expect(buildFalReferenceToVideoRequest('kling-o3', 'x', [START], 5, ratio, null, ['start']).input.aspect_ratio).toBe(ratio)
    }
    expect(buildFalReferenceToVideoRequest('kling-o3', 'x', [START], 5, '4:3', null, ['start']).input).not.toHaveProperty('aspect_ratio')
  })

  // 왜: Kling 의 참고 칸 상한(4)은 image_urls 장 수다 — 첫 · 마지막 장면 칸으로 가는 시작 · 끝까지 세면 참고 그림을 괜히 덜어 낸다.
  it('Kling O3 는 참고 칸에 들어가는 그림만 네 장까지 세고 시작 · 끝 그림은 세지 않는다', () => {
    const refs = [1, 2, 3, 4, 5].map((n) => `https://media.test/ref-${n}.png`)
    const four = clampReferenceImages([START, ...refs.slice(0, 4), END], ['start', 'ref', 'ref', 'ref', 'ref', 'end'], VIDEO_MODELS['kling-o3'].maxImageUrls, frameSlotRoles('kling-o3'))
    expect(four.dropped).toBe(0)

    const five = clampReferenceImages([START, ...refs, END], ['start', 'ref', 'ref', 'ref', 'ref', 'ref', 'end'], VIDEO_MODELS['kling-o3'].maxImageUrls, frameSlotRoles('kling-o3'))
    expect(five.urls).toEqual([START, ...refs.slice(0, 4), END])
    expect(five.dropped).toBe(1)
  })

  // 왜: Kling 은 첫 · 마지막 장면을 칸으로 받으니 "image 1 = START" 같은 그림 번호 문장이 Kling 의 참고 그림 번호(@Image1)와 어긋난다.
  it('Kling O3 영상 글은 그림 번호 대신 첫 장면 · 마지막 장면 칸을 가리키고, 참고 칸 그림은 @Image 번호로 부른다', () => {
    const { fullPrompt } = buildVideoPrompt({
      prompt: 'A duelist draws a rapier',
      generationMethod: 'I2V',
      modelKey: 'kling-o3',
      durationSeconds: 5,
      referenceImageRoles: ['start', 'ref', 'end'],
    })

    expect(fullPrompt).toContain('starts exactly on the given first frame')
    expect(fullPrompt).toContain('ends exactly on the given last frame')
    expect(fullPrompt).toContain('@Image1 = REF')
    expect(fullPrompt).not.toContain('image 1 = START')
  })
})

describe('같이 정한 것', () => {
  // 왜: 오너 2026-11-22 E6 "켠다" — 예전에는 `audio` 칸을 보냈는데 Kling 의 소리 칸은 `generate_audio`(기본 꺼짐)라
  //   모르는 칸이 버려져 Kling 영상이 소리 · 대사 없이 나왔다. 원가는 초당 $0.112 → $0.14, Take 는 그대로.
  it('Kling O3 영상은 소리를 켜서 만들고, 소리는 Kling 의 칸 이름(generate_audio)으로 보낸다', () => {
    const request = buildFalReferenceToVideoRequest('kling-o3', 'x', [START, END], 5, '16:9', null, ['start', 'end'])

    expect(KLING_O3_AUDIO_ON).toBe(true)
    expect(request.input.generate_audio).toBe(true)
    expect(request.input).not.toHaveProperty('audio')
    expect(computeIgnoredFields(request.input, request.model)).not.toContain('audio')
  })
})
