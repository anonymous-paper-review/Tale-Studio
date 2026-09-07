// 장소와 장면 정보를 바탕으로 사람 없는 배경을 만들고, 사용자의 생성을 구분해 기록한다
import { describe, expect, it } from 'vitest'
import { buildWorldShotPromptForLocation } from '@/lib/artist/world-prompt'
import { buildCharacterPrompt } from '@/lib/prompts'
import { shouldMarkWorldGenerationUserEdited } from '@/stores/artist-store'

describe('Artist 배경 만들기 안내', () => {
  it('Producer 정보만 있고 장면이 없으면 사람이 없는 넓은 배경을 만든다', () => {
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
    expect(prompt).toContain('no people or characters, empty environment')
    expect(prompt).toContain('wide shot, panoramic')
    expect(prompt).not.toContain('during ,')
    expect(prompt).not.toContain('during  ,')
  })

  it('인물 설명으로 만든 안내문에서는 배경에 사람을 넣지 않는다', () => {
    const prompt = buildCharacterPrompt('a detective in a wool coat', 'front')

    expect(prompt).toBe(
      'a detective in a wool coat, front view, facing camera, full body, character reference sheet, white background, cinematic lighting',
    )
    expect(prompt).not.toContain('no people')
  })

  it('장면 정보가 있으면 배경을 다시 만들 때 시간과 분위기를 반영한다', () => {
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

  it('사용자가 직접 시작한 생성은 수정으로 기록하고 자동 생성은 기록하지 않는다', () => {
    expect(shouldMarkWorldGenerationUserEdited('ui')).toBe(true)
    expect(shouldMarkWorldGenerationUserEdited('chat')).toBe(true)
    expect(shouldMarkWorldGenerationUserEdited('auto')).toBe(false)
  })
})
