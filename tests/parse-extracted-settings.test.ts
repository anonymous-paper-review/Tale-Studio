import { describe, expect, it } from 'vitest'
import { parseExtractedSettings } from '@/lib/parse-extracted-settings'

// C8: 어떤 형태로 JSON이 와도 reply(사용자 노출 텍스트)에는 JSON 원문이 새어나가면 안 된다.
const hasJsonLeak = (reply: string) =>
  /extractedSettings/.test(reply) || /```/.test(reply) || /\{\s*"/.test(reply)

describe('parseExtractedSettings (C8 JSON leak)', () => {
  it('trailing fenced json: extracts settings, reply is clean prose', () => {
    const text = '좋아요! 설정할게요.\n\n```json\n{"extractedSettings": {"genre": "thriller"}}\n```'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(reply).toBe('좋아요! 설정할게요.')
    expect(extractedSettings).toEqual({ genre: 'thriller' })
    expect(hasJsonLeak(reply)).toBe(false)
  })

  it('unfenced trailing json object does not leak', () => {
    const text = '정리했어요.\n{"extractedSettings": {"playtime": 30}}'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(reply).toBe('정리했어요.')
    expect(extractedSettings).toEqual({ playtime: 30 })
    expect(hasJsonLeak(reply)).toBe(false)
  })

  it('mid-message fenced json (text after the block) does not leak', () => {
    const text = '앞부분 설명.\n```json\n{"extractedSettings": {"genre": "drama"}}\n```\n그리고 뒷부분 코멘트.'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(hasJsonLeak(reply)).toBe(false)
    expect(reply).toContain('앞부분 설명')
    expect(reply).toContain('뒷부분 코멘트')
    expect(extractedSettings).toEqual({ genre: 'drama' })
  })

  it('multiple fenced blocks: none leak, last valid extracted wins', () => {
    const text = 'a\n```json\n{"extractedSettings": {"genre": "x"}}\n```\nb\n```json\n{"extractedSettings": {"genre": "y"}}\n```'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(hasJsonLeak(reply)).toBe(false)
    expect(extractedSettings).toEqual({ genre: 'y' })
  })

  it('malformed json inside fence does not leak (block stripped, settings empty)', () => {
    const text = '여기요.\n```json\n{"extractedSettings": {"genre": "thriller"  // broken\n```'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(hasJsonLeak(reply)).toBe(false)
    expect(reply).toBe('여기요.')
    expect(extractedSettings).toEqual({})
  })

  it('uppercase JSON fence label is handled', () => {
    const text = 'ok\n```JSON\n{"extractedSettings": {"format": "square_1:1"}}\n```'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(hasJsonLeak(reply)).toBe(false)
    expect(extractedSettings).toEqual({ format: 'square_1:1' })
  })

  it('unterminated fence (token cutoff) leaves no fence marker or json in reply', () => {
    const text = '여기 설정이에요.\n```json\n{"extractedSettings": {"genre": "noir"'
    const { reply, extractedSettings } = parseExtractedSettings(text)
    expect(reply).toBe('여기 설정이에요.')
    expect(hasJsonLeak(reply)).toBe(false)
    expect(reply).not.toContain('```')
    expect(extractedSettings).toEqual({})
  })

  it('plain reply with no json returns text untouched and empty settings', () => {
    const { reply, extractedSettings } = parseExtractedSettings('주인공은 어떤 사람인가요?')
    expect(reply).toBe('주인공은 어떤 사람인가요?')
    expect(extractedSettings).toEqual({})
  })
})
