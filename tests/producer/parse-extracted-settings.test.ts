// 설정 형식이 답변에 드러나지 않으면서도 이야기 설정은 빠짐없이 반영된다 (C8)
import { describe, expect, it } from 'vitest'
import { parseExtractedSettings } from '@/lib/parse-extracted-settings'

// C8: 어떤 형태로 JSON이 와도 reply(사용자 노출 텍스트)에는 JSON 원문이 새어나가면 안 된다.
const hasJsonLeak = (reply: string) =>
  /extractedSettings/.test(reply) || /```/.test(reply) || /\{\s*"/.test(reply)

describe('parseExtractedSettings (C8 답변에는 설정 형식이 보이지 않음)', () => {
  it('답변 뒤에 설정 형식이 붙어도 사용자에게는 자연스러운 문장만 보여준다', () => {
    const text = '좋아요! 설정할게요.\n\n```json\n{"extractedSettings": {"genre": "thriller"}}\n```'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(reply).toBe('좋아요! 설정할게요.')
    expect(extractedSettings).toEqual({ genre: 'thriller' })
    expect(hasJsonLeak(reply)).toBe(false)
  })

  it('답변 뒤에 표시된 설정 내용이 사용자에게 드러나지 않는다', () => {
    const text = '정리했어요.\n{"extractedSettings": {"playtime": 30}}'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(reply).toBe('정리했어요.')
    expect(extractedSettings).toEqual({ playtime: 30 })
    expect(hasJsonLeak(reply)).toBe(false)
  })

  it('답변 중간에 설정 내용이 있어도 앞뒤 문장만 보여준다', () => {
    const text = '앞부분 설명.\n```json\n{"extractedSettings": {"genre": "drama"}}\n```\n그리고 뒷부분 코멘트.'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(hasJsonLeak(reply)).toBe(false)
    expect(reply).toContain('앞부분 설명')
    expect(reply).toContain('뒷부분 코멘트')
    expect(extractedSettings).toEqual({ genre: 'drama' })
  })

  it('설정 내용이 여러 번 와도 보이지 않고 마지막으로 올바른 내용만 반영한다', () => {
    const text = 'a\n```json\n{"extractedSettings": {"genre": "x"}}\n```\nb\n```json\n{"extractedSettings": {"genre": "y"}}\n```'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(hasJsonLeak(reply)).toBe(false)
    expect(extractedSettings).toEqual({ genre: 'y' })
  })

  it('잘못된 설정 내용이 섞여도 형식이 보이지 않고 설정은 비워 둔다', () => {
    const text = '여기요.\n```json\n{"extractedSettings": {"genre": "thriller"  // broken\n```'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(hasJsonLeak(reply)).toBe(false)
    expect(reply).toBe('여기요.')
    expect(extractedSettings).toEqual({})
  })

  it('설정 표시가 대문자로 적혀도 내용을 알아본다', () => {
    const text = 'ok\n```JSON\n{"extractedSettings": {"format": "square_1:1"}}\n```'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(hasJsonLeak(reply)).toBe(false)
    expect(extractedSettings).toEqual({ format: 'square_1:1' })
  })

  it('설정 표시가 끝나지 않아도 흔적 없이 안내 문장만 보여준다', () => {
    const text = '여기 설정이에요.\n```json\n{"extractedSettings": {"genre": "noir"'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(reply).toBe('여기 설정이에요.')
    expect(hasJsonLeak(reply)).toBe(false)
    expect(reply).not.toContain('```')
    expect(extractedSettings).toEqual({})
  })

  it('설정 내용이 없으면 답변은 그대로 보여주고 설정은 비워 둔다', () => {
    const { reply, extractedSettings } = parseExtractedSettings('주인공은 어떤 사람인가요?')
    expect(reply).toBe('주인공은 어떤 사람인가요?')
    expect(extractedSettings).toEqual({})
  })
})
