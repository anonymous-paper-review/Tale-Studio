// 이전 생성이 끝나지 않아도 다시 만들기를 누르면 막힌 작업을 정리해 계속 진행한다 (#a1-inflight-block 2026-08-27 오너 신고 A1)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { describeFinalizeError } from '@/lib/fal/error-evidence'
import { KO as koMessages } from '@/lib/i18n/messages-ko'

// #a1-inflight-block (2026-08-27) — 오너 신고 A1 "하나는 재생성 불가" 재현·수리.
//
// 재현으로 확인한 사슬:
//   1) webhook 유실로 queued 로 남은 잡이 그 샷의 in_flight 가드를 계속 켠다
//   2) 가드가 force 보다 먼저 검사돼 사람이 눌러도 skip — 응답은 ok:true, 제출 0
//   3) 클라는 in_flight skip 을 안 알리고 낙관적 스피너만 남긴다 → "눌러도 반응 없음"
//   4) 회수로 풀려던 경로도 fal 404 의 빈 message 때문에 종결 가드에 걸려 실패
// 네 지점 중 하나라도 되돌아가면 같은 증상이 부활한다.

const route = readFileSync('src/app/api/writer/rough-storyboard/route.ts', 'utf8')
const view = readFileSync('src/features/writer/rough-storyboard-view.tsx', 'utf8')
const reconcile = readFileSync('src/lib/fal/reconcile.ts', 'utf8')

describe('다시 만들기는 이전 작업에 영구히 막히지 않는다', () => {
  it('특정 장면을 다시 만들면 끝나지 않은 작업을 확인한 뒤 제출한다', () => {
    expect(route).toContain('inFlightJobByShot')
    expect(route).toContain('reconcileJobFromFal')
    // 회수는 잡당 조회+finalize 라 무겁다 — maxDuration 안에서 끝나게 상한이 있어야 한다
    expect(route).toContain('RECONCILE_ON_FORCE_CAP')
  })

  it('끝난 이전 작업은 목록에서 빠져 같은 요청으로 다시 만든다', () => {
    expect(route).toMatch(/if \(after\.status !== 'queued'\)[\s\S]{0,160}inFlight\.delete/)
  })

  it('이전 작업 확인에 실패해도 중복 작업은 계속 막는다', () => {
    expect(route).toContain('[rough-storyboard] force reconcile failed:')
  })
})

describe('서비스에서 찾을 수 없는 오류도 이유를 남겨 마무리한다', () => {
  it('서비스 오류에 설명이 없어도 실패 이유를 만들어 남긴다', () => {
    expect(reconcile).toContain('terminalizeJob(job, describeFinalizeError(error))')
  })

  it('오류 설명이 비어도 실패 이유를 남기고 마무리한다', () => {
    // fal ApiError 재현: message 빈 문자열 + status 404
    const apiError = Object.assign(new Error(''), { name: 'ApiError', status: 404 })
    const evidence = describeFinalizeError(apiError)
    expect(evidence.trim()).not.toBe('')
    expect(evidence).toContain('404')
  })
})

describe('다시 만들기가 막히면 멈춘 이유를 알려준다', () => {
  it('다시 만들기가 모두 막히면 진행 표시를 멈추고 안내한다', () => {
    expect(view).toMatch(/if \(force && !auto && submitted\.length === 0\)/)
    expect(view).toContain("x.reason === 'in_flight'")
    expect(view).toContain('Still finishing the previous generation for {count} panels')
  })

  it('다시 만들기가 막혔다는 안내를 한국어로 보여준다', () => {
    const key = 'Still finishing the previous generation for {count} panels. Try again in a moment.'
    expect(koMessages[key]).toBeTruthy()
  })

  it('자동으로 시작한 작업은 안내를 띄우지 않고 진행 표시를 유지한다', () => {
    // auto 를 제외하지 않으면 진입 자동 생성마다 토스트가 뜨고, 실제 생성 중인 샷의 스피너까지 지운다
    expect(view).not.toMatch(/if \(force && submitted\.length === 0\)/)
  })
})
