// Lumi 에게 "실패한 샷"이라고 하면 그 묶음이 보드가 영상 실패(빨강)로 보이는 샷과 같은지 — 화면에서 멈춘 Take 가 끼어도 — 검사한다 (오너 2026-11-14 7번 · 리드 검토 a)
import { describe, expect, it } from 'vitest'
import type { DirectorNode } from '@/types/director'
import { directorShotRefs } from '@/lib/director/lumi-chat-runs'
import { groundVideoRequest } from '@/lib/director/chat-video-targets'
import { shotFactsByNode, shotState } from '@/lib/director/shot-state'
import { eligibleVideoBatchShotIds } from '@/lib/director/video-batch-client'
import { boardNodeNames } from '@/features/director/node-label'

const STOPPED = '2026-11-14T02:30:00Z'
const shot = (id: string) =>
  ({ id, type: 'shot', position: { x: 0, y: 0 }, data: { kind: 'shot', label: `w-${id}`, writerShotId: `w-${id}`, storyboardImage: { status: 'completed', url: `https://media.test/${id}.png` } } }) as unknown as DirectorNode
/** n 번째 Take(번호 · 시각이 클수록 새것). */
const take = (shotId: string, n: number, extra: Record<string, unknown>) =>
  ({ id: `${shotId}-t${n}`, type: 'video', position: { x: 0, y: 0 }, data: { kind: 'video', label: `take_v${n}`, parentShotNodeId: shotId, takeNumber: n, createdAt: `2026-11-14T0${n}:00:00Z`, lastAttemptAt: `2026-11-14T0${n}:00:00Z`, videoUrl: null, final: false, override: {}, ...extra } }) as unknown as DirectorNode
const failed = (shotId: string, n: number, extra: Record<string, unknown> = {}) => take(shotId, n, { status: 'failed', lastAttemptStatus: 'failed', ...extra })
const finished = (shotId: string, n: number, extra: Record<string, unknown> = {}) => take(shotId, n, { status: 'completed', lastAttemptStatus: 'completed', videoUrl: `https://media.test/${shotId}-${n}.mp4`, ...extra })
const running = (shotId: string, n: number, extra: Record<string, unknown> = {}) => take(shotId, n, { status: 'generating', lastAttemptStatus: 'generating', ...extra })

// 샷 1: 멈춘 채 뒤에서 도는 Take 만 / 샷 2: 멈춘 뒤 끝난 Take 만 / 샷 3: 멈춘 뒤 끝난 Take + 더 새로 실패한 Take(검토 a 의 예) / 샷 4: 실패한 Take
const BOARD = [
  shot('s1'), running('s1', 1, { cancelledAt: STOPPED }),
  shot('s2'), finished('s2', 1, { cancelledAt: STOPPED }),
  shot('s3'), finished('s3', 1, { cancelledAt: STOPPED }), failed('s3', 2),
  shot('s4'), failed('s4', 1),
]
const names = boardNodeNames({ scenes: [{ sceneId: 'sc1' }] }, ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'].map((id) => ({ shotId: `w-${id}`, sceneId: 'sc1' })))
const failedShots = (nodes: DirectorNode[]) => directorShotRefs(nodes, names).filter((shot) => shot.videoFailed).map((shot) => shot.nodeId)
const remakeFailed = (nodes: DirectorNode[]) =>
  groundVideoRequest({ text: '실패한 샷 다시 만들어줘', requested: null, shots: directorShotRefs(nodes, names), eligible: eligibleVideoBatchShotIds(nodes), selected: [] })

describe('"실패한 샷" 묶음과 멈춘 Take', () => {
  // 왜: 오너 7번 — 멈춘 Take 는 ★ 가 아니면 영상도 실패도 아니다. 그 샷을 실패로 세면 Lumi 가 화면에 빨강이 아닌 샷에 Take 를 쓴다.
  it('멈춘 채 뒤에서 도는 Take 나 멈춘 뒤 끝난 Take 만 있는 샷은 "실패한 샷 다시 만들어줘"에 담기지 않는다', () => {
    expect(failedShots(BOARD)).not.toContain('s1')
    expect(failedShots(BOARD)).not.toContain('s2')
    const ground = remakeFailed(BOARD)
    expect(ground.kind).toBe('run')
    expect(ground.kind === 'run' ? ground.shotIds : []).not.toEqual(expect.arrayContaining(['s1']))
    expect(ground.kind === 'run' ? ground.shotIds : []).not.toEqual(expect.arrayContaining(['s2']))
  })

  // 왜: 검토 a 의 예 — 멈춘 뒤 끝난 Take 가 "영상이 있다"로 읽혀, 그 뒤 새로 실패한 샷(화면은 빨강)이 "실패한 샷"에서 빠졌다.
  it('멈춘 뒤 끝난 Take 가 있어도 더 새로 실패한 Take 가 있으면 화면처럼 실패한 샷으로 세어 "실패한 샷 다시 만들어줘"에 담는다', () => {
    expect(failedShots(BOARD)).toEqual(['s3', 's4'])
    expect(remakeFailed(BOARD)).toEqual({ kind: 'run', shotIds: ['s3', 's4'] })
  })

  // 왜: 리드 검토 a — "실패한 샷"은 화면이 보이는 상태(빨강 실패)와 같은 판단 하나로 센다. 멈춘 Take 규칙이 바뀌어도 둘이 갈라지지 않게.
  it('"실패한 샷" 묶음은 보드가 영상 실패(빨강)로 보이는 샷과 같다 — 멈춘 Take 가 끼어도', () => {
    const mixed = [
      ...BOARD,
      shot('s5'), failed('s5', 1), running('s5', 2, { cancelledAt: STOPPED }),
      shot('s6'), failed('s6', 1), failed('s6', 2, { cancelledAt: STOPPED }),
      shot('s7'), failed('s7', 1, { cancelledAt: STOPPED }),
      shot('s8'), failed('s8', 1), finished('s8', 2, { cancelledAt: STOPPED }),
      shot('s9'), finished('s9', 1, { cancelledAt: STOPPED, final: true }), failed('s9', 2),
    ]
    const screen = shotFactsByNode(mixed, { queuedImageShots: new Set(), queuedVideoShots: new Set() })
    const red = [...screen].filter(([, facts]) => shotState(facts) === 'video_failed').map(([id]) => id)
    expect(failedShots(mixed)).toEqual(red)
  })
})
