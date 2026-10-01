/** User-selectable settings for studio chat only; generation pipelines keep their own models. */
export const CHAT_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
] as const
export const CHAT_EFFORTS = ['low', 'medium', 'high', 'max'] as const
export type ChatModelSettings = {
  model: typeof CHAT_MODELS[number]['id']
  effort: typeof CHAT_EFFORTS[number]
  thinking: 'adaptive'
}
export const DEFAULT_CHAT_MODEL_SETTINGS: ChatModelSettings = {
  model: 'claude-sonnet-5-5', effort: 'high', thinking: 'adaptive',
}

export function parseChatModelSettings(value: unknown): ChatModelSettings | null {
  if (value === undefined) return { ...DEFAULT_CHAT_MODEL_SETTINGS }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  const model = v.model === 'claude-sonnet-4-6' ? 'claude-sonnet-5-5'
    : v.model === 'claude-opus-4-6' ? 'claude-opus-5-5' : v.model
  if (Object.keys(v).some(key => !['model', 'effort', 'thinking'].includes(key)) ||
    !CHAT_MODELS.some(option => option.id === model) ||
    !CHAT_EFFORTS.some(effort => effort === v.effort) ||
    (v.thinking !== 'off' && v.thinking !== 'adaptive')) return null
  // 5.5는 disabled를 받지 않는다. 저장된 4.6/off 설정도 지원되는 자동 사고로 이관한다.
  return { model, effort: v.effort, thinking: 'adaptive' } as ChatModelSettings
}
