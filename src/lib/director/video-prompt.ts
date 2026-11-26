import { cameraToText } from '@/lib/director/camera-text'
import { videoMovement } from '@/lib/director/direction-line-prompt'
import { compileMotionContract, type MotionContract } from '@/lib/director/motion-contract'
import type { ContractSubject, GearDesign } from '@/lib/director/video-design'
import { findCameraBrand, findCameraMovement } from '@/lib/knowledge'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import type { VideoModelKey } from '@/lib/video-models'
import type { VideoMode } from '@/lib/director/video-modes'
import { DEFAULT_CAMERA_PRESET, type CameraConfig, type CameraPreset, type GenerationMethod } from '@/types'

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
  /** #u17-3: 레퍼런스 권위 절 — I2V 에서 텍스트↔레퍼런스 상충 시 레퍼런스가 이긴다. */
  referenceAuthority?: string
  referenceRoles?: string
  /** 영상 고치기의 바꿀 점(오너 2026-11-26 O5 · (e)(f)) — 움직임 약속 바로 뒤에 실린다. 고치기가 아니면 미설정. */
  change?: string
  /** 콘티에서 고친 연출 장을 읽은 줄(오너 2026-11-22 Q4) — 있으면 맨 앞에 실리고 움직임은 이 줄이 정한다. 없으면 미설정. */
  directionRead?: string
  /** 영상 만드는 방식 문장(오너 2026-11-27 N4a) — 방식 없이 만든 요청(손 배선 · 옛 요청)이면 미설정. */
  videoMode?: string
}

/** 'direction' = 시작+미들의 미들(실사 가운데 장 — 장면이 아니라 연출 · 의도, 오너 N4a ③ · V2). */
export type VideoReferenceImageRole = 'start' | 'end' | 'ref' | 'direction'

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
  /** 수동 프레임 와이어링으로 전달된 레퍼런스 배열의 역할(배열 순서와 정렬). */
  referenceImageRoles?: VideoReferenceImageRole[]
  /** #motion-contract: v4 dynamic_spec — 있으면 모션 계약문을 컴파일해 맨 앞에 싣는다.
   *  미전달(레거시) = 기존 프롬프트와 동일(계약·분기 없음). */
  dynamicSpec?: ShotDynamicSpec | null
  /** #g7 (2026-08-27 오너 확정: 음성은 영상 생성기에 맡긴다) — 이 샷의 대사.
   *  DB(shots.dialogue_lines)에 텍스트·어조·화자가 다 있는데 영상 프롬프트가 참조하지
   *  않아 모델이 대사의 존재를 몰랐다. 입이 안 움직이고 자막 싱크가 안 맞던 원인. */
  dialogueLines?: DialogueLine[] | null
  /** #g7-speakers (2026-08-27 오너 확정): characterId → 화자. 없으면 종전 무명 표기. */
  dialogueSpeakers?: Record<string, DialogueSpeaker> | null
  /** #camera-motivation(2026-09-07): 카메라 동기의 대상 id → 이름. 계약문의 "Purpose" 절이 이름을 쓴다. */
  characterNames?: Record<string, string> | null
  /**
   * 실사 그림체(오너 2026-11-23 "2 모두 적용을 실사 스타일로") — 글을 문장 중간에서 자르지 않고, 카메라 · 동작 · 말투의 어긋난 말을 고친다.
   *   없으면(다른 그림체 · 독립 영상 · 옛 요청) 지금과 글자까지 같다(tests/director/other-styles-unchanged.test.ts).
   */
  aligned?: boolean
  /**
   * 샷 설계에서 나온 카메라 값(설계가 없으면 null) — 샷의 카메라 값이 이것과 같거나 모두 0 이면 움직임 약속의 카메라만 싣고,
   *   다르면(사람이 고침) 그 값이 약속의 카메라가 된다. 안 보내면(undefined) 지금처럼 약속 뒤에 카메라 값 글을 덧붙인다.
   */
  designCamera?: CameraConfig | null
  /** 설계의 정지 각도만의 카메라 값 — 저장된 값에서 이 축은 움직임이 아니다(내려다보는 각도 = 위아래 회전 -5). */
  designAngle?: CameraConfig | null
  /** 샷 설계의 렌즈 · 초점 · 빛 — 샷에 저장된 카메라 값이 처음 값이면 이것을 쓴다. */
  gearDesign?: GearDesign | null
  /** 인물 id → 이름 · 겉모습 — 움직임 약속이 인물을 이름으로 부른다. */
  subjects?: ReadonlyMap<string, ContractSubject> | null
  /** 설계가 없는 샷에도 시간 · 지어내기 금지 규칙을 싣는다. */
  fallbackContract?: boolean
  /**
   * 영상 고치기의 바꿀 점(영어, 오너 2026-11-26 O5 · (e)(f)) — 샷 글에 붙이지 않고 움직임 약속 바로 뒤에 "Change from the previous take: …"로 싣는다.
   *   앞쪽이라 길이 상한에 잘리지 않는다. 없거나 비면 지금과 글자까지 같다.
   */
  change?: string
  /**
   * 콘티에서 고친 연출 장을 AI 가 읽은 한 줄의 영어판(오너 2026-11-22 Q4 · 리드 D2 — freshDirectionRead 의 en, 끝 장과 상관없이).
   *   있으면 영상의 움직임은 이 줄이 정한다: 맨 앞에 싣고 옛 움직임 약속(dynamicSpec · 설계 없는 샷 규칙)은 싣지 않는다.
   *   장면 글 · 대사 · 카메라 · 그림 역할은 그대로. 없거나 빈 글이면 지금과 글자까지 같다(dev e45d538e 와 같은 규칙, main 구조 위).
   */
  directionLine?: string | null
  /**
   * 영상 만드는 방식(오너 2026-11-27 N4a — dev fb1120-video 문장) — 있으면 그림 역할 · 방식 · "무엇이 진실인가" 세 조각을 맨 뒤에 싣고,
   *   글 상한이 있는 모델(Kling · Happy Horse)은 앞 글부터 줄여 방식 문장을 지킨다. 없으면(손 배선 · 옛 요청) 지금 글 그대로.
   */
  videoMode?: VideoMode | null
  /** ② 레퍼런스 그림의 이름(그림 순서와 같다) — "image 2 = character sheet: Mina". */
  referenceLabels?: string[] | null
}

/** 실사 그림체 영상 지시문의 앞부분 상한 — 글 상한이 없는 모델(Seedance · Veo …)도 이만큼까지만(옛 1,400 · 1,650자는 문장 중간에서 잘렸다). */
export const CONTRACT_BODY_MAX_CHARS = 4000

/** 글 상한이 있는 모델(fal 스키마 2026-11-23 확인). */
const PROMPT_MAX_CHARS: Partial<Record<VideoModelKey, number>> = { 'kling-o3': 2500, 'happy-horse': 2500 }
/** 그림 없는 글 영상 입구(Kling 2.1 T2V)의 글 상한 — fal 스키마 2026-11-23 확인. */
const T2V_PROMPT_MAX_CHARS = 2500

/** 조각을 문장으로 잇는다 — 끝이 문장 부호면 띄어쓰기, 아니면 마침표. */
function joinSentences(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .reduce((out, part) => (out ? `${out}${/[.。!?！？…]["'”’)]*$/u.test(out) ? ' ' : '. '}${part}` : part), '')
}

/** 끝이 문장 부호가 아니면 마침표를 붙인다 — 뒤에 그림 순서 문장이 이어진다. */
const closeSentence = (text: string) => (text && !/[.。!?！？…]["'”’)]*$/u.test(text) ? `${text}.` : text)

/** 상한을 넘으면 문장 경계에서 줄인다 — 문장 경계가 앞쪽(상한의 60% 아래)에만 있으면 내용이 통째로 빠지므로 낱말 경계에서. */
export function clipSentences(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const ends = [...head.matchAll(/[.!?。！？]["'”’)]?(?=\s|$)/gu)]
  const last = ends.length ? ends[ends.length - 1] : null
  if (last && last.index !== undefined && last.index + last[0].length >= max * 0.6) return head.slice(0, last.index + last[0].length)
  const word = head.replace(/\s+\S*$/, '').replace(/[\s,;:]+$/, '')
  return `${word.slice(0, Math.max(0, max - 1))}.`
}

const AXES = ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'] as const
const isZeroCamera = (c: CameraConfig) => AXES.every((k) => (c[k] ?? 0) === 0)
const sameCamera = (a: CameraConfig, b: CameraConfig) => AXES.every((k) => (a[k] ?? 0) === (b[k] ?? 0))

/** 사람이 고친 카메라 움직임 — 설계에서 온 그대로거나 모두 0 이면 null. 설계의 정지 각도와 같은 축은 움직임이 아니라 뺀다(설계가 그 축을 움직이면 각도가 아니다). */
function editedCamera(saved: CameraConfig | null | undefined, designCamera: CameraConfig | null | undefined, designAngle: CameraConfig | null | undefined): CameraConfig | null {
  if (designCamera === undefined || !saved || isZeroCamera(saved) || (designCamera && sameCamera(saved, designCamera))) return null
  const isAngle = (k: (typeof AXES)[number]) => {
    const angle = designAngle?.[k] ?? 0
    return angle !== 0 && saved[k] === angle && (designCamera?.[k] ?? angle) === angle
  }
  const camera = Object.fromEntries(AXES.map((k) => [k, isAngle(k) ? 0 : (saved[k] ?? 0)])) as unknown as CameraConfig
  return isZeroCamera(camera) ? null : camera
}

/** 사람이 고친 카메라 값이면 약속에 실을 글("pans steadily to the right; zooms slowly in"), 아니면 null. */
function cameraOverrideText(camera: CameraConfig | null): string | null {
  return camera ? cameraToText(camera).split('. ').map((s) => s.replace(/^Camera\s+/, '')).join('; ') || null : null
}

/** 카메라 기종 글 — 저장된 값이 처음 값이면 샷 설계의 렌즈 · 초점 · 빛, 사람이 고친 값이면 그 값. 설계를 안 보내면 지금과 같다. */
function gearText(preset: CameraPreset | null | undefined, design: GearDesign | null | undefined): string {
  if (!preset) return ''
  const brand = `shot on ${findCameraBrand(preset.brand)?.full_name ?? preset.brand}`
  const untouched = (['brand', 'focalLength', 'aperture', 'whiteBalance'] as const).every((k) => preset[k] === DEFAULT_CAMERA_PRESET[k])
  if (!design || !untouched) return `${brand}, ${preset.focalLength}mm, f/${preset.aperture}, white balance ${preset.whiteBalance}K`
  return [
    brand,
    design.lensMm ? `${design.lensMm}mm lens` : `${preset.focalLength}mm`,
    design.focus ?? `f/${preset.aperture}`,
    design.kelvin ? `scene light around ${design.kelvin}K` : `white balance ${preset.whiteBalance}K`,
  ].join(', ')
}

function referenceRolesClause(roles: VideoReferenceImageRole[]): string {
  const order = roles
    .map((role, index) => `image ${index + 1} = ${role.toUpperCase()}`)
    .join(', ')
  const refs = roles.includes('ref')
    ? ' REF images are style/character references, not temporal keyframes.'
    : ''
  const hasStart = roles.includes('start')
  const hasEnd = roles.includes('end')
  const temporal =
    hasStart && hasEnd
      ? ' The START image is the beginning of the shot, and the END image is the completed composition.'
      : hasStart
        ? ' The START image is the beginning of the shot.'
        : hasEnd
          ? ' The END image is the completed composition.'
          : ''
  return `Reference image order: ${order}.${refs}${temporal}`
}

/**
 * 방식 문장(오너 2026-11-27 N4a · dev fb1120-video 와 같은 글) — 그림 역할 · 방식 · "무엇이 진실인가" 세 조각.
 *   그림 번호는 참고 그림 목록 순서다(H3 Max 의 첫 장면 칸도 목록 1번을 함께 싣는다 — fal-video-request).
 */
function videoModeTail(input: {
  mode: VideoMode
  roles: VideoReferenceImageRole[]
  labels: string[] | null
  defaultAuthority: string
}): { roles: string; mode: string; authority: string } {
  const { mode, roles, labels, defaultAuthority } = input
  switch (mode) {
    case 'continue':
      return {
        roles: referenceRolesClause(roles),
        mode: "Image 1 is the last frame of the previous shot's video: begin exactly on it so the cut between the two shots is seamless — same positions, poses, lighting and framing in the first frame.",
        authority: defaultAuthority,
      }
    case 'start_prompt':
      return {
        roles: referenceRolesClause(roles),
        mode: 'There is no end frame: after starting exactly on image 1, let this text decide how the shot moves and how it ends.',
        authority: defaultAuthority,
      }
    case 'start_middle':
      return {
        roles: referenceRolesClause(roles),
        mode: 'Image 2 is the START frame overlaid with drawn DIRECTION arrows and labels, not a frame of the video: its arrows, dashed paths and handwritten labels only show the intended camera and subject movement. Perform that movement starting from image 1. Never draw arrows, lines, labels, text, pencil texture or wooden mannequins from image 2 in the video. If this text and the sketch disagree about the movement, follow the sketch.',
        authority: 'Image 1 is the visual ground truth — match its lighting, color temperature, wardrobe, set dressing and framing exactly; wherever this text description differs from image 1, follow image 1.',
      }
    case 'reference': {
      const named = roles.map((_, index) => `image ${index + 1} = ${labels?.[index] ?? 'REF'}`).join(', ')
      return {
        roles: `Reference images (references only — not frames of this video): ${named}.`,
        mode: "Keep each person's face, hair and outfit, the location and the props consistent with these references, but compose the shot from this text: no reference image is the first or last frame, and never reproduce a character sheet's white background, multiple poses or layout.",
        authority: '',
      }
    }
  }
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
  /** 실사 그림체만(2026-11-23): 말투는 목소리만이라고 적고, 움직임 약속이 겉모습과 함께 이름을 이미 적은 인물(introduced)은 이름만 적는다. */
  opts?: { aligned?: boolean; introduced?: ReadonlySet<string> | null },
): string {
  const said = (lines ?? []).filter((l) => (l?.text ?? '').trim())
  if (said.length === 0) return ''
  const isVo = (l: DialogueLine) => !(l.characterId ?? '').trim()
  const parts = said.map((l, i) => {
    const tone = [l.emotion, l.delivery].map((x) => (x ?? '').trim()).filter(Boolean).join(', ')
    const order = said.length > 1 ? `line ${i + 1}: ` : ''
    const sp = l.characterId ? speakers?.[l.characterId] : undefined
    const anchor = sp && !opts?.introduced?.has(l.characterId ?? '') ? speakerAnchor(sp.appearance) : ''
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
  // 말투 글("반쯤 일어서며")이 몸 동작까지 시키지 않게 — 몸은 움직임 약속이 정한다(2026-11-23 시브셀러 샷 27).
  const voice = opts?.aligned && said.some((l) => (l.emotion ?? '').trim() || (l.delivery ?? '').trim()) ? ' Delivery notes describe the voice only.' : ''
  return `${head}: ${parts.join('; ')}. ${tail}${voice}`
}

/**
 * 만들어 둔 지시문을 다른 모델로 보낼 때(자동 대체) 그 모델의 글 상한 안으로 — 뒤에 붙은 그림 순서 문장은 남기고 앞 글을 문장 경계에서 줄인다.
 *   Happy Horse 는 2,500자까지만 받는데 Seedance 로 만든 실사 그림체 지시문은 더 길 수 있다(상한 안의 글은 그대로).
 */
export function fitPromptForModel(fullPrompt: string, modelKey: VideoModelKey, promptParts?: unknown): string {
  const limit = PROMPT_MAX_CHARS[modelKey]
  if (!limit || fullPrompt.length <= limit) return fullPrompt
  const p = (promptParts ?? {}) as Partial<VideoPromptParts>
  // Veo 의 검은 화면 지시(길이 맞추기)는 다른 모델에 필요 없고, 맨 끝이라 아래 그림 순서 문장을 가린다 — 먼저 뗀다.
  if (typeof p.black === 'string' && p.black && fullPrompt.endsWith(p.black)) fullPrompt = fullPrompt.slice(0, -p.black.length).trimEnd()
  if (fullPrompt.length <= limit) return fullPrompt
  // 방식 문장(N4a)은 그림 순서 문장 바로 뒤에 붙는다 — 같은 순서로 떼어 남긴다.
  const tail = [p.referenceRoles, p.videoMode, p.startEnd, p.referenceAuthority].filter((x): x is string => typeof x === 'string' && !!x).join(' ')
  if (tail && tail.length + 1 < limit && fullPrompt.endsWith(tail)) {
    const head = fullPrompt.slice(0, fullPrompt.length - tail.length).trimEnd()
    return `${clipSentences(head, limit - tail.length - 1)} ${tail}`
  }
  return clipSentences(fullPrompt, limit)
}

export function buildVideoPrompt(parts: BuildVideoPromptInput): { fullPrompt: string; prompt_parts: VideoPromptParts } {
  const { prompt, camera, movementPreset, cameraPreset, generationMethod, modelKey, durationSeconds, startEndReference, referenceImageRoles, dynamicSpec, dialogueLines, dialogueSpeakers, characterNames } = parts
  const aligned = parts.aligned === true
  const moved = editedCamera(camera, parts.designCamera, parts.designAngle)
  // 오너 Q4: 콘티에서 고친 연출 장을 읽은 줄이 있으면 움직임은 그 줄이 정한다 — 옛 움직임 약속 · 설계 없는 샷 규칙("장면 글의 동작만")은 싣지 않는다.
  const movement = videoMovement(parts.directionLine)
  const contract: MotionContract = compileMotionContract(movement ? null : dynamicSpec, durationSeconds, {
    names: characterNames ? new Map(Object.entries(characterNames)) : null,
    aligned,
    subjects: parts.subjects ?? null,
    cameraOverride: cameraOverrideText(moved),
    fallback: parts.fallbackContract === true && !movement,
  })
  const dialogue = dialogueClause(dialogueLines, dialogueSpeakers, { aligned, introduced: contract.introduced })
  // 설계의 카메라 값을 아는 요청은 카메라를 움직임 약속 한 곳에서만 말한다.
  const cameraText = !camera
    ? ''
    : parts.designCamera === undefined
      ? cameraToText(camera)
      : contract.text || !moved
        ? ''
        : cameraToText(moved)
  const movementFragment = generationMethod === 'T2V' && movementPreset ? findCameraMovement(movementPreset)?.prompt_fragment ?? '' : ''
  const gearFragment = gearText(cameraPreset, parts.gearDesign)
  const prompt_parts: VideoPromptParts = { prompt, movement: movementFragment, gear: gearFragment, camera: cameraText }
  if (contract.text) prompt_parts.motionContract = contract.text
  if (dialogue) prompt_parts.dialogue = dialogue
  // 영상 고치기의 바꿀 점(오너 O5 · (e)(f)) — 움직임 약속 바로 뒤 · 대사와 샷 글 앞. 상한은 뒤에서 자르므로 여기는 잘리지 않는다.
  const changeText = parts.change?.trim() ? `Change from the previous take: ${parts.change.trim()}` : ''
  if (changeText) prompt_parts.change = changeText
  if (movement) prompt_parts.directionRead = movement.line
  // 계약문이 맨 앞(모델이 앞 토큰을 강하게 가중) — 그 뒤 장면 묘사·수동 카메라·기어.
  //   계약 있는 경로는 캡을 950 으로: 계약(~400자)이 묘사문에 밀려 잘리지 않게. 레거시(계약 없음)는 500 유지.
  // 대사는 계약 바로 뒤(#g7) — 앞 토큰 가중을 받되 모션 계약을 밀어내지 않는 자리.
  //   대사가 있으면 캡을 늘린다: 계약(~400자) + 대사(~200자)가 장면 묘사에 밀려 잘리면
  //   립싱크 지시가 통째로 사라진다.
  // #coverage-first(2026-09-02 리뷰 M3): 순차 계약(then·순서 문장·gaze)이 계약문을 ~1000자까지 키워
  //   옛 캡(950)에서 ban 절과 장면 묘사문(prompt — 리빌 대상을 나르는 유일한 채널)이 통째로 잘렸다.
  //   계약 경로 캡 +450.
  // 실사 그림체(2026-11-23): 움직임 약속이 있는 길은 1,400 · 1,650자에서 자르지 않는다 — 샷 글이 문장 중간에서 끊겼다(시브셀러 2 · 4 · 6 · 8, 우산 1).
  //   CONTRACT_BODY_MAX_CHARS 까지, 넘치면 문장 경계에서 줄인다. 글 상한이 있는 입구(Kling · Happy Horse, 그림 없는 글 영상)는 그 상한까지.
  // 읽은 줄(오너 Q4)은 움직임 약속 자리를 대신해 맨 앞이다 — 실사 그림체는 지금처럼 문장 경계에서 줄이고(설계된 길),
  //   다른 그림체는 줄 길이만큼 상한을 늘려 줄이 장면 글 자리를 빼앗지 않게 한다(dev e45d538e). 줄이 없으면 지금 그대로.
  const designed = aligned && (!!contract.text || !!movement)
  const cap = (designed ? CONTRACT_BODY_MAX_CHARS : contract.text ? (dialogue ? 1650 : 1400) : dialogue ? 750 : 500) + (movement && !designed ? movement.text.length + 2 : 0)
  // Veo 로 고른 영상은 맨 끝에 검은 화면 지시가 붙는다 — 글 영상 입구의 상한은 그 자리까지 합친 것이다.
  const blackInstruction = modelKey === 'veo' && durationSeconds < 8
    ? `Show the described action only for the first ${durationSeconds} seconds; after ${durationSeconds}s the frame must be a completely black screen — no subject, no motion — until the video ends.`
    : null
  const limit = generationMethod === 'T2V' ? T2V_PROMPT_MAX_CHARS - (blackInstruction ? blackInstruction.length + 1 : 0) : (PROMPT_MAX_CHARS[modelKey] ?? null)
  const withTail = (head: string, tail: string, legacyMax: number) =>
    designed
      ? `${limit === null ? head : clipSentences(head, Math.max(0, limit - tail.length - 1))} ${tail}`
      : `${head} ${tail}`.slice(0, legacyMax)
  const pieces = [movement?.text ?? '', contract.text, changeText, dialogue, prompt, movementFragment, gearFragment, cameraText].filter(Boolean)
  let fullPrompt = designed
    ? clipSentences(closeSentence(joinSentences(pieces)), limit === null ? cap : Math.min(cap, limit))
    : pieces.join('. ').slice(0, cap)

  // #u17-3(2026-08-31 오너 확정, 실측 sh_02_04): 장면 묘사문(shots.prompt)은 writer 가 상상한
  //   프레임 묘사라 실제 생성된 레퍼런스와 조명·배경·질감이 어긋날 수 있다 — 이미지 경로는
  //   "이 그림을 다시 그려라"(레퍼런스 권위)인데 영상만 텍스트 권위였던 배선 비대칭의 교정.
  const referenceAuthority = `The reference images are the visual ground truth — match their lighting, color temperature, wardrobe, set dressing and framing exactly; wherever this text description differs from the reference images, follow the references.`

  if (referenceImageRoles?.length && generationMethod === 'I2V' && parts.videoMode) {
    // 방식 문장(오너 2026-11-27 N4a): 역할 · 방식 · 진실 세 조각을 뒤에 붙인다. 글 상한이 있는 모델(Kling · Happy Horse 2,500자)은
    //   넘치면 앞 글(샷 글)부터 줄여 방식 문장이 잘려 사라지지 않게 한다(dev fb1120-video 와 같은 규칙, main 의 실사 그림체 길은 문장 경계에서 줄인다).
    const tail = videoModeTail({ mode: parts.videoMode, roles: referenceImageRoles, labels: parts.referenceLabels ?? null, defaultAuthority: referenceAuthority })
    prompt_parts.referenceRoles = tail.roles
    prompt_parts.videoMode = tail.mode
    if (tail.authority) prompt_parts.referenceAuthority = tail.authority
    const tailText = [tail.roles, tail.mode, tail.authority].filter(Boolean).join(' ')
    fullPrompt = designed
      ? withTail(fullPrompt, tailText, 0)
      : `${limit === null ? fullPrompt : fullPrompt.slice(0, Math.max(0, limit - tailText.length - 1))} ${tailText}`
  } else if (referenceImageRoles?.length && generationMethod === 'I2V') {
    const roleInstruction = referenceRolesClause(referenceImageRoles)
    prompt_parts.referenceRoles = roleInstruction
    prompt_parts.referenceAuthority = referenceAuthority
    fullPrompt = withTail(fullPrompt, `${roleInstruction} ${referenceAuthority}`, cap + (contract.text ? 700 : 650))
  }

  // V2(previz 실측 검증: END 프레이밍 수렴) — 첫 레퍼런스=START, 마지막=END 로 시작·끝 구도를 고정.
  //   P0(#motion-contract): 옛 문구는 "one continuous camera and subject movement"를 무조건 전제해
  //   정지 샷에도 이동을 지어내게 부추겼다 — 카메라 정지 계약이면 "구도 유지" 분기로.
  if (!referenceImageRoles?.length && startEndReference && generationMethod === 'I2V') {
    const startEndInstruction = contract.text && contract.cameraStatic
      ? `The first reference image is the shot's START frame and the last reference image is its END frame — hold this same composition throughout: no camera travel between them, only the contracted subject motion.`
      : `The first reference image is the shot's START frame and the last reference image is its END frame — begin exactly at the START composition and finish exactly at the END composition, with one continuous camera and subject movement between them.`
    prompt_parts.startEnd = startEndInstruction
    prompt_parts.referenceAuthority = referenceAuthority
    fullPrompt = withTail(fullPrompt, `${startEndInstruction} ${referenceAuthority}`, cap + (contract.text ? 500 : 550))
  }

  if (blackInstruction) {
    prompt_parts.black = blackInstruction
    // 리뷰 R2: 옛 하드코딩 1400 이 캡 인상(1400/1650)과 함께 안 움직여 black 지시가 통째로 잘렸다.
    //   black 지시는 기능 요구사항이라 항상 뒤에 붙인다(앞 본문은 이미 cap(+확장)으로 잘려 있다).
    return { fullPrompt: `${fullPrompt} ${blackInstruction}`, prompt_parts }
  }

  return { fullPrompt, prompt_parts }
}
