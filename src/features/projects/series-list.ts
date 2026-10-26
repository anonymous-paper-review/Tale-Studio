// 프로젝트 목록의 시리즈 판정(2026-10-26, 방향 문서 .claude/docs/2026-10-22/series-brief.html) — 카드에 보이는 앞 화 줄,
//   [새 프로젝트]의 "앞 화에서 이어 만들기"(고를 화 목록 · 검색 · 요금제 · 칸), 지우기 전 경고, 목록 API 가
//   프로젝트마다 함께 싣는 칸. 순수 함수 — 서버(목록 라우트)와 화면(카드 · 창)이 같은 판정을 쓴다.
//   문구는 영어 원문 = 사전 키.
//   2026-10-26 오너: 카드마다 붙은 [다음 화 만들기](99장 중 74장)가 목록을 어지럽혀 카드에서 빼고 [새 프로젝트]로 옮겼다.
import { parseSeries } from '@/lib/series/snapshot'

/** 목록(GET /api/project/list)이 프로젝트마다 주는 시리즈 칸. */
export interface SeriesListProject {
  id: string
  title?: string | null
  /** 앞 화 번호. 앞 화를 지우면 null 이 된다(on delete set null). */
  referenceProjectId?: string | null
  /** 앞 화를 지워도 카드에 남는 앞 화 제목. 시리즈가 아니면 null. */
  seriesPrevTitle?: string | null
  /** 이 화로 다음 화를 만들 수 있나 — 인물 · 배경 그림을 만들기 시작해 씬이 1개 이상 생긴 화. */
  canContinue?: boolean
}

/**
 * 서버가 series_not_ready 로 막았을 때 만들기 창에 보이는 한 줄 — 앞 화가 될 수 있는 화의 조건(10-04 결정 0-5: 씬 1개 이상).
 *   씬 행은 인물 · 배경 디자인(v2Design, persistAssetsToDb)이 처음 저장한다 — 리뉴얼 뒤에는 Artist [만들기], 그 전 프로젝트는
 *   Writer 씬 확정 뒤. 그래서 단계 이름 대신 "인물 · 배경 그림을 만들기 시작한 화"라고 쓴다.
 */
export const NEXT_EPISODE_NOT_READY =
  'You can create the next episode from an episode where you started making the character and background images.'

export interface SeriesPlanState {
  /** 프로젝트 칸이 2개 이상인 요금제(canUseReference). */
  canUseReference: boolean
  /** 칸 수. 제한이 없는 계정(관리자)은 null. */
  slotLimit: number | null
  /** 지금 쓴 칸 = 목록의 프로젝트 수. */
  used: number
}

/**
 * [새 프로젝트]를 눌렀을 때 할 일. 이어 만들 수 있는 화가 하나라도 있으면 "처음부터 / 앞 화에서 이어" 고르는 창,
 *   없으면 바로 새 프로젝트 — 처음 쓰는 사람에게 고를 것 없는 창을 보이지 않는다(오너 2026-10-26 추천안 ②).
 *   요금제가 안 돼도 고르는 창은 연다 — 잠긴 "앞 화에서 이어 만들기"가 요금제 안내로 이어진다.
 */
export function newProjectEntry(projects: readonly SeriesListProject[]): 'choose' | 'direct' {
  return projects.some((p) => p.canContinue === true) ? 'choose' : 'direct'
}

/**
 * "앞 화에서 이어 만들기"를 눌렀을 때 할 일. plan = 요금제 안내 창 · slots = 칸이 찼다는 창 · pick = 고를 화 목록.
 *   요금제를 먼저 본다 — 칸이 1개인 요금제에서는 어느 화로도 다음 화를 만들 수 없다.
 *   서버도 같은 순서로 막는다(403 reference_unavailable → 403 slot_limit).
 */
export function continueEntry(plan: SeriesPlanState): 'plan' | 'slots' | 'pick' {
  if (!plan.canUseReference) return 'plan'
  if (plan.slotLimit !== null && plan.used >= plan.slotLimit) return 'slots'
  return 'pick'
}

/** 고를 화 목록 한 줄에 필요한 칸. */
export interface ContinuableProject extends SeriesListProject {
  updated_at?: string | null
}

/** 검색은 영어 대소문자와 띄어쓰기를 무시한다 — "다음화"로 쳐도 "다음 화"가 찾아져야 한다. */
function searchKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '')
}

/**
 * "앞 화에서 이어 만들기" 목록 — 다음 화를 만들 수 있는 화만, 이름에 검색어가 든 것만, 최근에 고친 순서.
 *   고친 시각이 없는 화는 맨 뒤로 보낸다.
 */
export function continuableEpisodes<T extends ContinuableProject>(projects: readonly T[], query: string): T[] {
  const key = searchKey(query)
  const time = (p: T) => (p.updated_at ? Date.parse(p.updated_at) || 0 : 0)
  return projects
    .filter((p) => p.canContinue === true && (!key || searchKey(p.title).includes(key)))
    .sort((a, b) => time(b) - time(a))
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
