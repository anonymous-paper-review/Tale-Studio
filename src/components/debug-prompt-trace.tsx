'use client'

// 최종 전송 프롬프트 디버그 블록(#debug-prompts 확장) — 관리자 소유 프로젝트에서만.
//   소스 프롬프트(팝업이 이미 보여줌)와 별개로, 모델에 실제 전송된 최종본
//   (generation_jobs.input_snapshot — 영상은 모션 계약 포함 full_prompt)을 팝업에서 확인.
//   팝업 마운트 시 1회 지연 조회, 비관리자는 빈 응답이라 아무것도 렌더하지 않는다.
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { useDebugPrompts } from '@/lib/use-debug-prompts'
import type { PromptTraceItem, PromptTraceKind } from '@/lib/prompt-trace'
import { useT } from '@/lib/i18n'

export function DebugPromptTrace({
  projectId,
  shotId,
  kinds,
}: {
  projectId: string | null | undefined
  shotId: string | null | undefined
  /** 이 팝업에서 보여줄 잡 종류 (예: 영상 팝업 = ['shot_video']) */
  kinds: PromptTraceKind[]
}) {
  const t = useT()
  const KIND_LABEL: Record<PromptTraceKind, string> = {
    shot_video: t('Final video prompt sent'),
    shot_storyboard: t('Final live-action prompt sent (individual)'),
    storyboard_real_grid: t('Final live-action prompt sent (batch grid)'),
    shot_rough_storyboard: t('Final rough prompt sent (grid)'),
  }
  const enabled = useDebugPrompts(projectId)
  const [items, setItems] = useState<PromptTraceItem[] | null>(null)

  useEffect(() => {
    if (!enabled || !projectId || !shotId) return
    let cancelled = false
    void fetch(
      `/api/debug-prompt-trace?projectId=${encodeURIComponent(projectId)}&shotId=${encodeURIComponent(shotId)}`,
    )
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((b: { items?: PromptTraceItem[] }) => {
        if (!cancelled) setItems(Array.isArray(b.items) ? b.items : [])
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [enabled, projectId, shotId])

  if (!enabled || !items) return null
  const visible = items.filter((i) => kinds.includes(i.kind))
  if (!visible.length) return null

  return (
    <div className="space-y-2">
      {visible.map((item) => (
        <div key={item.kind} className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {KIND_LABEL[item.kind]}
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-warning">
              debug
            </Badge>
            {item.createdAt ? (
              <span className="text-[10px] font-normal text-muted-foreground">
                {new Date(item.createdAt).toLocaleString()}
              </span>
            ) : null}
          </div>
          {item.motionContract ? (
            <pre className="max-h-32 select-text overflow-y-auto whitespace-pre-wrap rounded-lg border border-warning/40 bg-warning/5 p-2.5 font-mono text-[11px] leading-relaxed scrollbar-thin">
              {item.motionContract}
            </pre>
          ) : null}
          <pre className="max-h-56 select-text overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted p-3 font-mono text-[11px] leading-relaxed text-muted-foreground scrollbar-thin">
            {item.finalPrompt}
          </pre>
          {item.sourcePrompt ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t('Source prompt at send time')}</summary>
              <pre className="mt-1 max-h-40 select-text overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted p-2.5 font-mono text-[11px] leading-relaxed scrollbar-thin">
                {item.sourcePrompt}
              </pre>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  )
}
