'use client'

import { Clock, Film, Languages, Monitor, Palette, RefreshCw, Sparkles, Tag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProducerStore } from '@/stores/producer-store'
import type { ProjectFormat } from '@/types'
import { TagInput } from './tag-input'

const FORMAT_OPTIONS: { value: ProjectFormat; label: string }[] = [
  { value: 'horizontal_16:9', label: '16:9 Horizontal' },
  { value: 'vertical_9:16', label: '9:16 Vertical' },
  { value: 'cinema_2.39:1', label: '2.39:1 Cinema' },
  { value: 'square_1:1', label: '1:1 Square' },
]

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
]

function SettingRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

export function ProjectDashboard() {
  const projectSettings = useProducerStore((s) => s.projectSettings)
  const updateSettings = useProducerStore((s) => s.updateSettings)
  const syncing = useProducerStore((s) => s.syncing)
  const storyText = useProducerStore((s) => s.storyText)
  const storyReady = useProducerStore((s) => s.storyReady)

  return (
    <div className="flex w-full shrink-0 flex-col overflow-hidden lg:w-80 xl:w-96">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-semibold">스토리 설정</span>
        {syncing && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <RefreshCw className="size-3 animate-spin" />
            저장 중
          </Badge>
        )}
      </div>

      {/* Settings — 전체 인라인 편집 (채팅 추출이 자동으로 채우고, 직접 수정 가능) */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SettingRow icon={<Clock className="size-3.5" />} label="러닝타임 (초)">
          <Input
            type="number"
            min={5}
            value={projectSettings.playtime || ''}
            placeholder="예: 120"
            onChange={(e) => updateSettings({ playtime: Number(e.target.value) || 0 })}
            className="font-mono tabular-nums"
          />
        </SettingRow>

        <SettingRow icon={<Film className="size-3.5" />} label="장르">
          <Input
            value={projectSettings.genre}
            placeholder="예: thriller"
            onChange={(e) => updateSettings({ genre: e.target.value })}
          />
        </SettingRow>

        <SettingRow icon={<Tag className="size-3.5" />} label="세부 장르 (선택)">
          <Input
            value={projectSettings.subGenre ?? ''}
            placeholder="예: psychological"
            onChange={(e) => updateSettings({ subGenre: e.target.value })}
          />
        </SettingRow>

        <SettingRow icon={<Monitor className="size-3.5" />} label="포맷">
          <Select
            value={projectSettings.format}
            onValueChange={(v) => updateSettings({ format: v as ProjectFormat })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow icon={<Palette className="size-3.5" />} label="톤 (권장)">
          <TagInput
            values={projectSettings.tone}
            onChange={(tone) => updateSettings({ tone })}
            placeholder="예: dark"
          />
        </SettingRow>

        <SettingRow icon={<Sparkles className="size-3.5" />} label="목표 감정 (권장)">
          <TagInput
            values={projectSettings.targetEmotion}
            onChange={(targetEmotion) => updateSettings({ targetEmotion })}
            placeholder="예: suspense"
          />
        </SettingRow>

        <SettingRow icon={<Languages className="size-3.5" />} label="대사 언어">
          <Select
            value={projectSettings.dialogueLanguage || undefined}
            onValueChange={(v) => updateSettings({ dialogueLanguage: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="선택…" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        {/* Story Text Preview (read-only — 채팅이 합성) */}
        <div className={`rounded-lg border p-4 ${storyReady ? 'border-success/50 bg-success/10' : 'border-border'}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">스토리</span>
            {storyReady ? (
              <Badge variant="outline" className="border-success/50 text-[10px] text-success">
                준비됨
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                더 구체화 필요
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground italic">
            {storyText
              ? storyText.slice(0, 200).concat(storyText.length > 200 ? '…' : '')
              : '채팅으로 컨셉을 정리해 주세요…'}
          </p>
        </div>
      </div>
    </div>
  )
}
