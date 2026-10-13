// 그림체가 생성할 때 기준 그림을 참고 그림으로 붙이는가(style_anchors.use_reference_image, 2026-10-13 오너 "실사는 기준 그림 없이로만 생성").
//   false 인 그림체는 그림체가 없는 프로젝트와 같은 길로 그린다(resolveStyleAnchor 가 앵커 없음으로 돌려준다).
//   style-anchor 모듈과 따로 둔다 — 배경 · 시트 경로 테스트들이 style-anchor 를 통째로 흉내 내서, 거기 새 함수를 두면 흉내에 없어 깨진다.
//   칸이 아직 없는 DB(운영 마이그레이션 전) · 조회 실패는 "붙인다"(종전 그대로)로 본다 — 기능 저하이지 오류가 아니다.
import { supabaseAdmin } from '@/lib/supabase/admin'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { value: boolean; expires: number }>()

/** 프리셋 그림체가 기준 그림을 붙이는가 — 칸이 false 일 때만 아니다. */
export async function presetUsesReferenceImage(key: string): Promise<boolean> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && hit.expires > now) return hit.value
  try {
    const { data, error } = await supabaseAdmin.from('style_anchors').select('use_reference_image').eq('key', key).maybeSingle()
    if (error) return true
    const value = (data as { use_reference_image?: unknown } | null)?.use_reference_image !== false
    cache.set(key, { value, expires: now + CACHE_TTL_MS })
    return value
  } catch {
    return true
  }
}

/** 프로젝트 그림체가 기준 그림 없이 그리게 정해졌는가 — 배경 경로가 글자 금지 줄을 정할 때 쓴다. 사용자가 올린 그림체 · 그림체 없음은 아니다. */
export async function styleDrawsWithoutReference(
  project: { style_anchor_key?: string | null; custom_style_anchor?: unknown } | null | undefined,
): Promise<boolean> {
  const key = project?.style_anchor_key
  if (!key) return false
  const custom = project?.custom_style_anchor as { url?: unknown } | null | undefined
  if (custom && typeof custom === 'object' && typeof custom.url === 'string' && custom.url.length > 0) return false
  return !(await presetUsesReferenceImage(key))
}

export function _clearReferenceImageCacheForTest(): void {
  cache.clear()
}
