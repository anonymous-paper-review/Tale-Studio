// 테스트 계정을 요청한 수만큼 안전한 주소와 비밀번호로 만든다
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  EMAIL_DOMAIN,
  genLocalPart,
  genEmail,
  genPassword,
  parseCount,
} from '../../scripts/seed-test-accounts.mjs'

describe('parseCount', () => {
  it('개수를 입력하지 않으면 10개를 만든다', () => {
    expect(parseCount([])).toBe(DEFAULT_COUNT)
    expect(parseCount(['--other', 'x'])).toBe(DEFAULT_COUNT)
  })

  it('개수를 숫자로 입력하면 해당 개수를 사용한다', () => {
    expect(parseCount(['20'])).toBe(20)
    expect(parseCount(['3'])).toBe(3)
  })

  it('개수 설정에 숫자를 넣으면 해당 개수를 사용한다', () => {
    expect(parseCount(['--count', '7'])).toBe(7)
    expect(parseCount(['--count=42'])).toBe(42)
  })

  it('최대 100개를 넘겨도 100개까지만 만든다', () => {
    expect(parseCount(['10000'])).toBe(MAX_COUNT)
    expect(parseCount(['--count', '500'])).toBe(MAX_COUNT)
  })

  it('0 이하이거나 정수가 아닌 개수는 거부한다', () => {
    expect(() => parseCount(['0'])).toThrow()
    expect(() => parseCount(['-5'])).toThrow()
    expect(() => parseCount(['abc'])).toThrow()
    expect(() => parseCount(['2.5'])).toThrow()
  })
})

describe('genLocalPart / genEmail', () => {
  it('test-로 시작하는 8자리 영문 숫자 계정을 만든다', () => {
    expect(genLocalPart()).toMatch(/^test-[0-9a-f]{8}$/)
  })

  it('@tale.studio 주소를 만든다', () => {
    const email = genEmail()
    expect(email).toMatch(/^test-[0-9a-f]{8}@tale\.studio$/)
    expect(email.endsWith(`@${EMAIL_DOMAIN}`)).toBe(true)
  })

  it('여러 번 만들어도 계정 주소가 겹치지 않는다', () => {
    const set = new Set(Array.from({ length: 50 }, () => genEmail()))
    expect(set.size).toBe(50)
  })
})

describe('genPassword', () => {
  it('비밀번호는 16자리 안전한 문자로 만든다', () => {
    expect(genPassword()).toMatch(/^[A-Za-z0-9_-]{16}$/)
  })

  it('여러 번 만들어도 비밀번호가 겹치지 않는다', () => {
    const set = new Set(Array.from({ length: 50 }, () => genPassword()))
    expect(set.size).toBe(50)
  })
})
