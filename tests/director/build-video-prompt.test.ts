// 영상 설명에 카메라와 장면 연결 안내를 알맞게 넣고 길이 제한도 지킨다
import { describe, expect, it } from 'vitest'
import { buildVideoPrompt } from '@/lib/director/video-prompt'

const STILL_CAMERA = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }

describe('buildVideoPrompt', () => {
  it('Kling I2V 영상은 카메라 움직임을 설명하고 이동 설정은 넣지 않는다', () => {
    const result = buildVideoPrompt({
      prompt: 'A moonlit fox pauses by a river',
      camera: { horizontal: 4, vertical: 0, pan: 0, tilt: -7, roll: 0, zoom: 2 },
      movementPreset: 'dolly-in',
      generationMethod: 'I2V',
      modelKey: 'kling-o3',
      durationSeconds: 5,
    })

    expect(result.fullPrompt).toMatchInlineSnapshot('"A moonlit fox pauses by a river. Camera tracks steadily to the right. Camera pans dramatically to the left. Camera zooms slowly in"')
  })

  it('T2V 영상은 선택한 움직임 설정을 설명에 덧붙인다', () => {
    const result = buildVideoPrompt({
      prompt: 'A courier sprints through rain',
      movementPreset: 'dolly-in',
      generationMethod: 'T2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
    })

    expect(result.fullPrompt).toMatchInlineSnapshot('"A courier sprints through rain. dolly in, slow forward push"')
  })

  it('카메라 설정을 고르면 Arri Alexa 촬영 정보를 설명에 덧붙인다', () => {
    const result = buildVideoPrompt({
      prompt: 'Macro shot of a glass orchid',
      camera: STILL_CAMERA,
      cameraPreset: { brand: 'arri', focalLength: 50, aperture: 2.8, whiteBalance: 5600 },
      generationMethod: 'I2V',
      modelKey: 'kling-o3',
      durationSeconds: 5,
    })

    expect(result.fullPrompt).toMatchInlineSnapshot('"Macro shot of a glass orchid. shot on Arri Alexa, 50mm, f/2.8, white balance 5600K"')
  })

  it('Veo 영상이 8초보다 짧으면 뒤를 검은 화면으로 채우고 설명을 1000자로 제한한다', () => {
    const result = buildVideoPrompt({
      prompt: 'A lighthouse keeper extinguishes the lamp',
      generationMethod: 'I2V',
      modelKey: 'veo',
      durationSeconds: 6,
    })

    expect(result.fullPrompt.length).toBeLessThanOrEqual(1000)
    expect(result.fullPrompt).toMatchInlineSnapshot('"A lighthouse keeper extinguishes the lamp Show the described action only for the first 6 seconds; after 6s the frame must be a completely black screen — no subject, no motion — until the video ends."')
  })

  it('START와 END를 함께 고른 I2V 영상에는 두 장면 연결을 안내하고 T2V에는 넣지 않는다', () => {
    const i2v = buildVideoPrompt({
      prompt: 'A duelist draws a rapier',
      generationMethod: 'I2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
      startEndReference: true,
    })
    expect(i2v.fullPrompt).toContain("START frame")
    expect(i2v.fullPrompt).toContain('finish exactly at the END composition')
    expect(i2v.prompt_parts.startEnd).toBeTruthy()

    const t2v = buildVideoPrompt({
      prompt: 'A duelist draws a rapier',
      generationMethod: 'T2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
      startEndReference: true,
    })
    expect(t2v.fullPrompt).not.toContain('START frame')
    expect(t2v.prompt_parts.startEnd).toBeUndefined()
  })

  it('START·REF·END 순서를 설명하되 REF를 시간 흐름의 기준 장면으로 취급하지 않는다', () => {
    const result = buildVideoPrompt({
      prompt: 'A duelist draws a rapier',
      generationMethod: 'I2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
      referenceImageRoles: ['start', 'ref', 'end'],
    })

    expect(result.fullPrompt).toContain('image 1 = START')
    expect(result.fullPrompt).toContain('image 2 = REF')
    expect(result.fullPrompt).toContain('image 3 = END')
    expect(result.fullPrompt).toContain('REF images are style/character references, not temporal keyframes')
    expect(result.fullPrompt).toContain('START image is the beginning')
    expect(result.fullPrompt).toContain('END image is the completed composition')
  })

  it('REF 이미지만 주면 END 장면이 있다고 잘못 안내하지 않는다', () => {
    const result = buildVideoPrompt({
      prompt: 'A duelist studies the room',
      generationMethod: 'I2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
      referenceImageRoles: ['ref', 'ref'],
    })

    expect(result.fullPrompt).toContain('image 1 = REF')
    expect(result.fullPrompt).toContain('REF images are style/character references, not temporal keyframes')
    expect(result.fullPrompt).not.toContain('END image is')
    expect(result.fullPrompt).not.toContain('START image is')
    expect(result.fullPrompt).not.toContain('finish exactly at the END composition')
  })

  it('역할 정보가 없으면 예전 START·END 연결 안내를 유지한다', () => {
    const result = buildVideoPrompt({
      prompt: 'A duelist draws a rapier',
      generationMethod: 'I2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
      startEndReference: true,
    })

    expect(result.fullPrompt).toContain('finish exactly at the END composition')
    expect(result.prompt_parts.startEnd).toBeTruthy()
    expect(result.prompt_parts.referenceRoles).toBeUndefined()
  })

  it('기본 설명이 500자를 넘으면 500자로 자른다', () => {
    const result = buildVideoPrompt({
      prompt: '0123456789'.repeat(52),
      generationMethod: 'T2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
    })

    expect(result.fullPrompt).toHaveLength(500)
    expect(result.fullPrompt).toMatchInlineSnapshot(`"01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789"`)
  })
})
