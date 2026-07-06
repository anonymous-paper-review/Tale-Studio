import { describe, expect, it } from 'vitest'
import {
  classifyDialoguePatch,
  pickShotFields,
  sanitizeLineRefs,
  validateWriterUpdates,
} from '@/lib/writer-chat-updates'
import type { DialogueLine } from '@/types'

type U = Record<string, unknown>

const dialogue = (characterId: string, text: string): DialogueLine => ({
  characterId,
  text,
  emotion: 'neutral',
  delivery: 'calm',
  durationHint: 2,
})

describe('writer chat update validation', () => {
  it('passes dialogueLines entries with only characterId and text', () => {
    const out = validateWriterUpdates([
      {
        type: 'updateShot',
        id: 'sh_01_01',
        patch: {
          dialogueLines: [
            { characterId: 'char_a', text: '안녕.', emotion: 'ignored' },
            { characterId: 'char_b', text: '' },
          ],
        },
      },
    ])

    expect(out).toEqual([
      {
        type: 'updateShot',
        id: 'sh_01_01',
        patch: {
          dialogueLines: [
            { characterId: 'char_a', text: '안녕.' },
            { characterId: 'char_b', text: '' },
          ],
        },
      },
    ])
  })

  it('strips malformed dialogueLines entries and drops non-array dialogueLines', () => {
    expect(
      pickShotFields({
        dialogueLines: [
          { characterId: 'char_a', text: '통과' },
          { characterId: 'char_b' },
          { text: '누락' },
          { characterId: 1, text: '불량' },
          'nope',
        ],
      }),
    ).toEqual({ dialogueLines: [{ characterId: 'char_a', text: '통과' }] })

    expect(
      validateWriterUpdates([
        {
          type: 'updateShot',
          id: 'sh_01_01',
          patch: { dialogueLines: 'not-array' },
        },
      ]),
    ).toEqual([])
  })

  it('keeps existing shot field validation behavior', () => {
    const out = validateWriterUpdates([
      {
        type: 'addShot',
        sceneId: 'sc_01',
        tempId: 'H1',
        shotType: 'BAD',
        actionDescription: '카메라가 골목 안으로 이동한다.',
        characters: ['char_a', 7, 'char_b'],
        durationSeconds: 99,
      },
      {
        type: 'updateShot',
        id: 'sh_01_02',
        patch: {
          shotType: 'CU',
          durationSeconds: 0.2,
          actionDescription: '  ',
        },
      },
    ])

    expect(out).toEqual([
      {
        type: 'addShot',
        sceneId: 'sc_01',
        actionDescription: '카메라가 골목 안으로 이동한다.',
        characters: ['char_a', 'char_b'],
        durationSeconds: 60,
        tempId: 'H1',
      },
      {
        type: 'updateShot',
        id: 'sh_01_02',
        patch: {
          shotType: 'CU',
          durationSeconds: 1,
        },
      },
    ])
  })

  it('keeps existing scene field validation behavior', () => {
    const out = validateWriterUpdates([
      {
        type: 'updateScene',
        id: 'sc_01',
        patch: {
          location: '  ',
          mood: '긴장',
          charactersPresent: ['char_a', 3],
          estimatedDurationSeconds: 999,
        },
      },
    ]) as U[]

    expect(out).toEqual([
      {
        type: 'updateScene',
        id: 'sc_01',
        patch: {
          mood: '긴장',
          charactersPresent: ['char_a'],
          estimatedDurationSeconds: 600,
        },
      },
    ])
  })
})

describe('classifyDialoguePatch', () => {
  it('applies same-length, longer, and new dialogue patches', () => {
    expect(
      classifyDialoguePatch(
        [dialogue('char_a', '기존')],
        [dialogue('char_a', '수정')],
      ),
    ).toBe('apply')
    expect(
      classifyDialoguePatch(
        [dialogue('char_a', '기존')],
        [dialogue('char_a', '기존'), dialogue('char_b', '추가')],
      ),
    ).toBe('apply')
    expect(classifyDialoguePatch([], [dialogue('char_a', '신규')])).toBe('apply')
  })

  it('requires confirmation when the next dialogue array is shorter', () => {
    expect(
      classifyDialoguePatch(
        [dialogue('char_a', '하나'), dialogue('char_b', '둘')],
        [dialogue('char_a', '하나')],
      ),
    ).toBe('confirm')
  })
})

describe('sanitizeLineRefs', () => {
  it('passes valid line refs and strips invalid labels or empty refs', () => {
    expect(
      sanitizeLineRefs([
        { label: 'L1', ref: 'sc_01.heading', kind: 'sceneHeading' },
        { label: '1', ref: 'sh_01_01.action', kind: 'action' },
        { label: 'L2', ref: '   ', kind: 'action' },
        { label: 'L3', ref: 'sh_01_01.dialogue[0]' },
      ]),
    ).toEqual([
      { label: 'L1', ref: 'sc_01.heading', kind: 'sceneHeading' },
      { label: 'L3', ref: 'sh_01_01.dialogue[0]', kind: 'dialogue' },
    ])
  })

  it('returns an empty array for non-arrays and caps output at 200 entries', () => {
    expect(sanitizeLineRefs('not-array')).toEqual([])

    const raw = Array.from({ length: 250 }, (_, index) => ({
      label: `L${index + 1}`,
      ref: `ref_${index + 1}`,
      kind: 'action',
    }))
    const out = sanitizeLineRefs(raw)

    expect(out).toHaveLength(200)
    expect(out[0]).toEqual({ label: 'L1', ref: 'ref_1', kind: 'action' })
    expect(out[199]).toEqual({ label: 'L200', ref: 'ref_200', kind: 'action' })
  })
})
