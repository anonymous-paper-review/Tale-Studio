/** User-selectable settings for studio chat only; generation pipelines keep their own models. */
export const CHAT_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
] as const
export const CHAT_EFFORTS = ['low', 'medium', 'high', 'max'] as const
export type ChatModelSettings = {
  model: typeof CHAT_MODELS[number]['id']
  effort: typeof CHAT_EFFORTS[number]
  thinking: 'off' | 'adaptive'
}
export const DEFAULT_CHAT_MODEL_SETTINGS: ChatModelSettings = {
  model: 'claude-sonnet-4-6', effort: 'high', thinking: 'off',
}

export function parseChatModelSettings(value: unknown): ChatModelSettings | null {
  if (value === undefined) return { ...DEFAULT_CHAT_MODEL_SETTINGS }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (Object.keys(v).some(key => !['model', 'effort', 'thinking'].includes(key)) ||
    !CHAT_MODELS.some(model => model.id === v.model) ||
    !CHAT_EFFORTS.some(effort => effort === v.effort) ||
    (v.thinking !== 'off' && v.thinking !== 'adaptive')) return null
  return { model: v.model, effort: v.effort, thinking: v.thinking } as ChatModelSettings
}
