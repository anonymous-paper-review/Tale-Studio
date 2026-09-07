import { describe, it, expect } from 'vitest'
import { shouldOfferHandoffNudge } from '@/lib/handoff-nudge'

// #handoff-once 2026-08-12 — "한 번 수락하면 다시는 안 뜨게 (DB에 기록)".
// 새 플래그가 아니라 reachedStage(projects.current_stage 복원값)가 진실:
// 다음 스테이지에 이미 도달했다 = 그 핸드오프는 수락됐다.

describe('shouldOfferHandoffNudge', () => {
  it('아직 그 스테이지까지만 도달했으면 띄운다', () => {
    expect(shouldOfferHandoffNudge('producer', 'producer')).toBe(true)
    expect(shouldOfferHandoffNudge('writer', 'writer')).toBe(true)
    expect(shouldOfferHandoffNudge('director', 'director')).toBe(true)
  })

  it('다음 스테이지에 이미 도달했으면(수락됨) 다시 띄우지 않는다', () => {
    expect(shouldOfferHandoffNudge('producer', 'writer')).toBe(false)
    expect(shouldOfferHandoffNudge('producer', 'editor')).toBe(false)
    expect(shouldOfferHandoffNudge('writer', 'artist')).toBe(false)
    expect(shouldOfferHandoffNudge('artist', 'director')).toBe(false)
    expect(shouldOfferHandoffNudge('director', 'editor')).toBe(false)
  })

  it('reached 가 from 보다 뒤(비정상)여도 안전하게 띄운다', () => {
    expect(shouldOfferHandoffNudge('artist', 'producer')).toBe(true)
  })
})
