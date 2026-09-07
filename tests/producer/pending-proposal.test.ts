// 진행 승인을 알아듣고, 확인할 작업과 영향 내용을 잃지 않고 읽기 쉽게 보여준다
import { describe, expect, it } from 'vitest'
import {
  createPendingProposal,
  formatProposalImpact,
  isApprovalUtterance,
} from '@/lib/pending-proposal'

describe('isApprovalUtterance', () => {
  it('짧은 한국어·영어 승인 말이면 진행하겠다는 뜻으로 알아듣는다', () => {
    expect(isApprovalUtterance('진행해줘')).toBe(true)
    expect(isApprovalUtterance('승인')).toBe(true)
    expect(isApprovalUtterance('ok')).toBe(true)
    expect(isApprovalUtterance('go ahead')).toBe(true)
  })

  it('하지 말라는 말이나 다른 질문은 승인으로 보지 않는다', () => {
    expect(isApprovalUtterance('진행하지마')).toBe(false)
    expect(isApprovalUtterance('나중에 하자')).toBe(false)
    expect(isApprovalUtterance('no')).toBe(false)
    expect(isApprovalUtterance('상태 알려줘')).toBe(false)
  })
})

describe('보류 작업 처리 규칙', () => {
  it('확인할 작업 내용을 다시 저장해도 그대로 유지된다', () => {
    const proposal = createPendingProposal({
      id: 'proposal-test',
      createdAt: '2026-06-13T00:00:00.000Z',
      stage: 'artist',
      kind: 'artistRegenerateCharacterView',
      target: '아라 main image',
      action: 'Regenerate main image',
      impact: ['generation cost', 'selected image may change after completion'],
      payload: { characterId: 'char_a', view: 'main' },
    })

    expect(JSON.parse(JSON.stringify(proposal))).toEqual(proposal)
  })

  it('확인 카드의 영향 내용을 읽기 쉽게 한 줄씩 보여준다', () => {
    expect(formatProposalImpact([' Writer stale ', '', 'Artist image stale'])).toBe(
      '• Writer stale\n• Artist image stale',
    )
  })
})
