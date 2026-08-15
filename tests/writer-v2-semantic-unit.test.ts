import { describe, expect, it } from 'vitest'
import {
  checkWriterV2Draft,
  WriterV2DraftSchema,
  type WriterV2Draft,
} from '@/lib/writer/v2/semantic-unit'

function validDraft(): WriterV2Draft {
  return {
    units: [
      {
        unit_id: 'unit_1',
        story: {
          intent: '변갑돌은 아기를 버려두지 못한다.',
          action: '변갑돌이 눈 속 바구니를 들어 올린다.',
          reaction: '아기의 울음에 마음이 흔들린다.',
          emotion: '차가움에서 연민으로 이동한다.',
          dialogue: [
            {
              character_id: 'char_2',
              line: '이 추운 날에 두고 갈 수는 없지.',
              timing: '바구니를 들기 직전',
              delivery: '투덜거리지만 다정하게',
            },
          ],
        },
        visual: {
          character_refs: ['char_2'],
          background_ref: 'location_1',
          unresolved_refs: [],
          direction_intent: '눈보라 속 작은 선택을 따뜻하게 대비한다.',
          composition: '처마와 바구니를 함께 담는 중경',
          camera: '낮은 시선에서 천천히 전진',
          blocking: '변갑돌이 화면 오른쪽에서 바구니로 접근한다.',
          transition: 'cold open 후 cut',
        },
        shots: [
          {
            shot_id: 'shot_1',
            purpose: '울음의 발견',
            duration_seconds: 5,
            composition: '처마 아래 바구니와 인물의 실루엣',
            camera: 'slow push-in',
            blocking: '인물이 멈춰 선다.',
            transition: 'cut',
          },
        ],
        continuity: {
          previous_unit_id: null,
          carry_forward: ['눈보라'],
          changes: ['인물이 바구니를 든다.'],
        },
      },
    ],
  }
}

describe('Writer V2 semantic-unit contract', () => {
  it('accepts a complete unit with production references and previz direction', () => {
    const draft = validDraft()

    expect(WriterV2DraftSchema.safeParse(draft).success).toBe(true)
    expect(checkWriterV2Draft(draft)).toMatchObject({
      passed: true,
      fields: {
        intent: true,
        action: true,
        emotion: true,
        dialogue: true,
        visual_direction: true,
      },
    })
  })

  it('rejects a unit that hides missing asset references', () => {
    const draft = validDraft()
    draft.units[0].visual.character_refs = []
    draft.units[0].visual.background_ref = undefined

    const result = checkWriterV2Draft(draft)

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('character reference'),
        expect.stringContaining('background reference'),
      ]),
    )
  })

  it('rejects duplicate semantic and shot identifiers', () => {
    const draft = validDraft()
    draft.units.push({
      ...validDraft().units[0],
      unit_id: 'unit_1',
      shots: [{ ...validDraft().units[0].shots[0], shot_id: 'shot_1' }],
    })

    const result = checkWriterV2Draft(draft)

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'duplicate unit_id: unit_1',
        'duplicate shot_id: shot_1',
      ]),
    )
  })
})
