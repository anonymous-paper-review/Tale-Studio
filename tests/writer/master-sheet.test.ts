// Writer 마스터 시트가 샷을 어떤 순서·내용으로 싣고 어떤 파일로 내보내는지 검사한다
import { describe, it, expect } from 'vitest'
import {
  buildMasterSheet,
  masterSheetExportPlan,
  type BuildMasterSheetInput,
  type MasterSheetSceneInput,
  type MasterSheetShotInput,
} from '@/lib/writer/master-sheet'

const characters = [
  { characterId: 'char_1', name: '지아' },
  { characterId: 'char_2', name: '레오' },
]
const locations = [{ locationId: 'loc_1', name: '달빛 숲' }]

function scene(over: Partial<MasterSheetSceneInput> & { sceneId: string }): MasterSheetSceneInput {
  return {
    sortOrder: 0,
    location: 'loc_1',
    timeOfDay: 'night',
    charactersPresent: ['char_1'],
    ...over,
  }
}

function shot(over: Partial<MasterSheetShotInput> & { shotId: string; sceneId: string }): MasterSheetShotInput {
  return {
    sortOrder: 0,
    shotType: 'MS',
    actionDescription: 'Walking quietly.',
    characters: ['char_1'],
    dialogueLines: [],
    durationSeconds: 5,
    roughStoryboard: {
      frames: { start: 'https://img/start.png', direction: 'https://img/direction.png', end: 'https://img/end.png' },
    },
    ...over,
  }
}

function baseInput(over: Partial<BuildMasterSheetInput> = {}): BuildMasterSheetInput {
  return {
    projectFormat: null,
    scenes: [],
    shots: [],
    characters,
    locations,
    ...over,
  }
}

describe('마스터 시트는 씬 순서와 그 안의 샷 순서대로 샷을 싣는다', () => {
  it('씬과 샷이 뒤섞여 들어와도 화면에 보이는 순서대로 싣는다', () => {
    const scenes = [scene({ sceneId: 'sc_b', sortOrder: 1 }), scene({ sceneId: 'sc_a', sortOrder: 0 })]
    const shots = [
      shot({ shotId: 'sh_b1', sceneId: 'sc_b', sortOrder: 0 }),
      shot({ shotId: 'sh_a2', sceneId: 'sc_a', sortOrder: 1 }),
      shot({ shotId: 'sh_a1', sceneId: 'sc_a', sortOrder: 0 }),
    ]
    const result = buildMasterSheet(baseInput({ scenes, shots }))
    const codes = result.pages.flatMap((p) => p.rows.map((r) => r.code))
    expect(codes).toEqual(['1-1', '1-2', '2-1'])
  })
})

describe('샷마다 START·DIRECTION·END 그림 세 장을 싣는다', () => {
  it('러프 스토리보드의 세 그림을 START·DIRECTION·END 순서로 담는다', () => {
    const scenes = [scene({ sceneId: 'sc_a' })]
    const shots = [shot({ shotId: 'sh_1', sceneId: 'sc_a' })]
    const result = buildMasterSheet(baseInput({ scenes, shots }))
    const row = result.pages[0].rows[0]
    expect(row.frames).toEqual({
      start: 'https://img/start.png',
      direction: 'https://img/direction.png',
      end: 'https://img/end.png',
    })
    expect(row.framesComplete).toBe(true)
  })
})

describe('그림이 없는 샷도 빼지 않고 빈 칸으로 싣고 빈 샷 수를 센다', () => {
  it('러프가 없는 샷도 빈 칸으로 남고 빈 샷 수에 들어간다', () => {
    const scenes = [scene({ sceneId: 'sc_a' })]
    const shots = [
      shot({ shotId: 'sh_1', sceneId: 'sc_a', sortOrder: 0 }),
      shot({ shotId: 'sh_2', sceneId: 'sc_a', sortOrder: 1, roughStoryboard: null }),
    ]
    const result = buildMasterSheet(baseInput({ scenes, shots }))
    const rows = result.pages.flatMap((p) => p.rows)
    expect(rows).toHaveLength(2)
    expect(rows[1].frames).toEqual({ start: null, direction: null, end: null })
    expect(rows[1].framesComplete).toBe(false)
    expect(result.missingFrameShots).toBe(1)
  })
})

describe('설명문에는 샷 번호·샷 크기·인물·액션·대사·길이를 싣는다', () => {
  it('샷 하나에 샷 번호·샷 크기·인물 이름·액션·대사·길이가 모두 있다', () => {
    const scenes = [scene({ sceneId: 'sc_a' })]
    const shots = [
      shot({
        shotId: 'sh_1',
        sceneId: 'sc_a',
        shotType: 'CU',
        characters: ['char_1', 'char_2'],
        actionDescription: 'A quiet embrace.',
        dialogueLines: [
          { characterId: 'char_1', text: 'Long time no see.', emotion: '', delivery: '', durationHint: 2 },
          { characterId: null, text: 'Years pass in silence.', emotion: '', delivery: '', durationHint: 2 },
        ],
        durationSeconds: 6,
      }),
    ]
    const result = buildMasterSheet(baseInput({ scenes, shots }))
    const row = result.pages[0].rows[0]
    expect(row.code).toBe('1-1')
    expect(row.shotSizeLabel).toBe('Close-up: mostly the face')
    expect(row.characters).toEqual(['지아', '레오'])
    expect(row.action).toBe('A quiet embrace.')
    expect(row.dialogueLines).toEqual(['지아: Long time no see.', 'Years pass in silence.'])
    expect(row.durationSeconds).toBe(6)
  })
})

describe('씬 머리글의 장소는 배경 이름으로 싣는다', () => {
  it('배경의 내부 표기가 평범한 낱말이어도 장소에는 배경 이름이 나온다', () => {
    // 왜: 개발 DB 프리렌 프로젝트에서 배경 표기가 'location' 이라 시트 머리글에 "장소: location" 이 찍혔다.
    const scenes = [scene({ sceneId: 'sc_a', location: 'location' })]
    const shots = [shot({ shotId: 'sh_1', sceneId: 'sc_a' })]
    const result = buildMasterSheet(baseInput({ scenes, shots, locations: [{ locationId: 'location', name: '마을 광장' }] }))
    expect(result.pages[0].locationName).toBe('마을 광장')
  })
})

describe('클라이언트가 받는 시트에는 내부 식별자·생성 방식·프롬프트를 싣지 않는다', () => {
  it('내부 식별자와 생성 방식이 시트 어디에도 나오지 않는다', () => {
    const scenes = [scene({ sceneId: 'sc_internal_9', location: 'loc_1' })]
    const shots = [
      shot({
        shotId: 'sh_internal_shot_id_42',
        sceneId: 'sc_internal_9',
        actionDescription: 'char_1 greets char_2 near loc_1.',
        characters: ['char_1', 'char_2'],
        dialogueLines: [{ characterId: 'char_2', text: 'Good to see you, char_1.', emotion: '', delivery: '', durationHint: 2 }],
      }),
    ]
    const result = buildMasterSheet(baseInput({ scenes, shots }))
    const row = result.pages[0].rows[0]
    expect(Object.keys(row)).not.toContain('shotId')
    expect(Object.keys(row)).not.toContain('sceneId')
    expect(Object.keys(row)).not.toContain('prompt')
    expect(Object.keys(row)).not.toContain('generationMethod')
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/\bchar_1\b/)
    expect(serialized).not.toMatch(/\bchar_2\b/)
    expect(serialized).not.toMatch(/\bloc_1\b/)
    expect(serialized).not.toContain('sh_internal_shot_id_42')
    expect(serialized).not.toContain('sc_internal_9')
    expect(serialized).not.toMatch(/\bT2V\b/)
    expect(serialized).not.toMatch(/\bI2V\b/)
  })
})

describe('씬이 바뀌면 새 장에서 시작하고 넘치는 씬은 여러 장으로 나눠 페이지 번호를 붙인다', () => {
  it('한 씬에 샷이 많으면 여러 장으로 나뉘고 다음 씬은 새 장에서 시작한다', () => {
    const scenes = [scene({ sceneId: 'sc_a', sortOrder: 0 }), scene({ sceneId: 'sc_b', sortOrder: 1 })]
    // 어떤 한 장당 수용치를 쓰든 9장은 분명히 넘치도록 충분히 많은 샷을 몰아넣는다.
    const sceneAShots = Array.from({ length: 9 }, (_, i) =>
      shot({ shotId: `sh_a_${i}`, sceneId: 'sc_a', sortOrder: i }),
    )
    const sceneBShots = [shot({ shotId: 'sh_b_0', sceneId: 'sc_b', sortOrder: 0 })]
    const result = buildMasterSheet(baseInput({ scenes, shots: [...sceneAShots, ...sceneBShots] }))

    const sceneAPages = result.pages.filter((p) => p.sceneNumber === 1)
    const sceneBPages = result.pages.filter((p) => p.sceneNumber === 2)
    expect(sceneAPages.length).toBeGreaterThan(1)
    expect(sceneBPages).toHaveLength(1)

    // 씬 A 의 부분 번호가 빠짐없이 이어진다.
    const parts = sceneAPages.map((p) => p.scenePart.index).sort((a, b) => a - b)
    expect(parts).toEqual(Array.from({ length: sceneAPages.length }, (_, i) => i + 1))
    for (const page of sceneAPages) expect(page.scenePart.total).toBe(sceneAPages.length)
    expect(sceneBPages[0].scenePart).toEqual({ index: 1, total: 1 })

    // 한 장의 모든 행은 그 장의 씬 번호에서만 온다 — 씬이 섞이지 않는다.
    for (const page of result.pages) {
      for (const row of page.rows) expect(row.code.startsWith(`${page.sceneNumber}-`)).toBe(true)
    }

    // 전역 페이지 번호가 1부터 연속이다.
    const totalPages = result.pages.length
    result.pages.forEach((page, i) => {
      expect(page.pageIndex).toBe(i + 1)
      expect(page.totalPages).toBe(totalPages)
    })
  })
})

describe('한 장이면 PNG 하나, 여러 장이면 ZIP 하나로 내보낸다', () => {
  it('한 장이면 PNG 파일 하나이고 파일 이름에 쓸 수 없는 글자는 뺀다', () => {
    const scenes = [scene({ sceneId: 'sc_a' })]
    const shots = [shot({ shotId: 'sh_1', sceneId: 'sc_a' })]
    const result = buildMasterSheet(baseInput({ scenes, shots }))
    expect(result.pages).toHaveLength(1)
    const plan = masterSheetExportPlan(result.pages, 'My/Project:Name')
    expect(plan).toEqual({ kind: 'png', fileName: 'MyProjectName-master-sheet.png' })
  })

  it('여러 장이면 ZIP 하나이고 안의 파일 이름에 씬 번호와 장 번호가 붙는다', () => {
    const scenes = [scene({ sceneId: 'sc_a' })]
    const shots = Array.from({ length: 9 }, (_, i) => shot({ shotId: `sh_${i}`, sceneId: 'sc_a', sortOrder: i }))
    const result = buildMasterSheet(baseInput({ scenes, shots }))
    expect(result.pages.length).toBeGreaterThan(1)
    const plan = masterSheetExportPlan(result.pages, 'Demo')
    expect(plan.kind).toBe('zip')
    if (plan.kind !== 'zip') throw new Error('unreachable')
    expect(plan.fileName).toBe('Demo-master-sheet.zip')
    expect(plan.entries).toHaveLength(result.pages.length)
    result.pages.forEach((page, i) => {
      expect(plan.entries[i]).toBe(`Demo-S${String(page.sceneNumber).padStart(2, '0')}-p${page.scenePart.index}.png`)
    })
  })
})

describe('세로 프로젝트는 그림 칸을 세로 비율로 잡는다', () => {
  it('세로 프로젝트는 그림 칸을 9:16으로, 가로나 모르는 프로젝트는 16:9로 잡는다', () => {
    const scenes = [scene({ sceneId: 'sc_a' })]
    const shots = [shot({ shotId: 'sh_1', sceneId: 'sc_a' })]
    const vertical = buildMasterSheet(baseInput({ projectFormat: 'vertical_9:16', scenes, shots }))
    const unknown = buildMasterSheet(baseInput({ projectFormat: null, scenes, shots }))
    const horizontal = buildMasterSheet(baseInput({ projectFormat: 'horizontal_16:9', scenes, shots }))
    expect(vertical.frameAspectRatio).toBe('9:16')
    expect(unknown.frameAspectRatio).toBe('16:9')
    expect(horizontal.frameAspectRatio).toBe('16:9')
  })

  it('세로 프로젝트는 칸이 높아 같은 샷 수가 가로보다 더 많은 장으로 나뉜다', () => {
    const scenes = [scene({ sceneId: 'sc_a' })]
    const shots = Array.from({ length: 5 }, (_, i) => shot({ shotId: `sh_${i}`, sceneId: 'sc_a', sortOrder: i }))
    const vertical = buildMasterSheet(baseInput({ projectFormat: 'vertical_9:16', scenes, shots }))
    const horizontal = buildMasterSheet(baseInput({ projectFormat: 'horizontal_16:9', scenes, shots }))
    expect(vertical.pages.length).toBeGreaterThanOrEqual(horizontal.pages.length)
  })
})
