// 화면에서 멈춘 Take 는 ★ 가 아니면 만드는 중도 영상도 아니다 — 스토리보드 카드 · 노드형 Take 노드도 샷 상태와 같은 규칙 (오너 2026-11-14 7번 · 리드 S4-2 1 · 2)
//   가장 새 Take 가 멈춘 것이면 그 샷은 실패도 아니다 — 멈춘 Take 의 시각은 멈춘 때(리드 2026-11-14 규칙).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gridVideoView } from '@/features/director/canvas-views/StoryboardGridView'
import { editorHandoverView } from '@/lib/director/editor-handover'
import { shotFactsByNode, shotState, takeCountsAsVideo, takeIsRunning, videoTakeFrame, videoTakeTail } from '@/lib/director/shot-state'
import type { DirectorNode } from '@/types/director'

type Rec = Parameters<typeof gridVideoView>[0][number]
const rec = (id: string, take: number, patch: Partial<Rec>): Rec =>
  ({
    id, take_number: take, created_at: `2026-11-14T0${take}:00:00Z`, status: 'pending', url: null, is_final: false,
    last_attempt_status: null, last_attempt_at: `2026-11-14T0${take}:00:00Z`, last_attempt_error: null, cancelled_at: null, node: {} as never,
    ...patch,
  }) as Rec

describe('스토리보드 카드', () => {
  it('멈춘 채 뒤에서 도는 Take 는 카드를 만드는 중으로 만들지 않아 [영상 만들기]를 다시 누를 수 있다', () => {
    // 왜: 오너 7번 "UI로는 취소된걸로 보이게 해서 유저가 수정해서 다시 생성 요청" — 카드가 만드는 중이면 영상 단추가 잠겼다(리드 검토 a 보통).
    const view = gridVideoView([rec('t1', 1, { status: 'generating', last_attempt_status: 'generating', cancelled_at: '2026-11-14T03:00:00Z' })])
    expect(view.generating).toBe(false)
    expect(gridVideoView([rec('t1', 1, { status: 'generating', last_attempt_status: 'generating' })]).generating).toBe(true)
  })

  it('멈춘 Take 가 뒤늦게 끝나도 ★ 가 아니면 카드 영상으로 틀지 않고 앞 영상을 틀며, ★ 로 고르면 그 영상을 튼다', () => {
    // 왜: 멈춘 결과는 기록에만 남는다(오너 7번) — 카드가 그 영상을 틀면 Editor 로 가는 영상과 달라 보인다.
    const older = rec('t1', 1, { status: 'completed', url: 'https://x/1.mp4', last_attempt_status: 'completed' })
    const stopped = rec('t2', 2, { status: 'completed', url: 'https://x/2.mp4', last_attempt_status: 'completed', cancelled_at: '2026-11-14T03:00:00Z' })
    expect(gridVideoView([older, stopped]).cardTake?.id).toBe('t1')
    expect(gridVideoView([stopped]).cardTake).toBeNull()
    expect(gridVideoView([older, { ...stopped, is_final: true }]).cardTake?.id).toBe('t2')
  })

  it('스토리보드 카드의 Take 목록은 멈춘 때를 싣는다', () => {
    // 왜: 싣지 않으면 위 규칙이 카드에서 돌지 않는다(prose 요청 — 넘기기 창 · 상세 · Take 목록은 이미 뺌).
    const grid = readFileSync('src/features/director/canvas-views/StoryboardGridView.tsx', 'utf8')
    expect(grid).toContain('cancelled_at: n.data.cancelledAt ?? null,')
    expect(grid).toContain('gridVideoView(takeRecords, t)')
  })
})

describe('노드형 Take 노드', () => {
  it('화면에서 멈춘 Take 노드는 회색 "멈췄어요" 꼬리이고 상태 색 테두리가 없다 — 뒤에서 끝나도 ★ 가 아니면 그대로다', () => {
    // 왜: 실패(빨강) · 만드는 중(보라)과 구분 — 멈춘 Take 는 다시 만들 수 있는 상태다(S4 혼자 정한 것 a).
    const running = { status: 'generating', lastAttemptStatus: 'generating', videoUrl: null, cancelledAt: '2026-11-14T03:00:00Z', final: false }
    expect(videoTakeTail(running)).toEqual({ label: 'Stopped by you', color: null, ring: false })
    expect(videoTakeFrame(running)).toBeNull()
    const lateDone = { ...running, status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://x/2.mp4' }
    expect(videoTakeTail(lateDone).label).toBe('Stopped by you')
    expect(videoTakeFrame(lateDone)).toBeNull()
  })

  it('★ 로 고른 멈춘 Take 가 끝났으면 노드 꼬리 · 테두리는 완성(초록)이다', () => {
    // 왜: ★ 는 사람이 이 영상을 쓰겠다고 고른 것 — 샷 상태 · 넘기기와 같다(★ 면 영상).
    const starred = { status: 'completed', lastAttemptStatus: 'completed', videoUrl: 'https://x/2.mp4', cancelledAt: '2026-11-14T03:00:00Z', final: true }
    expect(videoTakeFrame(starred)).toBe('border-success')
    expect(videoTakeTail(starred).label).toBe('Video done')
    expect(takeCountsAsVideo(starred)).toBe(true)
    expect(takeIsRunning({ ...starred, status: 'generating', lastAttemptStatus: 'generating' })).toBe(false)
  })

  it('멈춘 Take 노드는 만드는 중 카드(Lumi)로 덮지 않고, 같은 샷의 [영상 다시 만들기]를 막지 않는다', () => {
    // 왜: 멈춘 뒤 바로 고쳐 다시 만들 수 있어야 한다(오너 7번).
    const node = readFileSync('src/features/director/canvas-nodes/VideoNode.tsx', 'utf8')
    expect(node).toContain('const generating = takeIsRunning(data)')
    expect(node).toMatch(/node\.data\.standaloneVideoKey\) ===\s*videoOwnerKey &&\s*takeIsRunning\(node\.data\)/)
  })
})

/** 그림이 있는 샷 하나와 그 Take 들(앞에서부터 Take 1, 2, …). */
function shotWithTakes(takes: Array<Record<string, unknown>>): DirectorNode[] {
  const shot = { id: 'shot-1', type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: 'sh_01_01', writerShotId: 'sh_01_01', durationSeconds: 3, storyboardImage: { url: 'https://media.test/s.png', status: 'completed', errorMessage: null, generatedAt: 1 } } }
  return [shot, ...takes.map((data, i) => ({ id: `take-${i + 1}`, type: 'video', position: { x: 0, y: 0 }, data: {
    kind: 'video', parentShotNodeId: 'shot-1', standaloneVideoKey: null, takeNumber: i + 1, createdAt: `2026-11-14T0${i}:00:00Z`, final: false,
    status: 'pending', lastAttemptStatus: null, lastAttemptAt: `2026-11-14T0${i}:00:00Z`, videoUrl: null, thumbnailUrl: null, override: {}, cancelledAt: null, ...data,
  } }))] as unknown as DirectorNode[]
}
const NO_QUEUE = { queuedImageShots: new Set<string>(), queuedVideoShots: new Set<string>() }
const stateOf = (nodes: DirectorNode[]) => shotState(shotFactsByNode(nodes, NO_QUEUE).get('shot-1')!)
// 멈춘 Take(01:30 에 멈춤)가 뒤에서 05:00 에 실패로 끝났다.
const stoppedThenFailed = { status: 'failed', lastAttemptStatus: 'failed', lastAttemptAt: '2026-11-14T05:00:00Z', cancelledAt: '2026-11-14T01:30:00Z' }

describe('멈춘 Take 와 실패 (리드 2026-11-14 규칙)', () => {
  it('가장 새 Take 가 화면에서 멈춘 것(★ 아님)이면 그 샷은 뒤에서 실패해도 이미지 완료이고 빨강이 아니다', () => {
    // 왜: 멈춘 것은 사람이 그만둔 것이지 실패가 아니다 — 뒤에서 실패로 끝나도 빨강 · "영상 실패"로 다시 만들라고 다그치지 않는다(오너 7번).
    expect(stateOf(shotWithTakes([stoppedThenFailed]))).toBe('image_done')
    // 앞 Take 가 실패했어도 그 뒤에 멈춘 Take 가 가장 새것이면 이미지 완료다.
    expect(stateOf(shotWithTakes([{ status: 'failed', lastAttemptStatus: 'failed' }, { ...stoppedThenFailed, lastAttemptAt: '2026-11-14T01:00:00Z', cancelledAt: '2026-11-14T01:30:00Z' }]))).toBe('image_done')
  })

  it('멈춘 Take 보다 더 새로 실패한 Take 가 있으면 그 샷은 영상 실패(빨강)다 — 멈춘 Take 가 뒤늦게 끝나도 더 새 시도가 되지 않는다', () => {
    // 왜: 멈춘 뒤 다시 만든 것이 실패했으면 그것이 지금 할 일이다. 멈춘 Take 의 시각은 멈춘 때라, 그 Take 가 05:00 에 늦게 끝나도 02:00 에 시작한 실패가 더 새것이다.
    expect(stateOf(shotWithTakes([stoppedThenFailed, { status: 'failed', lastAttemptStatus: 'failed', lastAttemptAt: '2026-11-14T02:00:00Z' }]))).toBe('video_failed')
  })

  it('Editor 로 넘기기 창도 가장 새 Take 가 멈춘 것이면 "실패"가 아니라 "아직 만들지 않음"이고, 그 뒤 더 새로 실패한 Take 가 있으면 "실패"다', () => {
    // 왜: 넘기기 창(entry D8)과 샷 상태가 같은 샷을 다르게 말하지 않는다(리드 규칙 — editor-handover 도 같은 식).
    expect(editorHandoverView(shotWithTakes([stoppedThenFailed]), null).shots[0]!.missing).toBe('not_made')
    expect(editorHandoverView(shotWithTakes([stoppedThenFailed, { status: 'failed', lastAttemptStatus: 'failed', lastAttemptAt: '2026-11-14T02:00:00Z' }]), null).shots[0]!.missing).toBe('failed')
  })

  it('러프 보기 카드의 "최근 영상 실패"도 가장 새 Take 가 멈춘 것이면 띄우지 않는다', () => {
    // 왜: 카드 · 노드 · 넘기기 창이 같은 규칙(리드 규칙). 멈춘 Take 의 실패는 기록에만 있다.
    const stopped = rec('t1', 1, { status: 'failed', last_attempt_status: 'failed', last_attempt_at: '2026-11-14T05:00:00Z', last_attempt_error: 'fal 500', cancelled_at: '2026-11-14T01:30:00Z' })
    expect(gridVideoView([stopped]).failure).toBeNull()
    const newer = rec('t2', 2, { status: 'failed', last_attempt_status: 'failed', last_attempt_at: '2026-11-14T02:00:00Z', last_attempt_error: 'fal 500' })
    expect(gridVideoView([stopped, newer]).failure).toBe('fal 500')
    // 앞 Take 가 실패했어도 그 뒤에 멈춘 Take 가 가장 새것이면 띄우지 않는다.
    const olderFailed = rec('t0', 0, { status: 'failed', last_attempt_status: 'failed', last_attempt_at: '2026-11-14T00:30:00Z', last_attempt_error: 'fal 500' })
    expect(gridVideoView([olderFailed, stopped]).failure).toBeNull()
  })
})

describe('멈춘 Take 와 실패 — 그대로인 경우 (리드 2026-11-14 규칙)', () => {
  const failed = { status: 'failed', lastAttemptStatus: 'failed', lastAttemptAt: '2026-11-14T00:30:00Z' }

  it('앞 Take 가 실패했어도 그 뒤 Take 를 멈췄으면 뒤에서 아직 돌아도 그 샷은 이미지 완료다', () => {
    // 왜: 가장 새 일이 멈춤이다 — 멈춘 채 도는 Take 는 만드는 중이 아니고, 앞 실패로 빨강이 되지도 않는다.
    expect(stateOf(shotWithTakes([failed, { status: 'generating', lastAttemptStatus: 'generating', lastAttemptAt: '2026-11-14T01:00:00Z', cancelledAt: '2026-11-14T01:30:00Z' }]))).toBe('image_done')
  })

  it('앞 Take 가 실패했어도 그 뒤 멈춘 Take 가 뒤늦게 완성됐으면(★ 아님) 그 샷은 이미지 완료다', () => {
    // 왜: 멈춘 결과는 기록에만 남는다(오너 7번) — 영상 있음도 빨강도 아니다.
    expect(stateOf(shotWithTakes([failed, { status: 'completed', lastAttemptStatus: 'completed', lastAttemptAt: '2026-11-14T05:00:00Z', videoUrl: 'https://media.test/late.mp4', cancelledAt: '2026-11-14T01:30:00Z' }]))).toBe('image_done')
  })

  it('멈춘 Take 가 뒤늦게 완성됐어도 그 뒤에 시작해 실패한 Take 가 있으면 그 샷은 빨강이다', () => {
    // 왜: 멈춘 뒤 다시 만든 것이 실패했다 — 늦게 끝난 멈춘 Take 가 그 실패를 덮지 않는다.
    expect(stateOf(shotWithTakes([
      { status: 'completed', lastAttemptStatus: 'completed', lastAttemptAt: '2026-11-14T05:00:00Z', videoUrl: 'https://media.test/late.mp4', cancelledAt: '2026-11-14T00:30:00Z' },
      { status: 'failed', lastAttemptStatus: 'failed', lastAttemptAt: '2026-11-14T02:00:00Z' },
    ]))).toBe('video_failed')
  })

  it('★ 로 고른 멈춘 Take 가 끝났으면 그 샷은 영상 완성이다', () => {
    // 왜: ★ 는 사람이 이 영상을 쓰겠다고 고른 것 — 멈춘 Take 라도 영상이다(넘기기 · 노드와 같다).
    expect(stateOf(shotWithTakes([failed, { status: 'completed', lastAttemptStatus: 'completed', lastAttemptAt: '2026-11-14T05:00:00Z', videoUrl: 'https://media.test/star.mp4', cancelledAt: '2026-11-14T01:30:00Z', final: true }]))).toBe('video_done')
  })
})
