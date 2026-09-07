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

describe('force 재생성은 좀비 잡에 영구히 막히지 않는다', () => {
  it('force + 특정 샷이면 막고 있는 잡을 fal 진실로 회수한다', () => {
    expect(route).toContain('inFlightJobByShot')
    expect(route).toContain('reconcileJobFromFal')
    // 회수는 잡당 조회+finalize 라 무겁다 — maxDuration 안에서 끝나게 상한이 있어야 한다
    expect(route).toContain('RECONCILE_ON_FORCE_CAP')
  })

  it('회수로 종결된 샷은 in_flight 집합에서 빠져 같은 요청에서 제출된다', () => {
    expect(route).toMatch(/if \(after\.status !== 'queued'\)[\s\S]{0,160}inFlight\.delete/)
  })

  it('회수 실패는 삼키고 기존 중복 방지는 유지한다', () => {
    expect(route).toContain('[rough-storyboard] force reconcile failed:')
  })
})

describe('provider 404 는 사유를 채워 종결한다', () => {
  it('reconcile 이 원본 빈 message 대신 합성 증거를 넘긴다', () => {
    expect(reconcile).toContain('terminalizeJob(job, describeFinalizeError(error))')
  })

  it('message 가 비어도 status 가 남아 종결 가드를 통과한다', () => {
    // fal ApiError 재현: message 빈 문자열 + status 404
    const apiError = Object.assign(new Error(''), { name: 'ApiError', status: 404 })
    const evidence = describeFinalizeError(apiError)
    expect(evidence.trim()).not.toBe('')
    expect(evidence).toContain('404')
  })
})

describe('막힌 재생성은 조용히 죽지 않는다', () => {
  it('클릭 유래(force) 요청이 전부 막히면 스피너를 풀고 안내한다', () => {
    expect(view).toMatch(/if \(force && !auto && submitted\.length === 0\)/)
    expect(view).toContain("x.reason === 'in_flight'")
    expect(view).toContain('Still finishing the previous generation for {count} panels')
  })

  it('안내 문구가 한국어 사전에 있다', () => {
    const key = 'Still finishing the previous generation for {count} panels. Try again in a moment.'
    expect(koMessages[key]).toBeTruthy()
  })

  it('자동 경로는 여전히 조용하다 — 진짜 생성 중 표시를 지우지 않는다', () => {
    // auto 를 제외하지 않으면 진입 자동 생성마다 토스트가 뜨고, 실제 생성 중인 샷의 스피너까지 지운다
    expect(view).not.toMatch(/if \(force && submitted\.length === 0\)/)
  })
})
