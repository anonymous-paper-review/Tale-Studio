// 화면에서 멈춘 Take 는 ★ 가 아니면 만드는 중도 영상도 아니다 — 스토리보드 카드 · 노드형 Take 노드도 샷 상태와 같은 규칙 (오너 2026-11-14 7번 · 리드 S4-2 1 · 2)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gridVideoView } from '@/features/director/canvas-views/StoryboardGridView'
import { takeCountsAsVideo, takeIsRunning, videoTakeFrame, videoTakeTail } from '@/lib/director/shot-state'

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
