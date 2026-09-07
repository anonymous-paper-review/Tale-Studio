// 채팅에서 보낸 장면과 대사 수정이 올바른 내용만 반영되도록 한다
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

describe('채팅으로 보낸 장면과 대사 수정에서 올바른 내용만 반영한다', () => {
  it('대사의 감정과 말투, 길이 정보는 보존하고 알 수 없거나 잘못된 내용은 버린다', () => {
    // 예전 계약은 characterId+text 외 전부를 버려서, 챗 대사 수정마다 연기 지시가
    //   유실됐다(2026-08-31 실측). 이제 스펙 필드는 통과시키고 미정의·불량 값만 건다.
    const out = validateWriterUpdates([
      {
        type: 'updateShot',
        id: 'sh_01_01',
        patch: {
          dialogueLines: [
            {
              characterId: 'char_a',
              text: '안녕.',
              emotion: '반가움',
              delivery: '밝게 손을 흔들며',
              durationHint: 2,
              unknownField: 'dropped',
            },
            { characterId: 'char_b', text: '', emotion: 7, durationHint: -1 },
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
            {
              characterId: 'char_a',
              text: '안녕.',
              emotion: '반가움',
              delivery: '밝게 손을 흔들며',
              durationHint: 2,
            },
            { characterId: 'char_b', text: '' },
          ],
        },
      },
    ])
  })

  it('대사 목록에서 형식이 잘못된 항목과 목록이 아닌 값은 제외한다', () => {
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

  it('기존 샷 입력 규칙을 지키며 잘못된 값은 허용 범위로 바로잡는다', () => {
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

  it('기존 장면 입력 규칙을 지키며 잘못된 값은 허용 범위로 바로잡는다', () => {
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
  it('대사 수가 같거나 늘거나 새로 생긴 수정은 바로 반영한다', () => {
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

  it('다음 대사 수가 줄면 확인을 먼저 받는다', () => {
    expect(
      classifyDialoguePatch(
        [dialogue('char_a', '하나'), dialogue('char_b', '둘')],
        [dialogue('char_a', '하나')],
      ),
    ).toBe('confirm')
  })
})

describe('sanitizeLineRefs', () => {
  it('올바른 대사 위치는 남기고 잘못된 표시나 빈 위치는 제외한다', () => {
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

  it('대사 위치 목록이 아니면 비우고 200개까지만 남긴다', () => {
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

describe('등록된 인물만 장면과 대사 수정에 반영한다 (R1)', () => {
  const allowed = new Set(['char', 'kingdom_pursuer'])

  it('등록되지 않은 인물은 제외하고 등록된 인물만 남긴다 (제외된 인물도 기록한다)', () => {
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

  it('등록된 인물이 하나도 없으면 샷에서 인물 정보를 빼고 장면 정보를 따른다', () => {
    const out = validateWriterUpdates(
      [{ type: 'addShot', sceneId: 'sc_01', actionDescription: 'a', characters: ['girl'] }],
      allowed,
    ) as Array<{ characters?: string[] }>
    expect(out[0].characters).toBeUndefined()
  })

  it('장면의 인물과 대사의 화자도 등록된 인물만 남긴다', () => {
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

  it('인물 목록을 지정하지 않으면 기존처럼 모든 인물을 허용한다 (이전 화면 호환)', () => {
    const out = validateWriterUpdates([
      { type: 'addShot', sceneId: 'sc_01', actionDescription: 'a', characters: ['girl'] },
    ]) as Array<{ characters?: string[] }>
    expect(out[0].characters).toEqual(['girl'])
  })

  it('대사를 빈 목록으로 보내면 모두 지우려는 뜻을 그대로 반영한다', () => {
    const out = validateWriterUpdates(
      [{ type: 'updateShot', id: 'sh_01_01', patch: { dialogueLines: [] } }],
      allowed,
    ) as Array<{ patch: { dialogueLines?: unknown[] } }>
    expect(out[0].patch.dialogueLines).toEqual([])
  })
})
