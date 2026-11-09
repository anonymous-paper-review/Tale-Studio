// 프로젝트 목록의 이름으로 찾기 · 정렬(11/5 시안 R2, 리드 2026-11-09) — 순수 함수. 목록 화면(app/projects)이 쓴다.
//   정렬은 기억하지 않는다(들어올 때마다 최신순). 찾기는 이어 만들 화 찾기(series-list)와 같은 규칙이고 화면 안에서만 거른다.
//   문구는 영어 원문 = 사전 키. 약속: tests/project/list-sort.test.ts
import { STAGES } from '@/lib/constants'
import type { AppLocale } from '@/lib/locale'
import type { StageId } from '@/types'
import { searchKey } from './series-list'

export type ProjectSort = 'recent' | 'oldest' | 'name' | 'stage'

/** 들어올 때마다 이 정렬로 시작한다 — 최근에 고친 순(목록 API 가 주는 순서, 이어 만들 화 고르기와 같은 뜻). */
export const DEFAULT_PROJECT_SORT: ProjectSort = 'recent'

/** 정렬 메뉴 — 시안 순서 그대로. 이름순은 화면 언어의 글자부터 놓는다(한국어 ㄱ → ㅎ, 영어 A → Z). */
export const PROJECT_SORTS: ReadonlyArray<{ key: ProjectSort; label: string }> = [
  { key: 'recent', label: 'Latest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'name', label: 'Name (A → Z)' },
  { key: 'stage', label: 'Stage (Producer → Editor)' },
]

/** 찾기 · 정렬에 쓰는 칸(목록 API 의 프로젝트 한 줄). */
export interface ListedProject {
  title?: string | null
  current_stage?: string | null
  updated_at?: string | null
}

/** 카드에 보이는 이름 — 이름이 없으면 Untitled(카드와 같다). */
const shownTitle = (project: ListedProject) => project.title || 'Untitled'

/** 고친 시각(ms). 모르면 null — 최신순 · 오래된순 모두 맨 뒤로 보낸다. */
function editedAt(project: ListedProject): number | null {
  const time = project.updated_at ? Date.parse(project.updated_at) : Number.NaN
  return Number.isFinite(time) ? time : null
}

function byEdited(direction: 1 | -1) {
  return (a: ListedProject, b: ListedProject): number => {
    const ta = editedAt(a)
    const tb = editedAt(b)
    if (ta === null || tb === null) return ta === null ? (tb === null ? 0 : 1) : -1
    return (ta - tb) * direction
  }
}
const byRecent = byEdited(-1)
const byOldest = byEdited(1)

/** 단계 순서(Producer → Editor). 모르는 단계는 카드 이름표처럼 Producer 로 본다(projectStageLabel). */
function stageIndex(stage: string | null | undefined): number {
  const index = STAGES.findIndex((s) => s.id === stage)
  return index < 0 ? 0 : index
}

/** 목록에 보일 프로젝트 — 이름에 찾는 글이 든 것만, 고른 정렬로. 같으면 최근에 고친 것이 먼저다. */
export function visibleProjects<T extends ListedProject>(
  projects: readonly T[],
  { query, sort, locale }: { query: string; sort: ProjectSort; locale: AppLocale },
): T[] {
  const key = searchKey(query)
  const found = key ? projects.filter((p) => searchKey(shownTitle(p)).includes(key)) : [...projects]
  if (sort === 'oldest') return found.sort(byOldest)
  if (sort === 'name') {
    const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
    return found.sort((a, b) => collator.compare(shownTitle(a), shownTitle(b)) || byRecent(a, b))
  }
  if (sort === 'stage') return found.sort((a, b) => stageIndex(a.current_stage) - stageIndex(b.current_stage) || byRecent(a, b))
  return found.sort(byRecent)
}

/** 카드의 단계 점 색(11/5 시안 R2) — 단계 이름표와 같은 화면 이름 색. Tailwind 가 찾게 글자 그대로 둔다. 약속: tests/project/list-card.test.ts */
const STAGE_DOT: Record<StageId, string> = {
  entry: 'bg-stage-producer',
  producer: 'bg-stage-writer',
  artist: 'bg-stage-artist',
  writer: 'bg-stage-storyboard',
  director: 'bg-stage-director',
  editor: 'bg-stage-editor',
}

/** 단계 값 → 점 색. 단계 값이 없거나 모르는 값이면 카드 이름표처럼 Producer. */
export function projectStageDot(stage: string | null | undefined): string {
  const id = STAGES.find((s) => s.id === stage)?.id ?? 'entry'
  return STAGE_DOT[id]
}

/**
 * 카드 글자 타일의 첫 글자 — 앞쪽 기호 · 공백("[1화] …" · "「역마」 …")은 건너뛰고 첫 글자(한글 · 영문 · 숫자 등 글자 · 숫자)를
 *   대문자로. 그런 글자가 없거나 이름이 없으면 U(Untitled). 약속: tests/project/card-thumb.test.ts
 */
export function projectInitial(title: string | null | undefined): string {
  const first = (title ?? '').match(/[\p{L}\p{N}]/u)?.[0]
  return first ? first.toUpperCase() : 'U'
}
