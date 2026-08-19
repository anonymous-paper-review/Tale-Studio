'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getWriterEnginePreference,
  setWriterEnginePreference,
  type WriterEngine,
} from '@/lib/writer/engine'
import { useT } from '@/lib/i18n'

interface WriterEnginePickerProps {
  projectId: string | null | undefined
}

export function WriterEnginePicker({ projectId }: WriterEnginePickerProps) {
  const t = useT()
  const [authorizedProjectId, setAuthorizedProjectId] = useState<string | null>(null)
  const [engine, setEngine] = useState<WriterEngine>('v1')

  useEffect(() => {
    if (!projectId) return

    let cancelled = false
    fetch(`/api/writer/engine?projectId=${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        if (!response.ok) return
        const body = (await response.json()) as { enabled?: boolean }
        if (cancelled || body.enabled !== true) return
        setEngine(getWriterEnginePreference(projectId))
        setAuthorizedProjectId(projectId)
      })
      .catch(() => {
        // 관리자 전용 실험 컨트롤은 조회 실패 시 숨긴다.
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  if (!projectId || authorizedProjectId !== projectId) return null

  return (
    <div className="flex items-center gap-2" data-testid="writer-engine-picker">
      <Badge variant="outline" className="text-[10px] uppercase tracking-[0.08em]">
        Admin
      </Badge>
      <span className="text-xs text-muted-foreground">{t('Writer engine')}</span>
      <Select
        value={engine}
        onValueChange={(value) => {
          const next = value as WriterEngine
          setEngine(next)
          setWriterEnginePreference(projectId, next)
        }}
      >
        <SelectTrigger size="sm" aria-label={t('Select writer engine')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="v1">{t('V1 — existing pipeline')}</SelectItem>
          <SelectItem value="v2">{t('V2 — semantic unit experiment')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
