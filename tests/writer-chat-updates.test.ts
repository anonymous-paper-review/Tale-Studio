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

// #F-003 R1 (2026-08-12) — 인물 id 화이트리스트. 실측 dc531572: 모델이 발명한 girl/tracker 가
// 무검증 저장돼 하류 에셋 조인이 전부 끊겼다. 계약: 정본 집합 밖 id 는 드롭 + dropped 로 수집,
// 전부 탈락한 필드는 필드째 뺀다(씬 상속 폴백), 발명 화자의 대사는 대사째 드롭.

describe('validateWriterUpdates — 인물 id 화이트리스트 (R1)', () => {
  const allowed = new Set(['char', 'kingdom_pursuer'])

  it('발명 id 는 걸러지고 정본만 남는다 + dropped 수집', () => {
    const dropped: string[] = []
    const out = validateWriterUpdates(
      [
        {
          type: 'addShot',
          sceneId: 'sc_01',
          actionDescription: '달린다',
          characters: ['girl', 'char', 'tracker'],
        },
      ],
      allowed,
      dropped,
    ) as Array<{ characters?: string[] }>
    expect(out[0].characters).toEqual(['char'])
    expect(dropped.sort()).toEqual(['girl', 'tracker'])
  })

  it('전부 발명 id 면 characters 필드 자체가 빠진다 (씬 상속 폴백)', () => {
    const out = validateWriterUpdates(
      [{ type: 'addShot', sceneId: 'sc_01', actionDescription: 'a', characters: ['girl'] }],
      allowed,
    ) as Array<{ characters?: string[] }>
    expect(out[0].characters).toBeUndefined()
  })

  it('charactersPresent(씬)와 dialogueLines 화자도 같은 집합으로 거른다', () => {
    const dropped: string[] = []
    const out = validateWriterUpdates(
      [
        { type: 'addScene', charactersPresent: ['tracker', 'kingdom_pursuer'] },
        {
          type: 'updateShot',
          id: 'sh_01_01',
          patch: {
            dialogueLines: [
              { characterId: 'girl', text: '발명 화자 대사' },
              { characterId: 'char', text: '정본 화자 대사' },
            ],
          },
        },
      ],
      allowed,
      dropped,
    ) as Array<Record<string, unknown>>
    expect(out[0].charactersPresent).toEqual(['kingdom_pursuer'])
    const patch = out[1].patch as { dialogueLines: Array<{ characterId: string }> }
    expect(patch.dialogueLines).toHaveLength(1)
    expect(patch.dialogueLines[0].characterId).toBe('char')
    expect(dropped).toContain('girl')
    expect(dropped).toContain('tracker')
  })

  it('allowed 미지정이면 종전 동작 — 무필터 (구 클라 하위 호환)', () => {
    const out = validateWriterUpdates([
      { type: 'addShot', sceneId: 'sc_01', actionDescription: 'a', characters: ['girl'] },
    ]) as Array<{ characters?: string[] }>
    expect(out[0].characters).toEqual(['girl'])
  })

  it('명시적 빈 대사 배열([])의 "전체 삭제" 의미는 필터와 무관하게 보존된다', () => {
    const out = validateWriterUpdates(
      [{ type: 'updateShot', id: 'sh_01_01', patch: { dialogueLines: [] } }],
      allowed,
    ) as Array<{ patch: { dialogueLines?: unknown[] } }>
    expect(out[0].patch.dialogueLines).toEqual([])
  })
})
