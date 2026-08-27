import { describe, expect, it } from 'vitest'
import { buildVideoPrompt, dialogueClause } from '@/lib/director/video-prompt'
import type { ShotDynamicSpec } from '@/lib/writer/types/pipeline'

// #g7 (2026-08-27 오너 확정: "무조건 영상생성기에 맡길거임")
//
// 대사는 shots.dialogue_lines 에 텍스트·감정·딜리버리·화자까지 완비돼 있는데
// video-prompt / generate-video 어디에서도 읽지 않았다(참조 0건). 모델이 대사의 존재를
// 몰랐으므로 입이 움직이지 않고 자막 싱크도 맞을 수 없었다.
//
// memo.md(중국 숏드라마 팀) 구조: 상태·어조는 컷별 변수 = dialogue_lines 의 emotion/delivery.
// 대사 텍스트는 원문 그대로 — 번역하면 입모양이 어긋난다.

const spec: ShotDynamicSpec = {
  character_motion: [{ verb: 'places towel', magnitude: 'small', character_id: 'c1' }],
  camera_motion: { type: 'static' },
} as never

describe('G7 — 대사가 영상 프롬프트에 실린다', () => {
  it('대사 원문을 그대로 넣는다 (번역·요약 금지 — 입모양이 어긋난다)', () => {
    const line = '어매... 내 엿판 하나만 맞춰 주이소.'
    expect(dialogueClause([{ text: line }])).toContain(`"${line}"`)
  })

  it('립싱크를 명시적으로 요구한다 — 모델은 무성 클립 편향이 있다', () => {
    const c = dialogueClause([{ text: '가자.' }])
    expect(c).toContain('lip-synced')
    expect(c).toContain("mouth moves in sync")
  })

  it('어조(emotion·delivery)를 함께 싣는다', () => {
    const c = dialogueClause([{ text: '가자.', emotion: 'quiet', delivery: 'weak, yet unwavering' }])
    expect(c).toContain('quiet')
    expect(c).toContain('weak, yet unwavering')
  })

  it('여러 줄이면 순서를 명시한다', () => {
    const c = dialogueClause([{ text: 'A' }, { text: 'B' }])
    expect(c).toContain('line 1')
    expect(c).toContain('line 2')
    expect(c).toContain('spoken in the order given')
  })

  it('대사가 없거나 빈 문자열이면 아무것도 안 붙인다', () => {
    expect(dialogueClause(null)).toBe('')
    expect(dialogueClause([])).toBe('')
    expect(dialogueClause([{ text: '   ' }])).toBe('')
  })

  it('동작을 대사에 맞춰 싱크하라고 지시한다 (memo: 단어 시점 연기)', () => {
    expect(dialogueClause([{ text: '가자.' }])).toContain('time the scripted action to the words')
  })
})

describe('G7 — 기존 경로를 깨지 않는다', () => {
  it('대사 없는 샷의 프롬프트는 대사 절이 없다', () => {
    const r = buildVideoPrompt({
      prompt: 'A dim room.', generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec, dialogueLines: null,
    })
    expect(r.fullPrompt).not.toContain('Spoken dialogue')
    expect(r.prompt_parts.dialogue).toBeUndefined()
  })

  it('대사가 있으면 프롬프트와 parts 양쪽에 실린다', () => {
    const r = buildVideoPrompt({
      prompt: 'A dim room.', generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec,
      dialogueLines: [{ text: '가자.', delivery: 'quiet' }],
    })
    expect(r.fullPrompt).toContain('Spoken dialogue')
    expect(r.prompt_parts.dialogue).toBeTruthy()
  })

  it('대사가 길이 캡에 잘려 사라지지 않는다', () => {
    const long = '가'.repeat(300)
    const r = buildVideoPrompt({
      prompt: 'x'.repeat(600), generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec,
      dialogueLines: [{ text: long }],
    })
    // 계약 → 대사 → 묘사 순이므로 묘사가 길어도 대사는 살아남는다
    expect(r.fullPrompt).toContain('Spoken dialogue')
    expect(r.fullPrompt).toContain('lip-synced')
  })

  it('모션 계약이 대사보다 앞에 온다 — 앞 토큰 가중 순서 유지', () => {
    const r = buildVideoPrompt({
      prompt: 'A dim room.', generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec,
      dialogueLines: [{ text: '가자.' }],
    })
    expect(r.fullPrompt.indexOf('Motion contract')).toBeLessThan(r.fullPrompt.indexOf('Spoken dialogue'))
  })
})
