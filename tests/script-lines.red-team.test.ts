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

describe('resolveLineRefs red-team boundaries', () => {
  it('RT-01 resolves Korean particles but rejects malformed line-token variants', () => {
    const lines = syntheticLines(45)

    expect(resolveLineRefs('L45가 이상해', lines)).toEqual([
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])
    expect(resolveLineRefs('@L45는 다시 봐줘', lines)).toEqual([
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])

    expect(resolveLineRefs('L0 L01 L999999 45 l45 L1L2', lines)).toEqual([])
  })

  it('RT-02 scans very long mention text without duplicate or runaway output', () => {
    const lines = syntheticLines(45)
    const text = `${'가'.repeat(10_000)} L45가 ${'x'.repeat(10_000)} @L45`

    expect(() => resolveLineRefs(text, lines)).not.toThrow()
    expect(resolveLineRefs(text, lines)).toEqual([
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])
  })
})

describe('buildScriptLines red-team boundaries', () => {
  it('RT-03 tolerates nullish dialogueLines and does not synthesize dialogue entries', () => {
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

  it('RT-04 keeps orphan-only manifests line-numbered without headings', () => {
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

  it('RT-05 keeps script refs unambiguous when shotId values collide', () => {
    const lines = buildScriptLines(manifest(), [
      shot({ shotId: 'dup_shot', sceneId: 'sc_01', actionDescription: '첫 번째' }),
      shot({ shotId: 'dup_shot', sceneId: 'sc_01', actionDescription: '두 번째' }),
    ])
    const refs = lines.map((line) => line.ref)

    expect(new Set(refs).size).toBe(refs.length)
  })
})

describe('sanitizeLineRefs red-team boundaries', () => {
  it('RT-06 rejects prototype-inherited refs and label regex bypasses', () => {
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

  it('RT-07 handles circular sanitizeLineRefs input without recursion', () => {
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

describe('validateWriterUpdates red-team boundaries', () => {
  it('RT-08 drops nested malformed patches and type-confused dialogueLines', () => {
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

  it('RT-09 ignores deleteScene requests with non-string ids', () => {
    expect(
      validateWriterUpdates([
        { type: 'deleteScene', id: 45 },
        { type: 'deleteScene', id: { toString: () => 'sc_01' } },
        { type: 'deleteScene', id: null },
      ]),
    ).toEqual([])
  })
})

describe('classifyDialoguePatch red-team boundaries', () => {
  it('RT-10 treats same-reference and empty dialogue patches as apply', () => {
    const sameRef = [dialogue('char_a', '그대로')]

    expect(classifyDialoguePatch(sameRef, sameRef)).toBe('apply')
    expect(classifyDialoguePatch([], [])).toBe('apply')
  })
})
