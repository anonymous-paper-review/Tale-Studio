// 채팅 상단 진행 알림바의 파생 셀렉터 (#chat-progress-pin #feedback 2026-08-07).
//
// "파이프라인 진척도"라는 단일 진실은 없다 — 스테이지마다 다른 곳에 산다:
//   writer 텍스트 = writer_runs 폴링(useWriterStatus) / writer 러프보드 = shots[].roughStoryboard /
//   artist = /api/writer/status?assets=1 서버 집계(project-store) + artist-store in-flight /
//   director = 캔버스 노드 status / editor = rendering 플래그.
// 여기는 completeness.ts 선례를 따라 순수함수만 둔다 — store/네트워크 의존 없음, 호출자가
//   진실을 주입한다(pull). 새 상태를 만들지 않는다(architecture §0).
//
// #queue-restore 2026-08-11: 화면 상태만 보면 탭을 떠났다 오는 순간 "생성 중"이 사라진다
//   (러프보드 panelJobs 는 컴포넌트 로컬, director storyboardImage 는 DB 재수화로 덮인다).
//   그래서 모든 셀렉터가 generation_jobs 의 queued 집합(activeIds)을 함께 받아, 화면 상태가
//   비어 있어도 큐가 돌고 있으면 진행 중으로 판정한다. 큐가 이 판정의 바닥이다.
//
// 문구 형식(#feedback 2026-08-11): "누가 무엇을 하고 있는지"가 한 문장에 들어간다 —
//   stage-labels.ts 의 writer 파이프라인 문구와 같은 어투로 통일("Director가 …하고 있습니다").

import { STAGE_AGENT_NAME } from '@/lib/constants'
import type { GenerationJobKind } from '@/lib/generation-jobs'
import type { DirectorNode } from '@/types/director'
import { isShotData, isVideoData } from '@/types/director'
import type { StageId } from '@/types'

/** 알림바 한 줄 — done/total 이 있으면 분수 + 진행 바, 없으면 스피너 + 문구만. */
export interface PipelineWork {
  key: string
  label: string
  done?: number
  total?: number
  failed?: number
  /** 알림바 색이 따를 에이전트. 생략하면 지금 보고 있는 스테이지 색. */
  stage?: StageId
}

const EMPTY_IDS: ReadonlySet<string> = new Set<string>()

type ProgressBatchKey = 'writer-rough' | 'director-storyboard' | 'director-video'

interface ProgressBatch {
  members: Set<string>
  active: Set<string>
  placeholders: Set<string>
}

// 완료된 산출물에는 다음 재생성 묶음의 숫자를 붙이지 않는다. 이 값은 화면 파생값만을
// 위한 임시 기억이며, 저장소/DB에는 쓰지 않는다. 현재 묶음의 작업이 모두 끝나면 버린다.
const progressBatches = new Map<ProgressBatchKey, ProgressBatch>()

/**
 * 옵티미스틱 상태를 쓰기 직전에 호출해, 상태 전이가 화면에 도착하기 전에도 묶음 경계를
 * 명시한다. 이미 같은 종류의 작업이 돌고 있으면 기존 묶음에 항목을 추가한다.
 */
export function beginPipelineProgressBatch(
  key: ProgressBatchKey,
  itemId: string,
  hasActiveWork: boolean,
): void {
  if (!itemId) return
  const previous = progressBatches.get(key)
  if (!previous || !hasActiveWork || previous.active.size === 0) {
    progressBatches.set(key, {
      members: new Set([itemId]),
      active: new Set([itemId]),
      placeholders: new Set(),
    })
    return
  }
  previous.members.add(itemId)
  previous.active.add(itemId)
}

/** 프로젝트를 바꿀 때 화면 파생 묶음도 함께 버린다. */
export function resetPipelineProgressBatches(): void {
  progressBatches.clear()
}

function currentBatch(
  key: ProgressBatchKey,
  activeIds: ReadonlySet<string>,
  activeCount = 0,
): ProgressBatch | null {
  const queueOnlyCount = Math.max(0, activeCount - activeIds.size)
  if (activeIds.size === 0 && queueOnlyCount === 0) {
    progressBatches.delete(key)
    return null
  }
  const previous = progressBatches.get(key)
  if (!previous || previous.active.size === 0) {
    const placeholders = new Set(
      Array.from({ length: queueOnlyCount }, (_, i) => `queue-${i}`),
    )
    const next = {
      members: new Set([...activeIds, ...placeholders]),
      active: new Set([...activeIds, ...placeholders]),
      placeholders,
    }
    progressBatches.set(key, next)
    return next
  }
  // 큐만 보이던 작업이 재수화되어 실제 노드로 나타나면 임시 자리표시자를 치환한다.
  // 자리표시자를 묶음에 계속 남기면 실제 작업 하나가 2건으로 부풀려진다.
  const replacements = Math.min(previous.placeholders.size, activeIds.size)
  if (replacements > 0) {
    const oldPlaceholders = [...previous.placeholders].slice(0, replacements)
    for (const id of oldPlaceholders) {
      previous.placeholders.delete(id)
      previous.members.delete(id)
    }
  }
  for (const id of activeIds) previous.members.add(id)
  const placeholders = new Set(
    Array.from({ length: queueOnlyCount }, (_, i) => `queue-${activeIds.size + i}`),
  )
  for (const id of placeholders) previous.members.add(id)
  previous.placeholders = placeholders
  previous.active = new Set([...activeIds, ...placeholders])
  return previous
}

interface RoughShotLike {
  shotId?: string
  actionDescription?: string | null
  roughStoryboard?: { status: string } | null
}

/**
 * Writer 러프 스토리보드 — 생성 중 패널이 있을 때만. 대상은 액션이 있는 샷(생성 자격).
 * activeIds: 지금 queued 인 shot_rough_storyboard 잡이 겨냥한 샷들 (탭 왕복 후 복원 근거).
 */
export function writerRoughWork(
  shots: RoughShotLike[],
  activeIds: ReadonlySet<string> = EMPTY_IDS,
): PipelineWork | null {
  const eligible = shots.filter((s) => !!s.actionDescription?.trim())
  const hasStableIds = eligible.every((s) => typeof s.shotId === 'string' && s.shotId.length > 0)
  if (!hasStableIds) {
    const generating = eligible.filter(
      (s) =>
        s.roughStoryboard?.status === 'generating' ||
        (s.shotId ? activeIds.has(s.shotId) : false),
    ).length
    if (generating === 0) return null
    const done = eligible.filter((s) => s.roughStoryboard?.status === 'completed').length
    const failed = eligible.filter((s) => s.roughStoryboard?.status === 'failed').length
    return {
      key: 'writer-rough',
      label: `${STAGE_AGENT_NAME.writer}가 러프 스토리보드를 그리고 있습니다`,
      done,
      total: eligible.length,
      failed: failed || undefined,
      stage: 'writer',
    }
  }
  const active = new Set(
    eligible
      .filter(
        (s) =>
          s.roughStoryboard?.status === 'generating' ||
          (s.shotId ? activeIds.has(s.shotId) : false),
      )
      .map((s) => s.shotId!),
  )
  const batch = currentBatch('writer-rough', active)
  if (!batch) return null
  const done = eligible.filter(
    (s) =>
      s.shotId &&
      batch.members.has(s.shotId) &&
      s.roughStoryboard?.status === 'completed' &&
      !activeIds.has(s.shotId),
  ).length
  const failed = eligible.filter(
    (s) =>
      s.shotId &&
      batch.members.has(s.shotId) &&
      s.roughStoryboard?.status === 'failed' &&
      !activeIds.has(s.shotId),
  ).length
  return {
    key: 'writer-rough',
    label: `${STAGE_AGENT_NAME.writer}가 러프 스토리보드를 그리고 있습니다`,
    done,
    total: batch.members.size,
    failed: failed || undefined,
    stage: 'writer',
  }
}

/**
 * Artist 이미지 생성 — 초기 잠금 구간은 서버 집계(ready/total)로, 그 이후 수동 재생성은
 * artist-store in-flight 개수로. stalled/failed 로 큐가 멈췄으면 "진행 중"이 아니므로 숨긴다
 * (실패 표면화는 기존 배지/제안 몫 — 알림바는 도는 것만 보여준다).
 * activeCount: queued 인 character_view/world_shot 잡 수 — 새로고침으로 store in-flight 가
 *   비어도 큐가 돌고 있으면 진행 중이다.
 */
export function artistImageWork(opts: {
  imagesReady: boolean
  stalled: boolean
  failed: boolean
  progress: { ready: number; total: number } | null
  generatingCount: number
  activeCount?: number
}): PipelineWork | null {
  const agent = STAGE_AGENT_NAME.artist
  if (!opts.imagesReady && !opts.stalled && !opts.failed && opts.progress && opts.progress.total > 0) {
    return {
      key: 'artist-images',
      label: `${agent}가 캐릭터·배경 이미지를 생성하고 있습니다`,
      done: opts.progress.ready,
      total: opts.progress.total,
      stage: 'artist',
    }
  }
  const inFlight = Math.max(opts.generatingCount, opts.activeCount ?? 0)
  if (inFlight > 0) {
    // 문구 형식 통일(#feedback 2026-08-12) — 다른 에이전트 줄과 같은 "…하고 있습니다 n/N" 꼴.
    //   이 배치의 완료 수는 추적하지 않으므로 done=0/total=남은 건수 (남은 작업 분모).
    return {
      key: 'artist-regen',
      label: `${agent}가 이미지를 생성하고 있습니다`,
      done: 0,
      total: inFlight,
      stage: 'artist',
    }
  }
  return null
}

/** Director 촬영용(실사) 스토리보드 이미지 — 생성 중 샷이 있을 때만. */
export function directorShotImageWork(
  nodes: DirectorNode[],
  activeIds: ReadonlySet<string> = EMPTY_IDS,
): PipelineWork | null {
  const shots = nodes
    .map((node) => ({ id: node.id, data: node.data }))
    .filter((entry): entry is { id: string; data: Extract<DirectorNode['data'], { kind: 'shot' }> } =>
      isShotData(entry.data),
    )
  const hasStableIds = shots.every((entry) => !!entry.data.writerShotId || !!entry.id)
  if (!hasStableIds) {
    const generating = shots.filter(
      (entry) =>
        entry.data.storyboardImage?.status === 'generating' ||
        (entry.data.writerShotId ? activeIds.has(entry.data.writerShotId) : false),
    ).length
    if (generating === 0) return null
    const done = shots.filter((entry) => entry.data.storyboardImage?.status === 'completed').length
    const failed = shots.filter((entry) => entry.data.storyboardImage?.status === 'failed').length
    return {
      key: 'director-storyboard',
      label: `${STAGE_AGENT_NAME.director}가 촬영용 이미지를 생성하고 있습니다`,
      done,
      total: shots.length,
      failed: failed || undefined,
      stage: 'director',
    }
  }
  const itemId = (entry: (typeof shots)[number]) => entry.data.writerShotId ?? entry.id
  const active = new Set(
    shots
      .filter(
        (entry) =>
          entry.data.storyboardImage?.status === 'generating' ||
          (entry.data.writerShotId ? activeIds.has(entry.data.writerShotId) : false),
      )
      .map(itemId),
  )
  const batch = currentBatch('director-storyboard', active)
  if (!batch) return null
  const done = shots.filter(
    (entry) =>
      batch.members.has(itemId(entry)) &&
      entry.data.storyboardImage?.status === 'completed' &&
      !activeIds.has(itemId(entry)),
  ).length
  const failed = shots.filter(
    (entry) =>
      batch.members.has(itemId(entry)) &&
      entry.data.storyboardImage?.status === 'failed' &&
      !activeIds.has(itemId(entry)),
  ).length
  return {
    key: 'director-storyboard',
    label: `${STAGE_AGENT_NAME.director}가 촬영용 이미지를 생성하고 있습니다`,
    done,
    total: batch.members.size,
    failed: failed || undefined,
    stage: 'director',
  }
}

/** Director 영상 테이크 — 생성 중 비디오 노드가 있을 때만. */
export function directorVideoWork(
  nodes: DirectorNode[],
  activeCount = 0,
): PipelineWork | null {
  const videos = nodes
    .map((node) => ({ id: node.id, data: node.data }))
    .filter((entry): entry is { id: string; data: Extract<DirectorNode['data'], { kind: 'video' }> } =>
      isVideoData(entry.data),
    )
  // 재생성 때 기존 성공 결과를 보존하는 영상도 lastAttemptStatus 로 낙관 상태를 표시한다.
  const active = new Set(
    videos
      .filter(
        (entry) =>
          entry.data.status === 'generating' ||
          entry.data.lastAttemptStatus === 'generating',
      )
      .map((entry) => entry.id),
  )
  const hasStableIds = videos.every((entry) => !!entry.id)
  // 노드가 아직 재수화되지 않은 큐 작업은 기존처럼 큐 개수로 표시한다. 노드가 있으면
  // 현재 묶음만 추적해 프로젝트 전체의 완료 take를 분모에 넣지 않는다.
  if (!hasStableIds || videos.length === 0) {
    const generating = videos.filter(
      (entry) => entry.data.status === 'generating' || entry.data.lastAttemptStatus === 'generating',
    ).length
    if (generating === 0 && activeCount === 0) return null
    const done = videos.filter((entry) => entry.data.status === 'completed').length
    const failed = videos.filter((entry) => entry.data.status === 'failed').length
    return {
      key: 'director-video',
      label: `${STAGE_AGENT_NAME.director}가 영상을 생성하고 있습니다`,
      done,
      total: videos.length > 0 ? videos.length : activeCount,
      failed: failed || undefined,
      stage: 'director',
    }
  }
  const batch = currentBatch('director-video', active, activeCount)
  if (!batch) return null
  const done = videos.filter(
    (entry) =>
      batch.members.has(entry.id) &&
      !batch.active.has(entry.id) &&
      entry.data.status === 'completed',
  ).length
  const failed = videos.filter(
    (entry) =>
      batch.members.has(entry.id) &&
      !batch.active.has(entry.id) &&
      entry.data.status === 'failed',
  ).length
  return {
    key: 'director-video',
    label: `${STAGE_AGENT_NAME.director}가 영상을 생성하고 있습니다`,
    done,
    total: batch.members.size,
    failed: failed || undefined,
    stage: 'director',
  }
}

/** 잡 종류별 표시 문구 — 화면 상태 없이 큐만으로 알림바를 세울 때의 단일 source. */
const KIND_WORK: Record<GenerationJobKind, { label: string; stage: StageId }> = {
  character_view: {
    label: `${STAGE_AGENT_NAME.artist}가 캐릭터 이미지를 생성하고 있습니다`,
    stage: 'artist',
  },
  world_shot: {
    label: `${STAGE_AGENT_NAME.artist}가 배경 이미지를 생성하고 있습니다`,
    stage: 'artist',
  },
  shot_rough_storyboard: {
    label: `${STAGE_AGENT_NAME.writer}가 러프 스토리보드를 그리고 있습니다`,
    stage: 'writer',
  },
  shot_storyboard: {
    label: `${STAGE_AGENT_NAME.director}가 촬영용 이미지를 생성하고 있습니다`,
    stage: 'director',
  },
  storyboard_real_grid: {
    label: `${STAGE_AGENT_NAME.director}가 촬영용 이미지를 일괄 생성하고 있습니다`,
    stage: 'director',
  },
  shot_video: {
    label: `${STAGE_AGENT_NAME.director}가 영상을 생성하고 있습니다`,
    stage: 'director',
  },
  shot_previz_video: {
    label: `${STAGE_AGENT_NAME.director}가 프리비즈 영상을 만들고 있습니다`,
    stage: 'director',
  },
}

/**
 * 큐만 보고 세우는 알림바 — 그 작업의 전용 화면이 없는 탭(producer·editor)에서도 "다른 방에서
 * 뭐가 돌고 있는지"가 보여야 한다. 전용 핀이 있는 탭은 그쪽이 더 정확하므로 이걸 쓰지 않는다.
 */
export function queueWorks(
  countByKind: Partial<Record<GenerationJobKind, number>>,
): PipelineWork[] {
  const out: PipelineWork[] = []
  for (const [kind, count] of Object.entries(countByKind) as Array<
    [GenerationJobKind, number | undefined]
  >) {
    if (!count || count <= 0) continue
    const spec = KIND_WORK[kind]
    if (!spec) continue
    out.push({ key: `queue-${kind}`, label: spec.label, total: count, stage: spec.stage })
  }
  return out
}
