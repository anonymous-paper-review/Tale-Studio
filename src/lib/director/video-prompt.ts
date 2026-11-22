import { cameraToText } from '@/lib/director/camera-text'
import { compileMotionContract, type MotionContract } from '@/lib/director/motion-contract'
import { findCameraBrand, findCameraMovement } from '@/lib/knowledge'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'
import { VIDEO_MODELS, planModelImageRoles, type ModelImageRolePlan, type VideoModelKey } from '@/lib/video-models'
import type { StartMiddleSource, VideoMode } from '@/lib/director/video-modes'
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
  /** #u17-3: 레퍼런스 권위 절 — I2V 에서 텍스트↔레퍼런스 상충 시 레퍼런스가 이긴다. */
  referenceAuthority?: string
  referenceRoles?: string
  /** 영상 만드는 방식 문장(2026-11-22 D2~D5) — 기본(시작+끝)이면 없다. */
  videoMode?: string
  /** 고친 연출 장을 읽은 줄(오너 2026-11-22 Q4) — 있으면 움직임은 이 줄이 정한다. */
  directionRead?: string
}

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
  /** 영상 만드는 방식(오너 2026-11-22 D2~D5) — 없거나 'start_end' 면 지금 글 그대로. */
  videoMode?: VideoMode | null
  /** ② 레퍼런스 그림의 이름(그림 순서와 같다) — "image 2 = character sheet: Mina". */
  referenceLabels?: string[] | null
  /** ③ 미들 출처 — 러프 스케치와 실사 가운데 장을 다르게 부른다. */
  middleSource?: StartMiddleSource | null
  /**
   * 고친 연출 장을 AI 가 읽은 한 줄의 영어판(오너 2026-11-22 Q4 — fb-end freshDirectionLine). 있으면 영상의 움직임은 이 줄이 정한다:
   *   맨 앞에 싣고 옛 움직임 계약(dynamicSpec)은 싣지 않는다. 없거나(null) 빈 글이면 지금 지시 그대로(정상 경로 고정).
   */
  directionLine?: string | null
}

/** 읽은 줄을 싣는 길이 상한 — 사람이 고친 줄이 지나치게 길면 다른 지시를 밀어낸다. */
export const DIRECTION_LINE_MAX_CHARS = 400

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
 * 첫 · 마지막 장면 칸이 있는 모델(Kling O3, 2026-11-22)의 역할 문장 — 시작 · 끝은 칸이라 그림 번호가 없고,
 *   참고 칸 그림은 그 모델의 이름표(@Image1 …)로 부른다. "image 1 = START" 는 참고 칸 번호와 어긋나서 쓰지 않는다.
 */
function frameSlotRolesClause(plan: ModelImageRolePlan): string {
  const frames = plan.firstFrame && plan.lastFrame
    ? 'The video starts exactly on the given first frame and ends exactly on the given last frame, which is the completed composition.'
    : plan.firstFrame
      ? 'The video starts exactly on the given first frame.'
      : plan.lastFrame
        ? 'The video ends exactly on the given last frame, which is the completed composition.'
        : ''
  const order = plan.imageRoles
    .map((role, index) => `@Image${index + 1} = ${role === 'start_look' ? 'the first frame again (look and identity only)' : role.toUpperCase()}`)
    .join(', ')
  const refs = plan.imageRoles.includes('ref') ? ' REF images are style/character references, not temporal keyframes.' : ''
  return [frames, order ? `Reference images: ${order}.${refs}` : ''].filter(Boolean).join(' ')
}

/**
 * 방식 문장(오너 2026-11-22 D2~D5) — 그림 역할 · 방식 · "무엇이 진실인가" 세 조각. 첫 · 마지막 장면 칸이 있는 모델(Kling)은
 *   시작을 "the given first frame", 참고 칸 그림을 "@Image1 …"로 부른다(그림 번호가 참고 칸 번호와 어긋나지 않게).
 */
function videoModeTail(input: {
  mode: VideoMode
  roles: VideoReferenceImageRole[]
  slotPlan: ModelImageRolePlan | null
  labels: string[] | null
  middleSource: StartMiddleSource | null
  defaultAuthority: string
}): { roles: string; mode: string; authority: string } {
  const { mode, roles, slotPlan, labels, middleSource, defaultAuthority } = input
  const slotted = slotPlan !== null
  const first = slotted ? 'the given first frame' : 'image 1'
  const First = slotted ? 'The given first frame' : 'Image 1'
  const roleText = slotted ? frameSlotRolesClause(slotPlan) : referenceRolesClause(roles)
  switch (mode) {
    case 'continue':
      return {
        roles: roleText,
        mode: `${First} is the last frame of the previous shot's video: begin exactly on it so the cut between the two shots is seamless — same positions, poses, lighting and framing in the first frame.`,
        authority: defaultAuthority,
      }
    case 'start_prompt':
      return {
        roles: roleText,
        mode: `There is no ${slotted ? 'last' : 'end'} frame: after starting exactly on ${first}, let this text decide how the shot moves and how it ends.`,
        authority: defaultAuthority,
      }
    case 'start_middle': {
      const sketch = slotted ? '@Image1' : 'image 2'
      const Sketch = slotted ? '@Image1' : 'Image 2'
      const what = middleSource === 'real'
        ? 'the START frame overlaid with drawn DIRECTION arrows and labels'
        : 'a hand-drawn DIRECTION sketch'
      return {
        roles: roleText,
        mode: `${Sketch} is ${what}, not a frame of the video: its arrows, dashed paths and handwritten labels only show the intended camera and subject movement. Perform that movement starting from ${first}. Never draw arrows, lines, labels, text, pencil texture or wooden mannequins from ${sketch} in the video. If this text and the sketch disagree about the movement, follow the sketch.`,
        authority: `${First} is the visual ground truth — match its lighting, color temperature, wardrobe, set dressing and framing exactly; wherever this text description differs from ${first}, follow ${first}.`,
      }
    }
    case 'reference': {
      const tag = (index: number) => (slotted ? `@Image${index + 1}` : `image ${index + 1}`)
      const named = roles.map((_, index) => `${tag(index)} = ${labels?.[index] ?? 'REF'}`).join(', ')
      return {
        roles: `Reference images (references only — not frames of this video): ${named}.`,
        mode: `Keep each person's face, hair and outfit, the location and the props consistent with these references, but compose the shot from this text: no reference image is the first or last frame, and never reproduce a character sheet's white background, multiple poses or layout.`,
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
  const { prompt, camera, movementPreset, cameraPreset, generationMethod, modelKey, durationSeconds, startEndReference, referenceImageRoles, dynamicSpec, dialogueLines, dialogueSpeakers, characterNames, videoMode, referenceLabels, middleSource } = parts
  // 오너 Q4(2026-11-22): 고친 연출 장을 읽은 줄이 있으면 움직임은 그 줄이 정한다 — 옛 움직임 계약은 싣지 않는다(끝 그림과 같은 원칙).
  const directionLine = typeof parts.directionLine === 'string' && parts.directionLine.trim()
    ? parts.directionLine.trim().slice(0, DIRECTION_LINE_MAX_CHARS)
    : null
  const movementText = directionLine ? `Movement (from the edited direction sketch): ${directionLine}` : ''
  const contract: MotionContract = compileMotionContract(directionLine ? null : dynamicSpec, durationSeconds, {
    names: characterNames ? new Map(Object.entries(characterNames)) : null,
  })
  const dialogue = dialogueClause(dialogueLines, dialogueSpeakers)
  const cameraText = camera ? cameraToText(camera) : ''
  const movementFragment = generationMethod === 'T2V' && movementPreset ? findCameraMovement(movementPreset)?.prompt_fragment ?? '' : ''
  const gearFragment = cameraPreset ? `shot on ${findCameraBrand(cameraPreset.brand)?.full_name ?? cameraPreset.brand}, ${cameraPreset.focalLength}mm, f/${cameraPreset.aperture}, white balance ${cameraPreset.whiteBalance}K` : ''
  const prompt_parts: VideoPromptParts = { prompt, movement: movementFragment, gear: gearFragment, camera: cameraText }
  if (directionLine) prompt_parts.directionRead = directionLine
  if (contract.text) prompt_parts.motionContract = contract.text
  if (dialogue) prompt_parts.dialogue = dialogue
  // 계약문이 맨 앞(모델이 앞 토큰을 강하게 가중) — 그 뒤 장면 묘사·수동 카메라·기어.
  //   계약 있는 경로는 캡을 950 으로: 계약(~400자)이 묘사문에 밀려 잘리지 않게. 레거시(계약 없음)는 500 유지.
  // 대사는 계약 바로 뒤(#g7) — 앞 토큰 가중을 받되 모션 계약을 밀어내지 않는 자리.
  //   대사가 있으면 캡을 늘린다: 계약(~400자) + 대사(~200자)가 장면 묘사에 밀려 잘리면
  //   립싱크 지시가 통째로 사라진다.
  // #coverage-first(2026-09-02 리뷰 M3): 순차 계약(then·순서 문장·gaze)이 계약문을 ~1000자까지 키워
  //   옛 캡(950)에서 ban 절과 장면 묘사문(prompt — 리빌 대상을 나르는 유일한 채널)이 통째로 잘렸다.
  //   계약 경로 캡 +450.
  // 읽은 줄은 맨 앞이고 그 길이만큼 상한을 늘린다 — 줄이 장면 글 자리를 빼앗지 않게(줄이 없으면 지금 상한 그대로).
  const cap = (contract.text ? (dialogue ? 1650 : 1400) : dialogue ? 750 : 500) + (movementText ? movementText.length + 2 : 0)
  let fullPrompt = [movementText, contract.text, dialogue, prompt, movementFragment, gearFragment, cameraText]
    .filter(Boolean)
    .join('. ')
    .slice(0, cap)

  // #u17-3(2026-08-31 오너 확정, 실측 sh_02_04): 장면 묘사문(shots.prompt)은 writer 가 상상한
  //   프레임 묘사라 실제 생성된 레퍼런스와 조명·배경·질감이 어긋날 수 있다 — 이미지 경로는
  //   "이 그림을 다시 그려라"(레퍼런스 권위)인데 영상만 텍스트 권위였던 배선 비대칭의 교정.
  const referenceAuthority = `The reference images are the visual ground truth — match their lighting, color temperature, wardrobe, set dressing and framing exactly; wherever this text description differs from the reference images, follow the references.`

  // 방식이 있으면 늘 방식 문장을 붙인다 — 시작+끝(방식 문장 없음)은 오너 2026-11-22 폐기.
  const modeForTail = videoMode ?? null
  if (referenceImageRoles?.length && generationMethod === 'I2V' && modeForTail) {
    // 방식 문장(2026-11-22): 역할 · 방식 · 진실 세 조각을 뒤에 붙인다. 글 상한이 있는 모델(Kling · Happy Horse 2500자)은
    //   넘치면 앞 글(샷 글)부터 잘라 방식 문장이 잘려 사라지지 않게 한다.
    const tail = videoModeTail({
      mode: modeForTail,
      roles: referenceImageRoles,
      slotPlan: planModelImageRoles(modelKey, referenceImageRoles),
      labels: referenceLabels ?? null,
      middleSource: middleSource ?? null,
      defaultAuthority: referenceAuthority,
    })
    prompt_parts.referenceRoles = tail.roles
    prompt_parts.videoMode = tail.mode
    if (tail.authority) prompt_parts.referenceAuthority = tail.authority
    const tailText = [tail.roles, tail.mode, tail.authority].filter(Boolean).join(' ')
    const max = VIDEO_MODELS[modelKey].promptMaxChars
    const head = max ? fullPrompt.slice(0, Math.max(0, max - tailText.length - 1)) : fullPrompt
    fullPrompt = `${head} ${tailText}`
  } else if (referenceImageRoles?.length && generationMethod === 'I2V') {
    const slotPlan = planModelImageRoles(modelKey, referenceImageRoles)
    const roleInstruction = slotPlan ? frameSlotRolesClause(slotPlan) : referenceRolesClause(referenceImageRoles)
    prompt_parts.referenceRoles = roleInstruction
    prompt_parts.referenceAuthority = referenceAuthority
    fullPrompt = `${fullPrompt} ${roleInstruction} ${referenceAuthority}`.slice(0, cap + (contract.text ? 700 : 650))
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
    fullPrompt = `${fullPrompt} ${startEndInstruction} ${referenceAuthority}`.slice(0, cap + (contract.text ? 500 : 550))
  }

  if (modelKey === 'veo' && durationSeconds < 8) {
    const blackInstruction = `Show the described action only for the first ${durationSeconds} seconds; after ${durationSeconds}s the frame must be a completely black screen — no subject, no motion — until the video ends.`
    prompt_parts.black = blackInstruction
    // 리뷰 R2: 옛 하드코딩 1400 이 캡 인상(1400/1650)과 함께 안 움직여 black 지시가 통째로 잘렸다.
    //   black 지시는 기능 요구사항이라 항상 뒤에 붙인다(앞 본문은 이미 cap(+확장)으로 잘려 있다).
    return { fullPrompt: `${fullPrompt} ${blackInstruction}`, prompt_parts }
  }

  return { fullPrompt, prompt_parts }
}
