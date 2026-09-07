// 줄을 찾거나 바꿀 때 잘못된 입력은 무시하고 사용자가 적은 내용만 안전하게 반영한다
import { describe, expect, it } from 'vitest'
import {
  buildScriptLines,
  resolveLineRefs,
  type ScriptLine,
} from '@/lib/script-lines'
import {
  classifyDialoguePatch,
  sanitizeLineRefs,
  validateWriterUpdates,
} from '@/lib/writer-chat-updates'
import type { DialogueLine, SceneManifest, Shot } from '@/types'

const dialogue = (characterId: string, text: string): DialogueLine => ({
  characterId,
  text,
  emotion: 'neutral',
  delivery: 'calm',
  durationHint: 2,
})

const shot = (input: Partial<Shot> & Pick<Shot, 'shotId' | 'sceneId'>): Shot => ({
  shotId: input.shotId,
  sceneId: input.sceneId,
  shotType: input.shotType ?? 'MS',
  actionDescription: input.actionDescription ?? '기본 액션',
  characters: input.characters ?? [],
  durationSeconds: input.durationSeconds ?? 5,
  generationMethod: input.generationMethod ?? 'T2V',
  dialogueLines: input.dialogueLines ?? [],
  camera: input.camera ?? {
    horizontal: 0,
    vertical: 0,
    pan: 0,
    tilt: 0,
    roll: 0,
    zoom: 0,
  },
  lighting: input.lighting ?? {
    position: 'front',
    brightness: 50,
    colorTemp: 5000,
  },
})

const manifest = (scenes: SceneManifest['scenes'] = [
  {
    sceneId: 'sc_01',
    narrativeSummary: '골목에서 단서를 찾는다.',
    originalTextQuote: '',
    location: '골목',
    timeOfDay: '밤',
    mood: '긴장',
    charactersPresent: ['char_a'],
    estimatedDurationSeconds: 12,
  },
]): SceneManifest => ({
  scenes,
  characters: [
    {
      characterId: 'char_a',
      name: '카르타',
      role: 'protagonist',
      description: '',
      fixedPrompt: '',
      referenceImages: [],
    },
  ],
  locations: [],
})

const syntheticLines = (count: number): ScriptLine[] =>
  Array.from({ length: count }, (_, index) => ({
    lineNo: index + 1,
    kind: 'action',
    ref: `ref_${index + 1}`,
    text: `line ${index + 1}`,
    sceneId: 'sc_01',
    shotId: `sh_${index + 1}`,
  }))

describe('줄 번호를 찾을 때 예상 밖 입력도 안전하게 처리한다', () => {
  it('줄 번호 뒤에 조사가 붙어도 해당 줄만 찾고 잘못된 표기는 무시한다 (RT-01)', () => {
    const lines = syntheticLines(45)

    expect(resolveLineRefs('L45가 이상해', lines)).toEqual([
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])
    expect(resolveLineRefs('@L45는 다시 봐줘', lines)).toEqual([
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])

    expect(resolveLineRefs('L0 L01 L999999 45 l45 L1L2', lines)).toEqual([])
  })

  it('아주 긴 글에서 같은 줄을 여러 번 언급해도 한 번만 찾는다 (RT-02)', () => {
    const lines = syntheticLines(45)
    const text = `${'가'.repeat(10_000)} L45가 ${'x'.repeat(10_000)} @L45`

    expect(() => resolveLineRefs(text, lines)).not.toThrow()
    expect(resolveLineRefs(text, lines)).toEqual([
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])
  })
})

describe('장면과 대사를 줄로 만들 때 예상 밖 입력도 안전하게 처리한다', () => {
  it('대사가 없거나 비어 있으면 대사 줄을 임의로 만들지 않는다 (RT-03)', () => {
    const lines = buildScriptLines(manifest(), [
      { ...shot({ shotId: 'sh_undefined', sceneId: 'sc_01' }), dialogueLines: undefined } as unknown as Shot,
      { ...shot({ shotId: 'sh_null', sceneId: 'sc_01' }), dialogueLines: null } as unknown as Shot,
    ])

    expect(lines.map((line) => `${line.lineNo}:${line.ref}:${line.kind}`)).toEqual([
      '1:sc_01.heading:sceneHeading',
      '2:sh_undefined.action:action',
      '3:sh_null.action:action',
    ])
    expect(lines.filter((line) => line.kind === 'dialogue')).toEqual([])
  })

  it('장면 정보가 없어도 남은 촬영 단위에 줄 번호를 붙이고 제목 없이 보여준다 (RT-04)', () => {
    const lines = buildScriptLines(manifest([]), [
      shot({
        shotId: 'orphan_01',
        sceneId: 'missing_scene',
        dialogueLines: [dialogue('char_a', '씬 없이 남은 대사')],
      }),
    ])

    expect(lines).toEqual([
      expect.objectContaining({
        lineNo: 1,
        kind: 'action',
        ref: 'orphan_01.action',
        sceneId: 'missing_scene',
      }),
      expect.objectContaining({
        lineNo: 2,
        kind: 'dialogue',
        ref: 'orphan_01.dialogue[0]',
        sceneId: 'missing_scene',
        characterName: '카르타',
      }),
    ])
  })

  it('촬영 단위 번호가 겹쳐도 각 줄을 서로 헷갈리지 않게 구분한다 (RT-05)', () => {
    const lines = buildScriptLines(manifest(), [
      shot({ shotId: 'dup_shot', sceneId: 'sc_01', actionDescription: '첫 번째' }),
      shot({ shotId: 'dup_shot', sceneId: 'sc_01', actionDescription: '두 번째' }),
    ])
    const refs = lines.map((line) => line.ref)

    expect(new Set(refs).size).toBe(refs.length)
  })
})

describe('줄 참조를 정리할 때 잘못된 값도 안전하게 걸러낸다', () => {
  it('줄 참조 형식이 올바르지 않으면 무시하고 올바른 형식만 남긴다 (RT-06)', () => {
    const inheritedLineRef = {
      __proto__: { label: 'L1', ref: 'polluted.action', kind: 'action' },
    } as unknown

    expect(
      sanitizeLineRefs([
        inheritedLineRef,
        { label: 'L1 ', ref: 'trailing.action', kind: 'action' },
        { label: 'L+1', ref: 'signed.action', kind: 'action' },
        { label: 'L１', ref: 'fullwidth.action', kind: 'action' },
        { label: 'L١', ref: 'arabic-indic.action', kind: 'action' },
        { label: 'L2', ref: 'safe.dialogue[0]', kind: 'not-a-kind' },
      ]),
    ).toEqual([{ label: 'L2', ref: 'safe.dialogue[0]', kind: 'dialogue' }])
  })

  it('서로를 가리키는 잘못된 줄 목록이 들어와도 멈추지 않고 올바른 줄만 남긴다 (RT-07)', () => {
    const circularRef: Record<string, unknown> = { label: 'L2', ref: 'safe.dialogue[0]' }
    circularRef.self = circularRef
    const raw: unknown[] = [circularRef]
    raw.push(raw)

    expect(() => sanitizeLineRefs(raw)).not.toThrow()
    expect(sanitizeLineRefs(raw)).toEqual([
      { label: 'L2', ref: 'safe.dialogue[0]', kind: 'dialogue' },
    ])
  })
})

describe('장면과 대사 변경을 확인할 때 잘못된 내용은 반영하지 않는다', () => {
  it('잘못된 장면 변경 내용과 대사 목록은 모두 반영하지 않는다 (RT-08)', () => {
    const notText = () => '대사처럼 보이는 함수'

    expect(
      validateWriterUpdates([
        {
          type: 'updateShot',
          id: 'sh_01',
          patch: {
            actionDescription: { nested: '객체는 문자열이 아니다' },
            characters: { 0: 'char_a' },
            durationSeconds: '30',
            dialogueLines: [notText, 45, { characterId: notText, text: 99 }],
          },
        },
        { type: 'updateShot', id: 'sh_02', patch: { dialogueLines: notText } },
        { type: 'updateShot', id: 'sh_03', patch: { dialogueLines: 45 } },
        {
          type: 'updateScene',
          id: 'sc_01',
          patch: {
            mood: { nested: 'bad' },
            charactersPresent: [notText, 45],
            estimatedDurationSeconds: Number.NaN,
          },
        },
      ]),
    ).toEqual([])
  })

  it('장면 번호가 글자가 아니면 삭제 요청을 무시한다 (RT-09)', () => {
    expect(
      validateWriterUpdates([
        { type: 'deleteScene', id: 45 },
        { type: 'deleteScene', id: { toString: () => 'sc_01' } },
        { type: 'deleteScene', id: null },
      ]),
    ).toEqual([])
  })
})

describe('대사 변경 내용을 판단할 때 같은 내용도 요청으로 적용한다', () => {
  it('대사 내용이 그대로이거나 비어 있어도 변경 요청으로 적용한다 (RT-10)', () => {
    const sameRef = [dialogue('char_a', '그대로')]

    expect(classifyDialoguePatch(sameRef, sameRef)).toBe('apply')
    expect(classifyDialoguePatch([], [])).toBe('apply')
  })
})
