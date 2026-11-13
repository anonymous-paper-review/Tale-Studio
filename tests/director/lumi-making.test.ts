// 접힌 Lumi 아이콘이 움직이는 "만드는 중"이 화면에서 멈춘 Take 를 세지 않는지 검사한다 (오너 2026-11-14 7번 · 리드 검토 a)
import { describe, expect, it } from 'vitest'
import type { DirectorNode } from '@/types/director'
import { directorMaking } from '@/lib/director/making'

const take = (id: string, extra: Record<string, unknown>) =>
  ({ id, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: id, parentShotNodeId: 's1', takeNumber: 1, videoUrl: null, final: false, override: {}, ...extra } }) as unknown as DirectorNode
const making = (nodes: DirectorNode[]) => directorMaking({ projectId: 'p', realBatchBusy: false, videoBatchBusy: false, nodes }, 'p')
const STOPPED = '2026-11-14T03:00:00Z'

describe('멈춘 Take 와 아이콘 움직임', () => {
  // 왜: 오너 7번 — 화면에서 멈춘 Take 는 뒤에서 끝까지 돌아도 화면에서는 멈춘 것이다. 아이콘이 움직이면 아직 만드는 중으로 읽힌다(검토 a).
  it('멈춘 Take 만 뒤에서 도는 프로젝트에서는 접힌 Lumi 아이콘이 움직이지 않는다', () => {
    expect(making([take('v1', { status: 'generating', lastAttemptStatus: 'generating', cancelledAt: STOPPED })])).toBe(false)
  })

  // 왜: 정상 경로 고정 — 멈추지 않은 Take 가 도는 동안은 지금처럼 만드는 중이다(멈춘 Take 가 곁에 있어도).
  it('멈추지 않은 Take 가 하나라도 도는 중이면 지금처럼 움직인다', () => {
    expect(making([
      take('v1', { status: 'generating', lastAttemptStatus: 'generating', cancelledAt: STOPPED }),
      take('v2', { status: 'generating', lastAttemptStatus: 'generating' }),
    ])).toBe(true)
  })
})
