// [남은 컷 (다시) 그리기]가 어떤 컷을 골라 어떤 묶음으로 보내는지 검사한다
import { describe, expect, it } from 'vitest'
import { roughRedrawBatches, undrawnRoughShotIds } from '@/lib/writer/rough-progress'
import type { RoughStoryboardImage } from '@/types'

const drawn = (id: string): RoughStoryboardImage => ({ url: `https://example.test/${id}.png`, status: 'completed', errorMessage: null, generatedAt: 1 })
const failedPanel: RoughStoryboardImage = { url: '', status: 'failed', errorMessage: '거절됨', generatedAt: 1 }

function shot(shotId: string, sceneId: string, roughStoryboard: RoughStoryboardImage | null, actionDescription = '문을 연다') {
  return { shotId, sceneId, roughStoryboard, actionDescription }
}

describe('남은 컷 고르기', () => {
  // 왜: [남은 컷 다시 그리기]는 사람이 누른 다시 그리기라 실패를 여러 번 한 컷도 다시 보낸다 — 이미 있는 그림 · 그리는 중인 컷 · 스토리가 빈 컷을 보내면 돈만 들거나 아무 일도 없다.
  it('남은 컷을 다시 그리면 그리지 못했거나 아직 없는 컷만 고르고, 다 그린 컷 · 그리는 중인 컷 · 스토리가 빈 컷은 고르지 않는다', () => {
    const shots = [
      shot('done', 'sc_a', drawn('done')),
      shot('failed-db', 'sc_a', failedPanel),
      shot('missing', 'sc_a', null),
      shot('failed-local', 'sc_b', null),
      shot('queued', 'sc_b', null),
      shot('generating-local', 'sc_b', null),
      shot('no-story', 'sc_b', null, ' '),
      shot('redo-failed', 'sc_b', drawn('redo-failed')),
    ]
    const ids = undrawnRoughShotIds(
      shots,
      {},
      { 'failed-local': { status: 'failed' }, 'generating-local': { status: 'generating' }, 'redo-failed': { status: 'failed' } },
      new Set(['queued']),
    )
    expect(ids).toEqual(['failed-db', 'missing', 'failed-local', 'redo-failed'])
  })

  // 왜: 화면이 막 받은 완료 그림은 아직 DB 를 다시 읽기 전이라도 다 그린 컷이다 — 다시 보내면 같은 컷을 두 번 그린다.
  it('화면이 막 받은 완료 그림이 있으면 그 컷은 남은 컷이 아니다', () => {
    const ids = undrawnRoughShotIds([shot('fresh', 'sc_a', null)], { fresh: drawn('fresh') }, {}, new Set())
    expect(ids).toEqual([])
  })
})

describe('남은 컷 보내기 묶음', () => {
  // 왜: 서버는 한 장의 그리드에 한 씬의 샷을 넉 장까지만 그린다 — 넘치는 샷은 그 요청에서 빠지므로, 한 번에 한 씬 넉 장씩 보내야 고른 컷이 모두 그려진다.
  it('남은 컷은 한 씬에서 넉 장씩 묶어 차례로 보낸다', () => {
    const entries = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((shotId) => ({ shotId, sceneId: 'sc_a' })),
      { shotId: 'b1', sceneId: 'sc_b' },
      { shotId: 'a6', sceneId: 'sc_a' },
    ]
    expect(roughRedrawBatches(entries)).toEqual([['a1', 'a2', 'a3', 'a4'], ['a5'], ['b1'], ['a6']])
  })
})
