'use client'

import { SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useChatUiStore } from '@/stores/chat-ui-store'
import { CHAT_MODELS, CHAT_EFFORTS, parseChatModelSettings } from '@/lib/chat-model-settings'
import { useT } from '@/lib/i18n'

export function ChatModelControls({ disabled }: { disabled: boolean }) {
  const t = useT()
  const settings = useChatUiStore(s => s.modelSettings)
  const setSettings = useChatUiStore(s => s.setModelSettings)
  const fields = [
    { key: 'model', label: 'Chat model', values: CHAT_MODELS.map(model => ({ value: model.id, label: model.label })) },
    { key: 'effort', label: 'Effort', values: CHAT_EFFORTS.map(value => ({ value, label: value })) },
    { key: 'thinking', label: 'Model thinking', values: [{ value: 'off', label: 'Off' }, { value: 'adaptive', label: 'Automatic' }] },
  ] as const
  return (
    <div className="flex justify-end px-1 pb-1">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" disabled={disabled} aria-label={t('Configure chat model')}
            className="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{CHAT_MODELS.find(model => model.id === settings.model)?.label} · {settings.effort}{settings.thinking === 'adaptive' ? ` · ${t('Model thinking')}` : ''}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-64 space-y-3 p-4">
          <p className="text-sm font-medium">{t('Configure chat model')}</p>
          {fields.map(field => (
            <label key={field.key} className="block space-y-1 text-xs">
              <span className="text-muted-foreground">{t(field.label)}</span>
              <select aria-label={t(field.label)} value={settings[field.key]} disabled={disabled}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                onChange={event => {
                  const next = parseChatModelSettings({ ...settings, [field.key]: event.target.value })
                  if (next) setSettings(next)
                }}>
                {field.values.map(option => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
              </select>
            </label>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">{t('Applies to chat replies. More effort or thinking can increase response time and usage.')}</p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
