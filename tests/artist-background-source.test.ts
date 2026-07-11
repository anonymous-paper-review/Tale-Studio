import { describe, expect, it } from 'vitest'
import {
  buildWorldShotPromptForLocation,
  shouldMarkWorldGenerationUserEdited,
} from '@/stores/artist-store'

describe('artist background source prompts', () => {
  it('builds a Producer-only world prompt when no writer scene exists yet', () => {
    const prompt = buildWorldShotPromptForLocation(
      {
        locationId: 'neon_alley',
        name: 'Neon Alley',
        visualDescription: 'rain-slick neon alley with cramped storefronts',
        timeOfDay: '',
        lightingDirection: '',
        purpose: 'the chase starts here',
        origin: 'producer',
        styleDescription: 'noir reflections',
        lightingSources: ['pink sign', 'blue vending machine'],
        props: ['umbrella', 'trash bags'],
      },
      null,
      null,
      'wideShot',
    )

    expect(prompt).toContain('rain-slick neon alley')
    expect(prompt).toContain('story purpose: the chase starts here')
    expect(prompt).toContain('producer background purpose: the chase starts here')
    expect(prompt).toContain('lighting sources: pink sign, blue vending machine')
    expect(prompt).toContain('wide shot, panoramic')
    expect(prompt).not.toContain('during ,')
    expect(prompt).not.toContain('during  ,')
  })

  it('adds writer scene context when available for regeneration prompts', () => {
    const prompt = buildWorldShotPromptForLocation(
      {
        locationId: 'rooftop',
        name: 'Rooftop',
        visualDescription: 'windy rooftop safehouse',
        timeOfDay: '',
        lightingDirection: 'backlit skyline',
        purpose: 'quiet confession space',
        origin: 'producer',
      },
      {
        sceneId: 'sc_01',
        narrativeSummary: 'The protagonists decide whether to run or fight.',
        originalTextQuote: '',
        location: 'rooftop',
        timeOfDay: 'dawn',
        mood: 'tense but hopeful',
        charactersPresent: ['hero'],
        estimatedDurationSeconds: 45,
      },
      'Cinematic',
      'wideShot',
    )

    expect(prompt).toContain('windy rooftop safehouse')
    expect(prompt).toContain('during dawn')
    expect(prompt).toContain('tense but hopeful')
    expect(prompt).toContain('scene context: The protagonists decide whether to run or fight.')
    expect(prompt).toContain('cinematic lighting, dramatic composition')
    expect(prompt).toContain('wide shot, panoramic')
  })

  it('marks explicit generation as user-edited but leaves auto first-fill unmarked', () => {
    expect(shouldMarkWorldGenerationUserEdited('ui')).toBe(true)
    expect(shouldMarkWorldGenerationUserEdited('chat')).toBe(true)
    expect(shouldMarkWorldGenerationUserEdited('auto')).toBe(false)
  })
})
