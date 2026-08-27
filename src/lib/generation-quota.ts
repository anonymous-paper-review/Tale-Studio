// 생성 작업 동시성 정책 (멀티유저) — 2단 게이트 + 영상/이미지 분리 풀.
//
// 희소 자원은 단 하나다: 단일 FAL_KEY 계정의 **동시 실행 슬롯 20개**를 전 유저가 공유한다.
// fal 은 초과분을 거부하지 않고 큐에 태우므로 "터진다"가 아니라 "뒤에 온 사람이 앞사람 잔여 큐
// 뒤에서 기다린다"(head-of-line blocking)가 실제 증상이다. 이 파일은 그 대기를 통제한다.
//
//   레벨 0 — 유저당 상한: 한 유저의 독점을 막는다. 영상/이미지 **별도 풀** (2026-08-26 오너 결정).
//   레벨 1 — 전역 세마포어(MAX_GLOBAL_INFLIGHT_JOBS): 전 유저 합계가 fal 슬롯을 넘지 않게 막는다.
//
// 영상/이미지를 왜 나누나 (2026-08-26, 오너 세션 실측 C1): 합산 상한에서는 영상 배치가 슬롯을
//   다 먹어 이미지 한 장도 못 뽑았다. 과금 축과도 정합 — 요금제(tale_pricing v4)에서 Take 는
//   **영상 전용**이고 이미지는 무과금·다량(샷당 6장)이다. 영상은 작게 잡아 Take 소진 속도를
//   통제하고, 이미지는 처리량을 유지한다.
//
// admin 면제 (2026-08-26 오너 결정): 관리자 계정(운영·QA)은 유저당 상한을 받지 않는다.
//   전역 세마포어는 admin 도 받는다 — fal 슬롯 20 은 물리 한도라 면제 대상이 아니다.
//
// 공정성(유저 라운드로빈 디스패치)은 여기 없다 — 전역 상한에 닿으면 먼저 온 요청이 슬롯을 먹는다.
//   5명 규모에서는 이 러프함이 실무상 문제가 아니고, 진짜 fair-queue 는 잡을 pending 으로 재웠다가
//   디스패처가 승격시키는 별도 상태머신이 필요하다. 유저가 늘고 편중이 실측될 때 도입한다.
//   (거부→대기열 전환은 백로그 — .claude/docs/2026-08-26/group-a-state-loss.md 논의 3번)
import {
  countQueuedJobsByUser,
  countQueuedJobsGlobal,
  type GenerationJobKind,
} from '@/lib/generation-jobs'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { PROJECT_VIDEO_GENERATION_LIMIT } from '@/lib/plan-limits'
import { isAdminEmail } from '@/lib/admin'

/** 쿼터 카테고리 — Take 과금 축과 동일한 경계. 영상 kind 만 video, 나머지 전부 image. */
export type QuotaCategory = 'video' | 'image'

export const VIDEO_JOB_KINDS: readonly GenerationJobKind[] = ['shot_video', 'shot_previz_video']
export const IMAGE_JOB_KINDS: readonly GenerationJobKind[] = [
  'character_view',
  'world_shot',
  'shot_storyboard',
  'storyboard_real_grid',
  'shot_rough_storyboard',
]

// 유저 1명이 동시에 큐에 올릴 수 있는 최대 생성 작업 수 (레벨 0) — 카테고리별.
// 영상 3: Take(과금) 소진 속도 통제 + 5초 클립은 수 분 내 순환하므로 배치도 밀리지 않는다.
// 이미지 6: 무과금·다량(러프/실사 보드 12샷 × 샷당 6장) — 기존 합산 상한 수준의 처리량 유지.
// 합산 최악 9 라도 3명까지는 전역 상한(34) 안이고, 그 이상은 전역 세마포어가 받는다.
export const MAX_QUEUED_VIDEO_JOBS_PER_USER = 3
export const MAX_QUEUED_IMAGE_JOBS_PER_USER = 6

// 전 유저 합계 in-flight 상한 (레벨 1). fal 계정 동시 실행 한도에서 안전 마진을 뺀 값.
//
// 실측 근거 (2026-08-26, scripts/fal-slot-probe.mjs): 24건·40건 동시 제출은 전원 대기 0으로 즉시
//   실행됐고, 60건에서 처음으로 41건 실행 + 19건 대기가 관측됐다 — 계정 동시 한도 = 40.
//   오너 대시보드 표기($1000 충전 = 40건 동시)와 일치한다. 옛 주석의 "슬롯 20" 은 근거 없는
//   과소 가정이었고 그 위에 세운 18은 산 슬롯의 절반 이상을 놀리고 있었다.
//
// 마진 6인 이유: (a) count-then-submit 경쟁의 오버슛, (b) webhook 지연으로 이미 끝났는데 아직
//   queued 로 세는 잡, (c) 이 40이 충전액 연동 티어라 잔액이 줄면 한도가 내려갈 수 있다.
//   (c) 때문에 마진을 옛 2보다 크게 잡는다 — 티어가 30으로 내려가도 34는 fal 큐로 조금 새는 정도지만
//   40에 딱 붙은 값이면 대기가 즉시 길어진다.
//   ⚠️ fal 충전액/플랜을 바꾸면 이 값도 재검토할 것. 재측정은 위 스크립트로 (과금 발생).
export const MAX_GLOBAL_INFLIGHT_JOBS = 34

/** 한도에 걸린 축 — 유저 본인의 상한인지, 전 유저 공유 슬롯인지. 안내 문구가 갈린다. */
export type QuotaScope = 'user' | 'global'

export interface QuotaCheck {
  ok: boolean
  /** 걸린 축의 현재 in-flight 수 (ok=true 면 유저 본인 카테고리 수). */
  queued: number
  /** 걸린 축의 상한 (ok=true 면 유저 카테고리 상한). */
  limit: number
  /** ok=false 일 때 어느 축에서 막혔는지. ok=true 면 'user'(표시에 쓰이지 않음). */
  scope: QuotaScope
  /** 판정 대상 카테고리 — 클라 토스트가 "영상/이미지" 문구를 가른다. */
  category: QuotaCategory
}

function limitOf(category: QuotaCategory): number {
  return category === 'video' ? MAX_QUEUED_VIDEO_JOBS_PER_USER : MAX_QUEUED_IMAGE_JOBS_PER_USER
}

function kindsOf(category: QuotaCategory): readonly GenerationJobKind[] {
  return category === 'video' ? VIDEO_JOB_KINDS : IMAGE_JOB_KINDS
}

// admin 판별 캐시 — 쿼터 검사는 생성마다 도는 핫패스라 auth 조회를 유저당 1회로 줄인다.
//   admin 명단 변경은 배포/env 수준의 사건이라 프로세스 수명 캐시로 충분하다.
const adminUserCache = new Map<string, boolean>()

async function isAdminUserId(userId: string): Promise<boolean> {
  const cached = adminUserCache.get(userId)
  if (cached !== undefined) return cached
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (error) throw error
    const admin = isAdminEmail(data?.user?.email)
    adminUserCache.set(userId, admin)
    return admin
  } catch {
    // 판별 실패는 일반 유저로 취급 — 쿼터가 admin 에게 잘못 걸리는 쪽이 뚫리는 쪽보다 안전.
    return false
  }
}

/**
 * 생성 1건을 지금 제출해도 되는지 — 유저 카테고리 상한과 전역 슬롯을 함께 본다.
 *
 * 판정 순서는 유저 먼저다: 같은 429 라도 "내가 상한만큼 돌리는 중"과 "서버가 붐빈다"는 사용자가
 *   취할 행동이 다르다(전자는 내 작업이 끝나길 기다림, 후자는 잠시 후 재시도). 전역을 먼저 보면
 *   자기 독점이 서버 혼잡으로 오인된다.
 *
 * 집계 실패 시 fail-open(차단하지 않음) — 쿼터 텔레메트리 장애가 생성 자체를 막으면 안 된다.
 *   전역 게이트도 같은 규약: DB 조회 실패로 전원의 생성이 잠기는 쪽이 슬롯 초과보다 나쁘다.
 */
export async function checkGenerationCapacity(
  userId: string,
  category: QuotaCategory,
): Promise<QuotaCheck> {
  const limit = limitOf(category)
  try {
    const [userQueued, globalQueued, admin] = await Promise.all([
      countQueuedJobsByUser(userId, kindsOf(category)),
      countQueuedJobsGlobal(),
      isAdminUserId(userId),
    ])
    if (!admin && userQueued >= limit) {
      return { ok: false, queued: userQueued, limit, scope: 'user', category }
    }
    if (globalQueued >= MAX_GLOBAL_INFLIGHT_JOBS) {
      return { ok: false, queued: globalQueued, limit: MAX_GLOBAL_INFLIGHT_JOBS, scope: 'global', category }
    }
    return { ok: true, queued: userQueued, limit, scope: 'user', category }
  } catch {
    return { ok: true, queued: 0, limit, scope: 'user', category }
  }
}

/**
 * 429 응답 본문 표준 형태. 클라(generation-quota-toast)가 code/scope/category 로 안내 문구를 고른다.
 *
 * 문구가 영어인 이유: server-only 라 유저 locale 을 알 방법이 없다(#i18n-s5-batch 규약). 이 문자열은
 *   최후 폴백이고, 실제 사용자에게 보이는 것은 클라가 locale 로 고른 toast 다.
 */
export function quotaExceededBody(check: QuotaCheck) {
  const noun = check.category === 'video' ? 'video' : 'image'
  const message =
    check.scope === 'global'
      ? `Generation slots are busy across all users (${check.queued}/${check.limit}). Please try again in a moment.`
      : `Concurrent ${noun} generation limit reached (${check.queued}/${check.limit}). Please try again once the in-progress ones finish.`
  return {
    error: message,
    code: 'quota_exceeded' as const,
    scope: check.scope,
    category: check.category,
    queued: check.queued,
    limit: check.limit,
  }
}

// ── #f4 하드 블록(2026-08-27 오너 확정): 프로젝트당 영상 생성 총량 게이트 ──
// 사이드바 게이지와 같은 집계(영상 kind 잡 행 수 — 실패 포함)를 진실로 쓴다. admin 은 면제
//   (운영·QA), 집계 실패는 fail-open — 동시성 게이트와 같은 규약.
export interface ProjectVideoBudget {
  ok: boolean
  used: number
  limit: number
}

export async function checkProjectVideoBudget(
  projectId: string,
  userId: string,
): Promise<ProjectVideoBudget> {
  const limit = PROJECT_VIDEO_GENERATION_LIMIT
  try {
    if (await isAdminUserId(userId)) return { ok: true, used: 0, limit }
    const { count } = await supabaseAdmin
      .from('generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .in('kind', VIDEO_JOB_KINDS as unknown as string[])
    const used = count ?? 0
    return { ok: used < limit, used, limit }
  } catch {
    return { ok: true, used: 0, limit }
  }
}

/** 429 본문 — 클라(generation-quota-toast)가 code 로 문구를 고른다. 서버 문자열은 폴백. */
export function videoBudgetExceededBody(budget: ProjectVideoBudget) {
  return {
    error: `This project has used all ${budget.limit} video generations (${budget.used}/${budget.limit}).`,
    code: 'video_budget_exceeded' as const,
    used: budget.used,
    limit: budget.limit,
  }
}
