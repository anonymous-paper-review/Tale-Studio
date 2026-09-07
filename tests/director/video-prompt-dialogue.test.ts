// 영상에 대사가 있으면 원문과 말하는 사람의 모습이 빠짐없이 반영된다 (#g7 2026-08-27 오너 확정)
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

describe('G7 대사가 영상에 반영된다', () => {
  it('대사를 입력하면 원문 그대로 영상에 반영한다 (번역·요약 금지)', () => {
    const line = '어매... 내 엿판 하나만 맞춰 주이소.'
    expect(dialogueClause([{ text: line }])).toContain(`"${line}"`)
  })

  it('대사가 있으면 입모양이 말과 맞게 움직인다', () => {
    const c = dialogueClause([{ text: '가자.', characterId: 'char' }])
    expect(c).toContain('lip-synced')
    expect(c).toContain("mouth moves in sync")
  })

  it('대사의 감정과 말투를 영상에 함께 반영한다', () => {
    const c = dialogueClause([{ text: '가자.', emotion: 'quiet', delivery: 'weak, yet unwavering' }])
    expect(c).toContain('quiet')
    expect(c).toContain('weak, yet unwavering')
  })

  it('대사가 여러 줄이면 적은 순서대로 말한다', () => {
    const c = dialogueClause([{ text: 'A' }, { text: 'B' }])
    expect(c).toContain('line 1')
    expect(c).toContain('line 2')
    expect(c).toContain('spoken in the order given')
  })

  it('대사가 없거나 비어 있으면 영상에 대사를 넣지 않는다', () => {
    expect(dialogueClause(null)).toBe('')
    expect(dialogueClause([])).toBe('')
    expect(dialogueClause([{ text: '   ' }])).toBe('')
  })

  it('대사에 맞춰 움직임도 말하는 시점에 맞춘다 (memo: 단어 시점 연기)', () => {
    expect(dialogueClause([{ text: '가자.' }])).toContain('time the scripted action to the words')
  })
})

describe('G7 대사가 없어도 기존 영상이 그대로 만들어진다', () => {
  it('대사가 없는 장면에는 대사 안내가 들어가지 않는다', () => {
    const r = buildVideoPrompt({
      prompt: 'A dim room.', generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec, dialogueLines: null,
    })
    expect(r.fullPrompt).not.toContain('Spoken dialogue')
    expect(r.prompt_parts.dialogue).toBeUndefined()
  })

  it('대사가 있으면 영상 안내와 세부 내용에 함께 반영된다', () => {
    const r = buildVideoPrompt({
      prompt: 'A dim room.', generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec,
      dialogueLines: [{ text: '가자.', delivery: 'quiet' }],
    })
    expect(r.fullPrompt).toContain('Spoken dialogue')
    expect(r.prompt_parts.dialogue).toBeTruthy()
  })

  it('대사가 길어도 영상 안내에서 잘리지 않는다', () => {
    const long = '가'.repeat(300)
    const r = buildVideoPrompt({
      prompt: 'x'.repeat(600), generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec,
      dialogueLines: [{ text: long, characterId: 'char' }],
    })
    // 계약 → 대사 → 묘사 순이므로 묘사가 길어도 대사는 살아남는다
    expect(r.fullPrompt).toContain('Spoken dialogue')
    expect(r.fullPrompt).toContain('lip-synced')
  })

  it('움직임 안내가 대사보다 먼저 적용된다', () => {
    const r = buildVideoPrompt({
      prompt: 'A dim room.', generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec,
      dialogueLines: [{ text: '가자.' }],
    })
    expect(r.fullPrompt.indexOf('Motion contract')).toBeLessThan(r.fullPrompt.indexOf('Spoken dialogue'))
  })
})

describe('G7 말하는 사람은 이름과 모습으로 구분된다', () => {
  const SPEAKERS = {
    char: { name: '강이', appearance: 'A young man of twenty. Sun-darkened face, short black hair. White cotton trousers and jeogori, straw sandals.' },
    char_3: { name: '연이', appearance: 'A young woman of eighteen. Long braided hair, pale pink jeogori jacket and jade-green skirt.' },
  }

  it('말하는 사람을 등록하면 이름과 모습이 영상에 반영된다', () => {
    const c = dialogueClause([{ text: '가자.', characterId: 'char' }], SPEAKERS)
    expect(c).toContain('강이 (')
    expect(c).toContain('A young man of twenty')
  })

  it('사람의 모습 설명은 문장 단위로 정리해 너무 길지 않게 한다 (~120자)', () => {
    const c = dialogueClause([{ text: '가자.', characterId: 'char' }], SPEAKERS)
    const anchor = c.slice(c.indexOf('(') + 1, c.indexOf(')'))
    expect(anchor.length).toBeLessThanOrEqual(130)
    expect(anchor.endsWith('.')).toBe(false)
  })

  it('여러 사람이 말하면 각 대사가 알맞은 사람에게 돌아간다', () => {
    const c = dialogueClause(
      [
        { text: '구례로... 정녕 가시는 거요?', characterId: 'char' },
        { text: '강이 오라버니, 나 이제 구례 길로 가요.', characterId: 'char_3' },
      ],
      SPEAKERS,
    )
    expect(c.indexOf('강이 (')).toBeLessThan(c.indexOf('연이 ('))
    expect(c).toContain('line 1: 강이')
    expect(c).toContain('line 2: 연이')
    expect(c).toContain('spoken in the order given')
  })

  it('등록하지 않은 사람이 말하면 이름 없이 표시한다', () => {
    const c = dialogueClause([{ text: '가자.', characterId: 'ghost' }], SPEAKERS)
    expect(c).toContain('the speaking character says aloud')
  })

  it('말하는 사람이 없는 대사는 내레이션으로 처리하고 입모양을 움직이지 않는다', () => {
    const voOnly = dialogueClause([{ text: '봄이 오고 있었다.' }], SPEAKERS)
    expect(voOnly).toContain('voice-over')
    expect(voOnly).not.toContain('mouth moves in sync')
    expect(voOnly).toContain('no on-screen character mouths them')

    const mixed = dialogueClause(
      [{ text: '가자.', characterId: 'char' }, { text: '봄이 오고 있었다.' }],
      SPEAKERS,
    )
    expect(mixed).toContain('mouth moves in sync')
    expect(mixed).toContain('The voice-over line is narration')
  })

  it('말하는 사람을 등록하면 영상 전체에 이름과 모습이 반영된다', () => {
    const r = buildVideoPrompt({
      prompt: 'A dim room.', generationMethod: 'I2V', modelKey: 'happy-horse' as never,
      durationSeconds: 10, dynamicSpec: spec,
      dialogueLines: [{ text: '가자.', characterId: 'char' }],
      dialogueSpeakers: SPEAKERS,
    })
    expect(r.fullPrompt).toContain('강이 (')
    expect(r.prompt_parts.dialogue).toContain('강이')
  })
})
