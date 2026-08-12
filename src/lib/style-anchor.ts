import { DEFAULT_EDIT_IMAGE_MODEL, isImageEditModel } from '@/lib/writer/llm/fal'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const STYLE_ANCHOR_CLAUSE = 'STYLE REFERENCE — the FIRST reference image sets the visual style ONLY: match its art medium, rendering technique, linework, shading, lighting mood and color grade exactly. Do NOT reproduce its subject or objects.'
export const STYLE_ANCHOR_MULTIREF_CLAUSE = 'The remaining reference images are the character(s) and the location: keep their identity, design and outfit; only re-render them in the style reference\'s look.'
export const STYLE_ANCHOR_TEMPLATE_CLAUSE = 'The SECOND reference image is a layout template: keep its section boxes, dividers, labels and headings exactly in place. It is NOT a style reference — take the visual style ONLY from the first image.'

export type StyleAnchorMode = 'single' | 'turnaround' | 'multiref'

// ── 매체어 스크럽(#F-004 B4/B5 2026-08-12) ────────────────────────────────────
// 앵커가 있으면 앵커 이미지가 매체의 유일한 권위다. 그런데 실측(dc531572)에서 프롬프트에 실린
// 매체어("texture: photorealistic", "포토리얼리스틱 식생 지대")가 앵커를 이겨 매체 전이를 깨뜨렸다
// — 억제된 건 앵커에 부합하는 art_style(3d_animation)뿐이고 매체어는 살아남는, 정확히 뒤집힌
// 배치였다. 처방: 통짜 억제 대신 **매체어만** 정밀 제거.
//   · 토큰(snake_case 등 단일 값): 매체어를 품으면 토큰째 드롭 — tokenUnlessMediaWord
//   · 산문: 단어만 걷어내고 문장은 유지 — scrubMediaWords (applyStyleAnchor 가 자동 적용)
// 긴 패턴 우선(photorealistic 이 realistic 보다 먼저) — 부분 매칭 잔해 방지.
const MEDIA_WORD_RE =
  /photo[-_ ]?realistic|photo[-_ ]?realism|photoreal|photographic|hyper[-_ ]?realistic|live[-_ ]?action|realistic|realism|포토리얼리스틱|포토리얼|리얼리스틱|실사적인|실사적|실사/gi

export function containsMediaWord(text: string | null | undefined): boolean {
  if (!text) return false
  MEDIA_WORD_RE.lastIndex = 0
  return MEDIA_WORD_RE.test(text)
}

/** 토큰 값 — 매체어를 품으면 토큰째 뺀다(잘라내면 snake_case 잔해가 남는다). */
export function tokenUnlessMediaWord(value: string | undefined): string | undefined {
  if (!value) return undefined
  return containsMediaWord(value) ? undefined : value
}

/** 산문 — 매체어만 걷어내고 구두점·공백 잔해를 정리한다. 개행은 프롬프트 구조라 보존한다. */
export function scrubMediaWords(text: string): string {
  MEDIA_WORD_RE.lastIndex = 0
  return text
    .replace(MEDIA_WORD_RE, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[^\S\n]+([,.;:)])/g, '$1')
    .replace(/([,;])[^\S\n]*(?=[,.;])/g, '')
    .replace(/\([^\S\n]*\)/g, '')
    .replace(/[^\S\n]+$/gm, '')
    .trim()
}

export interface ResolvedStyleAnchor {
  key: string
  imageUrl: string
  /** style_anchors.medium — B7(영상 카메라 기재 억제) 판정용. 구 캐시 항목은 undefined 일 수 있다. */
  medium?: string | null
}

export interface AnchorableSubmit {
  prompt: string
  reference_image_urls?: string[]
  aspect_ratio?: string
  // gpt-image 계열 전용 캔버스 지정(#real-strip-guard) — 모델 스키마 필터가 비지원 모델에선 걸러낸다.
  image_size?: string
  model?: string
}

const STYLE_ANCHOR_CACHE_TTL_MS = 5 * 60 * 1000

const styleAnchorCache = new Map<string, { anchor: ResolvedStyleAnchor; expires: number }>()

type StyleAnchorRow = {
  key: string
  image_url: string
  is_active: boolean | null
  medium: string | null
}

export function applyStyleAnchor(
  anchor: ResolvedStyleAnchor | null,
  base: AnchorableSubmit,
  mode: 'turnaround',
  opts: { pinAspectRatio: string },
): AnchorableSubmit
export function applyStyleAnchor(
  anchor: ResolvedStyleAnchor | null,
  base: AnchorableSubmit,
  mode: 'single' | 'multiref',
  opts?: { pinAspectRatio?: string },
): AnchorableSubmit
export function applyStyleAnchor(
  anchor: ResolvedStyleAnchor | null,
  base: AnchorableSubmit,
  mode: StyleAnchorMode,
  opts?: { pinAspectRatio?: string },
): AnchorableSubmit {
  if (anchor == null) return base

  const modeClause =
    mode === 'turnaround'
      ? `\n${STYLE_ANCHOR_TEMPLATE_CLAUSE}`
      : mode === 'multiref'
        ? `\n${STYLE_ANCHOR_MULTIREF_CLAUSE}`
        : ''

  const next: AnchorableSubmit = {
    ...base,
    // 앵커 존재 시 본문 산문에서 매체어 제거(#F-004 B5) — 산문의 "포토리얼리스틱" 류가 앵커
    //   이미지를 이기는 실측 재발 방지. 앵커 없으면 이 함수 자체가 no-op(위 early return).
    prompt: `${STYLE_ANCHOR_CLAUSE}${modeClause}\n${scrubMediaWords(base.prompt)}`,
    reference_image_urls: [anchor.imageUrl, ...(base.reference_image_urls ?? [])],
    model: base.model && isImageEditModel(base.model) ? base.model : DEFAULT_EDIT_IMAGE_MODEL,
  }

  if (base.aspect_ratio !== undefined) {
    next.aspect_ratio = base.aspect_ratio
  } else if (opts?.pinAspectRatio !== undefined) {
    next.aspect_ratio = opts.pinAspectRatio
  } else {
    delete next.aspect_ratio
    if (mode !== 'turnaround') {
      console.warn('[style-anchor] no aspect_ratio pinned for mode', mode)
    }
  }

  return next
}

export async function resolveStyleAnchorByKey(
  key: string | null | undefined,
): Promise<ResolvedStyleAnchor | null> {
  if (!key) return null

  const now = Date.now()
  const cached = styleAnchorCache.get(key)
  if (cached && cached.expires > now) return cached.anchor
  if (cached) styleAnchorCache.delete(key)

  try {
    const { data, error } = await supabaseAdmin
      .from('style_anchors')
      .select('key, image_url, is_active, medium')
      .eq('key', key)
      .maybeSingle()

    if (error) {
      console.warn('[style-anchor] resolve failed', error)
      return null
    }

    const row = data as StyleAnchorRow | null
    if (!row || row.is_active === false) return null

    const anchor = { key: row.key, imageUrl: row.image_url, medium: row.medium ?? null }
    styleAnchorCache.set(key, { anchor, expires: now + STYLE_ANCHOR_CACHE_TTL_MS })
    return anchor
  } catch (error) {
    console.warn('[style-anchor] resolve failed', error)
    return null
  }
}

export function _clearStyleAnchorCacheForTest(): void {
  styleAnchorCache.clear()
}
