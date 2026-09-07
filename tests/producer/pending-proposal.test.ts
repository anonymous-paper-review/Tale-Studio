import { describe, expect, it } from 'vitest'
import {
  createPendingProposal,
  formatProposalImpact,
  isApprovalUtterance,
} from '@/lib/pending-proposal'

describe('isApprovalUtterance', () => {
  it('accepts compact Korean and English approvals', () => {
    expect(isApprovalUtterance('진행해줘')).toBe(true)
    expect(isApprovalUtterance('승인')).toBe(true)
    expect(isApprovalUtterance('ok')).toBe(true)
    expect(isApprovalUtterance('go ahead')).toBe(true)
  })

  it('rejects negative or unrelated messages', () => {
    expect(isApprovalUtterance('진행하지마')).toBe(false)
    expect(isApprovalUtterance('나중에 하자')).toBe(false)
    expect(isApprovalUtterance('no')).toBe(false)
    expect(isApprovalUtterance('상태 알려줘')).toBe(false)
  })
})

describe('PendingProposal helpers', () => {
  it('creates serializable proposal payloads', () => {
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

  it('formats impact bullets for proposal cards', () => {
    expect(formatProposalImpact([' Writer stale ', '', 'Artist image stale'])).toBe(
      '• Writer stale\n• Artist image stale',
    )
  })
})
