import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { effectivePrompt } from '@/stores/director-store'
import {
  buildWriterDirectorPromptPatch,
  writerDirectorPromptSource,
} from '@/features/director/hooks/use-writer-director-sync'
import type { ShotNodeData } from '@/types/director'

type PromptFields = Pick<
  ShotNodeData,
  'prompt' | 'derivedPrompt' | 'promptOverride' | 'promptMigratedV2'
>

function promptFields(overrides: Partial<PromptFields> = {}): PromptFields {
  return { prompt: '', ...overrides }
}

function applySync(data: PromptFields, sourcePrompt: string): PromptFields {
  return { ...data, ...buildWriterDirectorPromptPatch(data, sourcePrompt) }
}

describe('writer → director prompt sync contract v2', () => {
  it('신규 v2 Shot sync는 writer prompt를 derivedPrompt에 쓴다', () => {
    const sourcePrompt = writerDirectorPromptSource({
      prompt: 'rich writer prompt',
      actionDescription: 'fallback action',
    })

    const synced = applySync(promptFields({ promptMigratedV2: true }), sourcePrompt)

    expect(synced.derivedPrompt).toBe('rich writer prompt')
    expect(synced.promptOverride).toBeUndefined()
    expect(effectivePrompt(synced)).toBe('rich writer prompt')
  })

  it('기존 Shot re-sync는 promptOverride를 보존하고 derivedPrompt만 갱신한다', () => {
    const synced = applySync(
      promptFields({
        prompt: 'legacy prompt',
        derivedPrompt: 'old writer prompt',
        promptOverride: 'user edit',
        promptMigratedV2: true,
      }),
      'new writer prompt',
    )

    expect(synced.derivedPrompt).toBe('new writer prompt')
    expect(synced.promptOverride).toBe('user edit')
    expect(effectivePrompt(synced)).toBe('user edit')
  })

  it('legacy prompt가 sync source와 같으면 derivedPrompt로 흡수하고 migrated flag를 세운다', () => {
    const synced = applySync(
      promptFields({ prompt: '  writer prompt  ' }),
      'writer prompt',
    )

    expect(synced.derivedPrompt).toBe('writer prompt')
    expect(synced.promptOverride).toBeUndefined()
    expect(synced.promptMigratedV2).toBe(true)
    expect(effectivePrompt(synced)).toBe('writer prompt')
  })

  it('legacy prompt가 sync source와 다르면 promptOverride로 1회 이관한다', () => {
    const synced = applySync(
      promptFields({ prompt: 'user edited prompt' }),
      'writer prompt',
    )

    expect(synced.derivedPrompt).toBe('writer prompt')
    expect(synced.promptOverride).toBe('user edited prompt')
    expect(synced.promptMigratedV2).toBe(true)
    expect(effectivePrompt(synced)).toBe('user edited prompt')
  })

  it('effectivePrompt 우선순위는 override → derived → legacy prompt → empty', () => {
    expect(
      effectivePrompt(
        promptFields({
          prompt: 'legacy prompt',
          derivedPrompt: 'derived prompt',
          promptOverride: 'override prompt',
        }),
      ),
    ).toBe('override prompt')
    expect(
      effectivePrompt(
        promptFields({ prompt: 'legacy prompt', derivedPrompt: 'derived prompt' }),
      ),
    ).toBe('derived prompt')
    expect(effectivePrompt(promptFields({ prompt: 'legacy prompt' }))).toBe(
      'legacy prompt',
    )
    expect(effectivePrompt(promptFields())).toBe('')
  })

  it('sync hook contract writes writer source to derivedPrompt, not legacy prompt', () => {
    const source = readFileSync(
      'src/features/director/hooks/use-writer-director-sync.ts',
      'utf8',
    )

    expect(source).toContain('derivedPrompt: sourcePrompt')
    expect(source).toContain('buildWriterDirectorPromptPatch(d, sourcePrompt)')
    expect(source).not.toContain('prompt: shot.prompt || shot.actionDescription')
  })
})
