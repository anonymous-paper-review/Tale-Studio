// 서버도 화면과 같은 기준으로 "아직 영상이 없는 샷"을 고른다
//
// #batch-resume(2026-09-09) 슬라이스 C의 전제. 지금 그 판정(eligibleVideoBatchShotIds)은
// 브라우저 캔버스 노드를 보는데, 서버에는 노드가 없다 — DB 행만 있다.
// 기준이 어긋나면 서버가 이미 만든 샷을 또 만들거나(Take 낭비) 남은 샷을 건너뛴다.
//
// 화면 기준(video-batch-client.ts): 그 샷에 딸린 영상 중 "완성돼서 재생 가능" 하거나
//   "만드는 중" 인 것이 하나라도 있으면 제외. 서버도 같은 두 조건을 본다.
import { describe, expect, it } from 'vitest'
import { eligibleShotIdsFromRows, type ShotVideoRow } from '@/lib/director/batch-eligible'

function clip(overrides: Partial<ShotVideoRow> = {}): ShotVideoRow {
  return {
    shot_id: 'sh_01',
    status: 'completed',
    url: 'https://cdn/v.mp4',
    last_attempt_status: null,
    deleted_at: null,
    ...overrides,
  }
}

describe('서버가 고르는 만들 샷', () => {
  it('영상이 하나도 없는 샷을 고른다', () => {
    const eligible = eligibleShotIdsFromRows(['sh_01', 'sh_02'], [clip({ shot_id: 'sh_01' })])

    expect(eligible).toEqual(['sh_02'])
  })

  it('완성 영상이 있는 샷은 빼낸다', () => {
    const eligible = eligibleShotIdsFromRows(['sh_01'], [clip()])

    expect(eligible).toEqual([])
  })

  it('만드는 중인 샷도 빼낸다', () => {
    // 두 번 내면 Take 가 두 번 나간다.
    const eligible = eligibleShotIdsFromRows(
      ['sh_01'],
      [clip({ status: 'generating', url: null })],
    )

    expect(eligible).toEqual([])
  })

  it('시도 중 표시만 있어도 빼낸다', () => {
    // 화면 기준도 lastAttemptStatus 를 함께 본다.
    const eligible = eligibleShotIdsFromRows(
      ['sh_01'],
      [clip({ status: null, url: null, last_attempt_status: 'generating' })],
    )

    expect(eligible).toEqual([])
  })

  it('주소가 없는 완료는 완성으로 보지 않는다', () => {
    // status 만 completed 이고 파일이 없으면 재생할 수 없다 — 다시 만들어야 한다.
    const eligible = eligibleShotIdsFromRows(['sh_01'], [clip({ url: null })])

    expect(eligible).toEqual(['sh_01'])
  })

  it('지운 영상은 없는 것으로 본다', () => {
    const eligible = eligibleShotIdsFromRows(
      ['sh_01'],
      [clip({ deleted_at: '2026-09-09T00:00:00Z' })],
    )

    expect(eligible).toEqual(['sh_01'])
  })

  it('실패한 영상만 있으면 다시 만들 수 있다', () => {
    const eligible = eligibleShotIdsFromRows(
      ['sh_01'],
      [clip({ status: 'failed', url: null, last_attempt_status: 'failed' })],
    )

    expect(eligible).toEqual(['sh_01'])
  })

  it('샷 순서를 지킨다', () => {
    // 일괄은 앞에서부터 낸다 — 순서가 흔들리면 사용자가 기대한 것과 다른 샷이 먼저 나간다.
    const eligible = eligibleShotIdsFromRows(['sh_03', 'sh_01', 'sh_02'], [])

    expect(eligible).toEqual(['sh_03', 'sh_01', 'sh_02'])
  })
})
