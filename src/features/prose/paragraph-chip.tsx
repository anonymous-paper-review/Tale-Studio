'use client'

// 채팅 입력칸 위의 붙은 문단(v3 W1, 오너 2026-11-03 결정 7) — "S2 · 문단 앞부분"과 떼기(X). Writer 채팅 입력 알약 맨 위에 놓인다.
//   붙은 문단이 없거나 다른 프로젝트 것이면 그리지 않는다. 보내기는 채팅 입력칸이 한다(paragraph-request).
import { X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { paragraphLabel } from '@/lib/prose/paragraph-pick'
import { useProjectStore } from '@/stores/project-store'
import { useWriterRoomStore } from '@/stores/writer-room-store'

export function ParagraphChip() {
  const t = useT()
  const projectId = useProjectStore((s) => s.projectId)
  const pick = useWriterRoomStore((s) => s.paragraph)
  if (!pick || pick.projectId !== projectId) return null
  return (
    <div className="pb-1.5 pt-1" data-testid="prose-paragraph-chip">
      <div className="flex items-start gap-2 rounded-lg bg-chip py-1.5 pl-2.5 pr-1">
        <span className="shrink-0 pt-px font-num text-micro font-semibold text-stage">{paragraphLabel(pick.index)}</span>
        <span className="line-clamp-2 min-w-0 flex-1 text-caption text-muted-foreground">{pick.text}</span>
        <button
          type="button"
          onClick={() => useWriterRoomStore.getState().clearParagraph()}
          title={t('Detach the paragraph')}
          aria-label={t('Detach the paragraph')}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors duration-100 ease-out hover:bg-accent hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  )
}
