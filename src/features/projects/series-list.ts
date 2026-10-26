// 프로젝트 목록의 시리즈 판정(2026-10-26, 방향 문서 .claude/docs/2026-10-22/series-brief.html) — 카드에 보이는 앞 화 줄,
//   [다음 화 만들기] 버튼 상태, 지우기 전 경고, 목록 API 가 프로젝트마다 함께 싣는 칸. 순수 함수 — 서버(목록 라우트)와
//   화면(카드 · 창)이 같은 판정을 쓴다. 문구는 영어 원문 = 사전 키.
import { parseSeries } from '@/lib/series/snapshot'

/** 목록(GET /api/project/list)이 프로젝트마다 주는 시리즈 칸. */
export interface SeriesListProject {
  id: string
  title?: string | null
  /** 앞 화 번호. 앞 화를 지우면 null 이 된다(on delete set null). */
  referenceProjectId?: string | null
  /** 앞 화를 지워도 카드에 남는 앞 화 제목. 시리즈가 아니면 null. */
  seriesPrevTitle?: string | null
  /** 이 화로 다음 화를 만들 수 있나 — Artist [만들기]를 눌러 씬이 1개 이상 생긴 화. */
  canContinue?: boolean
}

/** 버튼 아래 한 줄 까닭 — 앞 화가 될 수 있는 화의 조건(10-04 결정 0-5: 씬 1개 이상). */
export const NEXT_EPISODE_NOT_READY = 'You can create the next episode from an episode where you pressed [Create] in Artist.'

/**
 * [다음 화 만들기]를 눌렀을 때 할 일.
 *   plan = 요금제 안내 창 · blocked = 누를 수 없음(까닭 한 줄) · slots = 칸이 찼다는 창 · create = 만들기 창
 */
export type NextEpisodeAction = 'plan' | 'blocked' | 'slots' | 'create'

export interface NextEpisodeButton {
  action: NextEpisodeAction
  enabled: boolean
  /** 요금제가 안 되는 계정에서는 잠긴 버튼으로 보인다 — 누르면 요금제 안내가 뜬다. */
  locked: boolean
  /** 버튼 아래 한 줄(사전 키). 없으면 null. */
  reason: string | null
}

export interface SeriesPlanState {
  /** 프로젝트 칸이 2개 이상인 요금제(canUseReference). */
  canUseReference: boolean
  /** 칸 수. 제한이 없는 계정(관리자)은 null. */
  slotLimit: number | null
  /** 지금 쓴 칸 = 목록의 프로젝트 수. */
  used: number
}

/**
 * 프로토타입 L1a · L1p · L1s 순서(요금제 → Artist [만들기] → 칸). 요금제를 먼저 보는 까닭:
 *   칸이 1개인 요금제에서는 어느 화로도 다음 화를 만들 수 없어 까닭 한 줄이 도움이 되지 않는다.
 *   서버도 같은 순서로 막는다(403 reference_unavailable → 403 slot_limit).
 */
export function nextEpisodeButton(project: SeriesListProject, plan: SeriesPlanState): NextEpisodeButton {
  if (!plan.canUseReference) return { action: 'plan', enabled: true, locked: true, reason: null }
  if (!project.canContinue) return { action: 'blocked', enabled: false, locked: false, reason: NEXT_EPISODE_NOT_READY }
  if (plan.slotLimit !== null && plan.used >= plan.slotLimit) return { action: 'slots', enabled: true, locked: false, reason: null }
  return { action: 'create', enabled: true, locked: false, reason: null }
}

/** 서버가 돌려준 실패 코드를 버튼 단계와 같은 창으로. 모르는 코드는 다시 시도 안내. */
export type NextEpisodeFailure = 'plan' | 'slots' | 'not_found' | 'not_ready' | 'unknown'

export function nextEpisodeFailure(code: string | null | undefined): NextEpisodeFailure {
  if (code === 'reference_unavailable') return 'plan'
  if (code === 'slot_limit') return 'slots'
  if (code === 'reference_not_found') return 'not_found'
  if (code === 'series_not_ready') return 'not_ready'
  return 'unknown'
}

export interface PrevEpisodeLink {
  title: string
  /** 앞 화를 지웠다 — 제목은 남았는데 연결이 끊긴 상태. */
  deleted: boolean
}

/** 카드의 "← 앞 화 제목" 줄. 시리즈가 아니면 null. */
export function prevEpisodeLink(project: SeriesListProject): PrevEpisodeLink | null {
  const title = (project.seriesPrevTitle ?? '').trim()
  if (!title) return null
  return { title, deleted: !project.referenceProjectId }
}

/** 이 화를 이어받은 다음 화들(목록 안에서). 하나라도 있으면 지우기 전에 경고한다. */
export function continuingEpisodes<T extends SeriesListProject>(projects: readonly T[], projectId: string): T[] {
  return projects.filter((p) => p.referenceProjectId === projectId)
}

/** "앞 화 마지막 장면에서 이어 시작하기" 체크박스를 보일지 — 미리보기(GET /api/project/next-episode)가 끝 장면을 찾았을 때만. */
export function canContinueLastScene(preview: { lastSceneAvailable?: boolean } | null | undefined): boolean {
  return preview?.lastSceneAvailable === true
}

/** 목록 라우트가 읽는 projects 행(필요한 칸만). */
export interface SeriesListRow {
  id: string
  reference_project_id?: string | null
  series?: unknown
}

export interface SeriesListFields {
  referenceProjectId: string | null
  seriesPrevTitle: string | null
  canContinue: boolean
}

/** 목록 응답에 더하는 시리즈 칸. 씬이 있는 프로젝트 번호 묶음은 한 번의 조회로 미리 센다. */
export function seriesListFields(row: SeriesListRow, projectsWithScenes: ReadonlySet<string>): SeriesListFields {
  const series = parseSeries(row.series)
  return {
    referenceProjectId: typeof row.reference_project_id === 'string' ? row.reference_project_id : null,
    seriesPrevTitle: series?.prevTitle ?? null,
    canContinue: projectsWithScenes.has(row.id),
  }
}
