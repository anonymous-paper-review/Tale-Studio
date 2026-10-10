import { DEFAULT_EDIT_IMAGE_MODEL, isImageEditModel } from '@/lib/writer/llm/fal'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const STYLE_ANCHOR_CLAUSE = 'STYLE REFERENCE — the FIRST reference image sets the visual style ONLY: match its art medium, rendering technique, linework, shading, lighting mood and color grade exactly. Do NOT reproduce its subject or objects.'
export const STYLE_ANCHOR_MULTIREF_CLAUSE = 'The remaining reference images are the character(s) and the location: keep their identity, design and outfit; only re-render them in the style reference\'s look.'
// #anchor-wiring(2026-08-14, 오너 확정): watercolor A안 — preview 를 2번 스타일 레퍼런스로 병행.
//   실측 근거: watercolor 인물 레지스터는 텍스트로 못 사고 이미지로만 산다(watercolor-2ref-test §8).
//   2-ref 시 "remaining" 절이 preview 를 캐릭터로 오인하는 사고(real_3d 2ref-test §5.2)를 막기 위해
//   두 절 모두 위치 인지형 변형을 쓴다.
export const STYLE_ANCHOR_2REF_CLAUSE = 'STYLE REFERENCE — the FIRST TWO reference images set the visual style ONLY: match their art medium, rendering technique, linework, shading, lighting mood and color grade exactly. Do NOT reproduce their subjects, characters, places or objects.'
export const STYLE_ANCHOR_2REF_MULTIREF_CLAUSE = 'The reference images after the first two are the character(s) and the location: keep their identity, design and outfit; only re-render them in the style references\' look.'
export const STYLE_ANCHOR_TEMPLATE_CLAUSE = 'The SECOND reference image is a layout template: keep its section boxes, dividers, labels and headings exactly in place. It is NOT a style reference — take the visual style ONLY from the first image.'

export type StyleAnchorMode = 'single' | 'turnaround' | 'multiref'

// ── facet 조각(2026-10-08 오너 · facet 인계 .claude/docs/2026-10-08/facet-presets/README.md §4) ──────────
// 앵커 그림이 못 나르는 값(선·명암·팔레트 역할·인물 비례·우선순위)을 텍스트 조각으로 함께 싣는다. 오너 결정 "둘 다":
//   역할 문장 → 현행 style_clause → "Style anchors:" → 본문 → 표면 문장 → [인물이면 Figure rules · Priority] → Avoid → 글자 금지.
//   조각 문자열은 인계 산출물 그대로다(제품이 다듬지 않는다). 조각이 없으면 종전 조립 그대로.
export const FACET_SURFACE_GUARD = 'Plain, fully specified surfaces: flat ground and backdrop as described, no borrowed patterns; accessories, footwear and sky or backdrop marks only as described.'
export const FACET_EXPRESSION_PRIORITY = 'These eye traits describe the relaxed face; when the scene calls for an expression, the expression sets the lid opening and corner angle and takes priority over these defaults, while the iris rendering, the single catchlight (kept even when the eye is narrowed or angry) and the outline colour stay as described.'
export const FACET_NO_TEXT = 'No text, no letters, no logo, no watermark.'
// 인물 조각의 비례 수치(약 7.9등신 등)는 그 스타일의 평균적인 성인 기준이다 — 아이 · 노인에게 어른 비례가 실리지 않게(2026-10-08 오너 결정 4).
//   조각 문자열은 인계 산출물 그대로 두고, 스타일마다 숫자가 달라 숫자 없이 어느 스타일에나 맞게 붙인다.
export const FACET_ADULT_PROPORTIONS = 'In this style, the proportions above are those of an average adult; children, elderly people and other body types keep their own natural proportions in the same rendering.'

export interface StyleAnchorFacets {
  version: string | null
  /** "Style anchors: …" — 앵커 이미지 바로 뒤의 압축 캡슐. 이것이 없으면 facet 없음으로 본다. */
  probeAnchors: string
  /** "Figure rules: …" — 인물이 있는 장면에만. */
  figure: string | null
  /** "Priority order: …" 한 줄 — 인물이 있는 장면에만. */
  priority: string | null
  /** "Avoid …" 한 문장. */
  negative: string | null
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** style_anchors.facets / custom_style_anchor.facets(jsonb) → 조각. 캡슐이 문자열이 아니면 facet 없음(종전 조립). */
export function parseStyleAnchorFacets(raw: unknown): StyleAnchorFacets | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const probeAnchors = text(record.probe_anchors)
  if (!probeAnchors) return null
  return {
    version: text(record.version),
    probeAnchors,
    figure: text(record.figure),
    priority: text(record.priority),
    negative: text(record.negative),
  }
}

// 카메라 각도(2026-10-10 오너) — 사용자 그림 분석은 그 그림 한 장의 구도(높은 부감 등)를 그림체로 담는다(운영 806e2cc2:
//   그림체 핵심 첫 문장 "High bird's-eye linear perspective", 우선순위 1번 "high-angle perspective"가 정면 시트 · 배경에도 실렸다).
//   그림 프롬프트에 실을 때 그림체 핵심 · 우선순위에서 카메라 각도 문장 · 항목을 뺀다. 저장된 분석은 그대로 두고, 투영 방식이
//   그림체인 문장(아이소메트릭 등)은 남긴다. 프리셋 조각은 오너가 다듬은 것이라 손대지 않는다.
const CAMERA_ANGLE_RE =
  /\b(?:bird'?s[- ]eye|worm'?s[- ]eye|high[- ]angle|low[- ]angle|eye[- ]level|dutch[- ]angle|vantage point|viewpoint)\b|\b(?:overhead|top[- ]down|aerial)\s+(?:view|shot|angle|perspective|camera)\b|\b(?:high|low)\s+(?:3\/4|three[- ]quarter)/i
const PROJECTION_STYLE_RE = /\b(?:isometric|axonometric|orthographic|parallel projection|oblique projection)\b/i
const isCameraAngleOnly = (text: string) => CAMERA_ANGLE_RE.test(text) && !PROJECTION_STYLE_RE.test(text)

/** 사용자 그림 분석 조각에서 카메라 각도를 뺀 사본 — 그림체 핵심은 문장 단위, 우선순위는 항목 단위. 다 빠지면 원문 그대로. */
export function withoutCameraAngle(facets: StyleAnchorFacets): StyleAnchorFacets {
  const kept = facets.probeAnchors.split(/(?<=\.)\s+/).filter((sentence) => !isCameraAngleOnly(sentence))
  const probeAnchors = kept.join(' ').trim() || facets.probeAnchors
  let priority = facets.priority
  const parts = priority?.match(/^(Priority order:\s*)([\s\S]*?)(\.?)$/)
  if (priority && parts) {
    const items = parts[2].split(/\s*→\s*/)
    const keptItems = items.filter((item) => !isCameraAngleOnly(item))
    if (keptItems.length > 0 && keptItems.length < items.length) priority = `${parts[1]}${keptItems.join(' → ')}${parts[3]}`
  }
  return { ...facets, probeAnchors, priority }
}

// 조각에 표정 우선 문장이 이미 있으면 다시 붙이지 않는다(인계 §4 — 중복 금지).
const EXPRESSION_PRIORITY_RE = /expression[^.]*\bpriority\b|\bpriority\b[^.]*expression/i

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
  /** #anchor-wiring: 앵커별 실측 검증 절(밀도/매체/방언/룩·노출) — 12종 배터리가 결손으로 확인한
   *  축에만 backfill 됐다(역사극·공포는 NULL = 절이 실측 해악이라 T 유지). 정본은 DB. */
  styleClause?: string | null
  /** #anchor-wiring: watercolor A안 — preview 를 2번 스타일 레퍼런스로 병행할지. */
  usePreviewRef?: boolean
  previewUrl?: string | null
  /** #anchor-wiring Rule 6: 'media' | 'sublook' — 서브룩은 그레이드가 상품이라 씬 조명 절의
   *  권위 이관("앵커 그레이드 베끼지 말 것")에서 그레이드·팔레트를 앵커에 남긴다. */
  anchorKind?: string | null
  /** facet 조각(2026-10-08) — 있으면 applyStyleAnchor 가 인계 §4 순서로 함께 싣는다. */
  facets?: StyleAnchorFacets | null
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
  style_clause: string | null
  use_preview_ref: boolean | null
  preview_url: string | null
  anchor_kind: string | null
}

export function applyStyleAnchor(
  anchor: ResolvedStyleAnchor | null,
  base: AnchorableSubmit,
  mode: 'turnaround',
  opts: { pinAspectRatio: string; people?: boolean },
): AnchorableSubmit
export function applyStyleAnchor(
  anchor: ResolvedStyleAnchor | null,
  base: AnchorableSubmit,
  mode: 'single' | 'multiref',
  opts?: { pinAspectRatio?: string; people?: boolean },
): AnchorableSubmit
/** opts.people — 인물이 있는 장면(인물 시트 · 인물이 든 컷)이면 facet 의 Figure rules · Priority 를 싣는다. */
export function applyStyleAnchor(
  anchor: ResolvedStyleAnchor | null,
  base: AnchorableSubmit,
  mode: StyleAnchorMode,
  opts?: { pinAspectRatio?: string; people?: boolean },
): AnchorableSubmit {
  if (anchor == null) return base

  // #anchor-wiring: watercolor A안 — preview 를 2번 스타일 레퍼런스로. turnaround 는 2번 슬롯이
  //   레이아웃 템플릿 계약이라 제외(위치 절 충돌 — 템플릿 경로는 1-ref 유지).
  const twoRef = !!(anchor.usePreviewRef && anchor.previewUrl && mode !== 'turnaround')
  const headClause = twoRef ? STYLE_ANCHOR_2REF_CLAUSE : STYLE_ANCHOR_CLAUSE
  const modeClause =
    mode === 'turnaround'
      ? `\n${STYLE_ANCHOR_TEMPLATE_CLAUSE}`
      : mode === 'multiref'
        ? `\n${twoRef ? STYLE_ANCHOR_2REF_MULTIREF_CLAUSE : STYLE_ANCHOR_MULTIREF_CLAUSE}`
        : ''
  // 앵커별 실측 검증 절(#anchor-wiring) — 절은 앵커 쪽 진실이라 스크럽 대상이 아니다(매체어
  //   포함 가능: stop_motion 매체 절, melo 매체 절 등). base.prompt 스크럽 뒤에 별도 줄로 얹는다.
  const styleClauseLine = anchor.styleClause?.trim() ? `\n${anchor.styleClause.trim()}` : ''

  // 앵커 존재 시 본문 산문에서 매체어 제거(#F-004 B5) — 산문의 "포토리얼리스틱" 류가 앵커
  //   이미지를 이기는 실측 재발 방지. 앵커 없으면 이 함수 자체가 no-op(위 early return).
  //   facet 조각은 앵커 쪽 진실이라 style_clause 처럼 스크럽하지 않는다(인계 §4).
  const body = scrubMediaWords(base.prompt)
  const facets = anchor.facets ?? null
  const prompt = facets
    ? [
        `${headClause}${modeClause}${styleClauseLine}`,
        `Style anchors: ${facets.probeAnchors}`,
        body,
        FACET_SURFACE_GUARD,
        ...(opts?.people && facets.figure
          ? [`Figure rules: ${facets.figure} ${FACET_ADULT_PROPORTIONS}${EXPRESSION_PRIORITY_RE.test(facets.figure) ? '' : ` ${FACET_EXPRESSION_PRIORITY}`}`]
          : []),
        ...(opts?.people && facets.priority ? [facets.priority] : []),
        ...(facets.negative ? [facets.negative] : []),
        // 인물 시트는 양식(2번째 참조)의 칸 이름을 지켜야 한다 — 본문이 이미 "never add any extra text"를 갖고 있어
        //   전면 글자 금지 줄은 싣지 않는다. 비율은 요청 값(aspect_ratio)으로 정해 문장으로 넣지 않는다.
        ...(mode === 'turnaround' ? [] : [FACET_NO_TEXT]),
      ].join('\n')
    : `${headClause}${modeClause}${styleClauseLine}\n${body}`

  const next: AnchorableSubmit = {
    ...base,
    prompt,
    reference_image_urls: [
      anchor.imageUrl,
      ...(twoRef ? [anchor.previewUrl as string] : []),
      ...(base.reference_image_urls ?? []),
    ],
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
  /** 유저 이미지의 경량 facet(인계 §6) — 추출 전이거나 실패했으면 없다(앵커 이미지 + 역할 문장만). */
  facets?: StyleAnchorFacets
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
    ...withFacets(parseStyleAnchorFacets(record.facets)),
  }
}

const withFacets = (facets: StyleAnchorFacets | null) => (facets ? { facets } : {})

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
    // 사용자 그림 분석은 카메라 각도를 빼고 싣는다(2026-10-10 오너) — 프리셋은 아래 경로 그대로.
    return { key: project.style_anchor_key ?? 'custom', imageUrl: custom.url, ...withFacets(custom.facets ? withoutCameraAngle(custom.facets) : null) }
  }

  const anchor = await resolveStyleAnchorByKey(project.style_anchor_key)
  if (!anchor) return null
  return { ...anchor, ...withFacets(await loadStyleAnchorFacets(anchor.key)) }
}

const facetsCache = new Map<string, { facets: StyleAnchorFacets | null; expires: number }>()

/**
 * 프리셋 앵커의 facet 조각(style_anchors.facets, 2026-10-08). 키 해석과 따로 읽는다 — 키 해석(영상 매체 판정 등
 *   여러 곳이 쓰는 조회)은 칸 목록 · 결과 모양을 바꾸지 않는다. 칸이 아직 없는 DB(live 마이그레이션 전)나 조회 실패는
 *   facet 없음 = 종전 조립으로 진행한다(기능 저하이지 오류가 아니다).
 */
export async function loadStyleAnchorFacets(key: string): Promise<StyleAnchorFacets | null> {
  const now = Date.now()
  const cached = facetsCache.get(key)
  if (cached && cached.expires > now) return cached.facets
  try {
    const { data, error } = await supabaseAdmin.from('style_anchors').select('facets').eq('key', key).maybeSingle()
    if (error) return null
    const facets = parseStyleAnchorFacets((data as { facets?: unknown } | null)?.facets)
    facetsCache.set(key, { facets, expires: now + STYLE_ANCHOR_CACHE_TTL_MS })
    return facets
  } catch {
    return null
  }
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
      .select('key, image_url, is_active, medium, style_clause, use_preview_ref, preview_url, anchor_kind')
      .eq('key', key)
      .maybeSingle()

    if (error) {
      console.warn('[style-anchor] resolve failed', error)
      return null
    }

    const row = data as StyleAnchorRow | null
    if (!row || row.is_active === false) return null

    const anchor: ResolvedStyleAnchor = {
      key: row.key,
      imageUrl: row.image_url,
      medium: row.medium ?? null,
      styleClause: row.style_clause ?? null,
      usePreviewRef: row.use_preview_ref ?? false,
      previewUrl: row.preview_url ?? null,
      anchorKind: row.anchor_kind ?? 'media',
    }
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

export interface StyleAnchorCatalogEntry {
  key: string
  label: string
  medium: string | null
  subtitle: string | null
}

let catalogCache: { values: StyleAnchorCatalogEntry[]; expires: number } | null = null

/**
 * 활성 앵커 카탈로그(키·라벨·매체·부제) — 채팅 프롬프트 주입용(D12).
 *
 * 유저가 이름/느낌("일본 애니 그림체")으로 말하면 모델이 여기서 키를 고른다.
 * medium을 같이 주는 이유: 라벨만 보면 "일본 멜로"(실사 서브룩)를 일본 애니로
 * 오인한다(G3 실측 — 이름이 오해를 부른다).
 */
export async function listStyleAnchorCatalog(): Promise<StyleAnchorCatalogEntry[]> {
  const now = Date.now()
  if (catalogCache && catalogCache.expires > now) return catalogCache.values

  try {
    const { data, error } = await supabaseAdmin
      .from('style_anchors')
      .select('key, label, medium, subtitle, is_active')
      .eq('is_active', true)
    if (error) throw error

    const values = (data ?? [])
      .map((row) => {
        const r = row as { key?: unknown; label?: unknown; medium?: unknown; subtitle?: unknown }
        if (typeof r.key !== 'string' || r.key.length === 0) return null
        return {
          key: r.key,
          label: typeof r.label === 'string' ? r.label : r.key,
          medium: typeof r.medium === 'string' ? r.medium : null,
          subtitle: typeof r.subtitle === 'string' ? r.subtitle : null,
        }
      })
      .filter((v): v is StyleAnchorCatalogEntry => v !== null)

    catalogCache = { values, expires: now + STYLE_ANCHOR_CACHE_TTL_MS }
    return values
  } catch (error) {
    console.warn('[style-anchor] catalog list failed', error)
    return []
  }
}

export function _clearStyleAnchorCacheForTest(): void {
  styleAnchorCache.clear()
  facetsCache.clear()
  mediumsCache = null
  catalogCache = null
}
