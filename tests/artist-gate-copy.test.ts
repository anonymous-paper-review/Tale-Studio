import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { KO as koMessages } from '@/lib/i18n/messages-ko'

// #stale-gate (2026-08-26) — 오너 실측 신고: 실패 0건인데 Artist 탭에 "생성 실패"가 떴다.
//   원인은 stalled(오래 대기)와 failed(진짜 실패)를 한 문구로 뭉친 것. 사용자는 사고로 오인한다.
//   이 시험은 둘이 다시 합쳐지는 회귀를 막는다.

const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
const lockPoll = readFileSync('src/hooks/use-artist-lock-poll.ts', 'utf8')
const writerStatus = readFileSync('src/lib/writer/use-writer-status.ts', 'utf8')

describe('Artist 게이트 문구 — 대기와 실패는 다른 말이어야 한다', () => {
  it('stalled 와 failed 를 한 조건으로 묶어 같은 문구를 쓰지 않는다', () => {
    // 되돌아간 형태: artistImagesFailed || artistImagesStalled ? t('Generation failed · retry')
    const merged = /artistImagesFailed\s*\|\|\s*artistImagesStalled\s*\n?\s*\?\s*t\('Generation failed/
    expect(merged.test(sidebar)).toBe(false)
  })

  it('지연 전용 문구가 존재하고 한국어 사전에 등록돼 있다', () => {
    expect(sidebar).toContain('Taking longer than usual · retry')
    expect(koMessages['Taking longer than usual · retry']).toBeTruthy()
    expect(koMessages['Taking longer than usual · retry']).not.toContain('실패')
  })

  it('실패 문구는 그대로 실패라고 말한다', () => {
    expect(koMessages['Generation failed · retry']).toContain('실패')
  })
})

describe('게이트 상태 알림 — 조용히 죽지 않는다', () => {
  it('실패·지연 판정 순간 토스트를 띄운다', () => {
    expect(lockPoll).toContain('toast.error')
    expect(lockPoll).toContain('toast.warning')
    // 중복 억제: 같은 토스트 id 로 묶어 폴러가 여러 번 서도 화면이 덮이지 않게
    expect(lockPoll).toContain("id: 'artist-gate-state'")
  })

  it('토스트 문구가 한국어 사전에 있다', () => {
    expect(koMessages['Some image generations failed. Click the Artist tab to retry.']).toBeTruthy()
    expect(koMessages['Image generation is taking longer than usual. Click the Artist tab to retry.']).toBeTruthy()
  })
})

describe('복귀 시 자가복구 — 새로고침이 유일한 처방이면 안 된다', () => {
  it('Artist 게이트 폴러가 탭 복귀에 재조회한다', () => {
    expect(lockPoll).toContain("addEventListener('visibilitychange'")
    expect(lockPoll).toContain("addEventListener('focus'")
    // 정리도 반드시 — 리스너 누수는 프로젝트 전환 때 유령 폴을 만든다
    expect(lockPoll).toContain("removeEventListener('visibilitychange'")
    expect(lockPoll).toContain("removeEventListener('focus'")
  })

  it('Writer 진행 폴러도 탭 복귀에 재조회한다', () => {
    expect(writerStatus).toContain("addEventListener('visibilitychange'")
    expect(writerStatus).toContain("removeEventListener('focus'")
  })

  it('화면을 계속 보고 있어도 매달린 요청을 끊고 다음 폴링을 예약한다', () => {
    expect(lockPoll).toContain('ARTIST_LOCK_REQUEST_TIMEOUT_MS')
    expect(lockPoll).toContain('requestController?.abort()')
    expect(writerStatus).toContain('WRITER_STATUS_REQUEST_TIMEOUT_MS')
    expect(writerStatus).toContain('requestController?.abort()')
  })
})
