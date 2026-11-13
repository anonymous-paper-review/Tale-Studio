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
import type { AppLocale } from '@/lib/locale'

// locale 을 안 넘기는 호출부(rough-directing-edit/route.ts)가 조용히 안 깨지도록 기존 동작(항상
//   한국어)을 기본값으로 보존한다 — producer-gate.ts/card-mention.ts 와 동일 취급.
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

const GROK_EDIT_MODEL = 'xai/grok-imagine-image/edit'

// i2i 는 소스의 구도·배치를 유지하고 프롬프트가 "바꿀 것"만 지시한다 — 지울 대상을 구체적으로 열거.
const STRIP_ARROWS_PROMPT =
  'Remove every arrow, motion line, dashed path, direction indicator, and handwritten text ' +
  'annotation from this pencil storyboard sketch. Keep everything else exactly identical: ' +
  'same composition, same figures and poses, same background, same monochrome pencil shading. ' +
  'Return only the cleaned drawing.'

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
 *  예전엔 시각이 바뀌면 버려 다시 분리에 그림 값이 또 들었다). */
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

export function promptForFrame(frame: RoughFrameKey, action: string | null): { prompt: string; refs: (f: NonNullable<RoughJson['frames']>) => string[] } {
  if (frame === 'end') return { prompt: END_FROM_DIRECTION_PROMPT, refs: (f) => [f.direction!] }
  if (frame === 'start') return { prompt: START_FROM_DIRECTION_PROMPT, refs: (f) => [f.direction!] }
  const movement = action?.trim() ? ` The movement to mark: ${action.trim()}.` : ''
  const prompt = `${DIRECTION_FROM_START_PROMPT}${movement} Keep the same monochrome pencil style. ${REDRAW_FIGURE_RULE} ${REDRAW_NOTES_RULE} Return only the drawing.`
  return { prompt, refs: (f) => [f.start!] }
}

/** 다시 그린 한 장을 시트에서 자른 다른 장 크기로 맞춘다 — Grok 은 720×1280(가로 1280×720)으로 돌려주는데 시트 칸은 255×447(406×223)이다.
 *  비율 차이(2% 안팎)는 가장자리를 몇 px 잘라 맞춘다(cover). 그림을 못 읽으면 그대로 둔다. */
export async function fitFrameToSize(buf: Buffer, width: number, height: number): Promise<Buffer> {
  try {
    const meta = await sharp(buf).metadata()
    if (meta.width === width && meta.height === height) return buf
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
  frame: RoughFrameKey,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: DirectingEditOptions = {},
): Promise<{ url: string; generatedAt: number; frame: RoughFrameKey }> {
  const rb = await loadRough(projectId, shotId)
  if (rb?.status !== 'completed' || !rb.frames?.start || !rb.frames?.direction || !rb.frames?.end) {
    throw new Error(translate(locale, 'You need the 3-frame rough set to redraw a frame'))
  }
  // 그리기 전에 본다 — 남의 파일 자리 때문에 그림 값을 쓰지 않는다(리뷰 M5).
  if (opts.projectFolderOnly) await assertProjectFolder(projectId, storagePathFromPublicUrl(rb.frames[frame]!, locale), locale)
  let action: string | null = null
  if (frame === 'direction') {
    const { data } = await supabaseAdmin
      .from('shots')
      .select('action_description')
      .eq('project_id', projectId)
      .eq('shot_id', shotId)
      .maybeSingle()
    action = typeof data?.action_description === 'string' ? data.action_description : null
  }
  const { prompt, refs } = promptForFrame(frame, action)
  // #creem-moderation(2026-10-11): 자리 예약 전에 검사한다 — DIRECTING 재생성에만 실리는 사용자
  //   액션 설명이 검사 대상이고, 프레임 지시문(START/END/DIRECTION 템플릿)은 우리 문구라 보내지 않는다.
  const moderation = await assertUserTextAllowed([action], { projectId, kind: 'image_generation' })
  const result = await generateReservedImage(
    {
      model: GROK_EDIT_MODEL,
      prompt,
      reference_image_urls: refs(rb.frames),
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

/** DIRECTING 프레임을 참조로 END 프레임을 재생성한다 — regenerateRoughFrame(..., 'end') 의 이름 호환. */
export async function regenerateEndFrame(
  projectId: string,
  shotId: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
  opts: DirectingEditOptions = {},
): Promise<{ url: string; generatedAt: number }> {
  const { url, generatedAt } = await regenerateRoughFrame(projectId, shotId, 'end', locale, opts)
  return { url, generatedAt }
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
