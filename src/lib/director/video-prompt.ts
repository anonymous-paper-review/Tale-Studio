import { cameraToText } from '@/lib/kling'
import { findCameraBrand, findCameraMovement } from '@/lib/knowledge'
import type { VideoModelKey } from '@/lib/video-models'
import type { CameraConfig, CameraPreset, GenerationMethod } from '@/types'

export type VideoPromptParts = {
  prompt: string
  movement: string
  gear: string
  camera: string
  black?: string
  startEnd?: string
}

export type BuildVideoPromptInput = {
  prompt: string
  camera?: CameraConfig | null
  movementPreset?: string | null
  cameraPreset?: CameraPreset | null
  generationMethod: GenerationMethod
  modelKey: VideoModelKey
  durationSeconds: number
  /** V2 refs(#real-strip 2026-07-22): 레퍼런스가 [START, END] 2장일 때 수렴 지시 절 추가. */
  startEndReference?: boolean
}

export function buildVideoPrompt(parts: BuildVideoPromptInput): { fullPrompt: string; prompt_parts: VideoPromptParts } {
  const { prompt, camera, movementPreset, cameraPreset, generationMethod, modelKey, durationSeconds, startEndReference } = parts
  const cameraText = camera ? cameraToText(camera) : ''
  const movementFragment = generationMethod === 'T2V' && movementPreset ? findCameraMovement(movementPreset)?.prompt_fragment ?? '' : ''
  const gearFragment = cameraPreset ? `shot on ${findCameraBrand(cameraPreset.brand)?.full_name ?? cameraPreset.brand}, ${cameraPreset.focalLength}mm, f/${cameraPreset.aperture}, white balance ${cameraPreset.whiteBalance}K` : ''
  const prompt_parts: VideoPromptParts = { prompt, movement: movementFragment, gear: gearFragment, camera: cameraText }
  let fullPrompt = [prompt, movementFragment, gearFragment, cameraText].filter(Boolean).join('. ').slice(0, 500)

  // V2(previz 실측 검증: END 프레이밍 수렴) — 첫 레퍼런스=START, 마지막=END 로 시작·끝 구도를 고정.
  if (startEndReference && generationMethod === 'I2V') {
    const startEndInstruction = `The first reference image is the shot's START frame and the last reference image is its END frame — begin exactly at the START composition and finish exactly at the END composition, with one continuous camera and subject movement between them.`
    prompt_parts.startEnd = startEndInstruction
    fullPrompt = `${fullPrompt} ${startEndInstruction}`.slice(0, 800)
  }

  if (modelKey === 'veo' && durationSeconds < 8) {
    const blackInstruction = `Show the described action only for the first ${durationSeconds} seconds; after ${durationSeconds}s the frame must be a completely black screen — no subject, no motion — until the video ends.`
    prompt_parts.black = blackInstruction
    return { fullPrompt: `${fullPrompt} ${blackInstruction}`.slice(0, 1000), prompt_parts }
  }

  return { fullPrompt, prompt_parts }
}
