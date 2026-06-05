import { supabaseAdmin } from '@/lib/supabase/admin'
import type { InventoryItem, InventoryKind } from '@/types/inventory'

/**
 * 경량 workspace 가드 (계획서 §4).
 * - row 없음 → false (존재하지 않는 workspace)
 * - owner_id != null && owner_id !== userId → false (타인 소유)
 * - owner_id === null (Default workspace) 또는 일치 → true
 *
 * ⚠️ `eq('owner_id', userId)` 필터 방식 복사 금지 — null-owner Default workspace가 전원 차단된다.
 */
/**
 * save-from-asset 원격 이미지 fetch 허용 호스트.
 * legit source는 Supabase storage publicUrl + fal CDN뿐.
 * allowlist가 denylist보다 안전 (DNS rebinding / IPv6 우회 회피).
 */
function imageHostAllowlist(): Set<string> {
  const hosts = new Set<string>()
  try {
    hosts.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host)
  } catch {
    // env 미설정 시 Supabase 호스트 생략.
  }
  hosts.add('fal.media')
  hosts.add('v3.fal.media')
  return hosts
}

/** save-from-asset의 원격 이미지 URL이 허용 호스트인지 검증. SSRF 방지. */
export function assertSafeImageUrl(raw: string): void {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('invalid image url')
  }
  if (u.protocol !== 'https:') throw new Error('image url must be https')
  if (!imageHostAllowlist().has(u.host)) throw new Error('image host not allowed')
}

export async function assertWorkspaceAccess(
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const { data: ws } = await supabaseAdmin
    .from('workspaces')
    .select('owner_id')
    .eq('id', workspaceId)
    .maybeSingle()
  if (!ws) return false
  const ownerId = (ws as { owner_id: string | null }).owner_id
  if (ownerId != null && ownerId !== userId) return false
  return true
}

type InventoryRow = {
  id: string
  workspace_id: string
  kind: InventoryKind
  name: string
  image_url: string
  storage_path: string
  thumbnail_url: string | null
  source_project_id: string | null
  source_character_id: string | null
  created_at: string
  updated_at: string
}

/** snake_case DB row → camelCase InventoryItem */
export function toInventoryItem(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    name: row.name,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    sourceProjectId: row.source_project_id,
    sourceCharacterId: row.source_character_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
