// 생성 화면에서 Artist의 오래 걸린 생성과 진짜 실패를 구분해 사용자가 다음 행동을 알 수 있게 한다 (#stale-gate 2026-08-26)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { KO as koMessages } from '@/lib/i18n/messages-ko'

// #stale-gate (2026-08-26) — 오너 실측 신고: 실패 0건인데 Artist 탭에 "생성 실패"가 떴다.
//   원인은 stalled(오래 대기)와 failed(진짜 실패)를 한 문구로 뭉친 것. 사용자는 사고로 오인한다.
//   이 시험은 둘이 다시 합쳐지는 회귀를 막는다.

const sidebar = readFileSync('src/components/layout/sidebar.tsx', 'utf8')
const lockPoll = readFileSync('src/hooks/use-artist-lock-poll.ts', 'utf8')
const writerStatus = readFileSync('src/lib/writer/use-writer-status.ts', 'utf8')
const queueRehydrate = readFileSync('src/features/director/hooks/use-queue-rehydrate.ts', 'utf8')
const activeRoute = readFileSync('src/app/api/generation/active/route.ts', 'utf8')

describe('Artist 안내 문구 — 오래 걸림과 실패를 서로 다르게 알린다', () => {
  it('오래 걸린 생성과 실패한 생성을 한 문구로 합치지 않는다', () => {
    // 되돌아간 형태: artistImagesFailed || artistImagesStalled ? t('Generation failed · retry')
    const merged = /artistImagesFailed\s*\|\|\s*artistImagesStalled\s*\n?\s*\?\s*t\('Generation failed/
    expect(merged.test(sidebar)).toBe(false)
  })

  it('오래 걸림 전용 안내가 있고 한국어로 표시된다', () => {
    expect(sidebar).toContain('Taking longer than usual · retry')
    expect(koMessages['Taking longer than usual · retry']).toBeTruthy()
    expect(koMessages['Taking longer than usual · retry']).not.toContain('실패')
  })

  it('실패한 생성은 실패라고 분명히 알린다', () => {
    expect(koMessages['Generation failed · retry']).toContain('실패')
  })
})

describe('Director 밖에서 끝난 작업도 다시 들어오면 알려준다', () => {
  it('Director로 돌아오면 최근 완료됐지만 아직 반영하지 않은 작업을 찾아 알린다', () => {
    expect(queueRehydrate).toContain('fetchUnreflectedCompletedJobs(projectId)')
    expect(queueRehydrate).toContain('reflectedDirectorJobs(')
    expect(queueRehydrate).toContain('hasWriterShotNodes')
    expect(queueRehydrate).toContain("'director-canvas-reentry'")
    expect(queueRehydrate).toContain('hydrateFromDb(projectId)')
  })

  it('추가 완료 확인은 돌아올 때 한 번만 하고 평소 주기 확인에는 섞지 않는다', () => {
    expect(activeRoute).toContain("get('includeUnreflected') !== '1'")
    expect(activeRoute).toContain(".eq('event', 'ui_reflected')")
  })
})

describe('생성 상태 안내 — 문제가 생겨도 조용히 사라지지 않는다', () => {
  it('실패하거나 오래 걸리면 화면에 안내를 띄운다', () => {
    expect(lockPoll).toContain('toast.error')
    expect(lockPoll).toContain('toast.warning')
    // 중복 억제: 같은 토스트 id 로 묶어 폴러가 여러 번 서도 화면이 덮이지 않게
    expect(lockPoll).toContain("id: 'artist-gate-state'")
  })

  it('화면 안내 문구가 한국어로 준비돼 있다', () => {
    expect(koMessages['Some image generations failed. Click the Artist tab to retry.']).toBeTruthy()
    expect(koMessages['Image generation is taking longer than usual. Click the Artist tab to retry.']).toBeTruthy()
  })
})

describe('탭으로 돌아오면 생성 상태를 스스로 다시 확인한다', () => {
  it('Artist 화면은 탭으로 돌아오면 상태를 다시 확인한다', () => {
    expect(lockPoll).toContain("addEventListener('visibilitychange'")
    expect(lockPoll).toContain("addEventListener('focus'")
    // 정리도 반드시 — 리스너 누수는 프로젝트 전환 때 유령 폴을 만든다
    expect(lockPoll).toContain("removeEventListener('visibilitychange'")
    expect(lockPoll).toContain("removeEventListener('focus'")
  })

  it('Writer 화면도 탭으로 돌아오면 상태를 다시 확인한다', () => {
    expect(writerStatus).toContain("addEventListener('visibilitychange'")
    expect(writerStatus).toContain("removeEventListener('focus'")
  })

  it('화면을 계속 보고 있어도 오래 걸린 확인을 정리하고 다음 확인을 예약한다', () => {
    expect(lockPoll).toContain('ARTIST_LOCK_REQUEST_TIMEOUT_MS')
    expect(lockPoll).toContain('requestController?.abort()')
    expect(writerStatus).toContain('WRITER_STATUS_REQUEST_TIMEOUT_MS')
    expect(writerStatus).toContain('requestController?.abort()')
  })
})
