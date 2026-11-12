// 운영 시험 계정(devtest@talestudio.art)은 관리자처럼 오래 쉬어도 자동으로 로그아웃되지 않는다 (2026-11-12 오너 "자동 로그아웃 끄기")
import { describe, expect, it } from 'vitest'
import { idleLogoutExempt } from '@/lib/idle-logout'

describe('운영 시험 계정의 자동 로그아웃', () => {
  it('devtest@talestudio.art 는 30분 넘게 쉬어도 자동으로 로그아웃되지 않는다', () => {
    // 왜: 오너 2026-11-12 "devtest도 admin과 같은 설정해놔줘(테이크 무한, 자동 로그아웃 끄기)" — 운영 시험 중 손을 놓아도 로그인 화면으로 튕기지 않게.
    expect(idleLogoutExempt('devtest@talestudio.art')).toBe(true)
    expect(idleLogoutExempt('  DevTest@TaleStudio.art ')).toBe(true)
  })
})
