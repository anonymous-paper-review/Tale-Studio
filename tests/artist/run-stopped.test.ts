// 이어 만들던 실행이 멈췄으면 Artist 카드 화면 위에도 멈춘 이유와 [이어서 다시 시도]를 보인다 (리뉴얼 1차 검토 2026-10-19)
import { describe, expect, it } from 'vitest'
import { artistRunStopped } from '@/lib/artist/breakdown'

describe('Artist 화면의 이어서 다시 시도', () => {
  it('이어 만들던 실행이 멈췄으면 카드가 보여도 이어서 다시 시도를 보인다', () => {
    // 왜: 인물 카드가 먼저 들어온 프로젝트는 실패해도 카드 화면이 열려 멈춘 줄 모르고, 다시 시도할 곳도 없었다.
    expect(artistRunStopped({ draftRun: false, status: { pipeline_failed: true } })).toBe(true)
  })

  it('아직 [만들기] 전인 산문 초안 실행에는 보이지 않는다', () => {
    // 왜: 초안 실패는 Writer 화면의 [다시 시도]가 맡는다 — Artist 는 아직 목록 화면이다.
    expect(artistRunStopped({ draftRun: true, status: { pipeline_failed: true } })).toBe(false)
  })

  it('실행이 멈추지 않았으면 보이지 않는다', () => {
    // 왜: 정상 경로 고정.
    expect(artistRunStopped({ draftRun: false, status: { pipeline_failed: false } })).toBe(false)
    expect(artistRunStopped({ draftRun: false, status: null })).toBe(false)
  })
})
