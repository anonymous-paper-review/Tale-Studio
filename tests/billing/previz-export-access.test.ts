// 요금제에 따라 previz 데이터 내보내기(화면 JPEG · 마스터 시트 · 이 단계 ZIP · 전체 프로젝트 ZIP)를 열거나 막는다
import { describe, expect, it } from 'vitest'
import { previzExportAccess } from '@/lib/billing/export-access'

function readPlan(plan: string, unlimited = false) {
  return { account: { plan, unlimited }, loading: false, error: null }
}

describe('previz 데이터 내보내기 요금제 판정', () => {
  it('Starter2(s2) 요금제 계정이면 previz 데이터 내보내기를 막는다', () => {
    // 왜: s2 코드를 받은 사람이 요금제 표에 ✗ 로 나온 내보내기를 그대로 쓰던 것을 막는다(오너 2026-10-27 "s2 내보내기 막으셈").
    expect(previzExportAccess(readPlan('s2'))).toBe('locked')
  })

  it('Producer10(p10) 요금제 계정이면 previz 데이터 내보내기를 연다', () => {
    // 왜: 요금제 표가 프로덕션부터 내보내기를 약속한다. p10 코드를 받은 사람은 지금처럼 받는다.
    expect(previzExportAccess(readPlan('p10'))).toBe('open')
  })

  it('무료 · s1 · s5 · s10 요금제 계정이면 previz 데이터 내보내기를 막는다', () => {
    // 왜: 요금제 표에서 이 넷도 s2 와 같이 내보내기가 ✗ 다. s2 만 막으면 표와 화면이 다시 어긋난다.
    for (const plan of ['free', 's1', 's5', 's10']) expect(previzExportAccess(readPlan(plan)), plan).toBe('locked')
  })

  it('p15 · p20 · p25 · p30 요금제 계정이면 previz 데이터 내보내기를 연다', () => {
    // 왜: 프로덕션 요금제 전부가 요금제 표에서 내보내기 ✓ 다.
    for (const plan of ['p15', 'p20', 'p25', 'p30']) expect(previzExportAccess(readPlan(plan)), plan).toBe('open')
  })

  it('관리자 · 시연 계정이면 스타터 요금제여도 previz 데이터 내보내기를 연다', () => {
    // 왜: 다음 화 만들기와 같은 기준이다. 시연 중에 내보내기가 잠기면 안 된다.
    expect(previzExportAccess(readPlan('s2', true))).toBe('open')
    expect(previzExportAccess(readPlan('free', true))).toBe('open')
  })

  it('알 수 없는 요금제 이름이면 previz 데이터 내보내기를 막는다', () => {
    // 왜: 요금제 이름이 잘못 들어가도 유료 기능이 새지 않게 한다. 고장: 결제 연동이 새 이름을 쓸 때.
    expect(previzExportAccess(readPlan('enterprise'))).toBe('locked')
  })

  it('요금제를 아직 읽지 못했으면 열지 않고 확인 중으로 둔다', () => {
    // 왜: 화면을 연 직후 요금제를 읽는 동안 스타터 계정이 잠깐 받아 가는 틈을 막는다.
    expect(previzExportAccess({ account: null, loading: true, error: null })).toBe('checking')
    expect(previzExportAccess({ account: null, loading: false, error: null })).toBe('checking')
  })

  it('요금제를 읽다가 실패했으면 열지 않고 실패로 알린다', () => {
    // 왜: 고장: 계정 정보 요청이 실패할 때(네트워크 끊김). 프로덕션 계정에게 "요금제가 낮다"고 잘못 말하지 않는다.
    expect(previzExportAccess({ account: null, loading: false, error: 'HTTP 500' })).toBe('failed')
  })

  it('다시 읽다가 실패해도 이미 읽은 요금제로 판정한다', () => {
    // 왜: 메뉴를 열 때마다 다시 읽는다. 한 번 실패했다고 방금까지 받던 p10 계정을 막지 않는다.
    expect(previzExportAccess({ account: { plan: 'p10', unlimited: false }, loading: false, error: 'HTTP 500' })).toBe('open')
  })
})
