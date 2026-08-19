// 연출 화살표 레이어 편집(#arrow-layer 실험 2026-08-09) — 서버 로직.
//
// DIRECTING 프레임의 화살표는 픽셀에 구워져 있어 진짜 레이어가 없다. 그래서:
//   1) separateArrowLayer — Grok Imagine i2i(입력 이미지의 레이아웃·배치를 앵커로 유지)로
//      화살표·지시문만 지운 "클린 플레이트"를 만들어 direction 프레임 옆에 영속 + JSONB 캐시.
//      캐시 키는 generatedAt(재생성되면 stale → 재분리). 편집기는 이걸 밑층으로 깔고
//      위층(원본)을 지우개로 긁어 화살표를 걷어낸다.
//   2) saveDirectingFrame — 편집기가 평탄화한 PNG 를 기존 direction 경로에 upsert 하고
//      generatedAt 을 올려 캐시버스트(rough-frame-cycle.withCacheBust 가 새 프레임을 집는다).
import { supabaseAdmin } from '@/lib/supabase/admin'
import { falImageGenerate } from '@/lib/writer/llm/fal'
import { mediaPathFromUrl, mediaPublicUrl, mediaUpload } from '@/lib/storage/media'
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

/**
 * 화살표 레이어 분리 — direction 프레임에서 화살표를 지운 클린 플레이트를 만들거나 캐시를 돌려준다.
 * 과금 방어: 같은 generatedAt 에 대해 1회만 생성(캐시 히트 시 fal 호출 없음).
 */
export async function separateArrowLayer(
  projectId: string,
  shotId: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): Promise<{ cleanUrl: string; cached: boolean }> {
  const rb = await loadRough(projectId, shotId)
  if (rb?.status !== 'completed' || !rb.frames?.direction) {
    throw new Error(
      translate(locale, 'The DIRECTING frame is missing — you need the 3-frame rough set first'),
    )
  }
  const genAt = rb.generatedAt ?? 0
  if (rb.cleanDirection?.url && rb.cleanDirection.for === genAt) {
    return { cleanUrl: rb.cleanDirection.url, cached: true }
  }

  const result = await falImageGenerate({
    model: GROK_EDIT_MODEL,
    prompt: STRIP_ARROWS_PROMPT,
    reference_image_urls: [rb.frames.direction],
  })
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
  const cleanUrl = await uploadToMedia(cleanPath, buf, contentType)

  // JSONB 병합 — 생성 도중 재생성됐으면(다른 generatedAt) 낡은 캐시를 쓰지 않는다(rough-adherence 패턴).
  const latest = await loadRough(projectId, shotId)
  if (latest && (latest.generatedAt ?? 0) === genAt) {
    const { error } = await supabaseAdmin
      .from('shots')
      .update({ rough_storyboard: { ...latest, cleanDirection: { url: cleanUrl, for: genAt } } })
      .eq('project_id', projectId)
      .eq('shot_id', shotId)
    if (error) throw error
  }
  return { cleanUrl, cached: false }
}

// END 프레임을 편집된 DIRECTING 프레임에서 다시 그린다 (#end-from-direction 2026-08-11).
//   화살표를 고쳤으면 "그 화살표가 끝난 뒤의 그림"인 END 도 따라가야 한다 — 안 그러면 편집이
//   DIRECTING 한 장에만 남고 세트가 서로 다른 이야기를 한다.
//   3프레임 통째 재생성이 아니라 i2i 한 장인 이유: 통째로 다시 그리면 방금 편집한 DIRECTING 이
//   버려진다(그게 이 기능의 출발점이다).
const END_FROM_DIRECTION_PROMPT =
  'This pencil storyboard sketch marks the intended movement of a shot with arrows, motion lines ' +
  'and handwritten annotations. Draw the END frame: the same scene after that movement has fully ' +
  'completed. Move the figures, objects and framing all the way to where the arrows point — the ' +
  'full extent of the indicated motion, not a barely-changed copy. Remove every arrow, motion ' +
  'line, dashed path and handwritten annotation. Keep the same characters, costumes, background ' +
  'and monochrome pencil style. Return only the cleaned drawing.'

/**
 * DIRECTING 프레임을 참조로 END 프레임을 재생성한다.
 * 과금: fal i2i 1회 — 사람이 "저장 후 재생성"을 명시적으로 누를 때만 호출된다(자동 경로 없음).
 */
export async function regenerateEndFrame(
  projectId: string,
  shotId: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): Promise<{ url: string; generatedAt: number }> {
  const rb = await loadRough(projectId, shotId)
  if (rb?.status !== 'completed' || !rb.frames?.direction || !rb.frames?.end) {
    throw new Error(
      translate(locale, 'You need the 3-frame rough set to redraw the END frame'),
    )
  }

  const result = await falImageGenerate({
    model: GROK_EDIT_MODEL,
    prompt: END_FROM_DIRECTION_PROMPT,
    reference_image_urls: [rb.frames.direction],
  })
  const res = await fetch(result.url)
  if (!res.ok)
    throw new Error(
      translate(locale, 'Failed to download the END frame: HTTP {status}', { status: res.status }),
    )
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10_000) {
    throw new Error(
      translate(locale, 'The END frame is abnormally small ({bytes}b)', { bytes: buf.length }),
    )
  }
  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
  const endPath = `${storagePathFromPublicUrl(rb.frames.end, locale).replace(/\.[a-z]+$/i, '')}.${ext}`
  const newUrl = await uploadToMedia(endPath, buf, contentType)

  // 생성 중에 러프가 재생성됐으면(다른 generatedAt) 덮어쓰지 않는다 — 낡은 END 로 새 세트를
  //   오염시키는 것을 막는다(separateArrowLayer 와 같은 방어).
  const latest = await loadRough(projectId, shotId)
  if (!latest || (latest.generatedAt ?? 0) !== (rb.generatedAt ?? 0)) {
    throw new Error(translate(locale, 'The rough set was regenerated in the meantime — please try again'))
  }
  const now = Date.now()
  const { error } = await supabaseAdmin
    .from('shots')
    .update({
      rough_storyboard: {
        ...latest,
        frames: { ...latest.frames, end: newUrl },
        generatedAt: now,
        // DIRECTING 은 그대로이므로 클린 플레이트 캐시는 유효 — for 를 함께 올려 재과금을 막는다.
        ...(latest.cleanDirection ? { cleanDirection: { ...latest.cleanDirection, for: now } } : {}),
      },
    })
    .eq('project_id', projectId)
    .eq('shot_id', shotId)
  if (error) throw error
  return { url: newUrl, generatedAt: now }
}

/** 편집기가 평탄화한 direction 프레임(PNG data URL)을 기존 경로에 upsert + 캐시버스트. */
export async function saveDirectingFrame(
  projectId: string,
  shotId: string,
  imageDataUrl: string,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): Promise<{ url: string; generatedAt: number }> {
  const rb = await loadRough(projectId, shotId)
  if (rb?.status !== 'completed' || !rb.frames?.direction) {
    throw new Error(translate(locale, "The DIRECTING frame is missing — there's nothing to save"))
  }
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl)
  if (!m) throw new Error(translate(locale, "This isn't a PNG data URL"))
  const buf = Buffer.from(m[1], 'base64')
  if (buf.length < 10_000) throw new Error(translate(locale, 'The image to save is empty'))
  if (buf.length > 15_000_000)
    throw new Error(translate(locale, 'The image is too large (over 15MB)'))

  const dirPath = storagePathFromPublicUrl(rb.frames.direction, locale)
  const newUrl = await uploadToMedia(dirPath, buf, 'image/png')
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
