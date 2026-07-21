import { describe, expect, it } from 'vitest'
import { buildVideoPrompt } from '@/lib/director/video-prompt'

const STILL_CAMERA = { horizontal: 0, vertical: 0, pan: 0, tilt: 0, roll: 0, zoom: 0 }

describe('buildVideoPrompt', () => {
  it('snapshots a standard Kling I2V prompt with camera text and no movement preset fragment', () => {
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

  it('snapshots a T2V movement preset fragment', () => {
    const result = buildVideoPrompt({
      prompt: 'A courier sprints through rain',
      movementPreset: 'dolly-in',
      generationMethod: 'T2V',
      modelKey: 'happy-horse',
      durationSeconds: 5,
    })

    expect(result.fullPrompt).toMatchInlineSnapshot('"A courier sprints through rain. dolly in, slow forward push"')
  })

  it('snapshots a camera preset gear fragment', () => {
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

  it('snapshots the Veo under-8s black-screen instruction and 800 character cap path', () => {
    const result = buildVideoPrompt({
      prompt: 'A lighthouse keeper extinguishes the lamp',
      generationMethod: 'I2V',
      modelKey: 'veo',
      durationSeconds: 6,
    })

    expect(result.fullPrompt.length).toBeLessThanOrEqual(800)
    expect(result.fullPrompt).toMatchInlineSnapshot('"A lighthouse keeper extinguishes the lamp Show the described action only for the first 6 seconds; after 6s the frame must be a completely black screen — no subject, no motion — until the video ends."')
  })

  it('snapshots the 500 character base prompt cap boundary', () => {
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
