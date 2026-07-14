import { describe, expect, it } from 'vitest'
import { activeMentionRefs } from '@/lib/card-mention'
import {
  buildScriptLines,
  resolveLineRefs,
  scriptLineMentions,
  serializeWriterScriptContext,
  type ScriptLine,
} from '@/lib/script-lines'
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

function fixture(): { manifest: SceneManifest; shots: Shot[] } {
  return {
    manifest: {
      scenes: [
        {
          sceneId: 'sc_01',
          narrativeSummary: '카르타가 골목에서 단서를 찾는다.',
          originalTextQuote: '',
          location: '골목',
          timeOfDay: '밤',
          mood: '긴장',
          charactersPresent: ['char_a'],
          estimatedDurationSeconds: 12,
        },
        {
          sceneId: 'sc_02',
          narrativeSummary: '',
          originalTextQuote: '',
          location: '옥상',
          timeOfDay: '새벽',
          mood: '',
          charactersPresent: ['char_b'],
          estimatedDurationSeconds: 8,
        },
      ],
      characters: [
        {
          characterId: 'char_a',
          name: '카르타',
          role: 'protagonist',
          description: '',
          fixedPrompt: '',
          referenceImages: [],
        },
        {
          characterId: 'char_b',
          name: '미로',
          role: 'supporting',
          description: '',
          fixedPrompt: '',
          referenceImages: [],
        },
      ],
      locations: [],
    },
    shots: [
      shot({
        shotId: 'sh_01_01',
        sceneId: 'sc_01',
        shotType: 'CU',
        actionDescription: '카르타가 녹슨 문을 연다.',
        characters: ['char_a'],
        dialogueLines: [
          dialogue('char_a', '여기야.'),
          dialogue('char_missing', '누구 없나?'),
        ],
      }),
      shot({
        shotId: 'sh_01_02',
        sceneId: 'sc_01',
        actionDescription: '',
        dialogueLines: [],
      }),
      shot({
        shotId: 'sh_02_01',
        sceneId: 'sc_02',
        shotType: 'WS',
        actionDescription: '미로가 난간 너머를 본다.',
        characters: ['char_b'],
        dialogueLines: [dialogue('char_b', '보여.')],
      }),
      shot({
        shotId: 'sh_99_01',
        sceneId: 'sc_99',
        shotType: 'MS',
        actionDescription: '씬에 묶이지 않은 샷이 말미에 남는다.',
        characters: ['char_a'],
        dialogueLines: [dialogue('char_a', '늦었어.')],
      }),
    ],
  }
}

const syntheticLines = (count: number): ScriptLine[] =>
  Array.from({ length: count }, (_, index) => ({
    lineNo: index + 1,
    kind: 'action',
    ref: `ref_${index + 1}`,
    text: `line ${index + 1}`,
    sceneId: 'sc_01',
    shotId: `sh_01_${String(index + 1).padStart(2, '0')}`,
  }))

describe('buildScriptLines', () => {
  it('uses global continuous numbering across scene headings, actions, and dialogue', () => {
    const { manifest, shots } = fixture()
    const lines = buildScriptLines(manifest, shots)

    expect(lines.map((line) => line.lineNo)).toEqual(
      Array.from({ length: lines.length }, (_, index) => index + 1),
    )
    expect(lines.map((line) => `${line.lineNo}:${line.ref}`)).toEqual([
      '1:sc_01.heading',
      '2:sh_01_01.action',
      '3:sh_01_01.dialogue[0]',
      '4:sh_01_01.dialogue[1]',
      '5:sh_01_02.action',
      '6:sc_02.heading',
      '7:sh_02_01.action',
      '8:sh_02_01.dialogue[0]',
      '9:sh_99_01.action',
      '10:sh_99_01.dialogue[0]',
    ])
  })

  it('keeps one semantic line per heading, shot action, and dialogue entry', () => {
    const { manifest, shots } = fixture()
    const lines = buildScriptLines(manifest, shots)

    expect(lines.filter((line) => line.kind === 'sceneHeading')).toHaveLength(2)
    expect(lines.filter((line) => line.kind === 'action')).toHaveLength(4)
    expect(lines.filter((line) => line.kind === 'dialogue')).toHaveLength(4)
    expect(lines.find((line) => line.ref === 'sh_01_02.action')?.text).toBe('(설명 없음)')
    expect(lines.find((line) => line.ref === 'sh_01_01.dialogue[1]')?.characterName).toBe(
      'char_missing',
    )
  })

  it('formats scene headings with location only or location plus mood', () => {
    const { manifest, shots } = fixture()
    const lines = buildScriptLines(manifest, shots)

    // sceneId(SC_01 등)는 뷰어 헤딩에서 제거(#c11 2026-07-14) — 장소·분위기만 표시.
    expect(lines.find((line) => line.ref === 'sc_01.heading')?.text).toBe('골목 · 긴장')
    expect(lines.find((line) => line.ref === 'sc_02.heading')?.text).toBe('옥상')
  })

  it('handles empty input, scenes without shots, and orphan shots at the end', () => {
    expect(buildScriptLines(null, [])).toEqual([])

    const { manifest, shots } = fixture()
    expect(buildScriptLines({ ...manifest, scenes: [manifest.scenes[0]] }, [])).toEqual([
      {
        lineNo: 1,
        kind: 'sceneHeading',
        ref: 'sc_01.heading',
        text: '골목 · 긴장',
        sceneId: 'sc_01',
      },
    ])

    const lines = buildScriptLines(manifest, shots)
    expect(lines.slice(-2).map((line) => line.ref)).toEqual([
      'sh_99_01.action',
      'sh_99_01.dialogue[0]',
    ])
  })
})

describe('scriptLineMentions', () => {
  it('uses L labels with stable line refs', () => {
    const { manifest, shots } = fixture()
    const mentions = scriptLineMentions(buildScriptLines(manifest, shots))

    expect(mentions.slice(0, 4)).toEqual([
      { ref: 'sc_01.heading', label: 'L1', hint: '씬' },
      { ref: 'sh_01_01.action', label: 'L2', hint: '액션' },
      { ref: 'sh_01_01.dialogue[0]', label: 'L3', hint: '대사' },
      { ref: 'sh_01_01.dialogue[1]', label: 'L4', hint: '대사' },
    ])
  })

  it('stays prefix-safe with activeMentionRefs for @L4 and @L45', () => {
    const mentions = scriptLineMentions(syntheticLines(45))

    expect(activeMentionRefs('@L45 고쳐줘', mentions)).toEqual(['ref_45'])
    expect(activeMentionRefs('@L4 고쳐줘', mentions)).toEqual(['ref_4'])
  })
})

describe('serializeWriterScriptContext', () => {
  it('keeps [L#] markers aligned with buildScriptLines line numbers', () => {
    const { manifest, shots } = fixture()
    const lines = buildScriptLines(manifest, shots)
    const context = serializeWriterScriptContext(manifest, shots)

    const labels = Array.from(context.matchAll(/\[L(\d+)\]/g), (match) => Number(match[1]))
    expect(labels).toEqual(lines.map((line) => line.lineNo))
    expect(context).toContain('## 현재 씬/샷 (scene_id·shot_id 를 그대로 사용, [L#] = 스크립트 라인 번호)')
    expect(context).toContain('[L4] 대사[1] char_missing: "누구 없나?"')
    expect(context).toContain('[L10] 대사[0] char_a(카르타): "늦었어."')
    expect(context).toContain(
      '## 등장인물 (dialogueLines[].characterId·characters[]·charactersPresent[] 에는 이름이 아니라 이 characterId 를 쓴다)',
    )
    expect(context).toContain('- char_a — 카르타')
  })
})

describe('resolveLineRefs', () => {
  it('resolves L45 and @L45 against the send-time line snapshot', () => {
    const lines = syntheticLines(45)

    expect(resolveLineRefs('L45 고쳐줘', lines)).toEqual([
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])
    expect(resolveLineRefs('@L45', lines)).toEqual([
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])
  })

  it('drops missing labels, avoids prefix confusion, dedupes, and handles empty lines', () => {
    const lines = syntheticLines(45)

    expect(resolveLineRefs('XL45 L45a @L4 @L45 @L45 L999', lines)).toEqual([
      { label: 'L4', ref: 'ref_4', kind: 'action' },
      { label: 'L45', ref: 'ref_45', kind: 'action' },
    ])
    expect(resolveLineRefs('L1', [])).toEqual([])
  })
})
