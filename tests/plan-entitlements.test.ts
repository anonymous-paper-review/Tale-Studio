import { describe, expect, it } from 'vitest'
import { getPlanEntitlements } from '@/lib/plan-limits'

// v4 3_요금제 시트 사다리 회귀 — Contract 표를 그대로 옮긴다. 수치가 바뀌면 이 테스트가 먼저 깨져야 한다.
describe('getPlanEntitlements — v4 요금제 사다리', () => {
  it('free', () => {
    expect(getPlanEntitlements('free')).toEqual({
      maxMinutesPerProject: 0,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 0,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('s1', () => {
    expect(getPlanEntitlements('s1')).toEqual({
      maxMinutesPerProject: 1,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 16,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('s2', () => {
    expect(getPlanEntitlements('s2')).toEqual({
      maxMinutesPerProject: 2,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 30,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('s5', () => {
    expect(getPlanEntitlements('s5')).toEqual({
      maxMinutesPerProject: 5,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 60,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('s10', () => {
    expect(getPlanEntitlements('s10')).toEqual({
      maxMinutesPerProject: 10,
      maxLinkedProjects: 1,
      includedTakesPerMonth: 100,
      canExport: false,
      accountSeats: 1,
    })
  })

  it('p10', () => {
    expect(getPlanEntitlements('p10')).toEqual({
      maxMinutesPerProject: 10,
      maxLinkedProjects: 2,
      includedTakesPerMonth: 150,
      canExport: true,
      accountSeats: 3,
    })
  })

  it('p15', () => {
    expect(getPlanEntitlements('p15')).toEqual({
      maxMinutesPerProject: 15,
      maxLinkedProjects: 3,
      includedTakesPerMonth: 200,
      canExport: true,
      accountSeats: 4,
    })
  })

  it('p20', () => {
    expect(getPlanEntitlements('p20')).toEqual({
      maxMinutesPerProject: 20,
      maxLinkedProjects: 3,
      includedTakesPerMonth: 360,
      canExport: true,
      accountSeats: 5,
    })
  })

  it('p25', () => {
    expect(getPlanEntitlements('p25')).toEqual({
      maxMinutesPerProject: 25,
      maxLinkedProjects: 4,
      includedTakesPerMonth: 410,
      canExport: true,
      accountSeats: 6,
    })
  })

  it('p30', () => {
    expect(getPlanEntitlements('p30')).toEqual({
      maxMinutesPerProject: 30,
      maxLinkedProjects: 4,
      includedTakesPerMonth: 710,
      canExport: true,
      accountSeats: 8,
    })
  })

  it('미지 plan은 free로 떨어진다', () => {
    expect(getPlanEntitlements('unknown-plan')).toEqual(getPlanEntitlements('free'))
    expect(getPlanEntitlements(null)).toEqual(getPlanEntitlements('free'))
    expect(getPlanEntitlements(undefined)).toEqual(getPlanEntitlements('free'))
    expect(getPlanEntitlements(42)).toEqual(getPlanEntitlements('free'))
  })
})
