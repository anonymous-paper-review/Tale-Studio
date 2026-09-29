// 설정 형식이 답변에 드러나지 않으면서도 이야기 설정은 빠짐없이 반영된다 (C8)
import { describe, expect, it } from 'vitest'
import { parseExtractedSettings } from '@/lib/parse-extracted-settings'

// C8: 어떤 형태로 JSON이 와도 reply(사용자 노출 텍스트)에는 JSON 원문이 새어나가면 안 된다.
const hasJsonLeak = (reply: string) =>
  /extractedSettings/.test(reply) || /```/.test(reply) || /\{\s*"/.test(reply)

describe('parseExtractedSettings (C8 답변에는 설정 형식이 보이지 않음)', () => {
  it('채팅에서 스타일을 선택하면 단독 형식으로 온 선택도 읽는다', () => {
    // 왜: 스타일 안내 예시를 따라 답한 모델의 선택이 버려져 팝업과 미정 뱃지가 남았다.
    const result = parseExtractedSettings('실사로 설정했어요.\n```json\n{"styleAnchorKey":"real"}\n```')
    expect(result).toEqual({ reply: '실사로 설정했어요.', extractedSettings: { styleAnchorKey: 'real' } })
  })

  it('첨부 그림체를 선택하면 단독 형식으로 온 선택도 읽는다', () => {
    // 왜: 첨부 스타일 예시도 선택을 감싸지 않는 형식이어서 저장되지 않았다.
    const styleAnchorFromAttachment = { imageIndex: 0, label: '수채화', medium: 'watercolor' }
    const result = parseExtractedSettings(`이 그림체로 설정했어요.\n${JSON.stringify({ styleAnchorFromAttachment })}`)
    expect(result).toEqual({ reply: '이 그림체로 설정했어요.', extractedSettings: { styleAnchorFromAttachment } })
  })

  it('단독 스타일 선택에 다른 항목이 섞이면 스타일 항목만 읽는다', () => {
    // 왜: 스타일 형식 호환을 이유로 별개 명령이나 임의 설정까지 받아들이면 안 된다.
    expect(parseExtractedSettings('```json\n{"styleAnchorKey":"real","deleteProject":true,"genre":"horror"}\n```').extractedSettings)
      .toEqual({ styleAnchorKey: 'real' })
  })

  it('정상 설정 뒤에 잘못된 설정이 오면 앞서 읽은 선택을 유지한다', () => {
    // 왜: 여러 설정 블록 중 잘못된 마지막 블록이 저장할 스타일을 지우면 안 된다.
    for (const invalid of [null, 'real', []]) {
      const valid = '실사로 설정했어요.\n```json\n{"extractedSettings":{"styleAnchorKey":"real"}}\n```'
      for (const suffix of [JSON.stringify({ extractedSettings: invalid }), `\n\`\`\`json\n${JSON.stringify({ extractedSettings: invalid })}\n\`\`\``]) {
        expect(parseExtractedSettings(valid + '\n' + suffix)).toEqual({ reply: '실사로 설정했어요.', extractedSettings: { styleAnchorKey: 'real' } })
      }
    }
  })

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
