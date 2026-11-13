// Director 샷 상태(시안 R 416:4941 "상태 색 · 버튼 · 클릭 규칙", 오너 2026-11-14) — 카드 · 노드 테두리, 꼬리 글, 상태 고르기,
//   위쪽 단추 숫자가 모두 이 판정 하나를 쓴다. 순수 함수만 둔다(화면 · 상점 의존 없음).
//   약속: tests/director/shot-state.test.ts
import { selectLatestAttempt } from '@/lib/director-video-take-selection'
import { isShotData, isVideoData, type DirectorNode } from '@/types/director'

export type DirectorShotState =
  | 'image_needed'
  | 'image_generating'
  | 'image_done'
  | 'image_failed'
  | 'video_generating'
  | 'video_done'
  | 'video_failed'

/** 상태를 정하는 근거. 화면이 노드 기록 · 작업 큐에서 모은다(shotFactsByNode). */
export interface ShotStateFacts {
  imageGenerating: boolean
  /** 보일 그림이 있다 — 다시 만들기가 실패해도 옛 그림 주소가 남아 있으면 있다(리드 검토 c ①). */
  imageDone: boolean
  /** 그림이 없는데 이미지 만들기가 실패했다. */
  imageFailed: boolean
  /** 옛 그림이 남아 있는데 마지막 다시 만들기가 실패했다 — 상태는 그대로, 꼬리만 "다시 만들기 실패". */
  imageRemakeFailed: boolean
  /** 일괄이 맡았지만 아직 큐에 앉지 않았다 — 만드는 중으로 세고 꼬리는 "대기 중". */
  imageWaiting: boolean
  videoGenerating: boolean
  /** 영상 묶음이 맡았지만 아직 내지 않았다 — 만드는 중으로 세고 꼬리는 "순서 기다리는 중". */
  videoWaiting: boolean
  videoDone: boolean
  /** 마지막 영상 시도가 실패했다(완성 Take 가 따로 있으면 영상 완성이 이긴다). */
  videoLatestFailed: boolean
}

/** 여러 상태에 걸치면 지금 하는 일이 먼저: 영상 만드는 중 > 이미지 만드는 중 > 영상 완성 > 영상 실패 > 이미지 실패 > 이미지 완료 > 이미지 필요. */
export function shotState(facts: ShotStateFacts): DirectorShotState {
  if (facts.videoGenerating) return 'video_generating'
  if (facts.imageGenerating) return 'image_generating'
  if (facts.videoDone) return 'video_done'
  if (facts.videoLatestFailed) return 'video_failed'
  if (facts.imageFailed) return 'image_failed'
  if (facts.imageDone) return 'image_done'
  return 'image_needed'
}

export interface ShotStateContext {
  /** 큐에 떠 있는 이미지 작업의 Writer 샷 id(탭을 떠났다 와도 진행을 되살린다). */
  queuedImageShots: ReadonlySet<string>
  /** 큐에 떠 있는 영상 작업의 Writer 샷 id. */
  queuedVideoShots: ReadonlySet<string>
  /** 일괄 러너가 맡았지만 아직 큐에 앉지 않은 샷(노드 id). */
  pendingImageNodeIds?: ReadonlySet<string>
  /** 영상 묶음이 맡았지만 아직 내지 않은 샷의 Writer 샷 id(서버 조회의 낼 순서). */
  pendingVideoShots?: ReadonlySet<string>
}

function hasUrl(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/** 화면에서 멈춘 Take 규칙 한 곳(오너 2026-11-14 7번, 리드 검토 a 5) — 샷 상태 · 스토리보드 카드 · 노드형 Take · 넘김 조건이 같이 쓴다.
 *  멈춘 Take 는 뒤에서 돌아도 만드는 중이 아니다. */
export function takeIsRunning(take: { status?: unknown; lastAttemptStatus?: unknown; cancelledAt?: unknown }): boolean {
  return take.cancelledAt == null && (take.status === 'generating' || take.lastAttemptStatus === 'generating')
}

/** 멈춘 Take 는 ★ 로 고르지 않은 한 뒤늦게 끝나도 영상이 아니다(기록에만 남는다). */
export function takeCountsAsVideo(take: { status?: unknown; videoUrl?: unknown; cancelledAt?: unknown; final?: unknown }): boolean {
  return take.status === 'completed' && hasUrl(take.videoUrl) && (take.cancelledAt == null || take.final === true)
}

/** 화면에서 멈췄고 ★ 로 고르지 않은 Take — 노드 꼬리 "멈췄어요"(상태 색 없음). */
function takeStopped(take: { cancelledAt?: unknown; final?: unknown }): boolean {
  return take.cancelledAt != null && take.final !== true
}

/** 옛 그림이 남아 있는데 마지막 다시 만들기가 실패했다(상점은 실패해도 옛 주소를 그대로 둔다). */
export function imageRemakeFailed(image: { status?: string | null; url?: string | null } | null | undefined): boolean {
  return image?.status === 'failed' && hasUrl(image.url)
}

export interface RealBatchContext {
  busy: boolean
  /** [모두 멈추기]를 눌렀다 — 남은 샷은 그리지 않는다. */
  cancelled: boolean
  /** 일괄이 맡은 Writer 샷 id. null 이면 그림 없는 샷 전부. */
  shotIds: readonly string[] | null
  /** 러프가 다 된 Writer 샷 id — 일괄은 러프가 있는 샷만 그린다. */
  roughShotIds: ReadonlySet<string>
}

/** 실사 일괄이 맡은 샷(노드 id) — 그림 없음 · 실패 아님 · 러프 있음 · 일괄 대상(카드의 autoFillPending 과 같은 조건). */
export function realBatchPendingNodeIds(nodes: readonly DirectorNode[], batch: RealBatchContext): Set<string> {
  const out = new Set<string>()
  if (!batch.busy || batch.cancelled) return out
  for (const node of nodes) {
    if (!isShotData(node.data)) continue
    const writerShotId = node.data.writerShotId
    const image = node.data.storyboardImage
    if (!writerShotId || hasUrl(image?.url) || image?.status === 'failed') continue
    if (!batch.roughShotIds.has(writerShotId)) continue
    if (batch.shotIds !== null && !batch.shotIds.includes(writerShotId)) continue
    out.add(node.id)
  }
  return out
}

/** 캔버스 노드에서 샷마다 상태 근거를 모은다(키 = 샷 노드 id). 영상은 그 샷을 부모로 둔 Take 들이다. */
export function shotFactsByNode(
  nodes: readonly DirectorNode[],
  context: ShotStateContext,
): Map<string, ShotStateFacts> {
  const takesByShot = new Map<string, DirectorNode[]>()
  for (const node of nodes) {
    if (!isVideoData(node.data) || node.data.parentShotNodeId === null) continue
    const list = takesByShot.get(node.data.parentShotNodeId) ?? []
    list.push(node)
    takesByShot.set(node.data.parentShotNodeId, list)
  }

  const out = new Map<string, ShotStateFacts>()
  for (const node of nodes) {
    if (!isShotData(node.data)) continue
    const writerShotId = node.data.writerShotId
    const image = node.data.storyboardImage
    const takes = takesByShot.get(node.id) ?? []
    const records = takes.flatMap((take) =>
      isVideoData(take.data)
        ? [{
            id: take.id,
            take_number: take.data.takeNumber,
            created_at: take.data.createdAt ?? null,
            status: take.data.status,
            url: take.data.videoUrl,
            last_attempt_status: take.data.lastAttemptStatus,
            last_attempt_at: take.data.lastAttemptAt,
            is_final: take.data.final,
            cancelled_at: take.data.cancelledAt ?? null,
          }]
        : [],
    )
    const latest = selectLatestAttempt(records)
    const imageQueued = !!writerShotId && context.queuedImageShots.has(writerShotId)
    const imagePending = !!context.pendingImageNodeIds?.has(node.id)
    // 화면에서 멈춘 Take(오너 2026-11-14 7번)는 뒤에서 돌아도 만드는 중이 아니고, ★ 가 아니면 뒤늦게 끝나도 영상 완성이 아니다
    //   — 투영 · 넘기기 창 · 일괄 검사와 같은 규칙(리드 검토 a 5).
    const videoRunning =
      records.some((r) => takeIsRunning({ status: r.status, lastAttemptStatus: r.last_attempt_status, cancelledAt: r.cancelled_at })) ||
      (!!writerShotId && context.queuedVideoShots.has(writerShotId))
    const videoPending = !!writerShotId && !!context.pendingVideoShots?.has(writerShotId)
    out.set(node.id, {
      imageGenerating: image?.status === 'generating' || imageQueued || imagePending,
      imageDone: (image?.status === 'completed' || image?.status === 'failed') && hasUrl(image.url),
      imageFailed: image?.status === 'failed' && !hasUrl(image.url),
      imageRemakeFailed: imageRemakeFailed(image),
      imageWaiting: imagePending && !imageQueued && image?.status !== 'generating',
      videoGenerating: videoRunning || videoPending,
      videoWaiting: videoPending && !videoRunning,
      videoDone: records.some((r) => takeCountsAsVideo({ status: r.status, videoUrl: r.url, cancelledAt: r.cancelled_at, final: r.is_final })),
      videoLatestFailed:
        !!latest && (latest.last_attempt_status === 'failed' || (latest.last_attempt_status == null && latest.status === 'failed')),
    })
  }
  return out
}

/** 상태 고르기 줄(시안 D1 406:3717) — 전체 + 여섯. 이미지 실패는 "이미지 필요" 줄에서 찾는다. */
export type ShotStatusFilter =
  | 'all'
  | 'image_needed'
  | 'image_generating'
  | 'image_done'
  | 'video_generating'
  | 'video_done'
  | 'video_failed'

export const SHOT_STATUS_FILTERS: readonly ShotStatusFilter[] = [
  'all',
  'image_needed',
  'image_generating',
  'image_done',
  'video_generating',
  'video_done',
  'video_failed',
]

export function statusFilterOf(state: DirectorShotState): Exclude<ShotStatusFilter, 'all'> {
  return state === 'image_failed' ? 'image_needed' : state
}

export function matchesStatusFilter(state: DirectorShotState, filter: ShotStatusFilter): boolean {
  return filter === 'all' || statusFilterOf(state) === filter
}

/** 스토리보드형: 고른 상태 샷만 남긴다(상태를 모르는 샷은 전체에서만 보인다). */
export function filterShotsByStatus<T extends { id: string }>(
  shots: readonly T[],
  states: ReadonlyMap<string, DirectorShotState>,
  filter: ShotStatusFilter,
): T[] {
  if (filter === 'all') return [...shots]
  return shots.filter((shot) => {
    const state = states.get(shot.id)
    return state !== undefined && matchesStatusFilter(state, filter)
  })
}

/** 노드형: 다른 상태의 샷 · 영상 노드는 숨기지 않고 흐리게(선 · 자리 · 자동 정렬이 흔들리지 않게). */
export function dimmedByStatusFilter(state: DirectorShotState | undefined, filter: ShotStatusFilter): boolean {
  if (filter === 'all' || state === undefined) return false
  return !matchesStatusFilter(state, filter)
}

export function countStatusFilters(states: Iterable<DirectorShotState>): Record<ShotStatusFilter, number> {
  const counts = Object.fromEntries(SHOT_STATUS_FILTERS.map((key) => [key, 0])) as Record<ShotStatusFilter, number>
  for (const state of states) {
    counts.all += 1
    counts[statusFilterOf(state)] += 1
  }
  return counts
}

/** 상태 고르기 줄 · 꼬리 글(영어 키 — 화면에서 t() 로 옮긴다). */
export const SHOT_STATUS_FILTER_LABEL: Record<ShotStatusFilter, string> = {
  all: 'All',
  image_needed: 'Image needed',
  image_generating: 'Making image',
  image_done: 'Image ready',
  video_generating: 'Making video',
  video_done: 'Video done',
  video_failed: 'Video failed',
}

/** 카드 · 노드 꼬리 글 — 이미지 필요 샷은 시안 D1 처럼 "대기". */
export const SHOT_STATE_TAIL_LABEL: Record<DirectorShotState, string> = {
  image_needed: 'Not started',
  image_generating: 'Making image',
  image_done: 'Image ready',
  image_failed: 'Image failed',
  video_generating: 'Making video',
  video_done: 'Video done',
  video_failed: 'Video failed',
}

export type ShotTailPlace = 'card' | 'node'

/** 꼬리 한 줄 — 점(색 · 고리)과 글(영어 키, 화면에서 t() 로 옮긴다). */
export interface ShotTail {
  label: string
  color: ShotStateColor | null
  ring: boolean
  /** 다시 만들기 실패 — 꼬리 옆에 [다시 만들기]를 단다. */
  remakeFailed: boolean
}

/** 카드 · 노드 꼬리(시안 D1 · D3 · R). 상태 글에 더해: 다시 만들기가 실패한 샷은 "다시 만들기 실패"(만드는 중이 아닐 때),
 *  일괄이 맡아 기다리는 샷은 "대기 중", 노드형 이미지 필요 샷은 "이미지 필요"(카드는 주황 태그가 따로 말해 "대기"). */
export function shotTail(
  state: DirectorShotState,
  facts: Pick<ShotStateFacts, 'imageRemakeFailed' | 'imageWaiting'> & Partial<Pick<ShotStateFacts, 'videoWaiting'>>,
  place: ShotTailPlace,
): ShotTail {
  const making = state === 'image_generating' || state === 'video_generating'
  if (facts.imageRemakeFailed && !making) return { label: 'Remake failed', color: 'destructive', ring: false, remakeFailed: true }
  const tone = shotStateTone(state)
  if (state === 'image_generating' && facts.imageWaiting) return { label: 'Waiting', color: tone.dot, ring: true, remakeFailed: false }
  if (state === 'video_generating' && facts.videoWaiting) return { label: 'Waiting in line', color: tone.dot, ring: true, remakeFailed: false }
  if (state === 'image_needed') return { label: place === 'node' ? 'Image needed' : SHOT_STATE_TAIL_LABEL.image_needed, color: null, ring: false, remakeFailed: false }
  return { label: SHOT_STATE_TAIL_LABEL[state], color: tone.dot, ring: tone.ring, remakeFailed: false }
}

/** 상태 색 이름(Tailwind 색 이름) — 파랑은 시안 값과 같은 Director 단계 색, 주황은 Producer 단계 색 값을 빌린다.
 *  새 토큰은 영상 보라(--state-video) 하나(오너 2026-11-14, design.md "Director 생성 상태"). */
export type ShotStateColor = 'stage-producer' | 'stage-director' | 'state-video' | 'success' | 'destructive'

export interface ShotStateTone {
  /** 카드 · 노드 테두리 색 클래스. 이미지 필요는 테두리 색 없음. */
  frame: string | null
  /** 점 · 진행 막대 색 이름. */
  dot: ShotStateColor
  /** 만드는 중 = 테두리만 있는 고리, 끝남 = 꽉 찬 점. */
  ring: boolean
}

const TONES: Record<DirectorShotState, ShotStateTone> = {
  image_needed: { frame: null, dot: 'stage-producer', ring: false },
  image_generating: { frame: 'border-stage-director', dot: 'stage-director', ring: true },
  image_done: { frame: 'border-stage-director', dot: 'stage-director', ring: false },
  image_failed: { frame: 'border-destructive', dot: 'destructive', ring: false },
  video_generating: { frame: 'border-state-video', dot: 'state-video', ring: true },
  video_done: { frame: 'border-success', dot: 'success', ring: false },
  video_failed: { frame: 'border-destructive', dot: 'destructive', ring: false },
}

export function shotStateTone(state: DirectorShotState): ShotStateTone {
  return TONES[state]
}

/** 점 색 이름 → 꽉 찬 점 · 고리 클래스(Tailwind 가 읽도록 글자 그대로 둔다). */
export const SHOT_DOT_FILL: Record<ShotStateColor, string> = {
  'stage-producer': 'bg-stage-producer',
  'stage-director': 'bg-stage-director',
  'state-video': 'bg-state-video',
  success: 'bg-success',
  destructive: 'bg-destructive',
}
export const SHOT_DOT_RING: Record<ShotStateColor, string> = {
  'stage-producer': 'border-stage-producer',
  'stage-director': 'border-stage-director',
  'state-video': 'border-state-video',
  success: 'border-success',
  destructive: 'border-destructive',
}

/** 노드형 영상 노드(Take 하나)의 테두리 — 만드는 중 보라 · 완성 초록 · 실패 빨강(시안 D4 · D7). 화면에서 멈춘 Take 는 색 없음. */
export function videoTakeFrame(take: {
  status: string | null | undefined
  lastAttemptStatus: string | null | undefined
  videoUrl: string | null | undefined
  cancelledAt?: string | null
  final?: boolean
}): string | null {
  if (takeIsRunning(take)) return 'border-state-video'
  if (takeStopped(take)) return null
  if (take.status === 'completed' && hasUrl(take.videoUrl)) return 'border-success'
  if (take.status === 'failed' || take.lastAttemptStatus === 'failed') return 'border-destructive'
  return null
}

/** 노드형 영상 노드(Take 하나)의 꼬리(시안 D1 406:4051 "● 영상 없음"). 영상이 남은 Take 의 다시 만들기 실패는 이미지와 같은 원칙.
 *  화면에서 멈춘 Take 는 ★ 가 아니면 뒤에서 돌든 끝났든 회색 "멈췄어요"(실패 빨강 · 만드는 중 보라와 구분, S4 혼자 정한 것 a). */
export function videoTakeTail(take: {
  status: string | null | undefined
  lastAttemptStatus: string | null | undefined
  videoUrl: string | null | undefined
  cancelledAt?: string | null
  final?: boolean
}): Omit<ShotTail, 'remakeFailed'> {
  const latest = take.lastAttemptStatus ?? take.status
  if (takeIsRunning(take)) return { label: 'Making video', color: 'state-video', ring: true }
  if (takeStopped(take)) return { label: 'Stopped by you', color: null, ring: false }
  const hasVideo = take.status === 'completed' && hasUrl(take.videoUrl)
  if (latest === 'failed') return { label: hasVideo ? 'Remake failed' : 'Video failed', color: 'destructive', ring: false }
  if (hasVideo) return { label: 'Video done', color: 'success', ring: false }
  return { label: 'No video yet', color: null, ring: false }
}

export type ShotStageDot = 'none' | 'image_progress' | 'image_done' | 'video_progress' | 'video_done' | 'failed'

/** 카드 아래 "● 이미지 → ● 영상" 줄의 두 점(시안 D1 · D3). */
export function shotStageDots(state: DirectorShotState): { image: ShotStageDot; video: ShotStageDot } {
  switch (state) {
    case 'image_needed':
      return { image: 'none', video: 'none' }
    case 'image_generating':
      return { image: 'image_progress', video: 'none' }
    case 'image_done':
      return { image: 'image_done', video: 'none' }
    case 'image_failed':
      return { image: 'failed', video: 'none' }
    case 'video_generating':
      return { image: 'image_done', video: 'video_progress' }
    case 'video_done':
      return { image: 'image_done', video: 'video_done' }
    case 'video_failed':
      return { image: 'image_done', video: 'failed' }
  }
}

/** [다음: Editor로] · 사이드바 Editor · 채팅 넘김이 켜지는 조건 — 마더 샷(Writer 샷)의 완성 Take 가 하나라도 있다(시안 R, 결정 페이지 추천).
 *  Editor 는 Writer 샷만 컷으로 받는다 — 샷 없는 독립 영상 · Director 에서 더한 샷의 영상만 있으면 빈 Editor 가 열린다
 *  (재검토 c 낮음 2, entry D8 editorHandoverView 와 같은 기준). */
export function directorHasFinishedVideo(nodes: readonly DirectorNode[]): boolean {
  const writerShots = new Set(nodes.flatMap((n) => (isShotData(n.data) && n.data.writerShotId ? [n.id] : [])))
  return nodes.some(
    (n) =>
      isVideoData(n.data) &&
      n.data.parentShotNodeId !== null &&
      writerShots.has(n.data.parentShotNodeId) &&
      // 화면에서 멈춘 Take 는 ★ 가 아니면 영상이 아니다(오너 2026-11-14 7번) — 넘기기 창 · 투영과 같은 규칙(리드 검토 a 5).
      takeCountsAsVideo(n.data),
  )
}

/** 사이드바 Editor 칸을 [다음: Editor로]와 같은 넘김으로 열 때 — 아직 Director 까지만 왔고(넘기기 전) 완성 영상이 있을 때. */
export function railEditorViaHandoff({
  stage,
  onDirector,
  reachedDirectorOnly,
  finishedVideo,
}: {
  stage: string
  /** 지금 Director 화면인가 — 밖에서는 넘김이 지금 단계의 것을 고르므로 열지 않는다(리드 검토 a S6 보통 2). */
  onDirector: boolean
  reachedDirectorOnly: boolean
  finishedVideo: boolean
}): boolean {
  return stage === 'editor' && onDirector && reachedDirectorOnly && finishedVideo
}
