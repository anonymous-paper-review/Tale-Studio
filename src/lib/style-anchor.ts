import { DEFAULT_EDIT_IMAGE_MODEL, isImageEditModel } from '@/lib/writer/llm/fal'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const STYLE_ANCHOR_CLAUSE = 'STYLE REFERENCE — the FIRST reference image sets the visual style ONLY: match its art medium, rendering technique, linework, shading, lighting mood and color grade exactly. Do NOT reproduce its subject or objects.'
export const STYLE_ANCHOR_MULTIREF_CLAUSE = 'The remaining reference images are the character(s) and the location: keep their identity, design and outfit; only re-render them in the style reference\'s look.'
export const STYLE_ANCHOR_TEMPLATE_CLAUSE = 'The SECOND reference image is a layout template: keep its section boxes, dividers, labels and headings exactly in place. It is NOT a style reference — take the visual style ONLY from the first image.'

export type StyleAnchorMode = 'single' | 'turnaround' | 'multiref'

export interface ResolvedStyleAnchor {
  key: string
  imageUrl: string
}

export interface AnchorableSubmit {
  prompt: string
  reference_image_urls?: string[]
  aspect_ratio?: string
  model?: string
}

const STYLE_ANCHOR_CACHE_TTL_MS = 5 * 60 * 1000

const styleAnchorCache = new Map<string, { anchor: ResolvedStyleAnchor; expires: number }>()

type StyleAnchorRow = {
  key: string
  image_url: string
  is_active: boolean | null
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
    prompt: `${STYLE_ANCHOR_CLAUSE}${modeClause}\n${base.prompt}`,
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
      .select('key, image_url, is_active')
      .eq('key', key)
      .maybeSingle()

    if (error) {
      console.warn('[style-anchor] resolve failed', error)
      return null
    }

    const row = data as StyleAnchorRow | null
    if (!row || row.is_active === false) return null

    const anchor = { key: row.key, imageUrl: row.image_url }
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
