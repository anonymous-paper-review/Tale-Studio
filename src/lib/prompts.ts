const BOOST_KEYWORDS: Record<string, string> = {
  Cinematic: 'cinematic lighting, dramatic composition',
  'High-Res': 'ultra-detailed, 8k quality',
  'Film Grain': '70s film grain, vintage aesthetic',
  'Neon Noir': 'neon-lit, cyberpunk noir atmosphere',
  'Golden Hour': 'golden hour light, warm amber tones',
}

export function buildCharacterPrompt(
  fixedPrompt: string,
  view: 'front' | 'side' | 'back',
): string {
  return `${fixedPrompt}, ${view} view, full body, character reference sheet, white background, cinematic lighting`
}

export function buildWorldPrompt(
  visualDescription: string,
  timeOfDay: string,
  mood: string,
  boostPreset?: string | null,
): string {
  const boost = boostPreset ? BOOST_KEYWORDS[boostPreset] ?? '' : ''
  const parts = [visualDescription, `during ${timeOfDay}`, mood, boost].filter(
    Boolean,
  )
  return parts.join(', ')
}
