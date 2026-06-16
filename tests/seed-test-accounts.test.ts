import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COUNT,
  MAX_COUNT,
  EMAIL_DOMAIN,
  genLocalPart,
  genEmail,
  genPassword,
  parseCount,
} from '../scripts/seed-test-accounts.mjs'

describe('parseCount', () => {
  it('defaults to 10 when no count is given', () => {
    expect(parseCount([])).toBe(DEFAULT_COUNT)
    expect(parseCount(['--other', 'x'])).toBe(DEFAULT_COUNT)
  })

  it('reads a positional integer', () => {
    expect(parseCount(['20'])).toBe(20)
    expect(parseCount(['3'])).toBe(3)
  })

  it('reads --count <n> and --count=<n>', () => {
    expect(parseCount(['--count', '7'])).toBe(7)
    expect(parseCount(['--count=42'])).toBe(42)
  })

  it('clamps above the max (100)', () => {
    expect(parseCount(['10000'])).toBe(MAX_COUNT)
    expect(parseCount(['--count', '500'])).toBe(MAX_COUNT)
  })

  it('rejects zero, negatives, NaN, and non-integers', () => {
    expect(() => parseCount(['0'])).toThrow()
    expect(() => parseCount(['-5'])).toThrow()
    expect(() => parseCount(['abc'])).toThrow()
    expect(() => parseCount(['2.5'])).toThrow()
  })
})

describe('genLocalPart / genEmail', () => {
  it('produces a test- prefixed 8-hex local part', () => {
    expect(genLocalPart()).toMatch(/^test-[0-9a-f]{8}$/)
  })

  it('produces an @tale.studio email', () => {
    const email = genEmail()
    expect(email).toMatch(/^test-[0-9a-f]{8}@tale\.studio$/)
    expect(email.endsWith(`@${EMAIL_DOMAIN}`)).toBe(true)
  })

  it('is unique across calls', () => {
    const set = new Set(Array.from({ length: 50 }, () => genEmail()))
    expect(set.size).toBe(50)
  })
})

describe('genPassword', () => {
  it('is a 16-char base64url string', () => {
    expect(genPassword()).toMatch(/^[A-Za-z0-9_-]{16}$/)
  })

  it('is unique across calls', () => {
    const set = new Set(Array.from({ length: 50 }, () => genPassword()))
    expect(set.size).toBe(50)
  })
})
