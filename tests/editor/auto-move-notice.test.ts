// Editor 를 열 때 자리가 저절로 바뀌면 한 번 띄우는 알림이 뒤 컷뿐 아니라 그 위 클립 · 마커 · 소리만 옮겨져도 뜨고, 옮긴 것을 다 말하는지 검사한다 (검토 · 리드 규칙 11/14)
import { describe, expect, it } from 'vitest'
import { autoMoveNotice, type PlacedSnapshot } from '@/lib/editor/auto-move'
import { translate } from '@/lib/i18n/translate'

/** 열기 전 · 뒤 자리 — V1 컷 · 위 줄 클립 · 마커 · 사람이 놓은 소리의 시작 초. */
const snap = (patch: Partial<PlacedSnapshot> = {}): PlacedSnapshot => ({
  cuts: new Map([['s1', 0], ['s3', 4]]),
  upper: new Map([['title', 5]]),
  markers: [5],
  sounds: new Map([['door', 5]]),
  ...patch,
})
const text = (notice: ReturnType<typeof autoMoveNotice>) => (notice ? translate('ko', notice.key, notice.params) : null)

describe('혼자 정한 것', () => {
  it('위 줄 · 마커만 옮겨져도 들어온 알림을 띄운다', () => {
    // 왜: 검토(리드 11/14) — V1 컷이 그대로이고 제목 · 마커만 옮겨졌을 때 알림이 없어, 왜 자리가 바뀌었는지 알 수 없었다.
    const arrived = { removed: 0, added: 1 }
    expect(text(autoMoveNotice(snap(), snap({ upper: new Map([['title', 9]]) }), arrived))).toBe('샷 1개가 새로 들어와 뒤 컷과 그 위 클립 · 소리 · 마커를 옮겼어요.')
    expect(text(autoMoveNotice(snap(), snap({ markers: [9] }), arrived))).toBe('샷 1개가 새로 들어와 뒤 컷과 그 위 클립 · 소리 · 마커를 옮겼어요.')
  })

  it('컷 · 위 줄 · 마커 · 소리가 모두 그대로면 알림을 띄우지 않는다', () => {
    // 왜: 정상 경로 고정 — 빈 곳에 다시 생긴 샷처럼 자리가 하나도 바뀌지 않으면 말할 것이 없다.
    expect(autoMoveNotice(snap(), snap(), { removed: 1, added: 1 })).toBeNull()
  })

  it('영상 없는 샷이 빠지고 샷이 새로 들어와 자리가 바뀌면 둘 다 말하고, 옮긴 것에 그 위 클립 · 소리 · 마커를 넣는다', () => {
    // 왜: 들어온 알림과 같은 말 — 빠진 쪽만 있을 때는 예전 저장본(빈 곳 없이 당겨지는 저장본)이라 위 줄 · 마커가 없어 지금 글 그대로다.
    const moved = snap({ cuts: new Map([['s1', 0], ['s3', 8]]) })
    expect(text(autoMoveNotice(snap(), moved, { removed: 1, added: 2 }))).toBe('영상 없는 샷 1개가 빠지고 샷 2개가 새로 들어와 뒤 컷과 그 위 클립 · 소리 · 마커를 옮겼어요.')
    expect(text(autoMoveNotice(snap(), moved, { removed: 1, added: 0 }))).toBe('영상 없는 샷 1개가 빠져 뒤 컷과 소리를 옮겼어요.')
  })
})
