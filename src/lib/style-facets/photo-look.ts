// 실사 그림체의 사진 글(오너 2026-11-23 "2 모두 적용을 실사 스타일로 지정해주고") — 지금 이 길을 타는 그림체는 실사(real) 하나다.
//   기준 그림 없이 그리는 그림체(use_reference_image = false) 가운데
//   매체가 실사(live_action)인 것만. 기준 그림 · 그림체 조각(facets) · 매체어 지우기는 resolveStyleAnchor 가 앵커 없음으로 돌려줘 이미 빠진다.
//   여기서 더하는 것은 "그림이 아니라 실제로 찍은 사진"이라는 말과, 그 그림체의 색감 문장(style_clause) 하나다.
//   기준 그림을 가리키는 문장("style reference(s)")은 싣지 않는다 — 붙지 않은 그림을 따르라고 하면 다른 참고 그림을 그림체로 읽는다.
//   style-anchor 모듈과 따로 두는 까닭은 reference-image.ts 와 같다(경로 시험들이 style-anchor 를 통째로 흉내 낸다).
//   못 읽으면 null = 덧붙이지 않고 지금처럼 그린다. 약속: tests/artist/photo-look.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import { hasPhotoTexture, PHOTO_TEXTURE_PLACE } from '@/lib/style-facets/photo-sheet-line'
import { styleDrawsWithoutReference } from '@/lib/style-facets/reference-image'

export interface PhotoLook {
  key: string
  /** 그 그림체의 색 · 빛 문장(style_anchors.style_clause). 없거나 기준 그림을 가리키면 null. */
  clause: string | null
}

export { PHOTO_SHEET_LINE } from '@/lib/style-facets/photo-sheet-line'
/** 배경 — 맨 앞에. */
export const PHOTO_WORLD_LEAD =
  'Live-action film still, photographed on location with a real camera: a real place with real materials, wear and light, never a painting, illustration, 3D render or game environment.'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { look: PhotoLook | null; expires: number }>()
const STYLE_REFERENCE_RE = /\bstyle references?\b/i

/** 기준 그림을 가리키지 않는 색감 문장만. */
export function textOnlyStyleClause(clause: string | null | undefined): string | null {
  const text = (clause ?? '').trim()
  return text && !STYLE_REFERENCE_RE.test(text) ? text : null
}

/** 프로젝트가 실사 계열 그림체를 기준 그림 없이 그리면 그 사진 글, 아니면 null. */
export async function resolvePhotoLook(
  project: { style_anchor_key?: string | null; custom_style_anchor?: unknown } | null | undefined,
): Promise<PhotoLook | null> {
  const key = project?.style_anchor_key
  if (!key || !(await styleDrawsWithoutReference(project))) return null
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expires > now) return hit.look
  try {
    const { data, error } = await supabaseAdmin.from('style_anchors').select('medium, style_clause').eq('key', key).maybeSingle()
    if (error) {
      console.warn('[photo-look] style lookup failed — drawing without the photo wording', key, (error as { message?: string }).message)
      return hit?.look ?? null
    }
    const row = data as { medium?: unknown; style_clause?: unknown } | null
    const look: PhotoLook | null =
      row?.medium === 'live_action' ? { key, clause: textOnlyStyleClause(typeof row.style_clause === 'string' ? row.style_clause : null) } : null
    cache.set(key, { look, expires: now + CACHE_TTL_MS })
    return look
  } catch (error) {
    console.warn('[photo-look] style lookup failed — drawing without the photo wording', key, error instanceof Error ? error.message : String(error))
    return hit?.look ?? null
  }
}

/** 배경 지시문에 사진 글을 — 없으면 원문 그대로. */
export function withPhotoWorld(prompt: string, look: PhotoLook | null): string {
  if (!look) return prompt
  // 순화해 다시 그릴 때 붙는 말("stylized non-graphic illustration")이 사진 글과 다투지 않게.
  return [
    PHOTO_WORLD_LEAD,
    prompt.replace('stylized non-graphic illustration', 'non-graphic photograph'),
    ...(hasPhotoTexture(look.clause) ? [] : [`${PHOTO_TEXTURE_PLACE}.`]),
    ...(look.clause ? [look.clause] : []),
  ].join('\n')
}

export function _clearPhotoLookCacheForTest(): void {
  cache.clear()
}
