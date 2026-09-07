// Writer에서 바뀐 장면 설명은 사용자의 수정 내용을 지키면서 Director에 반영한다
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

describe('Writer에서 Director로 장면 설명을 반영하는 약속', () => {
  it('새 장면 설명을 받으면 Writer의 내용을 Director에 반영한다', () => {
    const sourcePrompt = writerDirectorPromptSource({
      prompt: 'rich writer prompt',
      actionDescription: 'fallback action',
    })

    const synced = applySync(promptFields({ promptMigratedV2: true }), sourcePrompt)

    expect(synced.derivedPrompt).toBe('rich writer prompt')
    expect(synced.promptOverride).toBeUndefined()
    expect(effectivePrompt(synced)).toBe('rich writer prompt')
  })

  it('장면 설명을 다시 받아도 사용자가 고친 내용을 지킨다', () => {
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

  it('기존 장면 설명이 Writer 내용과 같으면 최신 내용으로 정리한다', () => {
    const synced = applySync(
      promptFields({ prompt: '  writer prompt  ' }),
      'writer prompt',
    )

    expect(synced.derivedPrompt).toBe('writer prompt')
    expect(synced.promptOverride).toBeUndefined()
    expect(synced.promptMigratedV2).toBe(true)
    expect(effectivePrompt(synced)).toBe('writer prompt')
  })

  it('기존 장면 설명이 Writer 내용과 다르면 사용자의 수정을 우선한다', () => {
    const synced = applySync(
      promptFields({ prompt: 'user edited prompt' }),
      'writer prompt',
    )

    expect(synced.derivedPrompt).toBe('writer prompt')
    expect(synced.promptOverride).toBe('user edited prompt')
    expect(synced.promptMigratedV2).toBe(true)
    expect(effectivePrompt(synced)).toBe('user edited prompt')
  })

  it('사용자 수정과 Writer 내용과 기존 내용을 차례로 적용하고 모두 없으면 비워 둔다', () => {
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

  it('Writer 내용은 장면 설명에 반영하고 기존 입력 칸은 덮어쓰지 않는다', () => {
    const source = readFileSync(
      'src/features/director/hooks/use-writer-director-sync.ts',
      'utf8',
    )

    expect(source).toContain('derivedPrompt: sourcePrompt')
    expect(source).toContain('buildWriterDirectorPromptPatch(d, sourcePrompt)')
    expect(source).not.toContain('prompt: shot.prompt || shot.actionDescription')
  })
})
