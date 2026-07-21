import { describe, expect, it, vi } from 'vitest'
import {
  facetsHash,
  renderDirectorPromptFromFacets,
  renderDirectorPromptTemplate,
} from '@/lib/writer/facet-render'
import type { ShotStaticSpec } from '@/lib/writer/types/pipeline'

function makeSpec(overrides: Partial<ShotStaticSpec> = {}): ShotStaticSpec {
  return {
    shot_id: 'shot_1',
    lens_mm: 35,
    shot_type: 'MS',
    camera_angle: 'eye_level',
    depth_of_field: 'medium',
    framing: {
      rule: 'thirds',
      layers: {
        foreground: 'amber rain on the window glass',
        midground: 'Kai at the navigation console',
        background: 'blue city towers beyond the hangar',
      },
      focal_point: 'Kai reaching toward the glowing map',
    },
    lighting: {
      key_fill_ratio: '4:1',
      color_temp_kelvin: 4200,
      quality: 'soft',
      key_direction: 'top_left',
    },
    character_blocking: [
      {
        character_id: 'Kai',
        position_in_frame: 'center',
        pose: 'standing_facing_left',
        gaze: 'off_screen_left',
        asset_version: 'v1',
      },
    ],
    prop_placement: [
      {
        prop: 'amber map shard',
        position_in_frame: 'foreground',
        significance: 'navigation clue',
      },
    ],
    palette_emphasis: ['emerald', 'amber'],
    texture_notes: 'rain-streaked glass and brushed metal',
    color_grading_intent: 'cool teal shadows with warm amber highlights',
    first_frame_prompt: 'legacy prompt ignored by director facet rendering',
    ...overrides,
  }
}

describe('facetsHash', () => {
  it('returns the same hash for the same spec and a different hash when facets change', () => {
    const spec = makeSpec()
    const sameSpec = {
      ...JSON.parse(JSON.stringify(spec)),
      framing: {
        focal_point: spec.framing.focal_point,
        layers: {
          background: spec.framing.layers.background,
          midground: spec.framing.layers.midground,
          foreground: spec.framing.layers.foreground,
        },
        rule: spec.framing.rule,
      },
    } as ShotStaticSpec
    const differentSpec = makeSpec({ shot_type: 'CU' })

    expect(facetsHash(spec)).toBe(facetsHash(sameSpec))
    expect(facetsHash(spec)).not.toBe(facetsHash(differentSpec))
  })
})

describe('renderDirectorPromptTemplate', () => {
  it('renders deterministically and includes shot type and blocking vocabulary', () => {
    const spec = makeSpec()
    const first = renderDirectorPromptTemplate(spec)
    const second = renderDirectorPromptTemplate(JSON.parse(JSON.stringify(spec)) as ShotStaticSpec)

    expect(first).toBe(second)
    expect(first).toContain('MS')
    expect(first).toContain('Blocking:')
    expect(first).toContain('Kai')
    expect(first).toContain('pose standing facing left')
    expect(first).toContain('emerald')
  })
})

describe('renderDirectorPromptFromFacets', () => {
  it('falls back to the deterministic template when injected LLM rendering throws', async () => {
    const spec = makeSpec()
    const llm = vi.fn(async () => {
      throw new Error('LLM failed')
    })

    await expect(
      renderDirectorPromptFromFacets(spec, { flagOverride: true, llm }),
    ).resolves.toBe(renderDirectorPromptTemplate(spec))
    expect(llm).toHaveBeenCalledTimes(1)
  })

  it('uses the template and does not call the injected LLM when FACET_RENDER is off', async () => {
    const spec = makeSpec()
    const llm = vi.fn(async () => ({ prompt: 'LLM prompt' }))

    await expect(
      renderDirectorPromptFromFacets(spec, { flagOverride: false, llm }),
    ).resolves.toBe(renderDirectorPromptTemplate(spec))
    expect(llm).not.toHaveBeenCalled()
  })
})
