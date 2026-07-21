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
}

export type BuildVideoPromptInput = {
  prompt: string
  camera?: CameraConfig | null
  movementPreset?: string | null
  cameraPreset?: CameraPreset | null
  generationMethod: GenerationMethod
  modelKey: VideoModelKey
  durationSeconds: number
}

export function buildVideoPrompt(parts: BuildVideoPromptInput): { fullPrompt: string; prompt_parts: VideoPromptParts } {
  const { prompt, camera, movementPreset, cameraPreset, generationMethod, modelKey, durationSeconds } = parts
  const cameraText = camera ? cameraToText(camera) : ''
  const movementFragment = generationMethod === 'T2V' && movementPreset ? findCameraMovement(movementPreset)?.prompt_fragment ?? '' : ''
  const gearFragment = cameraPreset ? `shot on ${findCameraBrand(cameraPreset.brand)?.full_name ?? cameraPreset.brand}, ${cameraPreset.focalLength}mm, f/${cameraPreset.aperture}, white balance ${cameraPreset.whiteBalance}K` : ''
  const baseFullPrompt = [prompt, movementFragment, gearFragment, cameraText].filter(Boolean).join('. ').slice(0, 500)
  const prompt_parts: VideoPromptParts = { prompt, movement: movementFragment, gear: gearFragment, camera: cameraText }

  if (modelKey === 'veo' && durationSeconds < 8) {
    const blackInstruction = `Show the described action only for the first ${durationSeconds} seconds; after ${durationSeconds}s the frame must be a completely black screen — no subject, no motion — until the video ends.`
    prompt_parts.black = blackInstruction
    return { fullPrompt: `${baseFullPrompt} ${blackInstruction}`.slice(0, 800), prompt_parts }
  }

  return { fullPrompt: baseFullPrompt, prompt_parts }
}
