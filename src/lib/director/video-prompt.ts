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
  /** #g7: 대사 절(립싱크 지시 포함). 대사 없는 샷이면 미설정. */
  dialogue?: string
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
  /** #g7 (2026-08-27 오너 확정: 음성은 영상 생성기에 맡긴다) — 이 샷의 대사.
   *  DB(shots.dialogue_lines)에 텍스트·어조·화자가 다 있는데 영상 프롬프트가 참조하지
   *  않아 모델이 대사의 존재를 몰랐다. 입이 안 움직이고 자막 싱크가 안 맞던 원인. */
  dialogueLines?: DialogueLine[] | null
  /** #g7-speakers (2026-08-27 오너 확정): characterId → 화자. 없으면 종전 무명 표기. */
  dialogueSpeakers?: Record<string, DialogueSpeaker> | null
}

/** 대사 화자(characters 테이블에서 해석). appearance 는 시각 앵커 재료로 일부만 쓰인다. */
export interface DialogueSpeaker {
  name: string
  appearance?: string | null
}

/** shots.dialogue_lines 한 줄. emotion/delivery 는 비어 있을 수 있다(파이프라인이 안 채운 경우). */
export interface DialogueLine {
  text?: string | null
  emotion?: string | null
  delivery?: string | null
  characterId?: string | null
}

/** 화자 앵커(#g7-speakers) — 외형 문장을 문장 경계로 누적해 ≤120자(최소 1문장), 끝 마침표 제거.
 *  샷 프롬프트가 캐릭터를 이름 없이 외형으로만 묘사하므로("a young woman in pink jacket"),
 *  이름만으로는 모델이 화면 속 누구인지 접지하지 못한다 — 외형 앵커가 그 다리다. */
function speakerAnchor(appearance: string | null | undefined): string {
  const text = (appearance ?? '').trim()
  if (!text) return ''
  let out = ''
  for (const s of text.split(/(?<=\.)\s+/)) {
    const next = out ? `${out} ${s}` : s
    if (out && next.length > 120) break
    out = next
    if (out.length > 120) break
  }
  return out.replace(/\.+$/, '')
}

/**
 * 대사 절(#g7). memo.md 의 중국 숏드라마 팀 구조를 따른다 —
 *   "음색·성격은 캐릭터 고정 상수, 상태·어조는 컷별 변수"에서 지금 있는 건 컷별 변수쪽이다.
 *   대사 텍스트는 원문 그대로 넣는다(번역하면 입모양이 어긋난다).
 *   여러 줄이면 순서를 명시해 모델이 차례로 말하게 한다.
 * #g7-speakers: speakers 맵이 있으면 화자를 "이름 (외형 앵커)"로 표기 — 다중 화자 샷에서
 *   누가 어느 줄을 말하는지 접지한다. characterId 없는 라인은 퍼시스트 규약상 V.O. 내레이션
 *   (화면 속 화자 없음)이라 립싱크 대상에서 제외한다.
 */
export function dialogueClause(
  lines: DialogueLine[] | null | undefined,
  speakers?: Record<string, DialogueSpeaker> | null,
): string {
  const said = (lines ?? []).filter((l) => (l?.text ?? '').trim())
  if (said.length === 0) return ''
  const isVo = (l: DialogueLine) => !(l.characterId ?? '').trim()
  const parts = said.map((l, i) => {
    const tone = [l.emotion, l.delivery].map((x) => (x ?? '').trim()).filter(Boolean).join(', ')
    const order = said.length > 1 ? `line ${i + 1}: ` : ''
    const sp = l.characterId ? speakers?.[l.characterId] : undefined
    const anchor = sp ? speakerAnchor(sp.appearance) : ''
    const who = isVo(l)
      ? 'a voice-over narration'
      : sp
        ? `${sp.name}${anchor ? ` (${anchor})` : ''}`
        : 'the speaking character'
    return `${order}${who} ${isVo(l) ? 'says' : 'says aloud'}: "${(l.text ?? '').trim()}"${tone ? ` — delivery: ${tone}` : ''}`
  })
  const voCount = said.filter(isVo).length
  const orderNote = said.length > 1 ? ', spoken in the order given' : ''
  // 립싱크를 명시적으로 요구한다. 모델은 기본적으로 무성 클립을 만들려는 편향이 있다.
  //   V.O.만 있으면 립싱크 문장 대신 "화면 속 입 움직임 없음"을 요구한다.
  const head = voCount === said.length ? 'Spoken dialogue (audible voice-over)' : 'Spoken dialogue (audible, lip-synced)'
  const tail =
    voCount === said.length
      ? `These lines are voice-over narration — no on-screen character mouths them${orderNote}; time the scripted action to the words.`
      : `The character's mouth moves in sync with these words${orderNote}; time the scripted action to the words.${voCount > 0 ? ' The voice-over line is narration — no on-screen lip movement for it.' : ''}`
  return `${head}: ${parts.join('; ')}. ${tail}`
}

export function buildVideoPrompt(parts: BuildVideoPromptInput): { fullPrompt: string; prompt_parts: VideoPromptParts } {
  const { prompt, camera, movementPreset, cameraPreset, generationMethod, modelKey, durationSeconds, startEndReference, dynamicSpec, dialogueLines, dialogueSpeakers } = parts
  const contract: MotionContract = compileMotionContract(dynamicSpec, durationSeconds)
  const dialogue = dialogueClause(dialogueLines, dialogueSpeakers)
  const cameraText = camera ? cameraToText(camera) : ''
  const movementFragment = generationMethod === 'T2V' && movementPreset ? findCameraMovement(movementPreset)?.prompt_fragment ?? '' : ''
  const gearFragment = cameraPreset ? `shot on ${findCameraBrand(cameraPreset.brand)?.full_name ?? cameraPreset.brand}, ${cameraPreset.focalLength}mm, f/${cameraPreset.aperture}, white balance ${cameraPreset.whiteBalance}K` : ''
  const prompt_parts: VideoPromptParts = { prompt, movement: movementFragment, gear: gearFragment, camera: cameraText }
  if (contract.text) prompt_parts.motionContract = contract.text
  if (dialogue) prompt_parts.dialogue = dialogue
  // 계약문이 맨 앞(모델이 앞 토큰을 강하게 가중) — 그 뒤 장면 묘사·수동 카메라·기어.
  //   계약 있는 경로는 캡을 950 으로: 계약(~400자)이 묘사문에 밀려 잘리지 않게. 레거시(계약 없음)는 500 유지.
  // 대사는 계약 바로 뒤(#g7) — 앞 토큰 가중을 받되 모션 계약을 밀어내지 않는 자리.
  //   대사가 있으면 캡을 늘린다: 계약(~400자) + 대사(~200자)가 장면 묘사에 밀려 잘리면
  //   립싱크 지시가 통째로 사라진다.
  const cap = contract.text ? (dialogue ? 1200 : 950) : dialogue ? 750 : 500
  let fullPrompt = [contract.text, dialogue, prompt, movementFragment, gearFragment, cameraText]
    .filter(Boolean)
    .join('. ')
    .slice(0, cap)

  // V2(previz 실측 검증: END 프레이밍 수렴) — 첫 레퍼런스=START, 마지막=END 로 시작·끝 구도를 고정.
  //   P0(#motion-contract): 옛 문구는 "one continuous camera and subject movement"를 무조건 전제해
  //   정지 샷에도 이동을 지어내게 부추겼다 — 카메라 정지 계약이면 "구도 유지" 분기로.
  if (startEndReference && generationMethod === 'I2V') {
    const startEndInstruction = contract.text && contract.cameraStatic
      ? `The first reference image is the shot's START frame and the last reference image is its END frame — hold this same composition throughout: no camera travel between them, only the contracted subject motion.`
      : `The first reference image is the shot's START frame and the last reference image is its END frame — begin exactly at the START composition and finish exactly at the END composition, with one continuous camera and subject movement between them.`
    prompt_parts.startEnd = startEndInstruction
    fullPrompt = `${fullPrompt} ${startEndInstruction}`.slice(0, cap + (contract.text ? 250 : 300))
  }

  if (modelKey === 'veo' && durationSeconds < 8) {
    const blackInstruction = `Show the described action only for the first ${durationSeconds} seconds; after ${durationSeconds}s the frame must be a completely black screen — no subject, no motion — until the video ends.`
    prompt_parts.black = blackInstruction
    return { fullPrompt: `${fullPrompt} ${blackInstruction}`.slice(0, contract.text ? 1400 : 1000), prompt_parts }
  }

  return { fullPrompt, prompt_parts }
}
