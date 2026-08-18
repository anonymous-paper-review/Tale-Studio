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
import { translate } from '@/lib/i18n'
import type { AppLocale } from '@/lib/locale'

// locale 을 안 넘기는 호출부(chat-progress-pin.tsx 등)가 조용히 안 깨지도록 기존 동작(항상
//   한국어)을 기본값으로 보존한다 — producer-gate.ts/card-mention.ts 와 동일 취급.
const UNSPECIFIED_LOCALE_FALLBACK: AppLocale = 'ko'

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
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): PipelineWork | null {
  const eligible = shots.filter((s) => !!s.actionDescription?.trim())
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
    label: translate(locale, '{agent} is drawing the rough storyboard', {
      agent: STAGE_AGENT_NAME.writer,
    }),
    done,
    total: eligible.length,
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
  /** 알림바 label 번역에 쓰는 로케일. 미지정이면 기존 동작(한국어) 유지. */
  locale?: AppLocale
}): PipelineWork | null {
  const agent = STAGE_AGENT_NAME.artist
  const locale = opts.locale ?? UNSPECIFIED_LOCALE_FALLBACK
  if (!opts.imagesReady && !opts.stalled && !opts.failed && opts.progress && opts.progress.total > 0) {
    return {
      key: 'artist-images',
      label: translate(locale, '{agent} is generating character and background images', { agent }),
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
      label: translate(locale, '{agent} is generating images', { agent }),
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
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): PipelineWork | null {
  const shots = nodes.map((n) => n.data).filter(isShotData)
  const generating = shots.filter(
    (d) =>
      d.storyboardImage?.status === 'generating' ||
      (d.writerShotId ? activeIds.has(d.writerShotId) : false),
  ).length
  if (generating === 0) return null
  const done = shots.filter((d) => d.storyboardImage?.status === 'completed').length
  const failed = shots.filter((d) => d.storyboardImage?.status === 'failed').length
  return {
    key: 'director-storyboard',
    label: translate(locale, '{agent} is generating shooting-ready images', {
      agent: STAGE_AGENT_NAME.director,
    }),
    done,
    total: shots.length,
    failed: failed || undefined,
    stage: 'director',
  }
}

/** Director 영상 테이크 — 생성 중 비디오 노드가 있을 때만. */
export function directorVideoWork(
  nodes: DirectorNode[],
  activeCount = 0,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): PipelineWork | null {
  const videos = nodes.map((n) => n.data).filter(isVideoData)
  const generating = videos.filter((d) => d.status === 'generating').length
  if (generating === 0 && activeCount === 0) return null
  const done = videos.filter((d) => d.status === 'completed').length
  const failed = videos.filter((d) => d.status === 'failed').length
  return {
    key: 'director-video',
    label: translate(locale, '{agent} is generating video', { agent: STAGE_AGENT_NAME.director }),
    done,
    // 노드가 아직 안 만들어진 채 큐만 도는 순간(재수화 직후)엔 큐 수를 총량으로 쓴다.
    total: videos.length > 0 ? videos.length : activeCount,
    failed: failed || undefined,
    stage: 'director',
  }
}

/** 잡 종류별 표시 문구 — 화면 상태 없이 큐만으로 알림바를 세울 때의 단일 source.
 *  labelKey 는 영어 원문 = i18n 키, {agent} 를 translate() 가 치환한다. */
const KIND_WORK: Record<GenerationJobKind, { labelKey: string; agent: string; stage: StageId }> = {
  character_view: {
    labelKey: '{agent} is generating character images',
    agent: STAGE_AGENT_NAME.artist,
    stage: 'artist',
  },
  world_shot: {
    labelKey: '{agent} is generating background images',
    agent: STAGE_AGENT_NAME.artist,
    stage: 'artist',
  },
  shot_rough_storyboard: {
    labelKey: '{agent} is drawing the rough storyboard',
    agent: STAGE_AGENT_NAME.writer,
    stage: 'writer',
  },
  shot_storyboard: {
    labelKey: '{agent} is generating shooting-ready images',
    agent: STAGE_AGENT_NAME.director,
    stage: 'director',
  },
  storyboard_real_grid: {
    labelKey: '{agent} is batch-generating shooting-ready images',
    agent: STAGE_AGENT_NAME.director,
    stage: 'director',
  },
  shot_video: {
    labelKey: '{agent} is generating video',
    agent: STAGE_AGENT_NAME.director,
    stage: 'director',
  },
  shot_previz_video: {
    labelKey: '{agent} is making the previz video',
    agent: STAGE_AGENT_NAME.director,
    stage: 'director',
  },
}

/**
 * 큐만 보고 세우는 알림바 — 그 작업의 전용 화면이 없는 탭(producer·editor)에서도 "다른 방에서
 * 뭐가 돌고 있는지"가 보여야 한다. 전용 핀이 있는 탭은 그쪽이 더 정확하므로 이걸 쓰지 않는다.
 */
export function queueWorks(
  countByKind: Partial<Record<GenerationJobKind, number>>,
  locale: AppLocale = UNSPECIFIED_LOCALE_FALLBACK,
): PipelineWork[] {
  const out: PipelineWork[] = []
  for (const [kind, count] of Object.entries(countByKind) as Array<
    [GenerationJobKind, number | undefined]
  >) {
    if (!count || count <= 0) continue
    const spec = KIND_WORK[kind]
    if (!spec) continue
    const label = translate(locale, spec.labelKey, { agent: spec.agent })
    out.push({ key: `queue-${kind}`, label, total: count, stage: spec.stage })
  }
  return out
}
