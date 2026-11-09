'use client'

// 단계 확인 단추(11/5 Figma Control/Stage Confirm) — 단계를 넘길지 묻는 자리의 한 쌍. 왼쪽 크림 알약은 다음 단계 아이콘 +
//   "좋아요, ~로"(다음 단계에서 하는 일), 오른쪽 어두운 알약은 "아니요, 더 고칠래요". stage = 지금 단계 id(entry = Producer …).
//   붙이는 자리(채팅 말풍선 안 · 화면)는 쓰는 쪽이 정한다 — tone="chat" 이면 말풍선 위에서 보이게 오른쪽 바탕이 한 단계 밝다(P2).
//   busy = 누른 일이 서버에서 도는 동안(예: 산문 확정) — 왼쪽 알약의 아이콘 자리에 도는 표시, 두 단추는 꺼진다.
//   약속: tests/project/stage-confirm.test.ts · tests/writer/writer-next-confirm.test.ts
import type { ComponentType, SVGProps } from 'react'
import { Loader2 } from 'lucide-react'
import { ArtistIcon, DirectorIcon, EditorIcon, ExportIcon, StoryboardIcon, WriterIcon } from '@/components/icons/v3-icons'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { StageId } from '@/types'

/** 다음 단계(옷 이름) — Editor 다음은 작품 완성. */
export type StageConfirmNext = 'writer' | 'artist' | 'storyboard' | 'director' | 'editor' | 'complete'

const NEXT: Record<StageId, StageConfirmNext> = {
  entry: 'writer',
  producer: 'artist',
  artist: 'storyboard',
  writer: 'director',
  director: 'editor',
  editor: 'complete',
}

const NEXT_LABEL: Record<StageConfirmNext, string> = {
  writer: 'Yes, write the prose',
  artist: 'Yes, draw the images',
  storyboard: 'Yes, plan the storyboard',
  director: 'Yes, start directing',
  editor: 'Yes, start editing',
  complete: 'Yes, finish it',
}

const NEXT_ICON: Record<StageConfirmNext, ComponentType<SVGProps<SVGSVGElement>>> = {
  writer: WriterIcon,
  artist: ArtistIcon,
  storyboard: StoryboardIcon,
  director: DirectorIcon,
  editor: EditorIcon,
  complete: ExportIcon,
}

/** 지금 단계에서 넘어갈 다음 단계. */
export function stageConfirmNext(stage: StageId): StageConfirmNext {
  return NEXT[stage]
}

const PILL = 'inline-flex h-[39px] items-center gap-2 rounded-full px-[18px] text-[14px] font-semibold leading-none transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'

export function StageConfirm({
  stage,
  onConfirm,
  onRevise,
  tone = 'screen',
  disabled = false,
  busy = false,
  className,
}: {
  stage: StageId
  onConfirm: () => void
  onRevise: () => void
  /** chat = 채팅 말풍선 안(오른쪽 바탕이 한 단계 밝다). */
  tone?: 'screen' | 'chat'
  disabled?: boolean
  /** 누른 일이 도는 동안 — 왼쪽 알약에 도는 표시, 두 단추 꺼짐. */
  busy?: boolean
  className?: string
}) {
  const t = useT()
  const next = NEXT[stage]
  const Icon = NEXT_ICON[next]
  const off = disabled || busy
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <button
        type="button"
        data-next={next}
        disabled={off}
        aria-busy={busy || undefined}
        onClick={onConfirm}
        className={cn(PILL, 'bg-primary text-on-stage hover:bg-primary/90')}
      >
        {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Icon className="size-4" />}
        {t(NEXT_LABEL[next])}
      </button>
      <button
        type="button"
        disabled={off}
        onClick={onRevise}
        className={cn(PILL, 'text-foreground', tone === 'chat' ? 'bg-surface-elevated hover:bg-chip' : 'bg-card hover:bg-chip')}
      >
        {t('No, I want to edit more')}
      </button>
    </div>
  )
}
