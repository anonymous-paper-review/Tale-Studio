import { describe, expect, it } from 'vitest'
import {
  AppearanceSelectionError,
  resolveCharacterAppearance,
  type AppearanceSelectionErrorCode,
  type CharacterAppearanceCandidate,
} from '@/lib/writer/appearance-selection'

const appearance = (
  appearanceKey: string,
  narrativeTime: CharacterAppearanceCandidate['narrativeTime'],
  isDefault = false,
): CharacterAppearanceCandidate => ({ appearanceKey, narrativeTime, isDefault })

function expectSelectionError(
  code: AppearanceSelectionErrorCode,
  select: () => string,
): void {
  try {
    select()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(AppearanceSelectionError)
    expect((error as AppearanceSelectionError).code).toBe(code)
  }
}

describe('resolveCharacterAppearance', () => {
  it('selects the one appearance matching the scene narrative time', () => {
    expect(resolveCharacterAppearance('past', [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
    ])).toBe('young-okhwa')
  })

  it('falls back to the unique overall default when no time matches', () => {
    expect(resolveCharacterAppearance('future', [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
      appearance('unplaced-reference', null),
    ])).toBe('present-okhwa')
  })

  it('rejects a zero-match scene without a unique overall default', () => {
    expectSelectionError('MISSING_DEFAULT_APPEARANCE', () =>
      resolveCharacterAppearance('future', [
        appearance('young-okhwa', 'past'),
        appearance('reference-only-look', null, true),
      ]),
    )
  })

  it('rejects multiple matching appearances without one matching default', () => {
    expectSelectionError('AMBIGUOUS_APPEARANCE', () =>
      resolveCharacterAppearance('past', [
        appearance('young-okhwa-a', 'past'),
        appearance('young-okhwa-b', 'past'),
        appearance('present-okhwa', 'present', true),
      ]),
    )
  })

  it('selects the only default among multiple matching appearances', () => {
    expect(resolveCharacterAppearance('past', [
      appearance('young-okhwa-a', 'past'),
      appearance('young-okhwa-b', 'past', true),
      appearance('present-okhwa', 'present'),
    ])).toBe('young-okhwa-b')
  })

  it('lets a valid explicit override win over the narrative-time match', () => {
    expect(resolveCharacterAppearance('past', [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
      appearance('reference-only-look', null),
    ], 'reference-only-look')).toBe('reference-only-look')
  })

  it('rejects an override that is not one of the character appearances', () => {
    expectSelectionError('INVALID_APPEARANCE_OVERRIDE', () =>
      resolveCharacterAppearance(
        'past',
        [appearance('young-okhwa', 'past')],
        'invented-look',
      ),
    )
  })

  it('treats nested flashbacks as relative to the fixed story present', () => {
    expect(resolveCharacterAppearance('past', [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
      appearance('future-okhwa', 'future'),
    ])).toBe('young-okhwa')
  })

  it('does not use time_of_day to resolve an appearance', () => {
    const appearances = [
      appearance('present-okhwa', 'present', true),
      appearance('young-okhwa', 'past'),
    ]

    expect(resolveCharacterAppearance('past', appearances)).toBe('young-okhwa')
  })
})
