import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShotSequence } from '@/lib/writer/types/pipeline'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  isFlagOn: vi.fn(),
  facetsHash: vi.fn(),
  renderDirectorPromptFromFacets: vi.fn(),
  renderDirectorPromptTemplate: vi.fn(),
  deriveEnBatch: vi.fn(),
  deriveNativeBatch: vi.fn(),
  isTargetScript: vi.fn(),
  i18nHash: vi.fn(),
  existingShots: [] as Record<string, unknown>[],
  insertedShots: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: mocks.from } }))
vi.mock('@/lib/flags', () => ({ isFlagOn: mocks.isFlagOn }))
vi.mock('@/lib/writer/facet-render', () => ({
  facetsHash: mocks.facetsHash,
  renderDirectorPromptFromFacets: mocks.renderDirectorPromptFromFacets,
  renderDirectorPromptTemplate: mocks.renderDirectorPromptTemplate,
}))
vi.mock('@/lib/writer/i18n/derive-en', () => ({
  deriveEnBatch: mocks.deriveEnBatch,
  deriveNativeBatch: mocks.deriveNativeBatch,
  i18nHash: mocks.i18nHash,
  isTargetScript: mocks.isTargetScript,
}))

import { persistShotsToDb } from '@/lib/writer/pipeline/util/persist_manifest'

const PROJECT_ID = '123e4567-e89b-12d3-a456-426614174000'

function shot(overrides: Record<string, unknown> = {}) {
  return {
    shot_id: 'shot_001',
    duration_seconds: 5,
    S: {
      scene_id: 'scene_1',
      scene_purpose: 'purpose',
      emotion_beat: { start: 'calm', end: 'tense' },
      character_action: 'Kai opens the door',
    },
    C: {
      causal_link: { from: null, to: null },
      info_disclosure: 'info',
    },
    V: {
      camera: { type: 'MS', angle: 'eye', movement: 'static' },
      lighting: { key_fill_ratio: '2:1', color_temp: '5000K' },
      composition: 'center',
      mood: 'tense',
    },
    assets: {
      characters: [{ id: 'kai', asset_version: 'v1' }],
      locations: [],
    },
    first_frame_generation: {
      base_assets: ['kai'],
      composition_prompt: 'Legacy composition prompt',
    },
    video_generation: { motion_prompt: 'slow push' },
    action_budget: {
      primary_action_count: 1,
      secondary_action_count: 0,
      camera_movement_complexity: 'none',
      environmental_changes: 0,
      passed_validation: true,
    },
    continuity: {
      carry_forward_from: null,
      consistent_elements: [],
      changes: [],
      is_scene_transition: false,
    },
    ...overrides,
  }
}

function sequence(shots: Array<Record<string, unknown>>): ShotSequence {
  return {
    project_id: PROJECT_ID,
    total_shots: shots.length,
    total_duration_seconds: shots.length * 5,
    depth_level: 'D3',
    shots,
  } as unknown as ShotSequence
}

function shotQuery() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: mocks.existingShots, error: null })),
    })),
    delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    insert: vi.fn(async (rows: Record<string, unknown>[]) => {
      mocks.insertedShots = rows
      return { error: null }
    }),
  }
}

function projectQuery() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { locale: 'en' }, error: null })),
      })),
    })),
  }
}

function sceneQuery() {
  const chain = { eq: vi.fn(() => chain) }
  return { update: vi.fn(() => chain) }
}

beforeEach(() => {
  vi.restoreAllMocks()
  mocks.existingShots = []
  mocks.insertedShots = []
  mocks.from.mockReset()
  mocks.from.mockImplementation((table: string) => {
    if (table === 'shots') return shotQuery()
    if (table === 'projects') return projectQuery()
    if (table === 'scenes') return sceneQuery()
    throw new Error(`unexpected table ${table}`)
  })
  mocks.isFlagOn.mockReset()
  mocks.isFlagOn.mockReturnValue(false)
  mocks.facetsHash.mockReset()
  mocks.facetsHash.mockImplementation((spec: { shot_id?: string }) => `hash:${spec.shot_id ?? 'missing'}`)
  mocks.renderDirectorPromptFromFacets.mockReset()
  mocks.renderDirectorPromptFromFacets.mockImplementation(async (spec: { shot_id?: string }) => `rendered:${spec.shot_id}`)
  mocks.renderDirectorPromptTemplate.mockReset()
  mocks.renderDirectorPromptTemplate.mockImplementation((spec: { shot_id?: string }) => `template:${spec.shot_id}`)
  mocks.deriveEnBatch.mockReset()
  mocks.deriveEnBatch.mockImplementation(async (items: Array<{ id: string; native: string }>) =>
    new Map(items.map((item) => [item.id, `EN:${item.native}`])),
  )
  mocks.deriveNativeBatch.mockReset()
  mocks.deriveNativeBatch.mockResolvedValue(new Map())
  mocks.isTargetScript.mockReset()
  mocks.isTargetScript.mockReturnValue(false)
  mocks.i18nHash.mockReset()
  mocks.i18nHash.mockImplementation((value: string) => `i18n:${value}`)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('persistShotsToDb facet persistence', () => {
  it('persists static_spec and prompt_source_hash on inserted shot rows', async () => {
    const staticSpec = { shot_id: 'shot_001', first_frame_prompt: 'Spec prompt', shot_type: 'MS' }

    await persistShotsToDb(PROJECT_ID, sequence([shot({ static_spec: staticSpec })]))

    expect(mocks.insertedShots).toHaveLength(1)
    expect(mocks.insertedShots[0].static_spec).toEqual(staticSpec)
    expect(mocks.insertedShots[0].prompt_source_hash).toBe('hash:shot_001')
  })

  it('keeps the legacy prompt path when FACET_RENDER is off', async () => {
    const staticSpec = { shot_id: 'shot_001', first_frame_prompt: 'Spec prompt', shot_type: 'MS' }

    await persistShotsToDb(PROJECT_ID, sequence([shot({ static_spec: staticSpec })]))

    expect(mocks.renderDirectorPromptFromFacets).not.toHaveBeenCalled()
    expect(mocks.insertedShots[0].prompt).toBe('Legacy composition prompt')
  })

  it('uses facet rendered prose only for static_spec shots when FACET_RENDER is on', async () => {
    mocks.isFlagOn.mockReturnValue(true)
    const staticSpec = { shot_id: 'shot_001', first_frame_prompt: 'Spec prompt', shot_type: 'MS' }
    const legacyOnly = shot({
      shot_id: 'shot_002',
      static_spec: undefined,
      first_frame_generation: { base_assets: [], composition_prompt: 'Second legacy prompt' },
    })

    await persistShotsToDb(PROJECT_ID, sequence([shot({ static_spec: staticSpec }), legacyOnly]))

    expect(mocks.renderDirectorPromptFromFacets).toHaveBeenCalledTimes(1)
    expect(mocks.renderDirectorPromptFromFacets).toHaveBeenCalledWith(staticSpec)
    expect(mocks.insertedShots.map((row) => row.prompt)).toEqual([
      'rendered:shot_001',
      'Second legacy prompt',
    ])
  })

  it('falls back to deterministic templates when a FACET_RENDER chunk throws', async () => {
    mocks.isFlagOn.mockReturnValue(true)
    mocks.renderDirectorPromptFromFacets.mockRejectedValue(new Error('LLM down'))
    const staticSpec = { shot_id: 'shot_001', first_frame_prompt: 'Spec prompt', shot_type: 'MS' }

    await persistShotsToDb(PROJECT_ID, sequence([shot({ static_spec: staticSpec })]))

    expect(mocks.insertedShots[0].prompt).toBe('template:shot_001')
  })

  it('skips facet rendering and preserves prompt when prompt_source_hash matches', async () => {
    mocks.isFlagOn.mockReturnValue(true)
    mocks.existingShots = [
      {
        shot_id: 'sh_01_01',
        prompt_source_hash: 'hash:shot_001',
        prompt: 'cached director prose',
      },
    ]
    const staticSpec = { shot_id: 'shot_001', first_frame_prompt: 'Spec prompt', shot_type: 'MS' }

    await persistShotsToDb(PROJECT_ID, sequence([shot({ static_spec: staticSpec })]))

    expect(mocks.renderDirectorPromptFromFacets).not.toHaveBeenCalled()
    expect(mocks.insertedShots[0].prompt).toBe('cached director prose')
  })

  it('carries forward current user-edit columns while overwriting pipeline facet outputs', async () => {
    const carriedCamera = { horizontal: 4, vertical: 0, pan: 12, tilt: 0, roll: 0, zoom: 1 }
    const carriedLighting = { position: 'side', brightness: 80, colorTemp: 3200 }
    const staticSpec = { shot_id: 'shot_001', first_frame_prompt: 'New spec prompt', shot_type: 'CU' }
    mocks.existingShots = [
      {
        shot_id: 'sh_01_01',
        camera_config: carriedCamera,
        lighting_config: carriedLighting,
        canvas_position: { x: 10, y: 20 },
        speed: 1.25,
        trim_start: 0.5,
        trim_end: 4,
        location_ids: ['loc_manual'],
        static_spec: { shot_id: 'old' },
        prompt_source_hash: 'old-hash',
      },
    ]

    await persistShotsToDb(PROJECT_ID, sequence([shot({ static_spec: staticSpec })]))

    expect(mocks.insertedShots[0]).toMatchObject({
      camera_config: carriedCamera,
      lighting_config: carriedLighting,
      canvas_position: { x: 10, y: 20 },
      speed: 1.25,
      trim_start: 0.5,
      trim_end: 4,
      location_ids: ['loc_manual'],
      static_spec: staticSpec,
      prompt_source_hash: 'hash:shot_001',
    })
  })
})
