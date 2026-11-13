// 화면에서 멈춘 Take 는 ★ 가 아니면 영상 없음 — Editor 로 넘기기 · 넘기기 창 · 넘김 조건 · 내보내기 · 샷 상태 · 영상 일괄이 같은 규칙이고, 멈춤은 그 Take 의 마지막 작업에 적혀 있다 (오너 2026-11-14 7번 · 리드 C · 검토 a 5)
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { withCancelledTakes } from '@/lib/director/take-cancellations'
import { selectHandoffTake } from '@/lib/director-video-take-selection'
import { editorHandoverView } from '@/lib/director/editor-handover'
import { directorHasFinishedVideo, shotFactsByNode, shotState } from '@/lib/director/shot-state'
import { eligibleVideoBatchShotIds } from '@/lib/director/video-batch-client'
import type { DirectorNode } from '@/types/director'

/** 샷 하나와 그 Take 들 — 멈춘 Take 규칙을 넘기기 창 · 샷 상태에 똑같이 거는지 본다. */
function shotWithTakes(takes: Array<Record<string, unknown>>): DirectorNode[] {
  const shot = { id: 'shot-1', type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: 'sh_01_01', writerShotId: 'sh_01_01', durationSeconds: 3, storyboardImage: { url: 'https://media.test/s.png', status: 'completed', errorMessage: null, generatedAt: 1 } } }
  return [shot, ...takes.map((data, i) => ({ id: `take-${i + 1}`, type: 'video', position: { x: 0, y: 0 }, data: {
    kind: 'video', parentShotNodeId: 'shot-1', standaloneVideoKey: null, takeNumber: i + 1, createdAt: `2026-11-14T0${i}:00:00Z`, final: false,
    status: 'completed', lastAttemptStatus: 'completed', lastAttemptAt: null, videoUrl: `https://media.test/t${i + 1}.mp4`, thumbnailUrl: null, override: {}, ...data,
  } }))] as unknown as DirectorNode[]
}
const NO_QUEUE = { queuedImageShots: new Set<string>(), queuedVideoShots: new Set<string>() }

const reader = (rows: unknown[] | null, error: unknown = null) => {
  const query = { select: vi.fn(() => query), in: vi.fn(() => query), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(resolve) }
  return { from: vi.fn(() => query) }
}

describe('넘기기 고르기의 멈춘 Take', () => {
  it('Take 줄에 멈춘 때를 붙여, 늦게 끝난 멈춘 Take 대신 앞 Take 를 Editor 로 넘긴다', async () => {
    // 왜: 오너 7번 "백그라운드에서 끝나면 히스토리로" — Editor · 내보내기가 늦게 끝난 영상을 저절로 쓰지 않는다.
    const clips = [
      { id: 'a', url: 'https://media.test/a.mp4', status: 'completed', take_number: 1, created_at: '2026-11-14T00:00:00Z', is_final: false, last_attempt_job_id: 'job-a' },
      { id: 'b', url: 'https://media.test/b.mp4', status: 'completed', take_number: 2, created_at: '2026-11-14T01:00:00Z', is_final: false, last_attempt_job_id: 'job-b' },
    ]
    const marked = await withCancelledTakes(reader([{ job_id: 'job-b', cancelled_at: '2026-11-14T01:01:00Z' }]), clips)
    expect(marked.map((c) => [c.id, c.cancelled_at ?? null])).toEqual([['a', null], ['b', '2026-11-14T01:01:00Z']])
    expect(selectHandoffTake(marked)?.id).toBe('a')
  })

  it('멈춤을 읽지 못하면 종전처럼 고른다', async () => {
    // 왜: 멈춤 표를 아직 못 읽는 환경(표가 없는 DB · 접근 실패)에서도 Editor 로 넘기기는 멈추지 않아야 한다.
    const clips = [{ id: 'a', last_attempt_job_id: 'job-a' }]
    expect(await withCancelledTakes(reader(null, { message: 'missing' }), clips)).toEqual(clips)
    expect(await withCancelledTakes({ from: () => { throw new Error('no table') } }, clips)).toEqual(clips)
  })

  it('Editor 로 넘기기 · 내보내기 · 내보내기 크기 셈이 모두 멈춘 Take 를 붙여 고른다', () => {
    // 왜: 리드 C "넘기기 고르기가 그 표를 보고 빼게" — 고르는 곳이 셋이라 하나라도 빠지면 그 길로 늦은 영상이 나간다.
    for (const file of ['src/stores/editor-store.ts', 'src/lib/export/director.ts', 'src/components/export-menu.tsx']) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).toMatch(/withCancelledTakes\(/)
      expect(src, file).toMatch(/last_attempt_job_id/)
    }
  })

})

describe('넘기기 창 · 샷 상태의 멈춘 Take', () => {
  it('Editor 로 넘기기 창도 멈춘 Take 는 ★ 가 아니면 영상 없음으로 본다', () => {
    // 왜: 리드 검토 a 5 — "멈춘 Take 는 ★ 가 아니면 영상 없음" 한 규칙을 투영 · 넘기기 창 · 샷 상태 · 일괄 검사 네 곳이 같이 쓴다.
    const stoppedOnly = editorHandoverView(shotWithTakes([{ cancelledAt: '2026-11-14T03:00:00Z' }]), null)
    expect(stoppedOnly.shots[0]!.take).toBeNull()
    expect(stoppedOnly.missing).toHaveLength(1)
    const picked = editorHandoverView(shotWithTakes([{ cancelledAt: '2026-11-14T03:00:00Z', final: true }]), null)
    expect(picked.shots[0]!.take).toEqual({ number: 1, final: true })
    // 멈추고 아직 도는 Take 는 "만드는 중"이 아니다(화면에서는 멈춘 것).
    const running = editorHandoverView(shotWithTakes([{ status: 'generating', lastAttemptStatus: 'generating', videoUrl: null, cancelledAt: '2026-11-14T03:00:00Z' }]), null)
    expect(running.shots[0]!.missing).not.toBe('generating')
  })

  it('샷 상태도 멈춘 Take 는 ★ 가 아니면 영상 완성으로 세지 않고, 멈춘 채 도는 Take 는 영상 만드는 중으로 세지 않는다', () => {
    // 왜: 리드 검토 a 5 · 오너 7번 — 카드 · 노드의 상태 색과 고르기 줄이 넘기기 · 내보내기와 같은 말을 한다.
    const stoppedDone = shotFactsByNode(shotWithTakes([{ cancelledAt: '2026-11-14T03:00:00Z' }]), NO_QUEUE).get('shot-1')!
    expect(stoppedDone.videoDone).toBe(false)
    expect(shotState(stoppedDone)).not.toBe('video_done')
    const pickedDone = shotFactsByNode(shotWithTakes([{ cancelledAt: '2026-11-14T03:00:00Z', final: true }]), NO_QUEUE).get('shot-1')!
    expect(pickedDone.videoDone).toBe(true)
    const stoppedRunning = shotFactsByNode(shotWithTakes([{ status: 'generating', lastAttemptStatus: 'generating', videoUrl: null, cancelledAt: '2026-11-14T03:00:00Z' }]), NO_QUEUE).get('shot-1')!
    expect(stoppedRunning.videoGenerating).toBe(false)
  })
})

describe('넘김 조건 · 영상 일괄의 멈춘 Take', () => {
  it('Editor 로 넘길 완성 영상이 있는지 셀 때도 멈춘 Take 는 ★ 가 아니면 세지 않는다', () => {
    // 왜: [다음: Editor로] · 사이드바 Editor · 채팅 넘김 · 넘기기 창 열기가 이 판정 하나를 쓴다 — 멈춘 Take 만 있는데 컷 0개로 넘어가지 않게.
    expect(directorHasFinishedVideo(shotWithTakes([{ cancelledAt: '2026-11-14T03:00:00Z' }]))).toBe(false)
    expect(directorHasFinishedVideo(shotWithTakes([{ cancelledAt: '2026-11-14T03:00:00Z', final: true }]))).toBe(true)
  })

  it('영상 일괄은 멈춘 Take 만 있는 샷도 아직 영상이 없는 샷으로 보고 보낸다', () => {
    // 왜: 위 [영상 만들기 · N] 숫자(샷 상태)와 실제로 보내는 샷이 같아야 한다 — 서버 일괄의 "다 만든 샷" · 같은 샷 검사도 멈춘 Take 를 뺀다.
    expect(eligibleVideoBatchShotIds(shotWithTakes([{ cancelledAt: '2026-11-14T03:00:00Z' }]))).toEqual(['shot-1'])
    const running = shotWithTakes([{ status: 'generating', lastAttemptStatus: 'generating', videoUrl: null, cancelledAt: '2026-11-14T03:00:00Z' }])
    expect(eligibleVideoBatchShotIds(running)).toEqual(['shot-1'])
    expect(eligibleVideoBatchShotIds(shotWithTakes([{ cancelledAt: '2026-11-14T03:00:00Z', final: true }]))).toEqual([])
  })
})
