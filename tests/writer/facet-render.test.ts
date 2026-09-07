// 화면의 연출 정보가 일관되고 다시 그릴 때 필요한 안내만 전달되도록 보장한다
import { describe, expect, it, vi } from 'vitest'
import {
  facetsHash,
  renderDirectorPromptFromFacets,
  renderDirectorPromptTemplate,
  renderRepaintCineLine,
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
  it('같은 화면 정보는 같은 식별값을 만들고 정보가 달라지면 식별값도 달라진다', () => {
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
  it('같은 연출 정보를 넣으면 같은 안내가 나오고 인물 위치와 화면 크기를 담는다', () => {
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

describe('renderRepaintCineLine (#viz-gap)', () => {
  it('다시 그릴 때 바뀌면 안 되는 렌즈·초점·조명·색 정보를 담는다', () => {
    const spec = makeSpec()
    const first = renderRepaintCineLine(spec)
    const second = renderRepaintCineLine(JSON.parse(JSON.stringify(spec)) as ShotStaticSpec)
    expect(first).toBe(second)
    // 비운반 채널이 실려야 한다
    expect(first).toContain('35mm lens')
    expect(first).toContain('medium depth of field')
    expect(first).toContain('soft key quality')
    expect(first).toContain('key from top left')
    expect(first).toContain('4200K')
    expect(first).toContain('amber') // 팔레트/그레이드
    expect(first.toLowerCase()).toContain('sharpest on') // 초점 지점
    expect(first).toContain('Kai reaching toward the glowing map')
  })

  it('이미 화면에 정해진 인물 자세·시선·구도·소품은 다시 지시하지 않는다', () => {
    // 리페인트 "포즈 유지" 지시와 충돌하지 않도록 — 가설의 반증 축(구도·포즈 훼손) 방어.
    const line = renderRepaintCineLine(makeSpec())
    expect(line).not.toContain('Blocking')
    expect(line).not.toContain('pose standing facing left')
    expect(line).not.toContain('Props')
    expect(line).not.toContain('amber map shard') // 소품
    expect(line).not.toContain('foreground amber rain') // framing.layers
  })

  it('일부 연출 정보가 없으면 빈 부분은 건너뛰고 가능한 안내만 남긴다', () => {
    expect(() => renderRepaintCineLine({})).not.toThrow()
    const partial = renderRepaintCineLine({ lens_mm: 85, depth_of_field: 'shallow' })
    expect(partial).toContain('85mm lens')
    expect(partial).toContain('shallow depth of field')
  })
})

describe('renderDirectorPromptFromFacets', () => {
  it('안내를 만들지 못하면 정해진 기본 안내를 대신 사용한다', async () => {
    const spec = makeSpec()
    const llm = vi.fn(async () => {
      throw new Error('LLM failed')
    })

    await expect(
      renderDirectorPromptFromFacets(spec, { flagOverride: true, llm }),
    ).resolves.toBe(renderDirectorPromptTemplate(spec))
    expect(llm).toHaveBeenCalledTimes(1)
  })

  it('다시 그리기 기능을 끄면 기본 안내만 사용한다', async () => {
    const spec = makeSpec()
    const llm = vi.fn(async () => ({ prompt: 'LLM prompt' }))

    await expect(
      renderDirectorPromptFromFacets(spec, { flagOverride: false, llm }),
    ).resolves.toBe(renderDirectorPromptTemplate(spec))
    expect(llm).not.toHaveBeenCalled()
  })
})
