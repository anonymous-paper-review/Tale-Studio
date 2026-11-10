import { sceneTimeTag } from '@/lib/scene-time'
const BOOST_KEYWORDS: Record<string, string> = {
  Cinematic: 'cinematic lighting, dramatic composition',
  'High-Res': 'ultra-detailed, 8k quality',
  'Film Grain': '70s film grain, vintage aesthetic',
  'Neon Noir': 'neon-lit, cyberpunk noir atmosphere',
  'Golden Hour': 'golden hour light, warm amber tones',
}

const VIEW_MODIFIERS: Record<
  'front' | 'side' | 'back' | 'threeQuarterLeft' | 'threeQuarterRight',
  string
> = {
  front: 'front view, facing camera',
  side: 'side profile, 90 degrees',
  back: 'back view, from behind',
  threeQuarterLeft: '3/4 view from left, 45 degrees',
  threeQuarterRight: '3/4 view from right, 45 degrees',
}

export function buildCharacterPrompt(
  fixedPrompt: string,
  view: 'front' | 'side' | 'back' | 'threeQuarterLeft' | 'threeQuarterRight',
): string {
  return `${fixedPrompt}, ${VIEW_MODIFIERS[view]}, full body, character reference sheet, white background, cinematic lighting`
}

export function buildWorldPrompt(
  visualDescription: string,
  timeOfDay: string,
  mood: string,
  boostPreset?: string | null,
): string {
  const boost = boostPreset ? BOOST_KEYWORDS[boostPreset] ?? '' : ''
  // 장면 머리의 이어짐 말(CONTINUOUS · LATER …)은 때가 아니라 시간으로 싣지 않는다(리드 2026-11-10 R2).
  const tag = sceneTimeTag(timeOfDay)
  const time = tag ? `during ${tag}` : ''
  const parts = [visualDescription, time, mood, boost].filter(Boolean)
  return parts.join(', ')
}
