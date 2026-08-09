import { cameraToText } from '@/lib/kling'
import { compileMotionContract, type MotionContract } from '@/lib/director/motion-contract'
import { findCameraBrand, findCameraMovement } from '@/lib/knowledge'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import type { VideoModelKey } from '@/lib/video-models'
import type { CameraConfig, CameraPreset, GenerationMethod } from '@/types'

export type VideoPromptParts = {
  prompt: string
  movement: string
  gear: string
  camera: string
  /** #motion-contract: dynamic_spec 컴파일 계약문 — 프롬프트 맨 앞에 실린다. */
  motionContract?: string
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
  /** #motion-contract: v4 dynamic_spec — 있으면 모션 계약문을 컴파일해 맨 앞에 싣는다.
   *  미전달(레거시) = 기존 프롬프트와 동일(계약·분기 없음). */
  dynamicSpec?: ShotDynamicSpec | null
}

export function buildVideoPrompt(parts: BuildVideoPromptInput): { fullPrompt: string; prompt_parts: VideoPromptParts } {
  const { prompt, camera, movementPreset, cameraPreset, generationMethod, modelKey, durationSeconds, startEndReference, dynamicSpec } = parts
  const contract: MotionContract = compileMotionContract(dynamicSpec, durationSeconds)
  const cameraText = camera ? cameraToText(camera) : ''
  const movementFragment = generationMethod === 'T2V' && movementPreset ? findCameraMovement(movementPreset)?.prompt_fragment ?? '' : ''
  const gearFragment = cameraPreset ? `shot on ${findCameraBrand(cameraPreset.brand)?.full_name ?? cameraPreset.brand}, ${cameraPreset.focalLength}mm, f/${cameraPreset.aperture}, white balance ${cameraPreset.whiteBalance}K` : ''
  const prompt_parts: VideoPromptParts = { prompt, movement: movementFragment, gear: gearFragment, camera: cameraText }
  if (contract.text) prompt_parts.motionContract = contract.text
  // 계약문이 맨 앞(모델이 앞 토큰을 강하게 가중) — 그 뒤 장면 묘사·수동 카메라·기어.
  //   계약 있는 경로는 캡을 950 으로: 계약(~400자)이 묘사문에 밀려 잘리지 않게. 레거시(계약 없음)는 500 유지.
  let fullPrompt = [contract.text, prompt, movementFragment, gearFragment, cameraText]
    .filter(Boolean)
    .join('. ')
    .slice(0, contract.text ? 950 : 500)

  // V2(previz 실측 검증: END 프레이밍 수렴) — 첫 레퍼런스=START, 마지막=END 로 시작·끝 구도를 고정.
  //   P0(#motion-contract): 옛 문구는 "one continuous camera and subject movement"를 무조건 전제해
  //   정지 샷에도 이동을 지어내게 부추겼다 — 카메라 정지 계약이면 "구도 유지" 분기로.
  if (startEndReference && generationMethod === 'I2V') {
    const startEndInstruction = contract.text && contract.cameraStatic
      ? `The first reference image is the shot's START frame and the last reference image is its END frame — hold this same composition throughout: no camera travel between them, only the contracted subject motion.`
      : `The first reference image is the shot's START frame and the last reference image is its END frame — begin exactly at the START composition and finish exactly at the END composition, with one continuous camera and subject movement between them.`
    prompt_parts.startEnd = startEndInstruction
    fullPrompt = `${fullPrompt} ${startEndInstruction}`.slice(0, contract.text ? 1200 : 800)
  }

  if (modelKey === 'veo' && durationSeconds < 8) {
    const blackInstruction = `Show the described action only for the first ${durationSeconds} seconds; after ${durationSeconds}s the frame must be a completely black screen — no subject, no motion — until the video ends.`
    prompt_parts.black = blackInstruction
    return { fullPrompt: `${fullPrompt} ${blackInstruction}`.slice(0, contract.text ? 1400 : 1000), prompt_parts }
  }

  return { fullPrompt, prompt_parts }
}
