// #ledger: Director 누락 목록 — 보여주는 샷이 없는 상태 변화만 사람 말 라벨로.
import { describe, it, expect } from 'vitest'
import { ledgerGapLabels, getDirectorGaps } from '@/lib/completeness'

describe('ledgerGapLabels', () => {
  const ledgers = {
    sc_01: {
      transitions: [
        { character_id: 'char_2', beat: 0, kind: 'posture', from: 'lying', to: 'standing', covered: false },
        { character_id: 'char', beat: 0, kind: 'posture', from: 'lying', to: 'standing', covered: true },
        { character_id: 'char_3', beat: 3, kind: 'move', from: '-2,-3', to: '-0.5,-1', covered: false, distance_m: 2.5 },
      ],
    },
  }
  it('덮이지 않은 변화만, 씬·비트·인물·변화를 담아', () => {
    const labels = ledgerGapLabels(ledgers, (id) => ({ char: '용족 수장', char_2: '요정 수장', char_3: '수인 수장' })[id] ?? id)
    expect(labels).toEqual([
      'sc_01 비트 0: 요정 수장 누움→섬 — 보여주는 샷 없음',
      'sc_01 비트 3: 수인 수장 이동 2.5m — 보여주는 샷 없음',
    ])
  })
  it('getDirectorGaps 가 라벨을 갭으로 앞세운다', () => {
    const gaps = getDirectorGaps([], { hasCharacterImage: () => true, characterName: (id) => id, ledgerGaps: ['x'] })
    expect(gaps).toEqual([{ label: 'x' }])
    expect(ledgerGapLabels(null, (id) => id)).toEqual([])
  })
})
