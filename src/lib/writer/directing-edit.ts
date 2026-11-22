// 연출 화살표 레이어 편집(#arrow-layer 실험 2026-08-09) — 서버 로직.
//
// DIRECTING 프레임의 화살표는 픽셀에 구워져 있어 진짜 레이어가 없다. 그래서:
//   1) separateArrowLayer — Grok Imagine i2i(입력 이미지의 레이아웃·배치를 앵커로 유지)로
//      화살표·지시문만 지운 "클린 플레이트"를 만들어 direction 프레임 옆에 영속 + JSONB 캐시.
//      캐시 키는 generatedAt(재생성되면 stale → 재분리). 편집기는 이걸 밑층으로 깔고
//      위층(원본)을 지우개로 긁어 화살표를 걷어낸다.
//   2) saveDirectingFrame — 편집기가 평탄화한 PNG 를 기존 direction 경로에 upsert 하고
//      generatedAt 을 올려 캐시버스트(rough-frame-cycle.withCacheBust 가 새 프레임을 집는다).
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { generateReservedImage } from '@/lib/fal/generate-image'
import { assertUserTextAllowed } from '@/lib/moderation/creem'
import { mediaPathFromUrl, mediaPublicUrl, mediaUpload } from '@/lib/storage/media'
import { uploadThumbnail } from '@/lib/storage-thumb'
import { translate } from '@/lib/i18n'
import { deriveEnBatch } from '@/lib/writer/i18n/derive-en'
import { stripCameraMoveSentences } from '@/lib/writer/pipeline/stage/view'
import { stripColor, words } from '@/lib/writer/rough-storyboard'
import { freshDirectionRead, withEndDrawn, type DirectionRead } from '@/lib/writer/direction-read'
import { readDirectionMarks } from '@/lib/writer/direction-read-vlm'
import {
  completeGenerationJob,
  confirmGenerationJobReceipt,
  rejectGenerationJobReservation,
  reserveGenerationJob,
  type GenerationJob,
} from '@/lib/generation-jobs'
import { STALE_QUEUED_MS } from '@/lib/generation-job-timing'
import { falImageSubmit } from '@/lib/writer/llm/fal'
import { resolveWebhookUrl } from '@/lib/fal/webhook-url'
import { isDefiniteSubmitRejection } from '@/lib/fal/submit-rejection'
import { moderatedSubmitInput } from '@/lib/moderation/creem'
import { recordModerationPass } from '@/lib/api/moderation'
import type { AppLocale } from '@/lib/locale'

// locale 을 안 넘기는 호출부(rough-directing-edit/route.ts)가 조용히 안 깨지도록 기존 동작(항상
//   한국어)을 기본값으로 보존한다 — producer-gate.ts/card-mention.ts 와 동일 취급.
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

const GROK_EDIT_MODEL = 'xai/grok-imagine-image/edit'

// i2i 는 소스의 구도·배치를 유지하고 프롬프트가 "바꿀 것"만 지시한다 — 지울 대상을 구체적으로 열거.
//   밑층은 지우개로 드러나 저장되는 그림이다 — 한 장 다시 그리기처럼 얼굴 없는 목각 인형 · 글자 없음을 지킨다(2026-11-14 검토 a 3).
const STRIP_ARROWS_PROMPT =
  'Remove every arrow, motion line, dashed path, direction indicator, and handwritten text ' +
  'annotation from this pencil storyboard sketch. Keep everything else exactly identical: ' +
  'same composition, same figures and poses, same background, same monochrome pencil shading. ' +
  'Keep every figure the same faceless wooden mannequin with a completely blank head (never add a face), ' +
  'and do not add any text. Return only the cleaned drawing.'

type RoughJson = {
  status?: string
  generatedAt?: number
  frames?: { start?: string; direction?: string; end?: string }
  cleanDirection?: { url: string; for: number }
} & Record<string, unknown>

async function loadRough(projectId: string, shotId: string): Promise<RoughJson | null> {
  const { data, error } = await supabaseAdmin
    .from('shots')
    .select('rough_storyboard')
    .eq('project_id', projectId)
    .eq('shot_id', shotId)
    .maybeSingle()
  if (error) throw error
  return (data?.rough_storyboard as RoughJson | null) ?? null
}

/** media 버킷 public URL → 보관함 경로 (?v= 캐시버스트 쿼리는 pathname 밖이라 자동 제외). */
function storagePathFromPublicUrl(url: string, locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK): string {
  const path = mediaPathFromUrl(url)
  if (!path) throw new Error(translate(locale, 'Not a media bucket URL: {url}', { url }))
  return path
}

async function uploadToMedia(path: string, buf: Buffer, contentType: string): Promise<string> {
  const { error } = await mediaUpload(path, buf, { contentType, upsert: true })
  if (error) throw error
  const publicUrl = mediaPublicUrl(path)
  return `${publicUrl}?v=${Date.now()}`
}

/** 러프 한 장을 올리고 그 장의 작은 미리보기(_thumb.webp)도 새로 만든다 — 카드 · 팝업의 세 장은 미리보기를 보여 준다
 *  (운영 NEXT_PUBLIC_IMAGE_THUMBS=1). 미리보기를 그대로 두면 처음 그린 그림이 계속 보인다(2026-10-31 QA). */
async function uploadRoughFrame(path: string, buf: Buffer, contentType: string): Promise<string> {
  const url = await uploadToMedia(path, buf, contentType)
  await uploadThumbnail(path, buf)
  return url
}

/** 연출 고치기 옵션 — 라우트는 늘 projectFolderOnly 로 부른다. */
export interface DirectingEditOptions {
  /** 덮어쓸 파일이 "작업 공간/프로젝트/" 폴더 안일 때만 올린다(2026-11-01 리뷰 M5). 주소는 브라우저가 고칠 수 있는
   *  rough_storyboard 에서 오므로 버킷만 보면 다른 작업 공간의 그림 · 미리보기를 덮을 수 있었다. 함수를 직접 부르는 옛 시험은 끈 채로 둔다. */
  projectFolderOnly?: boolean
  /** 분리: 화면이 보고 있는 연출 그림 주소(?v= 포함). 서버 그림과 다르면 그림 값을 쓰기 전에 StaleDirectionError(검토 2026-11-14 낮음 2 ②). */
  expectDirection?: string
}

/** 화면이 서버보다 낡은 채 분리하려 했다 — 위층(옛 그림)과 밑층(새 그림)이 섞이지 않게 거절하고 화면이 다시 읽게 한다. */
export class StaleDirectionError extends Error {
  constructor(locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK) {
    super(translate(locale, 'The directing frame changed in the meantime. Open it again and separate the layer again.'))
    this.name = 'StaleDirectionError'
  }
}

/** 순수: 분리가 끝났을 때 서버에 남길 러프 JSON — 그사이 연출 그림(주소)이 바뀌었으면 낡은 밑층이라 null.
 *  시작 · 끝만 바뀌었으면 연출 그림이 그대로라 지금 그림 시각(generatedAt)에 묶어 남긴다(검토 2026-11-14 낮음 2 ① —
 *  예전엔 시각이 바뀌면 버려 다시 분리에 그림 값이 또 들었다).
 *  알려진 빈틈(재검토 c 2, 드묾 · 회귀 아님): 분리하는 30초 사이 다른 창에서 [저장]하면 주소가 바뀌어 여기서 버린다.
 *  저장은 밑그림을 바꾸지 않아(saveDirectingFrame 은 for 를 올려 잇는다) 이어 줄 수 있지만, 주소만으로는 저장과
 *  다시 그리기를 가를 수 없다 — 이으려면 러프 JSON 에 "어느 그림 위에 저장했는지" 표시가 필요해 지금은 두지 않는다. */
export function withCleanPlate(latest: RoughJson, separatedFrom: string, cleanUrl: string): RoughJson | null {
  if (!latest.frames?.direction || latest.frames.direction !== separatedFrom) return null
  return { ...latest, cleanDirection: { url: cleanUrl, for: latest.generatedAt ?? 0 } }
}

export class ForeignMediaPathError extends Error {
  constructor(locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK) {
    super(translate(locale, "This picture is not in this project's folder, so it can't be changed"))
    this.name = 'ForeignMediaPathError'
  }
}

/** 그 경로가 이 프로젝트 폴더("작업 공간/프로젝트/") 안인지 — 아니면 ForeignMediaPathError. */
async function assertProjectFolder(projectId: string, path: string, locale: AppLocale): Promise<void> {
  const { data, error } = await supabaseAdmin.from('projects').select('workspace_id').eq('id', projectId).maybeSingle()
  if (error) throw error
  const workspaceId = (data as { workspace_id?: unknown } | null)?.workspace_id
  if (typeof workspaceId !== 'string' || !workspaceId || !path.startsWith(`${workspaceId}/${projectId}/`)) {
    throw new ForeignMediaPathError(locale)
  }
}

/**
 * 화살표 레이어 분리 — direction 프레임에서 화살표를 지운 클린 플레이트를 만들거나 캐시를 돌려준다.
 * 과금 방어: 같은 generatedAt 에 대해 1회만 생성(캐시 히트 시 fal 호출 없음).
 */
export async function separateArrowLayer(
  projectId: string,
  shotId: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: DirectingEditOptions = {},
): Promise<{ cleanUrl: string; cached: boolean }> {
  const rb = await loadRough(projectId, shotId)
  if (rb?.status !== 'completed' || !rb.frames?.direction) {
    throw new Error(
      translate(locale, 'The DIRECTING frame is missing. You need the 3-frame rough set first'),
    )
  }
  if (opts.expectDirection && opts.expectDirection !== rb.frames.direction) throw new StaleDirectionError(locale)
  const genAt = rb.generatedAt ?? 0
  if (rb.cleanDirection?.url && rb.cleanDirection.for === genAt) {
    return { cleanUrl: rb.cleanDirection.url, cached: true }
  }

  // #creem-moderation(2026-10-11): 이 경로의 프롬프트는 전부 우리 고정 템플릿이다 — 사용자가 쓴 글이
  //   없으므로 검사할 대상이 없고(건너뜀 영수증), 그래도 제출은 영수증 없이 못 나간다.
  const moderation = await assertUserTextAllowed([], { projectId, kind: 'image_generation' })
  const result = await generateReservedImage(
    {
      model: GROK_EDIT_MODEL,
      prompt: STRIP_ARROWS_PROMPT,
      reference_image_urls: [rb.frames.direction],
      moderation,
    },
    { projectId },
  )
  const res = await fetch(result.url)
  if (!res.ok)
    throw new Error(
      translate(locale, 'Failed to download the clean plate: HTTP {status}', { status: res.status }),
    )
  const buf = Buffer.from(await res.arrayBuffer())
  // 빈/모더레이션 출력 방어 (finalize 의 그리드 방어와 같은 취지, 단일 패널이라 문턱만 낮춤)
  if (buf.length < 10_000) {
    throw new Error(
      translate(locale, 'The clean plate is abnormally small ({bytes}b)', { bytes: buf.length }),
    )
  }
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const dirPath = storagePathFromPublicUrl(rb.frames.direction, locale)
  const cleanPath = `${dirPath.replace(/\.[a-z]+$/i, '')}_clean.${ext}`
  // 그린 뒤 올리기 전에 본다 — 옛 라우트 시험(용량 거절)이 프로젝트 행 없이 그리기 단계까지 오기 때문(리뷰 M5).
  if (opts.projectFolderOnly) await assertProjectFolder(projectId, cleanPath, locale)
  const cleanUrl = await uploadToMedia(cleanPath, buf, contentType)

  // JSONB 병합 — 생성 도중 연출 그림이 바뀌었으면(다시 만들기 · 저장) 낡은 밑층이라 남기지 않는다(withCleanPlate).
  const latest = await loadRough(projectId, shotId)
  const merged = latest ? withCleanPlate(latest, rb.frames.direction, cleanUrl) : null
  if (merged) {
    const { error } = await supabaseAdmin
      .from('shots')
      .update({ rough_storyboard: merged })
      .eq('project_id', projectId)
      .eq('shot_id', shotId)
    if (error) throw error
  }
  return { cleanUrl, cached: false }
}

// 한 장 다시 그리기 공통 규칙(2026-11-14 미들 프레임 고장): 시트(rough-storyboard-grid GRID_STYLE)와 같은 목각 인형 · 글자 규칙.
//   이 규칙 없이 연출 칸을 다시 만들면 얼굴 있는 만화 소녀 · 말풍선 "YOU'RE WASTING TIME!" · "DIRECTING" · "DIR. FRAME 1" 상자가
//   그려졌다(개발 실측 914165c8). "START frame" · "storyboard" 같은 낱말도 쓰지 않는다 — 그림 안에 칸 이름 · 표 글씨로 옮겨 적혔다.
const REDRAW_FIGURE_RULE =
  "Every human figure is the same classic wooden artist's drawing mannequin: a ball-jointed wooden pose doll " +
  'with segmented limbs, visible sphere joints, mitten-like hands without fingers, and a completely smooth ' +
  'egg-shaped wooden head. The head is entirely blank — absolutely no face, no eyes, no nose, no mouth, no hair, ' +
  'no expression. No clothing. All figures are this one identical wooden mannequin; only pose and position differ.'
const REDRAW_WORDLESS_RULE =
  'Wordless drawing: no writing anywhere. No speech bubbles, no dialogue, no captions, no frame names, ' +
  'no scene or shot numbers, no labels.'
const REDRAW_NOTES_RULE =
  'The only writing allowed is those few short motion notes next to the arrows. No speech bubbles, no dialogue, ' +
  'no captions, no frame names or titles, no scene or shot numbers, no boxed labels, no header or footer text.'

// END 프레임을 편집된 DIRECTING 프레임에서 다시 그린다 (#end-from-direction 2026-08-11).
//   화살표를 고쳤으면 "그 화살표가 끝난 뒤의 그림"인 END 도 따라가야 한다 — 안 그러면 편집이
//   DIRECTING 한 장에만 남고 세트가 서로 다른 이야기를 한다.
//   3프레임 통째 재생성이 아니라 i2i 한 장인 이유: 통째로 다시 그리면 방금 편집한 DIRECTING 이
//   버려진다(그게 이 기능의 출발점이다).
const END_FROM_DIRECTION_PROMPT =
  'This pencil sketch marks the intended movement of a shot with arrows, motion lines and handwritten notes. ' +
  'Redraw the same scene just after that movement has fully completed. Move the figures, objects and framing ' +
  'all the way to where the arrows point — the full extent of the indicated motion, not a barely-changed copy. ' +
  'Remove every arrow, motion line, dashed path and handwritten note. Keep the same figures, background and ' +
  `monochrome pencil style. ${REDRAW_FIGURE_RULE} ${REDRAW_WORDLESS_RULE} Return only the cleaned drawing.`

export type RoughFrameKey = 'start' | 'direction' | 'end'
export const ROUGH_FRAME_KEYS: readonly RoughFrameKey[] = ['start', 'direction', 'end']

/** 한 장 다시 그리기에 보내는 것 — 그림 AI · 문장 · 참고 그림 · 실제로 싣는 사용자 글(내용 검사 대상). */
export interface FramePlan {
  model: string
  prompt: string
  refs: string[]
  userText: string | null
}

// 끝 장을 그리는 방식(D10, 2026-11-22). 바꿀 때는 여기만 바꾼다 — 물음의 [다시 그리기] · [이 장만 다시 만들기](끝) ·
//   옛 regenerate-end 요청이 모두 regenerateEndFrame → endFramePlan 을 거친다.
//   'read-then-draw' = ②(오너 Q1 · Q3 "2번으로 해줘"): 읽는 AI 가 연출 장을 한 줄로 읽고, GPT Image 2 가 시작 장 + 그 줄로 그린다.
//   'direction-only' = 예전 방식: 고친 연출 장 한 장 + 정해진 문장(Grok). 비교 보드의 "지금 방식" — 고를 수 있게 남겨 둔다.
//   어느 방식이든 샷 설계의 옛 움직임 글(행동 글 · 카메라 무브)은 받지 않는다 — 고친 화살표와 다툰다. 약속: tests/writer/end-frame-plan.test.ts
export type EndFrameMethod = 'direction-only' | 'read-then-draw'
export const END_FRAME_METHOD: EndFrameMethod = 'read-then-draw'
const GPT_EDIT_MODEL = 'openai/gpt-image-2/edit'

/** ② 그리기 문장 — 2026-11-22 비교 시험(다섯 샷)의 문장에서 "START frame" · "storyboard" 낱말만 뺐다
 *  (한 장 다시 그리기 규칙: 그 낱말이 그림 속 칸 이름 · 표 글씨로 옮겨 적혔다, 11/14 실측 914165c8). 샷 길이를 모르면 길이 말을 뺀다. */
function endFromLinePrompt(line: string, seconds: number | null): string {
  const over = typeof seconds === 'number' && seconds > 0 ? ` over ${Math.round(seconds)} seconds` : ''
  return (
    'This rough monochrome pencil sketch shows the first moment of one film shot. ' +
    `Redraw the same shot at the moment this movement has fully completed${over}: ${line.trim()} ` +
    'Carry the movement its full extent, not a barely-changed copy, and keep everything not mentioned where it is. ' +
    `Same location, figures, props and pencil style. ${REDRAW_FIGURE_RULE} ${REDRAW_WORDLESS_RULE} Return only the drawing.`
  )
}

type EndPlanInput = { line: string; seconds: number | null }
const END_FRAME_PLANS: Record<EndFrameMethod, (frames: NonNullable<RoughJson['frames']>, input?: EndPlanInput) => FramePlan> = {
  'direction-only': (frames) => ({ model: GROK_EDIT_MODEL, prompt: END_FROM_DIRECTION_PROMPT, refs: [frames.direction!], userText: null }),
  'read-then-draw': (frames, input) => {
    if (!input?.line.trim()) throw new Error('read-then-draw needs the line read from the directing frame')
    return { model: GPT_EDIT_MODEL, prompt: endFromLinePrompt(input.line, input.seconds), refs: [frames.start!], userText: input.line.trim() }
  },
}

/** 순수: 끝 장 그리기 계획 — END_FRAME_METHOD 가 정한 방식대로. ② 는 읽은 줄 · 샷 길이를 받는다(행동 글 · 샷 설계는 받지 않는다). */
export function endFramePlan(frames: NonNullable<RoughJson['frames']>, method: EndFrameMethod = END_FRAME_METHOD, input?: EndPlanInput): FramePlan {
  return END_FRAME_PLANS[method](frames, input)
}

/** 순수: GPT 에 시킬 끝 장 크기 — 다른 두 장 비율, 16 의 배수, 0.66MP 이상(fal gpt-image-2/edit 스키마). 정사각형에 가까우면 1024×1024. */
export function endFrameImageSize(width: number, height: number): string {
  const ar = width > 0 && height > 0 ? width / height : 16 / 9
  if (Math.abs(ar - 1) < 0.05) return '1024x1024'
  const round16 = (value: number) => Math.max(16, Math.round(value / 16) * 16)
  for (let long = 1280; long <= 3840; long += 64) {
    const [w, h] = ar >= 1 ? [long, round16(long / ar)] : [round16(long * ar), long]
    if (w * h >= 660_000) return `${w}x${h}`
  }
  return ar >= 1 ? `3840x${round16(3840 / ar)}` : `${round16(3840 * ar)}x3840`
}

// 약속 I(2026-09-04): 3장 중 한 장만 다시 그린다 — 나머지 두 장은 손대지 않는다.
//   start: DIRECTING 을 참조로 "움직임이 시작되기 전" · end: "움직임이 끝난 뒤" · direction: START 를 참조로 화살표를 그린다.
//   direction 은 시트처럼 START 와 같은 순간을 그대로 두고 화살표 · 움직임 선 · 짧은 메모만 얹는다(2026-11-14).
const START_FROM_DIRECTION_PROMPT =
  'This pencil sketch marks the intended movement of a shot with arrows, motion lines and handwritten notes. ' +
  'Redraw the same scene at the instant just before that movement begins, with the figures, objects and framing ' +
  'at the positions where the arrows start. Remove every arrow, motion line, dashed path and handwritten note. ' +
  `Keep the same figures, background and monochrome pencil style. ${REDRAW_FIGURE_RULE} ${REDRAW_WORDLESS_RULE} ` +
  'Return only the cleaned drawing.'
const DIRECTION_FROM_START_PROMPT =
  'Keep this pencil sketch exactly as it is: the same frozen instant, with the same figures, poses, positions, ' +
  'framing, props and background. Do not advance the motion and do not change anything in the scene. On top of it, ' +
  'add only arrows, motion lines and a few short handwritten motion notes that mark how the figures, objects and ' +
  'camera move during the shot.'

/** 순수: 한 장만 바꾼 새 러프 JSON — 나머지 프레임은 그대로, generatedAt 만 올린다(캐시버스트).
 *  DIRECTING 이 바뀌면 화살표 클린 플레이트 캐시는 낡은 것이라 버리고, 아니면 for 를 올려 재과금을 막는다. */
export function mergeRoughFrame(
  rough: RoughJson,
  frame: RoughFrameKey,
  url: string,
  now: number,
): RoughJson {
  const frames = { ...(rough.frames ?? {}), [frame]: url }
  const cleanDirection =
    frame === 'direction'
      ? undefined
      : rough.cleanDirection
        ? { ...rough.cleanDirection, for: now }
        : undefined
  const { cleanDirection: _dropped, ...rest } = rough
  void _dropped
  return { ...rest, frames, generatedAt: now, ...(cleanDirection ? { cleanDirection } : {}) }
}

// 따옴표 대사 — "…" “…” 「…」 『…』 ‘…’, 앞이 글자가 아닌 '…', 그리고 한글 바로 뒤에서 열려 인용 조사 앞에서 닫히는
//   '…'("도윤이'마지막이야'라고", 검토 a 7b10877d 낮음 2). man's · don't 같은 아포스트로피는 남긴다.
//   대사 바로 뒤의 인용 조사(이라고 · 라고 · 이라며 · 라며 · 하고 · 하며 · 며 · 줄임꼴 고)도 같이 뺀다 — 남으면 "도윤이라고"처럼 읽힌다.
//   조사 앞 띄어쓰기("'마지막이야' 라고")도 받는다(검토 a 45b1e2e2). 조사는 낱말 끝이어야 한다 — "'야옹' 고양이"의 '고'는 조사가 아니다.
//   한글 글자는 코드 줄에 두지 않고 이스케이프로 쓴다(i18n-korean-scan).
const QUOTATIVE = String.raw`(?:\uC774\uB77C\uACE0|\uB77C\uACE0|\uC774\uB77C\uBA70|\uB77C\uBA70|\uD558\uACE0|\uD558\uBA70|\uBA70|\uACE0)(?=[\s.,!?;:)]|$)`
const QUOTED_DIALOGUE = new RegExp(
  String.raw`(?:"[^"]*"|\u201c[^\u201d]*\u201d|\u300c[^\u300d]*\u300d|\u300e[^\u300f]*\u300f|\u2018[^\u2019]*\u2019|(?<![\p{L}\p{N}])'(?:[^'\n]|'(?=[A-Za-z]))*?'(?![A-Za-z])|(?<=[\uAC00-\uD7A3])'[^'\n]+?'(?=\s?${QUOTATIVE}))(?:\s?${QUOTATIVE})?`,
  'gu',
)

/** 순수: 따옴표 대사를 뺀다 — 연출 다시 그리기의 짧은 메모로 옮겨 적힐 재료가 된다(검토 a 1). */
export function withoutQuotedDialogue(text: string): string {
  return text
    .replace(QUOTED_DIALOGUE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

/** 순수: 연출 다시 그리기에 싣는 행동 글 — 시트 START 줄과 같은 손질(카메라 무브 문장 · 색 말 빼기)에 따옴표 대사 빼기. */
export function movementSentence(text: string): string {
  return stripColor(stripCameraMoveSentences(withoutQuotedDialogue(text))).replace(/[\s.]+$/, '')
}

type CameraMotionLike = { type?: string | null; direction?: string | null; speed?: string | null }

/** 순수: 샷 설계의 카메라 무브 — 시트 MOTION 줄의 카메라 말과 같다(rough-storyboard-grid camMove, 까닭 말은 뺀다). 고정이면 null. */
export function cameraMoveClause(cam: CameraMotionLike | null | undefined): string | null {
  if (!cam?.type || cam.type === 'static') return null
  return `camera ${words(cam.type)}${cam.direction && cam.direction !== 'none' ? ` ${words(cam.direction)}` : ''}${cam.speed ? `, ${words(cam.speed)}` : ''}`
}

/** 연출 다시 그리기의 재료 — 행동 글은 시트처럼 영어 파생본(같은 번역 종류)으로, 대사는 번역 전에 뺀다. 카메라는 샷 설계에서.
 *  번역이 안 되면 행동 글은 빼고 카메라 말만 둔다 — 원문(이름 · 조사)이 그대로 실렸다(검토 a 7b10877d 낮음 1, 리드 판단 · 시트는 그대로). */
export async function directionMaterialFrom(
  shotId: string,
  actionDescription: string | null,
  dynamicSpec: unknown,
): Promise<{ action: string | null; camera: string | null }> {
  const native = actionDescription ? withoutQuotedDialogue(actionDescription) : ''
  const action = native ? ((await deriveEnBatch([{ id: shotId, native }], 'shot action description')).get(shotId) ?? null) : null
  const camera = cameraMoveClause((dynamicSpec as { camera_motion?: CameraMotionLike } | null)?.camera_motion)
  return { action, camera }
}

/** 시작 · 연출 장 다시 그리기 프롬프트 · 참조 그림 · 실제로 싣는 사용자 글(내용 검사 대상). 시작에는 사용자 글이 없다. 끝 장은 endFramePlan. */
export function promptForFrame(
  frame: Exclude<RoughFrameKey, 'end'>,
  action: string | null,
  camera: string | null = null,
): { prompt: string; refs: (f: NonNullable<RoughJson['frames']>) => string[]; userText: string | null } {
  if (frame === 'start') return { prompt: START_FROM_DIRECTION_PROMPT, refs: (f) => [f.direction!], userText: null }
  const userText = action ? movementSentence(action) || null : null
  const marks = [userText, camera].filter(Boolean).join('; ')
  const movement = marks ? ` The movement to mark: ${marks}.` : ''
  const prompt = `${DIRECTION_FROM_START_PROMPT}${movement} Keep the same monochrome pencil style. ${REDRAW_FIGURE_RULE} ${REDRAW_NOTES_RULE} Return only the drawing.`
  return { prompt, refs: (f) => [f.start!], userText }
}

/** 다시 그린 한 장을 시트에서 자른 다른 장 크기로 맞춘다 — Grok 은 720×1280(가로 1280×720)으로 돌려주는데 시트 칸은 255×447(406×223)이다.
 *  비율 차이(2% 안팎)는 가장자리를 몇 px 잘라 맞춘다(cover). 그림을 못 읽거나 비율이 5% 넘게 다르면(세로 칸에 가로 그림 —
 *  폭의 32%만 남는다, 검토 a 2) 그대로 둔다. */
export async function fitFrameToSize(buf: Buffer, width: number, height: number): Promise<Buffer> {
  try {
    const meta = await sharp(buf).metadata()
    if (!meta.width || !meta.height) return buf
    if (meta.width === width && meta.height === height) return buf
    if (Math.abs((meta.width / meta.height) / (width / height) - 1) > 0.05) return buf
    return await sharp(buf).resize(width, height, { fit: 'cover' }).toBuffer()
  } catch {
    return buf
  }
}

/** 나머지 두 장 중 작은 쪽 크기 — 고치기 전에 다시 그린 큰 장이 섞인 세트도 시트에서 자른 크기로 돌아간다. 둘 다 못 읽으면 null. */
async function otherFramesSize(
  frames: NonNullable<RoughJson['frames']>,
  frame: RoughFrameKey,
): Promise<{ width: number; height: number } | null> {
  const sizes = await Promise.all(
    ROUGH_FRAME_KEYS.filter((key) => key !== frame).map(async (key) => {
      try {
        const res = await fetch(frames[key]!)
        if (!res.ok) return null
        const { width, height } = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
        return width && height ? { width, height } : null
      } catch {
        return null
      }
    }),
  )
  const known = sizes.filter((size): size is { width: number; height: number } => size !== null)
  return known.sort((a, b) => a.width * a.height - b.width * b.height)[0] ?? null
}

/**
 * 러프 3장 중 한 장만 다시 그린다(약속 I1·I2·I3). 과금: fal i2i 1회 — 사람이 "이 장만 다시 만들기"를 눌렀을 때만.
 *   생성 중에 러프 세트가 통째로 바뀌었으면(다른 generatedAt) 덮어쓰지 않는다.
 */
export async function regenerateRoughFrame(
  projectId: string,
  shotId: string,
  frame: Exclude<RoughFrameKey, 'end'>,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: DirectingEditOptions = {},
): Promise<{ url: string; generatedAt: number; frame: RoughFrameKey }> {
  const rb = await loadRough(projectId, shotId)
  if (rb?.status !== 'completed' || !rb.frames?.start || !rb.frames?.direction || !rb.frames?.end) {
    throw new Error(translate(locale, 'You need the 3-frame rough set to redraw a frame'))
  }
  // 그리기 전에 본다 — 남의 파일 자리 때문에 그림 값을 쓰지 않는다(리뷰 M5).
  if (opts.projectFolderOnly) await assertProjectFolder(projectId, storagePathFromPublicUrl(rb.frames[frame]!, locale), locale)
  let material: { action: string | null; camera: string | null } = { action: null, camera: null }
  if (frame === 'direction') {
    const { data } = await supabaseAdmin
      .from('shots')
      .select('action_description,dynamic_spec')
      .eq('project_id', projectId)
      .eq('shot_id', shotId)
      .maybeSingle()
    material = await directionMaterialFrom(
      shotId,
      typeof data?.action_description === 'string' ? data.action_description : null,
      data?.dynamic_spec ?? null,
    )
  }
  // 시작 · 연출 장은 지금처럼 Grok 한 장. 끝 장은 regenerateEndFrame(②, 작업 틀)이 그린다(D10).
  const { prompt: framePrompt, refs: frameRefs, userText: frameUserText } = promptForFrame(frame, material.action, material.camera)
  const plan: FramePlan = { model: GROK_EDIT_MODEL, prompt: framePrompt, refs: frameRefs(rb.frames), userText: frameUserText }
  // #creem-moderation(2026-10-11): 자리 예약 전에 검사한다 — DIRECTING 재생성에만 실리는 사용자
  //   액션 설명이 검사 대상이고, 프레임 지시문(START/END/DIRECTION 템플릿)은 우리 문구라 보내지 않는다.
  //   검사는 실제로 싣는 글(영어 파생 · 손질한 것)로 한다(2026-11-14 검토 a 1).
  const moderation = await assertUserTextAllowed([plan.userText], { projectId, kind: 'image_generation' })
  const result = await generateReservedImage(
    {
      model: plan.model,
      prompt: plan.prompt,
      reference_image_urls: plan.refs,
      moderation,
    },
    { projectId },
  )
  const res = await fetch(result.url)
  if (!res.ok)
    throw new Error(
      translate(locale, 'Failed to download the {frame} frame: HTTP {status}', { frame: frame.toUpperCase(), status: res.status }),
    )
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10_000) {
    throw new Error(
      translate(locale, 'The {frame} frame is abnormally small ({bytes}b)', { frame: frame.toUpperCase(), bytes: buf.length }),
    )
  }
  // 나머지 두 장과 같은 크기로 — 세 장 크기가 다르면 카드 순환 · 편집기 그림 크기가 어긋난다(2026-11-14).
  const size = await otherFramesSize(rb.frames, frame)
  const fitted = size ? await fitFrameToSize(buf, size.width, size.height) : buf
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const current = rb.frames[frame]!
  const framePath = `${storagePathFromPublicUrl(current, locale).replace(/\.[a-z]+$/i, '')}.${ext}`
  const newUrl = await uploadToMedia(framePath, fitted, contentType)

  const latest = await loadRough(projectId, shotId)
  if (!latest || (latest.generatedAt ?? 0) !== (rb.generatedAt ?? 0)) {
    throw new Error(translate(locale, 'The rough set was regenerated in the meantime. Please try again'))
  }
  // 미리보기는 "그사이 다시 그려졌는지" 확인 뒤에만 — PNG · JPG 가 미리보기 한 장을 같이 써서 새 세트의 미리보기를 덮을 수 있었다(리뷰 L7).
  await uploadThumbnail(framePath, fitted)
  const now = Date.now()
  const { error } = await supabaseAdmin
    .from('shots')
    .update({ rough_storyboard: mergeRoughFrame(latest, frame, newUrl, now) })
    .eq('project_id', projectId)
    .eq('shot_id', shotId)
  if (error) throw error
  return { url: newUrl, generatedAt: now, frame }
}

// ── 끝 장 ②: 읽기 · 작업 내기 · 끼우기(D10 · 2026-11-22 오너 Q1 · Q3 · Q4, 리드 Q-a) ──────────────────────────
//   읽기(7~11초) + 그리기(65~71초)는 요청 하나 60초를 넘는다 — 그리기는 있는 생성 작업 틀(종류 image_generation + 대상 roughEnd)로 낸다.
//   요청은 작업 번호만 돌려주고, 그림이 오면 완료 처리(fal/finalize.ts → finalizeRoughEndFrameJob)가 끝 장을 바꿔 끼운다.
//   약속: tests/writer/end-frame-read-draw.test.ts

/** 읽는 AI 가 화살표를 읽지 못했고 사람이 적은 줄도 없다 — 그림 값을 쓰지 않고 알린다(라우트 422 direction_unreadable). */
export class DirectionUnreadableError extends Error {
  constructor(locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK) {
    super(translate(locale, 'The AI could not read the arrows, so the end frame was not redrawn. Write the motion in the directing tab.'))
    this.name = 'DirectionUnreadableError'
  }
}

/** 한국어로 고친 줄을 영어로 옮기지 못했다 — 지시에 한국어를 섞지 않고 다시 시도하게 한다(라우트 422 direction_translate_failed). */
export class DirectionTranslateError extends Error {
  constructor(locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK) {
    super(translate(locale, 'Could not translate the motion line. Try again.'))
    this.name = 'DirectionTranslateError'
  }
}

/** 읽은 줄을 러프 기록에 남긴다 — 그사이 연출 장이 바뀌었으면(옛 연출 장을 읽은 줄) 남기지 않는다. 남겼으면 true. */
async function storeDirectionRead(projectId: string, shotId: string, read: DirectionRead): Promise<boolean> {
  const latest = await loadRough(projectId, shotId)
  if (!latest?.frames?.direction || latest.frames.direction !== read.direction) return false
  const { error } = await supabaseAdmin
    .from('shots')
    .update({ rough_storyboard: { ...latest, directionRead: read } })
    .eq('project_id', projectId)
    .eq('shot_id', shotId)
  if (error) throw error
  return true
}

/**
 * 지금 연출 장을 읽은 줄 — 이미 있으면 다시 읽지 않고, 없으면 읽는 AI(Gemini 3.6 Flash)로 읽어 연출 장 주소와 함께 남긴다.
 *   저장 직후 물음 창 · 편집기 아래 줄 [고쳐서 끝 장 다시 그리기]가 부른다. 못 읽으면 null(물음 창이 "직접 적어 주세요").
 *   주소는 우리 보관함 그림만 읽는다 — 러프 기록은 브라우저가 고칠 수 있는 칸이라 남의 주소를 서버가 받아 오지 않게.
 */
export async function readDirection(projectId: string, shotId: string): Promise<DirectionRead | null> {
  const rb = await loadRough(projectId, shotId)
  if (rb?.status !== 'completed' || !rb.frames?.start || !rb.frames?.direction) return null
  const fresh = freshDirectionRead(rb)
  if (fresh) return fresh
  if (!mediaPathFromUrl(rb.frames.start) || !mediaPathFromUrl(rb.frames.direction)) return null
  const marks = await readDirectionMarks(rb.frames.start, rb.frames.direction)
  if (!marks) return null
  const read: DirectionRead = { en: marks.en, ko: marks.ko, source: 'ai', direction: rb.frames.direction, at: Date.now(), endDrawn: null }
  return (await storeDirectionRead(projectId, shotId, read)) ? read : null
}

/** 그 샷의 끝 장 작업이 돌고 있으면 그 작업 번호 — 같은 끝 장을 두 번 내지 않는다. 오래 멈춘(유령) 작업은 세지 않는다. */
async function runningEndJob(projectId: string, shotId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id, target, created_at')
    .eq('project_id', projectId)
    .eq('kind', 'image_generation')
    .eq('status', 'queued')
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; target?: { writerShotId?: string; roughEnd?: unknown } | null; created_at?: string | null }>
  const hit = rows.find(
    (row) =>
      !!row.target?.roughEnd &&
      row.target.writerShotId === shotId &&
      (!row.created_at || Date.now() - Date.parse(row.created_at) < STALE_QUEUED_MS),
  )
  return hit?.id ?? null
}

/** 사람이 고친 줄 — 화면 말(lang)로 적은 글. 한국어면 영어로 옮겨 싣는다. */
export interface EditedDirectionLine {
  text: string
  lang: 'ko' | 'en'
}

/**
 * 끝 장 다시 그리기(②) — 물음의 [다시 그리기] · [이 장만 다시 만들기](끝) · 옛 regenerate-end 요청이 모두 여기로 온다.
 *   줄: 사람이 고친 줄(다시 읽지 않음, 한국어면 영어로 옮김) → 지금 연출 장을 읽은 줄 → 그래도 없으면 지금 읽는다.
 *   줄은 내용 검사를 거친 뒤에만 그림을 낸다(10/11 약속). 그 샷의 끝 장 작업이 돌고 있으면 그 작업 번호를 돌려준다.
 */
export async function regenerateEndFrame(
  projectId: string,
  shotId: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: DirectingEditOptions & { line?: EditedDirectionLine | null; userId?: string | null } = {},
): Promise<{ jobId: string; read: DirectionRead | null; replayed: boolean }> {
  const { data: shot, error: shotError } = await supabaseAdmin
    .from('shots')
    .select('rough_storyboard, duration_seconds')
    .eq('project_id', projectId)
    .eq('shot_id', shotId)
    .maybeSingle()
  if (shotError) throw shotError
  const rb = ((shot as { rough_storyboard?: unknown } | null)?.rough_storyboard ?? null) as RoughJson | null
  if (rb?.status !== 'completed' || !rb.frames?.start || !rb.frames?.direction || !rb.frames?.end) {
    throw new Error(translate(locale, 'You need the 3-frame rough set to redraw a frame'))
  }
  const frames = rb.frames
  // 그리기 전에 본다 — 남의 파일 자리 때문에 그림 값을 쓰지 않는다(리뷰 M5).
  if (opts.projectFolderOnly) await assertProjectFolder(projectId, storagePathFromPublicUrl(frames.end!, locale), locale)

  const running = await runningEndJob(projectId, shotId)
  if (running) return { jobId: running, read: freshDirectionRead(rb), replayed: true }

  let read: DirectionRead | null
  const edited = opts.line?.text?.trim()
  if (edited) {
    let en = edited
    if (opts.line?.lang === 'ko') {
      const translated = (await deriveEnBatch([{ id: shotId, native: edited }], 'storyboard motion line')).get(shotId)?.trim()
      if (!translated) throw new DirectionTranslateError(locale)
      en = translated
    }
    read = { en, ko: opts.line?.lang === 'ko' ? edited : null, source: 'user', direction: frames.direction!, at: Date.now(), endDrawn: null }
    if (!(await storeDirectionRead(projectId, shotId, read))) throw new StaleDirectionError(locale)
  } else {
    read = freshDirectionRead(rb) ?? (await readDirection(projectId, shotId))
  }
  if (!read) throw new DirectionUnreadableError(locale)

  const seconds = typeof (shot as { duration_seconds?: unknown }).duration_seconds === 'number' ? ((shot as { duration_seconds: number }).duration_seconds) : null
  const size = await otherFramesSize(frames, 'end')
  const imageSize = endFrameImageSize(size?.width ?? 16, size?.height ?? 9)
  const plan = endFramePlan(frames, END_FRAME_METHOD, { line: read.en, seconds })

  // #creem-moderation(2026-10-11): 읽은 줄 · 고친 줄은 사용자 손글씨가 옮겨진 글이다 — 자리 예약 전에 검사한다.
  const moderation = await assertUserTextAllowed([plan.userText], { projectId, kind: 'image_generation', ...(opts.userId ? { userId: opts.userId } : {}) })
  const { data: project, error: projectError } = await supabaseAdmin.from('projects').select('workspace_id').eq('id', projectId).maybeSingle()
  if (projectError) throw projectError
  const workspaceId = (project as { workspace_id?: string } | null)?.workspace_id ?? undefined
  const job = await reserveGenerationJob({
    projectId,
    model: plan.model,
    kind: 'image_generation',
    ...(opts.userId ? { userId: opts.userId } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    provider: 'fal',
    inputSnapshot: { prompt: plan.prompt, image_urls: plan.refs, image_size: imageSize, rough_end: true },
    target: {
      ...(workspaceId ? { workspaceId } : {}),
      writerShotId: shotId,
      roughEnd: { generatedAt: rb.generatedAt ?? 0, direction: frames.direction!, line: read.en },
    },
  })
  recordModerationPass(moderation, { projectId, kind: 'image_generation', userId: opts.userId ?? null, jobId: job.id })
  let receipt: Awaited<ReturnType<typeof falImageSubmit>>
  try {
    // 외부 접수는 한 번뿐이다 — 예약이 이미 자리를 잡고 있으니 SDK 재시도는 이중 발주다.
    receipt = await falImageSubmit(
      moderatedSubmitInput(
        { model: plan.model, prompt: plan.prompt, reference_image_urls: plan.refs, image_size: imageSize, webhookUrl: resolveWebhookUrl() },
        moderation,
      ),
      { retry: false, falKeyId: job.fal_key_id ?? undefined },
    )
  } catch (err) {
    if (isDefiniteSubmitRejection(err)) {
      await rejectGenerationJobReservation(job.id, projectId, err instanceof Error ? err.message : String(err)).catch(() => undefined)
    }
    throw err
  }
  try {
    await confirmGenerationJobReceipt(job.id, projectId, receipt)
  } catch (err) {
    // 이미 접수됐다 — 새 번호로 다시 내지 않는다. 기록 실패는 로그로만.
    console.error('[directing-edit] end frame receipt could not be saved:', job.id, err instanceof Error ? err.message : String(err))
  }
  return { jobId: job.id, read, replayed: false }
}

/**
 * 끝 장 작업 끼우기(완료 처리 갈래) — 그림을 다른 두 장 크기로 맞춰 끝 장 자리에 올리고, 끝 장만 바꾼다(약속 I).
 *   그 줄로 그렸다는 표시(directionRead.endDrawn)를 남겨야 영상 지시가 그 줄을 쓴다(리드 Q-a).
 *   그사이 러프가 통째로 바뀌었거나 연출 장이 다시 저장됐으면 끼우지 않는다 — 작업은 실패로 남고 화면이 다시 하라고 알린다.
 */
export async function finalizeRoughEndFrameJob(job: GenerationJob, falImageUrl: string): Promise<string> {
  const shotId = job.target.writerShotId
  const roughEnd = job.target.roughEnd
  if (!shotId || !roughEnd) throw new Error('rough end job target is missing writerShotId/roughEnd')
  const unchanged = (rough: RoughJson | null): rough is RoughJson =>
    !!rough?.frames?.start && !!rough.frames.end && (rough.generatedAt ?? 0) === roughEnd.generatedAt && rough.frames.direction === roughEnd.direction
  const latest = await loadRough(job.project_id, shotId)
  if (!unchanged(latest)) throw new Error('The rough changed while the end frame was being drawn, so it was not inserted')
  const endPath = storagePathFromPublicUrl(latest.frames!.end!)
  await assertProjectFolder(job.project_id, endPath, UNSPECIFIED_LOCALE_FALLBACK)
  const res = await fetch(falImageUrl)
  if (!res.ok) throw new Error(`end frame image fetch failed: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10_000) throw new Error(`end frame image is abnormally small (${buf.length}b)`)
  const size = await otherFramesSize(latest.frames!, 'end')
  const fitted = size ? await fitFrameToSize(buf, size.width, size.height) : buf
  const contentType = res.headers.get('content-type') ?? 'image/png'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const framePath = `${endPath.replace(/\.[a-z]+$/i, '')}.${ext}`
  const newUrl = await uploadToMedia(framePath, fitted, contentType)
  // 올리는 사이 바뀌었는지 한 번 더 — 미리보기는 그 뒤에만 바꾼다(한 장 다시 그리기와 같은 순서, 리뷰 L7).
  const again = await loadRough(job.project_id, shotId)
  if (!unchanged(again)) throw new Error('The rough changed while the end frame was being drawn, so it was not inserted')
  await uploadThumbnail(framePath, fitted)
  const merged = mergeRoughFrame(again, 'end', newUrl, Date.now())
  const next = merged.directionRead === undefined
    ? merged
    : { ...merged, directionRead: withEndDrawn(merged.directionRead, { en: roughEnd.line, direction: roughEnd.direction }, newUrl) }
  const { error } = await supabaseAdmin
    .from('shots')
    .update({ rough_storyboard: next })
    .eq('project_id', job.project_id)
    .eq('shot_id', shotId)
  if (error) throw error
  await completeGenerationJob(job.id, newUrl)
  return newUrl
}

/** 편집기가 평탄화한 direction 프레임(PNG data URL)을 기존 경로에 upsert + 캐시버스트. */
export async function saveDirectingFrame(
  projectId: string,
  shotId: string,
  imageDataUrl: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: DirectingEditOptions = {},
): Promise<{ url: string; generatedAt: number }> {
  const rb = await loadRough(projectId, shotId)
  if (rb?.status !== 'completed' || !rb.frames?.direction) {
    throw new Error(translate(locale, "The DIRECTING frame is missing, so there's nothing to save"))
  }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl)
  if (!m) throw new Error(translate(locale, "This isn't a PNG data URL"))
  const buf = Buffer.from(m[1], 'base64')
  if (buf.length < 10_000) throw new Error(translate(locale, 'The image to save is empty'))
  if (buf.length > 15_000_000)
    throw new Error(translate(locale, 'The image is too large (over 15MB)'))

  const dirPath = storagePathFromPublicUrl(rb.frames.direction, locale)
  if (opts.projectFolderOnly) await assertProjectFolder(projectId, dirPath, locale)
  const newUrl = await uploadRoughFrame(dirPath, buf, 'image/png')
  const now = Date.now()
  // generatedAt 을 올려 3프레임 표시가 캐시버스트되게 한다. 클린 플레이트는 이 편집의 밑층
  //   그대로이므로 for 를 함께 올려 유효 캐시로 유지(다음 열람에서 재과금 방지).
  const { error } = await supabaseAdmin
    .from('shots')
    .update({
      rough_storyboard: {
        ...rb,
        frames: { ...rb.frames, direction: newUrl },
        generatedAt: now,
        ...(rb.cleanDirection ? { cleanDirection: { ...rb.cleanDirection, for: now } } : {}),
      },
    })
    .eq('project_id', projectId)
    .eq('shot_id', shotId)
  if (error) throw error
  return { url: newUrl, generatedAt: now }
}
