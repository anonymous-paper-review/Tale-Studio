// 생성 큐 하나에서 파생하는 숫자들 — 약속 D(2026-09-04): 채팅 핀·왼쪽 탭 숫자·Director 버튼 숫자는 서버 큐(generation_jobs)
//   하나만 본다. 순수 함수만 두어(클라·서버 공용, DB 없음) 테스트가 결정론적이다.
//
//   배치(lane) = 같은 종류의 잡 묶음. 도는 잡이 있을 때만 배치가 존재하고, 분모는 "이 배치에 속한 잡 전부"(도는 것 +
//   같은 창 안에서 끝난 것). 창은 지금 도는 잡 중 가장 오래된 것의 시각에서 BATCH_WINDOW_MS 만큼 앞이다 — 일괄 생성은
//   몇 초 안에 제출되므로 같은 창에 들어오고, 30분 전에 따로 만든 이미지는 들어오지 않는다.
import type { GenerationJobKind, GenerationJobStatus, GenerationJobTarget } from '@/lib/generation-jobs'
import type { StageId } from '@/types'

export type GenerationLane = 'artist' | 'writer-rough' | 'director-storyboard' | 'director-video' | 'director-previz'

export const LANE_OF_KIND: Record<GenerationJobKind, GenerationLane> = {
  character_view: 'artist',
  world_shot: 'artist',
  shot_rough_storyboard: 'writer-rough',
  shot_storyboard: 'director-storyboard',
  storyboard_real_grid: 'director-storyboard',
  shot_video: 'director-video',
  shot_previz_video: 'director-previz',
}

export const LANE_STAGE: Record<GenerationLane, StageId> = {
  artist: 'artist',
  'writer-rough': 'writer',
  'director-storyboard': 'director',
  'director-video': 'director',
  'director-previz': 'director',
}

/** 일괄 제출은 몇 초 안에 끝나므로 2분이면 한 배치를 넉넉히 덮고, 한참 전의 단건 생성은 섞이지 않는다. */
export const BATCH_WINDOW_MS = 2 * 60 * 1000
/** 유령 queued(웹훅 유실)는 큐에서 빼는 것과 같은 기준(generation-jobs.STALE_QUEUED_MS). */
export const BATCH_STALE_QUEUED_MS = 10 * 60 * 1000

export interface GenerationBatchRow {
  id: string
  kind: GenerationJobKind
  status: GenerationJobStatus
  target: GenerationJobTarget | null
  /** ISO */
  created_at: string
  /** ISO — 완료·실패 시각의 근사(finalize 가 갱신). */
  updated_at?: string | null
}

export interface GenerationBatch {
  lane: GenerationLane
  stage: StageId
  /** 지금 도는 단위 수 */
  active: number
  /** 이 배치의 전체 단위 수(도는 것 + 창 안에서 끝난 것) */
  total: number
  done: number
  failed: number
}

/** 잡 하나가 대변하는 단위 수 — 그리드 잡(실사 4샷 시트, 러프 그리드)은 샷 수만큼. */
export function unitsOf(row: Pick<GenerationBatchRow, 'kind' | 'target'>): number {
  const ids = row.target?.writerShotIds
  if ((row.kind === 'storyboard_real_grid' || row.kind === 'shot_rough_storyboard') && Array.isArray(ids) && ids.length > 0) {
    return ids.length
  }
  return 1
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? 0 : t
}

/**
 * 순수: 잡 행들(최근 것) → 레인별 배치. 도는 잡이 없는 레인은 배치가 없다(핀이 사라지는 근거, 약속 D4·D5).
 *   유령 queued(제출 뒤 BATCH_STALE_QUEUED_MS 초과)는 도는 것으로 세지 않는다.
 */
export function summarizeGenerationBatches(rows: readonly GenerationBatchRow[], nowMs: number = Date.now()): GenerationBatch[] {
  const byLane = new Map<GenerationLane, GenerationBatchRow[]>()
  for (const row of rows) {
    const lane = LANE_OF_KIND[row.kind]
    if (!lane) continue
    ;(byLane.get(lane) ?? byLane.set(lane, []).get(lane)!).push(row)
  }
  const out: GenerationBatch[] = []
  for (const [lane, laneRows] of byLane) {
    const activeRows = laneRows.filter((r) => r.status === 'queued' && nowMs - ms(r.created_at) <= BATCH_STALE_QUEUED_MS)
    if (activeRows.length === 0) continue
    const oldestActive = Math.min(...activeRows.map((r) => ms(r.created_at)))
    const windowStart = oldestActive - BATCH_WINDOW_MS
    const inWindow = laneRows.filter((r) => ms(r.created_at) >= windowStart)
    let active = 0
    let done = 0
    let failed = 0
    for (const r of inWindow) {
      const u = unitsOf(r)
      if (r.status === 'completed') done += u
      else if (r.status === 'failed') failed += u
      else if (nowMs - ms(r.created_at) <= BATCH_STALE_QUEUED_MS) active += u
    }
    out.push({ lane, stage: LANE_STAGE[lane], active, total: active + done + failed, done, failed })
  }
  return out.sort((a, b) => a.lane.localeCompare(b.lane))
}

export interface GenerationCompletion {
  stage: StageId
  lane: GenerationLane
  /** 완료 시각 epoch ms */
  at: number
  units: number
}

/** 순수: 완료(성공) 잡 행 → 완료 기록(스테이지 배지의 근거). */
export function completionsOf(rows: readonly GenerationBatchRow[]): GenerationCompletion[] {
  const out: GenerationCompletion[] = []
  for (const row of rows) {
    if (row.status !== 'completed') continue
    const lane = LANE_OF_KIND[row.kind]
    if (!lane) continue
    out.push({ stage: LANE_STAGE[lane], lane, at: ms(row.updated_at ?? row.created_at), units: unitsOf(row) })
  }
  return out.sort((a, b) => a.at - b.at)
}

/**
 * 순수(약속 D3·D14): 스테이지 배지 = 그 스테이지를 마지막으로 본 뒤 완료된 단위 수. 지금 보고 있는 스테이지는 0.
 *   lastSeen 이 없는 스테이지는 0 — 처음 온 사용자에게 옛 완료를 다 쌓아 보이지 않는다.
 */
export function deriveStageBadges(
  completions: readonly GenerationCompletion[],
  lastSeen: Partial<Record<StageId, number>>,
  currentStage: StageId | null,
): Partial<Record<StageId, number>> {
  const out: Partial<Record<StageId, number>> = {}
  for (const c of completions) {
    if (c.stage === currentStage) continue
    const seen = lastSeen[c.stage]
    if (seen == null || c.at <= seen) continue
    out[c.stage] = (out[c.stage] ?? 0) + c.units
  }
  return out
}

/**
 * 실사(Director storyboard) 레인에 아직 제출되지 않은 일괄 잔여를 더한다 — 러너는 60초 상한 때문에 몇 장씩 나눠 제출하므로
 *   큐만 세면 "전체 작업량"이 아니다(2026-08-25 오너 피드백). 잔여가 없거나 그 레인이 안 돌면 그대로다.
 */
export function withStoryboardBacklog(batches: readonly GenerationBatch[], backlog: number): GenerationBatch[] {
  if (backlog <= 0) return [...batches]
  const lane = batches.find((b) => b.lane === 'director-storyboard')
  if (!lane) return [...batches]
  return batches.map((b) => (b.lane === 'director-storyboard' ? { ...b, active: b.active + backlog, total: b.total + backlog } : b))
}
