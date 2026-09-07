// 파일 이름에 위험한 문자가 들어와도 누구나 쓸 수 있는 안전한 이름으로 바꾼다
import { describe, expect, it } from 'vitest'

import { PathAllocator, sanitizeSegment } from '@/lib/export/sanitize'

describe('파일 이름에 위험한 문자가 들어오면 안전한 이름으로 바꾼다', () => {
  it('공백과 글자 조합이 섞인 이름을 넣으면 한 줄의 이름으로 정리한다 (RT-01)', () => {
    expect(sanitizeSegment('Cafe\u0301   noir\tfinal\ncut')).toBe('Café-noir-final-cut')
  })

  it('파일 이름에 금지된 기호가 섞여도 안전하게 바꾸고 다른 글자는 보존한다 (RT-02)', () => {
    expect(sanitizeSegment('김민준<>:"/\\|?*\u0000\u001Fok')).toBe('김민준-ok')
    expect(sanitizeSegment('folder/sub\\name')).toBe('folder-sub-name')
  })

  it('한국어와 여러 언어의 글자·숫자가 든 이름을 넣으면 그대로 파일 이름으로 쓴다 (RT-03)', () => {
    expect(sanitizeSegment('김민준')).toBe('김민준')
    expect(sanitizeSegment('김민준 2화')).toBe('김민준-2화')
  })

  it('윈도우에서 사용할 수 없는 예약 이름을 넣으면 안전한 이름으로 바꾼다 (RT-04)', () => {
    expect(sanitizeSegment('CON')).toBe('_CON')
    expect(sanitizeSegment('nul')).toBe('_nul')
    expect(sanitizeSegment('con.txt')).toBe('_con.txt')
    expect(sanitizeSegment('Com9')).toBe('_Com9')
    expect(sanitizeSegment('LPT1')).toBe('_LPT1')
  })

  it('이름 앞뒤에 점이나 빈칸이 있으면 안전한 이름으로 다듬는다 (RT-05)', () => {
    expect(sanitizeSegment('  .-report final.  ')).toBe('report-final')
    expect(sanitizeSegment('draft. ')).toBe('draft')
  })

  it('80글자를 넘는 이름을 넣으면 80글자 안으로 줄인다 (RT-06)', () => {
    const safe = sanitizeSegment(`${'가'.repeat(79)}🙂🙂`)

    expect(Array.from(safe)).toHaveLength(80)
    expect(safe).toBe(`${'가'.repeat(79)}🙂`)
  })

  it('80글자에서 잘린 끝에 점이나 줄표가 남으면 없앤다 (RT-06b)', () => {
    expect(sanitizeSegment(`${'a'.repeat(79)}-${'b'.repeat(10)}`)).toBe('a'.repeat(79))
    expect(sanitizeSegment(`${'가'.repeat(79)}.${'나'.repeat(10)}`)).toBe('가'.repeat(79))
  })

  it('쓸 수 있는 글자가 하나도 없으면 untitled로 표시한다 (RT-07)', () => {
    expect(sanitizeSegment('')).toBe('untitled')
    expect(sanitizeSegment(' <>:"/\\|?* . ')).toBe('untitled')
  })
})

describe('같은 폴더의 파일 이름이 겹치면 구분해서 저장한다', () => {
  it('한 폴더에 같은 파일을 여러 번 만들면 이름 뒤에 번호를 붙여 구분한다 (RT-08)', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('', 'base', 'md')).toBe('base.md')
    expect(allocator.file('', 'base', 'md')).toBe('base-2.md')
    expect(allocator.file('', 'base', 'md')).toBe('base-3.md')
  })

  it('서로 다른 폴더의 같은 파일 이름은 각각 그대로 쓴다 (RT-09)', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('producer', 'draft', 'txt')).toBe('producer/draft.txt')
    expect(allocator.file('writer', 'draft', 'txt')).toBe('writer/draft.txt')
  })

  it('대소문자만 다른 같은 이름이 겹치면 요청한 표기를 살려 번호를 붙인다 (RT-10)', () => {
    const allocator = new PathAllocator()

    expect(allocator.file('artist', 'Kim', 'png')).toBe('artist/Kim.png')
    expect(allocator.file('artist', 'kim', 'png')).toBe('artist/kim-2.png')
    expect(allocator.child('artist', '김민준')).toBe('artist/김민준')
    expect(allocator.child('artist', '김민준')).toBe('artist/김민준-2')
  })
})
