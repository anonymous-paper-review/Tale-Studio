// 프로젝트 목록의 시리즈 판정(2026-10-26, 방향 문서 .claude/docs/2026-10-22/series-brief.html) — 카드에 보이는 앞 화 줄,
//   [새 프로젝트]의 "앞 화에서 이어 만들기"(고를 화 목록 · 검색 · 요금제 · 칸), 지우기 전 경고, 목록 API 가
//   프로젝트마다 함께 싣는 칸. 순수 함수 — 서버(목록 라우트)와 화면(카드 · 창)이 같은 판정을 쓴다.
//   문구는 영어 원문 = 사전 키.
//   2026-10-26 오너: 카드마다 붙은 [다음 화 만들기](99장 중 74장)가 목록을 어지럽혀 카드에서 빼고 [새 프로젝트]로 옮겼다.
import { customStyleLabel } from '@/lib/custom-style-label'
import type { AppLocale } from '@/lib/locale'
import { parseSeries } from '@/lib/series/snapshot'
import { styleAnchorName } from '@/lib/style-anchor-name'
import type { StageId } from '@/types'

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

/** 검색은 영어 대소문자와 띄어쓰기를 무시한다 — "다음화"로 쳐도 "다음 화"가 찾아져야 한다. 프로젝트 목록 찾기(project-list)도 같은 규칙. */
export function searchKey(value: string | null | undefined): string {
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

/** 만들기 창이 받는 미리보기(GET /api/project/next-episode) — 그림체 · 장르는 2026-11-09 오너 추천대로 더했다. */
export interface NextEpisodePreviewView {
  prevTitle: string
  characters: string[]
  locations: string[]
  hasVoices: boolean
  lastSceneAvailable: boolean
  style?: { kind: 'custom'; label: string | null } | { kind: 'preset'; key: string; label: string; subtitle: string | null } | null
  genre?: string | null
}

export interface NextEpisodeRow {
  key: 'characters' | 'backgrounds' | 'style' | 'genre' | 'voices'
  label: string
  value: string
}

/**
 * 만들기 창의 이어받는 것 줄(11/5 시안 R6) — 등장인물 · 배경 · 그림체(이름과 함께) · 장르(이어받을 때) · 말투(대사까지 끝난 앞 화).
 *   그림체 이름은 화면 언어로(목록 그림체는 그 언어 이름, 사용자가 올린 그림체는 그 이름 · 없으면 "내 레퍼런스").
 *   약속: tests/project/next-episode-rows.test.ts
 */
export function nextEpisodeRows(
  preview: NextEpisodePreviewView,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: AppLocale,
): NextEpisodeRow[] {
  const dot = ' · '
  const style = preview.style ?? null
  const styleName = !style
    ? null
    : style.kind === 'custom'
      ? customStyleLabel(style.label, locale)
      : styleAnchorName({ key: style.key, label: style.label, subtitle: style.subtitle }, locale)
  const rows: NextEpisodeRow[] = [
    { key: 'characters', label: t('Characters'), value: preview.characters.length ? preview.characters.join(dot) : t('None') },
    { key: 'backgrounds', label: t('Backgrounds'), value: preview.locations.length ? preview.locations.join(dot) : t('None') },
    {
      key: 'style',
      label: t('Art style'),
      value: styleName ? t('Same as the previous episode ({style})', { style: styleName }) : t('Same as the previous episode'),
    },
  ]
  if (preview.genre) rows.push({ key: 'genre', label: t('Genre'), value: t('Inherited from the previous episode') })
  if (preview.hasVoices) rows.push({ key: 'voices', label: t('Voices'), value: t('Inherited from the previous episode') })
  return rows
}

/**
 * [다음 화 만들기]를 누른 뒤 기다리는 카드의 단계(11/5 시안 R5, 리드 2026-11-09).
 *   서버는 한 번에 답해서 단계를 알려 주지 않는다 — Producer 자료 읽기(entry-store READ_STEP_MS)와 같은 1.4초마다 넘기고,
 *   마지막 단계는 답이 올 때까지 지금 단계로 둔다.
 */
export const NEXT_EPISODE_WAIT_STEPS = ['Open the previous episode', 'Loading characters and backgrounds', 'Matching the art style'] as const
export const NEXT_EPISODE_WAIT_STEP_MS = 1400

/** 다음으로 보일 단계 번호 — 마지막에서 멈춘다. */
export function nextEpisodeWaitStep(step: number): number {
  return Math.min(step + 1, NEXT_EPISODE_WAIT_STEPS.length - 1)
}

/**
 * 다음 화가 만들어진 뒤 열 프로젝트(시작 화면) — 스튜디오는 주소만 바꿔서는 다른 프로젝트를 열지 않아
 *   유저 메뉴의 프로젝트 바꾸기(switchProject)와 같은 길로 먼저 바꾼다(검토 B 높음 1, 2026-11-09).
 */
export function nextEpisodeSwitch(body: { projectId: string; project?: { title?: unknown } | null }): { id: string; title: string; stage: StageId } {
  const title = typeof body.project?.title === 'string' && body.project.title.trim() ? body.project.title : 'Untitled'
  return { id: body.projectId, title, stage: 'entry' }
}

/**
 * 만든 뒤 기다리는 카드 · 창을 닫을 때 — 스튜디오 안(레일 프로필 메뉴)에서 연 창은 틀이 이동해도 그대로라,
 *   열린 프로젝트가 새 화로 바뀌면 닫는다. 프로젝트 목록 화면은 새 화로 옮겨 가면 화면째 사라지므로 닫지 않는다
 *   (먼저 닫으면 목록이 한 번 깜박인다).
 */
export function nextEpisodeWaitDone({
  createdId,
  projectId,
  pathname,
}: {
  createdId: string | null
  projectId: string | null
  pathname: string | null
}): boolean {
  return !!createdId && projectId === createdId && !!pathname?.startsWith('/studio')
}

/** [다음 화 만들기]를 누를 수 있나 — 미리 보기가 있고, 만드는 중이 아니고, 이 창에서 아직 만들지 않았을 때(한 창에 한 번). */
export function canCreateNextEpisode({ preview, creating, createdId }: { preview: unknown; creating: boolean; createdId: string | null }): boolean {
  return !!preview && !creating && !createdId
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
