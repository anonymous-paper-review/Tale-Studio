'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, Film, Monitor, Palette, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useProducerStore } from '@/stores/producer-store'

function formatPlaytime(seconds: number): string {
  if (!seconds) return 'Pending...'
  if (seconds < 60) return `${seconds}s`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return sec ? `${min}m ${sec}s` : `${min}m`
}

interface SettingWidgetProps {
  icon: React.ReactNode
  label: string
  value: string
}

function SettingWidget({ icon, label, value }: Omit<SettingWidgetProps, 'onEdit'>) {
  const isPending = !value || value === 'Pending...'
  const prevValueRef = useRef(value)
  const [highlight, setHighlight] = useState(false)

  useEffect(() => {
    if (value && value !== 'Pending...' && value !== prevValueRef.current) {
      setHighlight(true)
      const timer = setTimeout(() => setHighlight(false), 1500)
      prevValueRef.current = value
      return () => clearTimeout(timer)
    }
    prevValueRef.current = value
  }, [value])

  return (
    <div
      className={`rounded-lg border p-4 transition-all duration-500 ${
        highlight
          ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20'
          : 'border-border'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {icon}
          {label}
        </div>
        {isPending && (
          <Badge variant="outline" className="text-[10px]">
            Pending
          </Badge>
        )}
      </div>
      <span
        className={`text-sm font-medium ${isPending ? 'text-muted-foreground italic' : 'text-foreground'}`}
      >
        {value || 'Pending...'}
      </span>
    </div>
  )
}

const ASPECT_RATIO_LABELS: Record<string, string> = {
  '16:9': '16:9 Cinematic',
  '9:16': '9:16 Vertical',
  '1:1': '1:1 Square',
}

export function ProjectDashboard() {
  const { projectSettings, syncing, storyText, storyReady } = useProducerStore()

  return (
    <div className="flex w-full flex-col lg:w-80 xl:w-96">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">Project Dashboard</span>
        {syncing && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <RefreshCw className="size-3 animate-spin" />
            Syncing
          </Badge>
        )}
      </div>

      {/* Settings Grid */}
      <div className="flex-1 space-y-3 p-4">
        <SettingWidget
          icon={<Clock className="size-3.5" />}
          label="PLAYTIME"
          value={formatPlaytime(projectSettings.playtime)}
        />
        <SettingWidget
          icon={<Film className="size-3.5" />}
          label="GENRE"
          value={projectSettings.genre || 'Pending...'}
        />
        <SettingWidget
          icon={<Monitor className="size-3.5" />}
          label="ASPECT RATIO"
          value={
            ASPECT_RATIO_LABELS[projectSettings.aspectRatio] ??
            projectSettings.aspectRatio ??
            'Pending...'
          }
        />
        <SettingWidget
          icon={<Palette className="size-3.5" />}
          label="TONE & STYLE"
          value={projectSettings.toneStyle || 'Pending...'}
        />

        {/* Story Text Preview */}
        <div className={`rounded-lg border p-4 ${storyReady ? 'border-green-500/50 bg-green-500/5' : 'border-border'}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">STORY</span>
            {storyReady ? (
              <Badge variant="outline" className="border-green-500/50 text-[10px] text-green-600">
                Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Need more detail
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground italic">
            {storyText
              ? storyText.slice(0, 200).concat(storyText.length > 200 ? '…' : '')
              : 'Pending concept discussion...'}
          </p>
        </div>
      </div>
    </div>
  )
}
