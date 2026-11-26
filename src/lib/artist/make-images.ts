// Artist 새 흐름(m1126 O1 · O6, 리드 2026-11-26 2차)의 [이미지 만들기] — 서버 쪽 규칙.
//   산문 확정 뒤 디자인 · 씬 · 샷 나누기가 끝났고 그림은 아직이다. [이미지 만들기]는 고른 그림체를 저장하고(바꿨을 때만)
//   인물 · 배경 · 소품 첫 그림만 건다(triggerAssetDrafts — 그림이 없는 칸만). 씬 · 샷 · 산문(Writer 실행)은 건드리지 않는다.
//   그림을 그리기 시작한 뒤의 그림체 바꾸기는 [재생성하기](버전 기록이 남는 길)다. 약속: tests/artist/make-images-route.test.ts
import { supabaseAdmin } from '@/lib/supabase/admin'
import { STALE_QUEUED_MS } from '@/lib/generation-jobs'
import { ARTIST_IMAGE_JOB_KINDS } from '@/lib/artist/images-started'

export const MAKE_IMAGES_CODES = {
  imagesStarted: 'images_started',
  completed: 'completed',
  styleLocked: 'style_locked',
  unknownStyle: 'unknown_style',
  alreadyQueued: 'drafts_already_queued',
  noLook: 'no_look',
} as const

export type MakeImagesStylePlan =
  | { action: 'keep' }
  | { action: 'switch'; key: string }
  | { action: 'reject'; code: (typeof MAKE_IMAGES_CODES)[keyof typeof MAKE_IMAGES_CODES]; error: string; status: number }

/** 고른 그림체로 무엇을 하나 — 그대로 두기 · 바꾸기 · 거절. 바꿀 때만 그림 시작 여부 · Storyboard 열림을 본다. */
export function makeImagesStylePlan(input: {
  current: { styleKey: string | null; custom: unknown }
  requested: string | null | undefined
  /** 인물 · 배경 · 소품 그림 작업이 있었나(images-started) — null 은 모름(바꾸지 않는다). */
  imagesStarted: boolean | null
  /** Storyboard 를 열었다(artistStyleLocked) — 그림체를 바꿀 수 없다. */
  storyboardOpened: boolean
}): MakeImagesStylePlan {
  const requested = input.requested?.trim() || null
  if (!requested || requested === (input.current.styleKey ?? '')) return { action: 'keep' }
  if (input.storyboardOpened) return { action: 'reject', code: MAKE_IMAGES_CODES.completed, error: 'The style cannot be changed after Storyboard opens', status: 409 }
  if (input.imagesStarted !== false) return { action: 'reject', code: MAKE_IMAGES_CODES.imagesStarted, error: 'Images were already started — change the style with Regenerate', status: 409 }
  const custom = input.current.custom
  if (custom && typeof custom === 'object' && (custom as { locked?: unknown }).locked === true) {
    return { action: 'reject', code: MAKE_IMAGES_CODES.styleLocked, error: 'The art style is fixed to the uploaded picture', status: 409 }
  }
  // 올린 내 그림체는 지금 그림체일 때만 쓴다 — 다른 사람 · 다른 작품의 그림체 키로 바꾸지 않는다.
  if (requested.startsWith('custom')) return { action: 'reject', code: MAKE_IMAGES_CODES.unknownStyle, error: 'Unknown style', status: 400 }
  return { action: 'switch', key: requested }
}

/** 쓸 수 있는 카탈로그 그림체 — 없거나 내린 것이면 null. medium = 그림 지시 그림체 값을 고를 매체. */
export async function activeCatalogStyle(key: string): Promise<{ key: string; medium: string | null } | null> {
  const { data, error } = await supabaseAdmin.from('style_anchors').select('key, is_active, medium').eq('key', key).maybeSingle()
  if (error) throw new Error(`style read failed: ${error.message}`)
  const row = data as { is_active?: boolean; medium?: string | null } | null
  return row?.is_active ? { key, medium: row.medium ?? null } : null
}

/** 10분 안에 대기열에 든 이 작품의 그림 작업 수 — 다른 창이 먼저 눌러 그리는 중이면 다시 걸지 않는다(retry-drafts 와 같은 막이 + 소품). */
export async function freshQueuedDraftJobCount(projectId: string): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_QUEUED_MS).toISOString()
  const { count, error } = await supabaseAdmin
    .from('generation_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .in('kind', [...ARTIST_IMAGE_JOB_KINDS])
    .eq('status', 'queued')
    .gte('created_at', cutoff)
  if (error) throw new Error(error.message ?? 'queued draft query failed')
  return count ?? 0
}
