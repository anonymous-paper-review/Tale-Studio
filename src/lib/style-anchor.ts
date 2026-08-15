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

/**
 * 유저가 올린 이미지로 만든 앵커 (projects.custom_style_anchor).
 * 프리셋과 달리 전역 카탈로그에 행이 없다 — 실체가 프로젝트 행 안에 있다.
 */
export interface CustomStyleAnchor {
  url: string
  label: string | null
  medium: string | null
}

/** jsonb 는 무엇이든 들어올 수 있다 — url 이 문자열일 때만 앵커로 인정한다. */
export function parseCustomStyleAnchor(raw: unknown): CustomStyleAnchor | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const url = record.url
  if (typeof url !== 'string' || url.length === 0) return null
  return {
    url,
    label: typeof record.label === 'string' ? record.label : null,
    medium: typeof record.medium === 'string' ? record.medium : null,
  }
}

/** 앵커 해석에 필요한 projects 컬럼만. 호출부는 이 두 칸을 select 해야 한다. */
export interface AnchorSourceProject {
  style_anchor_key?: string | null
  custom_style_anchor?: unknown
}

/**
 * 프로젝트의 유효 스타일 앵커. 커스텀이 있으면 그것이 이기고, 없으면 전역 카탈로그를 본다.
 *
 * 커스텀도 key 는 projects.style_anchor_key(custom_<uuid>)를 그대로 쓴다 — 그 키가 룩 지문과
 * 생성 기록의 앵커 정체성이라, 여기서 다른 값을 지어내면 서버/클라 지문이 어긋난다.
 */
export async function resolveStyleAnchor(
  project: AnchorSourceProject | null | undefined,
): Promise<ResolvedStyleAnchor | null> {
  if (!project) return null

  const custom = parseCustomStyleAnchor(project.custom_style_anchor)
  if (custom) {
    return { key: project.style_anchor_key ?? 'custom', imageUrl: custom.url }
  }

  return resolveStyleAnchorByKey(project.style_anchor_key)
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

let mediumsCache: { values: string[]; expires: number } | null = null

/**
 * 카탈로그에 실제로 존재하는 medium 슬러그 목록.
 *
 * 두 곳이 같은 목록을 봐야 한다 — 채팅 프롬프트(모델이 고를 후보)와 저장 라우트(검증).
 * 하드코딩하면 카탈로그에 매체가 추가될 때 둘이 조용히 어긋난다.
 */
export async function listStyleAnchorMediums(): Promise<string[]> {
  const now = Date.now()
  if (mediumsCache && mediumsCache.expires > now) return mediumsCache.values

  try {
    const { data, error } = await supabaseAdmin
      .from('style_anchors')
      .select('medium')
      .eq('is_active', true)
    if (error) throw error

    const values = Array.from(
      new Set(
        (data ?? [])
          .map((row) => (row as { medium?: unknown }).medium)
          .filter((m): m is string => typeof m === 'string' && m.length > 0),
      ),
    ).sort()

    mediumsCache = { values, expires: now + STYLE_ANCHOR_CACHE_TTL_MS }
    return values
  } catch (error) {
    console.warn('[style-anchor] medium list failed', error)
    return []
  }
}

export function _clearStyleAnchorCacheForTest(): void {
  styleAnchorCache.clear()
  mediumsCache = null
}
