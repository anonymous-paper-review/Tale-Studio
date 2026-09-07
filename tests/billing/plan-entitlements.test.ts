// 요금제에 따라 작업 시간과 연결 수, 내보내기, 좌석, 월별 Take를 정확히 보장한다 (v4 3_요금제 시트)
import { describe, expect, it } from 'vitest'
import { getPlanEntitlements } from '@/lib/plan-limits'

// v4 3_요금제 시트 사다리 회귀 — Contract 표를 그대로 옮긴다. 수치가 바뀌면 이 테스트가 먼저 깨져야 한다.
describe('getPlanEntitlements — v4 요금제별 사용 범위', () => {
  it('무료 요금제는 내보내기와 월별 Take를 제공하지 않는다', () => {
    expect(getPlanEntitlements('free')).toEqual({
      maxMinutesPerProject: 0,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 0,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('S1 요금제는 1분 작업과 월 16 Take를 제공한다', () => {
    expect(getPlanEntitlements('s1')).toEqual({
      maxMinutesPerProject: 1,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 16,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('S2 요금제는 2분 작업과 월 30 Take를 제공한다', () => {
    expect(getPlanEntitlements('s2')).toEqual({
      maxMinutesPerProject: 2,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 30,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('S5 요금제는 5분 작업과 월 60 Take를 제공한다', () => {
    expect(getPlanEntitlements('s5')).toEqual({
      maxMinutesPerProject: 5,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 60,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('S10 요금제는 10분 작업과 월 100 Take를 제공한다', () => {
    expect(getPlanEntitlements('s10')).toEqual({
      maxMinutesPerProject: 10,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 100,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('P10 요금제는 10분·2개 연결·월 150 Take와 내보내기를 제공한다', () => {
    expect(getPlanEntitlements('p10')).toEqual({
      maxMinutesPerProject: 10,
      maxLinkedProjects: 2,
      includedTakesPerMonth: 150,
      canExport: true,
      accountSeats: 3,
    })
  })

  it('P15 요금제는 15분·3개 연결·월 200 Take와 내보내기를 제공한다', () => {
    expect(getPlanEntitlements('p15')).toEqual({
      maxMinutesPerProject: 15,
      maxLinkedProjects: 3,
      includedTakesPerMonth: 200,
      canExport: true,
      accountSeats: 4,
    })
  })

  it('P20 요금제는 20분·3개 연결·월 360 Take와 내보내기를 제공한다', () => {
    expect(getPlanEntitlements('p20')).toEqual({
      maxMinutesPerProject: 20,
      maxLinkedProjects: 3,
      includedTakesPerMonth: 360,
      canExport: true,
      accountSeats: 5,
    })
  })

  it('P25 요금제는 25분·4개 연결·월 410 Take와 내보내기를 제공한다', () => {
    expect(getPlanEntitlements('p25')).toEqual({
      maxMinutesPerProject: 25,
      maxLinkedProjects: 4,
      includedTakesPerMonth: 410,
      canExport: true,
      accountSeats: 6,
    })
  })

  it('P30 요금제는 30분·4개 연결·월 710 Take와 내보내기를 제공한다', () => {
    expect(getPlanEntitlements('p30')).toEqual({
      maxMinutesPerProject: 30,
      maxLinkedProjects: 4,
      includedTakesPerMonth: 710,
      canExport: true,
      accountSeats: 8,
    })
  })

  it('알 수 없는 요금제는 무료 요금제 기준으로 처리한다', () => {
    expect(getPlanEntitlements('unknown-plan')).toEqual(getPlanEntitlements('free'))
    expect(getPlanEntitlements(null)).toEqual(getPlanEntitlements('free'))
    expect(getPlanEntitlements(undefined)).toEqual(getPlanEntitlements('free'))
    expect(getPlanEntitlements(42)).toEqual(getPlanEntitlements('free'))
  })
})
