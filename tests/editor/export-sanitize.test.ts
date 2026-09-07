import { describe, expect, it } from 'vitest'

import { PathAllocator, sanitizeSegment } from '@/lib/export/sanitize'

describe('sanitizeSegment red-team filesystem boundaries', () => {
  it('RT-01 normalizes NFC and collapses whitespace runs into single dashes', () => {
    expect(sanitizeSegment('Cafe\u0301   noir\tfinal\ncut')).toBe('Café-noir-final-cut')
  })

  it('RT-02 replaces reserved filesystem chars, path separators, and controls without dropping Unicode', () => {
    expect(sanitizeSegment('김민준<>:"/\\|?*\u0000\u001Fok')).toBe('김민준-ok')
    expect(sanitizeSegment('folder/sub\\name')).toBe('folder-sub-name')
  })

  it('RT-03 preserves Korean and Unicode letters/digits as first-class filename text', () => {
    expect(sanitizeSegment('김민준')).toBe('김민준')
    expect(sanitizeSegment('김민준 2화')).toBe('김민준-2화')
  })

  it('RT-04 prefixes Windows device names case-insensitively', () => {
    expect(sanitizeSegment('CON')).toBe('_CON')
    expect(sanitizeSegment('nul')).toBe('_nul')
    expect(sanitizeSegment('con.txt')).toBe('_con.txt')
    expect(sanitizeSegment('Com9')).toBe('_Com9')
    expect(sanitizeSegment('LPT1')).toBe('_LPT1')
  })

  it('RT-05 trims leading/trailing dash, dot, and space so Windows trailing-dot/space bans cannot leak', () => {
    expect(sanitizeSegment('  .-report final.  ')).toBe('report-final')
    expect(sanitizeSegment('draft. ')).toBe('draft')
  })

  it('RT-06 caps output to 80 code points after sanitizing', () => {
    const safe = sanitizeSegment(`${'가'.repeat(79)}🙂🙂`)

    expect(Array.from(safe)).toHaveLength(80)
    expect(safe).toBe(`${'가'.repeat(79)}🙂`)
  })

  it('RT-06b re-trims trailing dots and dashes left by the 80-code-point cap', () => {
    expect(sanitizeSegment(`${'a'.repeat(79)}-${'b'.repeat(10)}`)).toBe('a'.repeat(79))
    expect(sanitizeSegment(`${'가'.repeat(79)}.${'나'.repeat(10)}`)).toBe('가'.repeat(79))
  })

  it('RT-07 falls back to untitled when every character is unsafe or trimmed away', () => {
    expect(sanitizeSegment('')).toBe('untitled')
    expect(sanitizeSegment(' <>:"/\\|?* . ')).toBe('untitled')
  })
})

describe('PathAllocator red-team collision boundaries', () => {
  it('RT-08 dedupes identical file names in one directory before the extension', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('', 'base', 'md')).toBe('base.md')
    expect(allocator.file('', 'base', 'md')).toBe('base-2.md')
    expect(allocator.file('', 'base', 'md')).toBe('base-3.md')
  })

  it('RT-09 keeps identical names independent across different directories', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('producer', 'draft', 'txt')).toBe('producer/draft.txt')
    expect(allocator.file('writer', 'draft', 'txt')).toBe('writer/draft.txt')
  })

  it('RT-10 treats collisions case-insensitively while preserving the requested case', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('artist', 'Kim', 'png')).toBe('artist/Kim.png')
    expect(allocator.file('artist', 'kim', 'png')).toBe('artist/kim-2.png')
    expect(allocator.child('artist', '김민준')).toBe('artist/김민준')
    expect(allocator.child('artist', '김민준')).toBe('artist/김민준-2')
  })
})
