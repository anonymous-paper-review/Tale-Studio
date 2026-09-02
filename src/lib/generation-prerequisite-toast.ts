'use client'

// 생성 선행조건 미충족(409 + code) 공용 처리 — 안내 + 대기 + 자동 재개(#ref-gate 2026-09-02, 오너 결정 "1번").
//
// 서버가 "무엇이 빠졌는지"를 code 로 주면(architecture.md 생성 선행조건), 클라이언트는
//   1) 왜 안 됐는지 한 문장으로 알리고(toast + 채팅),
//   2) 빠진 산출물이 DB 에 나타날 때까지 폴링하다가(브라우저 클라이언트, RLS = 소유자 읽기),
//   3) 같은 생성을 자동으로 다시 제출한다(호출부가 waitForPrerequisite 의 'ready' 를 받아 재호출).
// 탭을 닫으면 대기가 끊긴다 — 서버 예약(2번안)은 새 상태 소유자가 필요해 채택하지 않았다.
// 같은 (프로젝트·code·샷) 키의 대기는 하나만 — 새 대기가 시작되면 이전 대기는 취소된다.

import { toast } from 'sonner'
import { translate } from '@/lib/i18n'
import { useLocaleStore } from '@/stores/locale-store'
import { useGlobalChatStore } from '@/stores/global-chat-store'
import { createClient } from '@/lib/supabase/client'
import { hasStoryboardImage } from '@/lib/director/storyboard-image'
import type { StageId } from '@/types'

export type PrerequisiteCode = 'missing_character_sheets' | 'missing_rough_storyboard' | 'missing_storyboard'
export const PREREQUISITE_CODES: readonly PrerequisiteCode[] = [
  'missing_character_sheets',
  'missing_rough_storyboard',
  'missing_storyboard',
]

export interface PrerequisiteBody {
  error?: string
  code?: string
  /** 러프/실사 스토리보드 선행조건의 샷 */
  shotId?: string
  /** 인물 시트 선행조건의 빠진 인물들 */
  missing?: Array<{ characterId?: string; appearanceKey?: string; name?: string }>
}

export function isPrerequisiteMissing(
  status: number,
  body: unknown,
): body is PrerequisiteBody & { code: PrerequisiteCode } {
  if (status !== 409 || typeof body !== 'object' || body === null) return false
  const code = (body as { code?: unknown }).code
  return typeof code === 'string' && (PREREQUISITE_CODES as readonly string[]).includes(code)
}

/** 하위호환 별칭 — 예전 호출부(missing_character_sheets 전용)와 같은 이름. */
export function isMissingCharacterSheets(status: number, body: unknown): body is PrerequisiteBody {
  return isPrerequisiteMissing(status, body) && body.code === 'missing_character_sheets'
}

function missingNames(body: PrerequisiteBody): string {
  return (body.missing ?? [])
    .map((m) => (m.name ?? m.characterId ?? '').trim())
    .filter(Boolean)
    .join(', ')
}

/** 사람이 읽는 "무엇을 기다리나" — 인물 시트: 이름들 / 러프 스토리보드(샷) / 실사 스토리보드(샷). */
export function prerequisiteLabel(body: PrerequisiteBody & { code: PrerequisiteCode }): string {
  const locale = useLocaleStore.getState().locale
  switch (body.code) {
    case 'missing_character_sheets':
      return translate(locale, 'character sheets for {names}', { names: missingNames(body) || '?' })
    case 'missing_rough_storyboard':
      return translate(locale, 'the rough storyboard of {shot}', { shot: body.shotId ?? '?' })
    case 'missing_storyboard':
      return translate(locale, 'the live-action storyboard of {shot}', { shot: body.shotId ?? '?' })
  }
}

const TOAST_ID = 'generation-prerequisite'

export function notifyPrerequisiteWaiting(stage: StageId, body: PrerequisiteBody & { code: PrerequisiteCode }): void {
  const locale = useLocaleStore.getState().locale
  const message = translate(
    locale,
    'Waiting for {what}. Generation resumes automatically when it is ready.',
    { what: prerequisiteLabel(body) },
  )
  toast.info(message, { id: TOAST_ID })
  // 채팅에도 남긴다 — toast 는 사라지지만 "왜 안 됐나"는 stage 를 옮겨도 읽을 수 있어야 한다.
  useGlobalChatStore.getState().notifyActionError(stage, translate(locale, 'Generation'), message)
}

export function notifyPrerequisiteResumed(body: PrerequisiteBody & { code: PrerequisiteCode }): void {
  const locale = useLocaleStore.getState().locale
  toast.success(translate(locale, '{what} ready — resuming generation.', { what: prerequisiteLabel(body) }), { id: TOAST_ID })
}

export function notifyPrerequisiteTimeout(stage: StageId, body: PrerequisiteBody & { code: PrerequisiteCode }): void {
  const locale = useLocaleStore.getState().locale
  const message = translate(
    locale,
    'Stopped waiting for {what} after 20 minutes. Generate it, then retry manually.',
    { what: prerequisiteLabel(body) },
  )
  toast.error(message, { id: TOAST_ID })
  useGlobalChatStore.getState().notifyActionError(stage, translate(locale, 'Generation'), message)
}

/**
 * 하위호환: 선행조건 미충족이면 "대기 중" 안내만 하고 true. 자동 재개는 호출부가 waitForPrerequisite 로 한다.
 */
export function notifyIfPrerequisiteMissing(status: number, body: unknown): boolean {
  if (!isPrerequisiteMissing(status, body)) return false
  notifyPrerequisiteWaiting('director', body)
  return true
}

// ── 준비 판정(순수) + DB 조회 ────────────────────────────────────────────────

export interface PrerequisiteState {
  /** missing_character_sheets: 빠졌던 (character_id, appearance_key) 의 현재 sheet_url */
  sheets?: Array<{ character_id: string; appearance_key: string; sheet_url: string | null }>
  /** missing_rough_storyboard / missing_storyboard: 샷 행 */
  shot?: { rough_storyboard?: unknown; storyboard_image?: unknown } | null
}

/** 순수: 조회 결과가 선행조건을 만족하는가. */
export function prerequisiteSatisfied(
  body: PrerequisiteBody & { code: PrerequisiteCode },
  state: PrerequisiteState,
): boolean {
  switch (body.code) {
    case 'missing_character_sheets': {
      const need = (body.missing ?? []).filter((m) => m.characterId)
      if (!need.length) return true
      const rows = state.sheets ?? []
      return need.every((m) =>
        rows.some(
          (r) =>
            r.character_id === m.characterId &&
            (!m.appearanceKey || r.appearance_key === m.appearanceKey) &&
            typeof r.sheet_url === 'string' &&
            r.sheet_url.trim().length > 0,
        ),
      )
    }
    case 'missing_rough_storyboard': {
      const frames = (state.shot?.rough_storyboard as { frames?: Record<string, unknown> } | null | undefined)?.frames
      return !!(frames && typeof frames.start === 'string' && typeof frames.direction === 'string' && typeof frames.end === 'string')
    }
    case 'missing_storyboard':
      // 서버 게이트(generate-video)와 같은 판정 — 생성 중 placeholder(status≠completed)는 아직 아님.
      return hasStoryboardImage(state.shot?.storyboard_image)
  }
}

export async function fetchPrerequisiteState(
  projectId: string,
  body: PrerequisiteBody & { code: PrerequisiteCode },
): Promise<PrerequisiteState> {
  const supabase = createClient()
  if (body.code === 'missing_character_sheets') {
    const ids = [...new Set((body.missing ?? []).map((m) => m.characterId).filter((x): x is string => !!x))]
    if (!ids.length) return { sheets: [] }
    const { data, error } = await supabase
      .from('character_appearances')
      .select('character_id, appearance_key, sheet_url')
      .eq('project_id', projectId)
      .in('character_id', ids)
    if (error) throw error
    return { sheets: (data ?? []) as PrerequisiteState['sheets'] }
  }
  if (!body.shotId) return { shot: null }
  const { data, error } = await supabase
    .from('shots')
    .select('rough_storyboard, storyboard_image')
    .eq('project_id', projectId)
    .eq('shot_id', body.shotId)
    .maybeSingle()
  if (error) throw error
  return { shot: (data ?? null) as PrerequisiteState['shot'] }
}

const activeWaits = new Map<string, () => void>()

function waitKey(projectId: string, body: PrerequisiteBody & { code: PrerequisiteCode }): string {
  const target = body.code === 'missing_character_sheets' ? missingNames(body) : (body.shotId ?? '')
  return `${projectId}:${body.code}:${target}`
}

export type PrerequisiteWaitOutcome = 'ready' | 'timeout' | 'cancelled'

/**
 * 선행조건이 DB 에 나타날 때까지 폴링. 같은 키의 이전 대기는 취소된다(중복 재개 방지).
 *   기본 10초 간격, 20분 상한. isCancelled 가 true 를 돌려주면 즉시 'cancelled'.
 */
export async function waitForPrerequisite(
  projectId: string,
  body: PrerequisiteBody & { code: PrerequisiteCode },
  opts?: {
    intervalMs?: number
    timeoutMs?: number
    isCancelled?: () => boolean
    /** 테스트 주입용 조회자 */
    fetchState?: (projectId: string, body: PrerequisiteBody & { code: PrerequisiteCode }) => Promise<PrerequisiteState>
    sleep?: (ms: number) => Promise<void>
  },
): Promise<PrerequisiteWaitOutcome> {
  const key = waitKey(projectId, body)
  activeWaits.get(key)?.()
  let cancelled = false
  activeWaits.set(key, () => { cancelled = true })
  const intervalMs = opts?.intervalMs ?? 10_000
  const deadline = Date.now() + (opts?.timeoutMs ?? 20 * 60_000)
  const fetchState = opts?.fetchState ?? fetchPrerequisiteState
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  try {
    while (Date.now() < deadline) {
      if (cancelled || opts?.isCancelled?.()) return 'cancelled'
      try {
        if (prerequisiteSatisfied(body, await fetchState(projectId, body))) return 'ready'
      } catch (e) {
        // 조회 실패는 대기를 끝내지 않는다(일시 장애) — 다음 틱에 다시.
        console.warn('[prerequisite-wait] state fetch failed:', e instanceof Error ? e.message : e)
      }
      await sleep(intervalMs)
    }
    return 'timeout'
  } finally {
    if (activeWaits.get(key) && !cancelled) activeWaits.delete(key)
  }
}
