// 디렉터 영상 요청은 고른 모델의 fal 칸 이름으로 고른 해상도 · 길이 · 소리 · 화면 비율을 담아 보낸다 (오너 2026-11-01 Seedance 2.5)
import { describe, expect, it } from 'vitest'
import { buildFalReferenceToVideoRequest } from '@/lib/director/fal-video-request'
import { computeIgnoredFields } from '@/lib/fal/model-schemas'

const START = 'https://example.test/start.png'
const END = 'https://example.test/end.png'

describe('Seedance 2.5 영상 요청', () => {
  // 왜: 정상 경로 고정. 영상 노드에서 Seedance 2.5 · 1080p 를 고르고 [영상 생성]을 누를 때 fal 이 그 값을 그대로 받아야 한다.
  it('Seedance 2.5 로 만들면 Seedance 2.5 입구에 고른 해상도 · 길이 · 소리 켜기 · 화면 비율 · 시작과 끝 그림을 담아 보낸다', () => {
    const request = buildFalReferenceToVideoRequest('seedance-2.5', 'A quiet harbor at dawn', [START, END], 6, '16:9', '1080p')

    expect(request.model).toBe('bytedance/seedance-2.5/us/reference-to-video')
    expect(request.input).toMatchObject({
      prompt: 'A quiet harbor at dawn',
      image_urls: [START, END],
      duration: 6,
      generate_audio: true,
      resolution: '1080p',
      aspect_ratio: '16:9',
    })
  })

  // 왜: fal 은 모르는 칸을 조용히 버린다. 해상도나 소리 칸 이름이 틀리면 오류 없이 다른 영상이 나온다.
  //   Seedance 2.0 과 똑같이 모든 모델에 붙이는 흐림 방지 문구(negative_prompt)만 Seedance 2.5 가 받지 않는 칸이다.
  it('Seedance 2.5 요청에서 모델이 받지 않는 칸은 Seedance 2.0 과 같다', () => {
    const v25 = buildFalReferenceToVideoRequest('seedance-2.5', 'x', [START], 5, '9:16', '720p')
    const v20 = buildFalReferenceToVideoRequest('seedance', 'x', [START], 5, '9:16', '720p')

    expect(computeIgnoredFields(v25.input, v25.model)).toEqual(['negative_prompt'])
    expect(computeIgnoredFields(v25.input, 'seedance-2.5')).toEqual(computeIgnoredFields(v20.input, 'seedance'))
  })
})
