import type { NarrativeTime } from '@/lib/writer/types/pipeline'

export type AppearanceSelectionErrorCode =
  | 'INVALID_APPEARANCE_OVERRIDE'
  | 'AMBIGUOUS_APPEARANCE'
  | 'MISSING_DEFAULT_APPEARANCE'

export class AppearanceSelectionError extends Error {
  constructor(
    public readonly code: AppearanceSelectionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AppearanceSelectionError'
  }
}

export interface CharacterAppearanceCandidate {
  appearanceKey: string
  narrativeTime: NarrativeTime | null
  isDefault: boolean
}

/**
 * Resolves a character appearance relative to the fixed story present.
 * Rows without narrativeTime are never auto-selected; they require an explicit override.
 */
export function resolveCharacterAppearance(
  narrativeTime: NarrativeTime,
  appearances: readonly CharacterAppearanceCandidate[],
  appearanceOverride?: string | null,
): string {
  if (appearanceOverride != null) {
    const selected = appearances.find((appearance) => appearance.appearanceKey === appearanceOverride)
    if (selected) return selected.appearanceKey
    throw new AppearanceSelectionError(
      'INVALID_APPEARANCE_OVERRIDE',
      `Appearance override "${appearanceOverride}" does not exist`,
    )
  }

  const timeMatches = appearances.filter((appearance) => appearance.narrativeTime === narrativeTime)
  if (timeMatches.length === 1) return timeMatches[0].appearanceKey
  if (timeMatches.length > 1) {
    const defaults = timeMatches.filter((appearance) => appearance.isDefault)
    if (defaults.length === 1) return defaults[0].appearanceKey
    throw new AppearanceSelectionError(
      'AMBIGUOUS_APPEARANCE',
      `Multiple appearances match narrative time "${narrativeTime}"`,
    )
  }

  const defaults = appearances.filter(
    (appearance) => appearance.isDefault && appearance.narrativeTime !== null,
  )
  if (defaults.length === 1) return defaults[0].appearanceKey
  throw new AppearanceSelectionError(
    'MISSING_DEFAULT_APPEARANCE',
    `No unique default appearance is available for narrative time "${narrativeTime}"`,
  )
}
