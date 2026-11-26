// 실사 가운데(연출) 장 화살표 고치기의 지시문(오너 2026-11-27 N4b "실사 이미지에서 화살표 수정하면 뒤에 마지막 프레임 수정해줘. (이미지만)") — 순수 문장만.
//   밑층(Grok i2i): 실사 가운데 장에서 화살표 · 움직임 선 · 글씨만 지운 그림 — 실사 가운데 장은 시작 장과 화소가 달라(구도가 조금 옮겨져 그려진다)
//     그 장 자체에서 지운 밑층이어야 지우개로 긁은 자리가 맞는다. 콘티 밑층 문장(연필 · 목각)은 쓰지 않는다.
//   끝 장(GPT Image 2): 콘티 끝 장 ②(오너 Q1 · Q3)와 같은 길 — 실사 시작 장 한 장 + 고친 화살표를 읽은 줄. 샷 설계의 옛 움직임 글은 싣지 않는다.
//     실사 그림체(사진 길, resolvePhotoLook)는 main 실사 지시문과 같은 실제 사진 문장 · 그 그림체 색감 문장을 싣고, 다른 그림체는 그 그림의 그림체를 지키게 한다.
//   서버 · 화면 어디서나 불러도 되는 순수 파일이다. 약속: tests/writer/real-arrow-prompts.test.ts
import { hasPhotoTexture, PHOTO_TEXTURE_PEOPLE, PHOTO_TEXTURE_PLACE } from '@/lib/style-facets/photo-sheet-line'

/** 실사 끝 장을 그리는 그림 AI — 콘티 끝 장 ②와 같다(오너 Q1 "2번 shot이 제일 성능이 좋아" · Q3). */
export const REAL_END_MODEL = 'openai/gpt-image-2/edit'

/** 밑층 — 실사 가운데 장에서 그린 표시만 지운다(그림체 · 빛 · 사람은 그대로). */
export const REAL_STRIP_ARROWS_PROMPT =
  'Remove every arrow, motion line, dashed path, direction indicator and text label drawn on top of this picture. ' +
  'Keep everything else exactly identical: the same framing, the same people in the same poses, the same background, ' +
  'and the same rendering style, light, colors and detail. Do not add any text, marks or borders. Return only the cleaned picture.'

const CARRY = 'Carry the movement its full extent, not a barely-changed copy, and keep everything not mentioned where it is.'
const NO_MARKS = 'No text, letters, numbers, arrows or marks anywhere.'
const NO_PEOPLE = 'There are no people in this shot; do not add any person or figure.'

export interface RealEndPlanInput {
  /** 실사 시작 장 주소 — 끝 장의 유일한 참고 그림. */
  start: string
  /** 고친 화살표를 읽은(사람이 고친) 영어 줄. */
  line: string
  /** 샷 길이(초) — 모르면 null(길이 말을 뺀다). */
  seconds: number | null
  /** 실사 그림체(사진 길)면 그 그림체 색감 문장(없으면 clause null), 아니면 null. */
  photoLook: { clause: string | null } | null
  /** 사람이 없는 샷(shots.characters 가 빈 목록) — 사람 이야기를 싣지 않는다. */
  noPeople?: boolean
}

export interface RealEndPlan {
  model: string
  prompt: string
  refs: string[]
  /** 내용 검사에 보낼 사용자 글 — 읽은 줄(사람 손글씨가 옮겨진 글). */
  userText: string
}

function endPrompt(input: RealEndPlanInput): string {
  const over = typeof input.seconds === 'number' && input.seconds > 0 ? ` over ${Math.round(input.seconds)} seconds` : ''
  const line = input.line.trim()
  const noPeople = input.noPeople === true
  if (input.photoLook) {
    const clause = (input.photoLook.clause ?? '').trim()
    return [
      `This is a live-action film still: the first moment of one shot, photographed with a real camera${noPeople ? ' on a real location' : ' with real actors'}.`,
      `Photograph the same shot at the moment this movement has fully completed${over}: ${line}`,
      CARRY,
      `Same location${noPeople ? '' : ', people, faces, hair and outfits'}, props, lens and light as this still.`,
      ...(noPeople ? [NO_PEOPLE] : []),
      ...(hasPhotoTexture(clause) ? [] : [`${noPeople ? PHOTO_TEXTURE_PLACE : PHOTO_TEXTURE_PEOPLE}.`]),
      ...(clause ? [clause] : []),
      NO_MARKS,
      'Return only the photograph.',
    ].join(' ')
  }
  return [
    'This picture is the first moment of one film shot.',
    `Redraw the same shot at the moment this movement has fully completed${over}: ${line}`,
    CARRY,
    `Same location${noPeople ? '' : ', characters and outfits'}, props, and exactly the same art style, colors, light and rendering as this picture.`,
    ...(noPeople ? [NO_PEOPLE] : []),
    NO_MARKS,
    'Return only the picture.',
  ].join(' ')
}

/** 순수: 실사 끝 장 그리기 계획 — 그림 AI · 문장 · 참고 그림(시작 장 하나) · 내용 검사할 글. */
export function realEndFramePlan(input: RealEndPlanInput): RealEndPlan {
  if (!input.line.trim()) throw new Error('the real end frame needs the line read from the directing frame')
  return { model: REAL_END_MODEL, prompt: endPrompt(input), refs: [input.start], userText: input.line.trim() }
}
