// 실사 그림체의 실사 샷 지시문 — 오너 2026-11-23 "'2 모두 적용'을 실사 스타일로 지정해주고 바로 main에 올려줘".
//   기준 그림 없이 그리는 실사(resolvePhotoLook 이 있을 때)만 쓴다. 일본 멜로를 비롯한 다른 그림체는 storyboard-strip 의 지금 지시문 그대로다.
//   원칙: 연필 러프는 구도 · 사람 수 · 자리 · 자세의 도면이고 생김새는 아니다. 결과는 실제 카메라로 찍은 사진이다.
//   참고 그림 순서(storyboard-strip 과 같다): [러프 띠 · 시트, ...인물 시트, 배경, 추가 입력].
//   약속: tests/director/still-consistency.test.ts
import { gridMovementLines, stripMovementLines } from '@/lib/director/direction-line-prompt'
import { STILL_NO_MARKS_LINE, STILL_PANEL_RULE, clipWords, leftToRight, type StillLabel } from '@/lib/director/still-prompt'
import { assetAuthorityClause, type CharacterRefLabel } from '@/lib/director/storyboard-strip'
import { hasPhotoTexture, PHOTO_TEXTURE_PEOPLE, PHOTO_TEXTURE_PLACE } from '@/lib/style-facets/photo-sheet-line'

/** 인물 줄 라벨 — 이름 · 러프 자리 · 자세에 더해 짧은 겉모습, 시작 · 끝 칸에서 있고 없음, 좌우 차례(still-prompt stillCharacterLabel). */
export interface PhotoCharacterLabel extends CharacterRefLabel {
  look?: string | null
  presence?: string | null
  startX?: StillLabel['startX']
  endX?: StillLabel['endX']
  absentAtStart?: boolean
  absentAtEnd?: boolean
}

export interface PhotoLookText {
  /** 그 그림체의 색 · 빛 문장(없으면 null). */
  clause: string | null
}

/** 마지막 줄: 어느 칸에도 글자 없음 + 연필 그림의 흔적 없음. 연필 러프는 구도 · 자세 · 화살표만 나르고 결과에는 남지 않는다. */
const noTextLine = (kind: keyof typeof STILL_NO_MARKS_LINE) =>
  `- No text, letters or numbers anywhere in the sheet. Nothing of the pencil drawing may remain: no pencil lines, hatching, sketch outlines, paper texture or handwriting in any panel. ${STILL_NO_MARKS_LINE[kind]}`

/** 러프는 도면, 생김새는 사진 — 사람이 없는 샷에는 사람 이야기(사람 수 · 자세 · 피부)를 넣지 않는다. */
const photoStillLine = (noPeople: boolean) =>
  `- The pencil drawing is the exact blueprint of each panel: its framing${noPeople ? ' and where things stand' : ', how many figures there are, where they stand and how they pose'} — but not of the look. Every panel must look like a photograph taken with a real camera — real ${noPeople ? 'surfaces, materials' : 'skin, hair, fabric, surfaces'} and light; never a painted-over sketch, illustration, 3D render or game screenshot.`

/** "실제 사진" 문장 — 그림체 색감 문장에 이미 있으면 싣지 않는다. */
const textureLines = (clause: string, noPeople: boolean) => (hasPhotoTexture(clause) ? [] : [`- ${noPeople ? PHOTO_TEXTURE_PLACE : PHOTO_TEXTURE_PEOPLE}.`])

const photoLead = (sheet: 'strip' | 'sheet', noPeople: boolean) =>
  `Re-shoot this exact ${sheet} as photographs — frames of a live-action film, photographed with a real camera on a real set${noPeople ? '' : ' with real actors'}:`

const standIns = (noPeople: boolean) => (noPeople ? '' : ' with wooden mannequin stand-ins')

/** 자세 글 상한 — 낱말 경계에서 끊는다(예전엔 110자에서 낱말 중간을 잘라 "upwa"가 됐다). */
const POSE_MAX = 160

const POSITION_PHRASES: Record<string, string> = {
  left_third: 'left third of the frame',
  center_third: 'center of the frame',
  right_third: 'right third of the frame',
  left: 'left of the frame',
  center: 'center of the frame',
  right: 'right of the frame',
  foreground: 'foreground',
  midground: 'midground',
  background: 'background',
}

function positionPhrase(position: string | null | undefined): string | null {
  const token = (position ?? '').trim().toLowerCase()
  return token ? (POSITION_PHRASES[token] ?? token.replace(/_/g, ' ')) : null
}

/** "Yeong-gam, a white-haired old man (center of the frame — standing)" — 인물이 한 명이면 자리로 가릴 것이 없어 자세만. */
export function describePhotoCharacterRef(ref: string | PhotoCharacterLabel, opts?: { alone?: boolean; look?: boolean }): string {
  if (typeof ref === 'string') return ref
  const name = opts?.look && ref.look?.trim() ? `${ref.name}, ${ref.look.trim()}` : ref.name
  const where = (ref.presence ?? '').trim() || (opts?.alone ? null : positionPhrase(ref.position))
  const pose = clipWords((ref.pose ?? '').trim(), POSE_MAX).replace(/[.。]+$/, '')
  const hint = [where, pose || null].filter(Boolean).join(' — ')
  return hint ? `${name} (${hint})` : name
}

/** 네 샷 시트 칸의 왼쪽부터 차례 — 이름 뒤에 마침표를 붙여 잇는다(없으면 빈 글). */
function gridOrder(names: ReadonlyArray<string | PhotoCharacterLabel>): string {
  const order = leftToRight(names, { start: 'row 1', end: 'row 3' })
  return order ? `.${order}` : ''
}

/** 멈춘 러프(사람이 더한 샷) — 세 칸이 같은 그림이고 화살표가 없다. 샷 설명의 동작으로 사람을 더하거나 빼지 않는다. 사람 없는 샷에는 사람 이야기를 넣지 않는다. */
const staticHoldLine = (noPeople: boolean) =>
  `- This rough is a static hold: the three pencil panels show the same moment. Make all three panels the same picture${noPeople ? '' : ' — the same people in the same places and poses'}, with no arrows anywhere, including the middle panel. The shot description may describe an action; do not add, remove or move ${noPeople ? 'anything' : 'anyone'} for it.`

/** "한 칸에 한 번"의 예외 — 어느 칸에 없는 인물(들어오고 나감) · 비친 모습. 없으면 빈 글. */
function oncePerPanelExceptions(refs: Array<string | PhotoCharacterLabel>, reflection?: boolean): string {
  const absent = refs.some((r) => typeof r !== 'string' && !!r.presence)
  return [
    absent ? ' Where a line above says a character is not in a panel, that panel has none of them.' : '',
    reflection ? ' A reflection in glass, a mirror or water shows the same character and is not a second person.' : '',
  ].join('')
}

/** 인형 ↔ 인물 배정(한 샷) — 참조 번호 = 이름, 러프의 자리 · 자세로 어느 인형인지 못박는다. 괄호가 하나도 없으면 샷 설명으로 짝짓게 한다. */
export function photoIdentityBlock(refs: PhotoCharacterLabel[], opts?: { reflection?: boolean }): string[] {
  if (!refs.length) return []
  const alone = refs.length === 1
  const described = refs.map((r) => describePhotoCharacterRef(r, { alone, look: !alone }))
  const hinted = refs.some((r) => describePhotoCharacterRef(r, { alone }) !== r.name)
  return [
    `- Character references, in order after the first image: ${described
      .map((text, i) => `reference image ${i + 2} = ${text}`)
      .join('; ')}. ${
      hinted
        ? alone && !refs[0].presence
          ? 'The words in parentheses say what that figure is doing.'
          : 'The words in parentheses say where that figure stands in the pencil frame and what it is doing.'
        : alone
          ? ''
          : 'Match each mannequin to the character whose action and look fit the shot description — only to tell who is who, never to add or remove anyone.'
    }${leftToRight(refs, { start: 'the START panel', end: 'the END panel' })}`.trim(),
    `- ${
      alone
        ? hinted
          ? 'Replace the wooden mannequin doing that with this character.'
          : 'Replace the main wooden mannequin with this character.'
        : hinted
          ? 'Replace each wooden mannequin with the character assigned to its place above.'
          : 'Replace each wooden mannequin with the character it was matched to.'
    } Every assigned character appears exactly ONCE per panel — never paint the same character twice in one panel, and never merge two characters into one figure. A mannequin that matches no assignment is a different, unnamed background person: give it its own plain look, never a copy of an assigned character.${oncePerPanelExceptions(refs, opts?.reflection)}`,
    `- Keep each character's identity, design and outfit exactly as in their sheet — the same character(s), consistent across all three panels.`,
  ]
}

/** 실사 그림체의 한 샷(세 칸 띠) 지시문. */
export function buildPhotoStripPrompt(
  shotPrompt: string,
  opts: {
    photoLook: PhotoLookText
    characterRefCount: number
    worldRefCount?: number
    extraRefCount?: number
    characterRefs?: PhotoCharacterLabel[]
    /** 샷 설계의 빛 · 초점 · 렌즈 · 색(real-cine-line) — 러프 손글씨를 옮기지 않는 대신 글로 싣는다. */
    cineLine?: string | null
    /** 콘티에서 고친 화살표를 읽고 그 줄로 끝 장을 다시 그린 샷의 줄(오너 R1, freshDirectionLine). 없으면 지시문 그대로. */
    directionLine?: string | null
    /** 씬 시간대(영어). */
    sceneLighting?: string | null
    /** 거울 · 창에 비친 모습을 그리는 샷. */
    reflection?: boolean
    /** 러프가 멈춘 샷(roughIsStaticHold) — 세 칸이 같은 그림, 화살표 없음. */
    staticHold?: boolean
    /** 사람이 없는 샷 — 러프 칸 규칙에서 사람 이야기를 뺀다. */
    noPeople?: boolean
    /** 러프 시트의 칸 방향 — composeRoughReferenceStrip 이 준 값. 'cols' = 세로 포맷 가로 3열. */
    frameAxis?: 'rows' | 'cols'
  },
): string {
  const { characterRefCount, cineLine } = opts
  const clause = (opts.photoLook.clause ?? '').trim()
  const noPeople = opts.noPeople === true
  const rowLayout = opts.frameAxis === 'cols'
  const p1 = rowLayout ? 'Left' : 'Top'
  const p3 = rowLayout ? 'Right' : 'Bottom'
  const sheetDesc = rowLayout ? '3-panel horizontal storyboard row (three panels side by side on one wide sheet)' : '3-panel vertical storyboard strip'
  const layoutContract = rowLayout ? 'the same single wide sheet with exactly three side-by-side panels' : 'the same single vertical sheet with exactly three stacked panels'
  const sceneLine = (opts.sceneLighting ?? '').trim()
  return [
    `The FIRST reference image is a ${sheetDesc} of ONE film shot, drawn as rough pencil previz${standIns(noPeople)}. ${p1} panel = START frame. Middle panel = DIRECTION frame — the same drawing as START plus hand-drawn direction arrows and text labels describing the camera and figure movement. ${p3} panel = END frame, after that movement completes.`,
    '',
    photoLead('strip', noPeople),
    `- The output MUST be ${layoutContract} — never a single standalone picture, and never add any decorative frame or border outside the sheet.`,
    `- Keep the sheet layout and the three panel borders exactly as they are; draw only inside the panels.`,
    photoStillLine(noPeople),
    ...textureLines(clause, noPeople),
    `- ${p1} panel: a photograph of the START frame — same camera setup, framing, composition and poses as reference panel 1, with no arrows or marks drawn on it.`,
    ...(opts.staticHold
      ? [
          `- Middle panel: the exact same image as the ${p1.toLowerCase()} panel, with nothing drawn on it.`,
          `- ${p3} panel: a photograph of the END frame — the same picture as the ${p1.toLowerCase()} panel. It has no arrows or marks drawn on it.`,
          staticHoldLine(noPeople),
        ]
      : [
          `- Middle panel: the exact same image as the ${p1.toLowerCase()} panel, with only the SAME direction ARROWS from reference panel 2 drawn on top as thin, clean overlay lines. Copy no words, labels or notes from reference panel 2 — its handwriting is an instruction for you, not part of the picture. Never invent arrows that are not in reference panel 2 — if the rough sheet has no arrows (a static hold), the middle panel stays clean with no annotation.`,
          `- ${p3} panel: a photograph of the END frame — the same shot after the motion completes, matching reference panel 3's composition exactly. Reproduce panel 3's arrived state faithfully: every element the motion changed (a drawer now open, a figure now moved or turned, an object now displaced) must be shown in its completed end state. If the shot contains two or more movements, show ALL of them completed — never repeat the ${p1.toLowerCase()} panel's state. It has no arrows or marks drawn on it.`,
        ]),
    `- Every panel keeps its reference panel's exact shot size and camera distance — never push in, pull out or reframe: an extreme close-up stays an extreme close-up, a full shot stays a full shot, and each figure's size within the frame stays the same as in the reference. If reference panel 3 is framed closer or wider than reference panel 1, keep that difference.`,
    noPeople ? STILL_PANEL_RULE.noPeople : STILL_PANEL_RULE.strip,
    ...(opts.characterRefs && opts.characterRefs.length > 0
      ? photoIdentityBlock(opts.characterRefs, { reflection: opts.reflection })
      : characterRefCount > 0
        ? [
            '- Replace every wooden mannequin with the corresponding character(s) from the remaining reference images (character/world references): keep their identity, design and outfit; the same character(s), consistent across all three panels.',
          ]
        : []),
    ...(characterRefCount > 0 || (opts.worldRefCount ?? 0) > 0 || (opts.extraRefCount ?? 0) > 0
      ? [assetAuthorityClause(characterRefCount, opts.worldRefCount ?? 0, false, false, opts.extraRefCount ?? 0)]
      : []),
    ...(clause ? [`- ${clause}`] : []),
    ...(sceneLine
      ? [`- Scene lighting — time of day: ${sceneLine}. Render that time of day's light${clause ? '' : ' and color grade'} consistently in all three panels.`]
      : []),
    `- Shot description: ${shotPrompt}`,
    ...stripMovementLines(opts.directionLine),
    ...(cineLine && cineLine.trim()
      ? [`- Cinematography — realize these lighting, focus, lens and color intents the pencil cannot show; apply them WITHOUT changing framing, composition or poses: ${cineLine.trim()}`]
      : []),
    noTextLine('strip'),
  ].join('\n')
}

/** 칸별 시네 줄 — 연필 시트가 못 보여 주는 빛 · 초점 · 렌즈 · 색만. */
function gridCineBlock(cineLines?: (string | null | undefined)[]): string[] {
  const entries = (cineLines ?? []).map((line, i) => ({ i, line: (line ?? '').trim() })).filter((e) => e.line.length > 0)
  if (!entries.length) return []
  return [
    `- Per-column cinematography — realize these lighting, focus, lens and color intents that the pencil sheet cannot show. Apply ONLY light/shadow, depth-of-field, focus, lens perspective and color grade; do NOT change each column's framing, composition or figure poses:`,
    ...entries.map((e) => `    · Column ${e.i + 1}: ${e.line}`),
  ]
}

/** 실사 그림체의 네 샷 시트 지시문. */
export function buildPhotoGridPrompt(
  shotCount: number,
  opts: {
    photoLook: PhotoLookText
    characterRefCount: number
    worldRefCount?: number
    cineLines?: (string | null | undefined)[]
    /** 콘티에서 고친 화살표를 읽고 그 줄로 끝 장을 다시 그린 칸의 줄(오너 R1, freshDirectionLine) — 칸(=샷) 순서대로, 줄 있는 칸만 싣는다. */
    directionLines?: (string | null | undefined)[]
    /** 참조 순서대로의 이름 · 짧은 겉모습. */
    characterRefs?: { name: string; look?: string | null }[]
    /** 칸(샷) 순서대로 그 칸의 인물. */
    columnCharacters?: Array<Array<string | PhotoCharacterLabel>>
    sceneLighting?: string | null
    /** 이 시트에 거울 · 창에 비친 모습을 그리는 샷이 있다. */
    reflection?: boolean
    /** 칸 순서대로 — 러프가 멈춘 샷인가. */
    staticColumns?: boolean[]
    /** 시트의 모든 샷이 사람 없는 샷인가(인물 목록이 빈 샷 — 인물이 화면 밖으로 계산된 샷은 아니다). */
    noPeople?: boolean
  },
): string {
  const { characterRefCount, characterRefs, columnCharacters } = opts
  const clause = (opts.photoLook.clause ?? '').trim()
  const sceneLine = (opts.sceneLighting ?? '').trim()
  const holds = opts.staticColumns ?? []
  // 모든 칸에 사람이 없는 시트 — 칸 배정 줄이 통째로 빠지므로 시트 전체에 적는다.
  const noPeople = opts.noPeople === true && characterRefCount === 0
  const identityBlock =
    characterRefs && characterRefs.length > 0
      ? [
          `- Character references, in order after the first image: ${characterRefs
            .map((c, i) => `reference image ${i + 2} = ${c.name}${characterRefs.length > 1 && c.look?.trim() ? `, ${c.look.trim()}` : ''}`)
            .join('; ')}.`,
          `- Replace every wooden mannequin with the character assigned to ITS OWN column below — never carry a character into a column they are not assigned to:`,
          ...(columnCharacters ?? []).map(
            (names, i) =>
              `    * Column ${i + 1}: ${
                names.length
                  ? `${names.map((n) => describePhotoCharacterRef(n, { alone: names.length === 1 })).join(' and ')}${gridOrder(names)}`
                  : 'no character — keep this column free of people'
              }`,
          ),
          `- Keep each character's identity, design and outfit exactly as in their reference, consistent across that column's three rows.`,
          `- Every assigned character appears exactly ONCE per panel — never paint the same character twice in one panel, and never merge two characters into one figure. A mannequin that matches no assignment in its column is a different, unnamed background person, never a copy of an assigned character.${oncePerPanelExceptions((columnCharacters ?? []).flat(), opts.reflection)}`,
          assetAuthorityClause(characterRefs.length, opts.worldRefCount ?? 0, false, false),
        ]
      : characterRefCount > 0
        ? [
            '- Replace every wooden mannequin with the corresponding character(s) from the remaining reference images (character/world references): keep their identity, design and outfit, consistent across all panels.',
          ]
        : [
            ...(noPeople ? ['- No column has a character: keep every panel of this sheet free of people.'] : []),
            ...((opts.worldRefCount ?? 0) > 0 ? [assetAuthorityClause(0, opts.worldRefCount ?? 0, false, false)] : []),
          ]
  return [
    `The FIRST reference image is a 4-column x 3-row storyboard sheet. Each COLUMN is ONE film shot, read top to bottom: row 1 = START frame, row 2 = DIRECTION frame (the same drawing as START plus hand-drawn arrows and labels), row 3 = END frame after the movement completes. The drawings are rough pencil previz${standIns(noPeople)}.${shotCount < 4 ? ` Only the first ${shotCount} column(s) contain shots — keep the remaining column(s) as empty blank panels.` : ''}`,
    '',
    photoLead('sheet', noPeople),
    `- The output MUST be the same single 4x3 sheet — keep the sheet layout and every panel border exactly where they are; draw only inside the panels; never add any decoration outside the sheet.`,
    photoStillLine(noPeople),
    ...textureLines(clause, noPeople),
    `- Each column stays the same shot: same camera setup, framing, composition and poses as its reference column. Rows keep their START/DIRECTION/END roles. Row 2 is row 1's picture with only the direction ARROWS from reference row 2 drawn as thin, clean overlay lines — copy no words, labels or notes from the reference; its handwriting is an instruction for you, not part of the picture. Rows 1 and 3 have no arrows or marks drawn on them.`,
    `- Row 3 of each column = that shot's END: reproduce reference row 3's arrived state faithfully — every element the motion changed (a figure now moved or turned, an object now displaced) must be shown in its completed end state; if a column's motion has two or more movements, show ALL of them completed. Never repeat that column's row 1 state in row 3${holds.some(Boolean) ? ' (except in a static-hold column)' : ''}, and never invent a different composition for it.`,
    `- Every panel keeps its reference panel's exact shot size and camera distance — never push in, pull out or reframe: an extreme close-up stays an extreme close-up, a full shot stays a full shot, and each figure's size within the frame stays the same as in the reference. If a column's reference row 3 is framed closer or wider than its row 1, keep that difference.`,
    noPeople ? STILL_PANEL_RULE.noPeople : STILL_PANEL_RULE.grid,
    ...holds.flatMap((hold, i) => (hold ? [`- Column ${i + 1} is a static hold: its three rows show the same moment${noPeople ? '' : ' — the same people in the same places and poses'}, with no arrows in row 2.`] : [])),
    ...identityBlock,
    ...(clause ? [`- ${clause}`] : []),
    ...(sceneLine
      ? [
          `- Scene lighting — the whole sheet is ONE scene, time of day: ${sceneLine}. Render that time of day's light${clause ? '' : ' and color grade'} in every panel, identical across all columns; never drift to a different time of day in any column.`,
        ]
      : []),
    ...gridCineBlock(opts.cineLines),
    ...gridMovementLines(opts.directionLines),
    noTextLine('grid'),
  ].join('\n')
}
