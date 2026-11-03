'use client'

// 스튜디오 위 막대(v3 Nav/Stage Header, 2026-11-03) — 지금 단계 칩 · 프로젝트 제목 · 연필(이름 바꾸기) · 오른쪽 자리.
//   스튜디오 레이아웃이 모든 단계 화면 위에 놓는다. Producer 시작 화면은 자기 머리(탭)를 같은 막대로 그린다.
//   오른쪽 자리에 단추를 놓고 싶은 화면(예: Director 의 [다음: Editor로])은 <TopBarActions> 로 넣는다.
//   AI 가 일하는 잠금 화면이 떠 있어도 제목 칸은 막히지 않는다(data-ai-lock-keep, lib/ai-busy-lock) — 예전 레일 홈 카드처럼 이름을 바꾼다.
//   단계 칩 · 오른쪽 자리는 그동안 막히고, 오른쪽 자리는 흐려져 막혀 있음을 알린다.
import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { StageChip } from '@/components/controls/stage-chip'
import { ProjectTitleField } from '@/features/entry/project-title-field'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'

const ACTIONS_ID = 'studio-top-bar-actions'

function CurrentProjectTitle() {
  const t = useT()
  const projectTitle = useProjectStore((s) => s.projectTitle)
  return (
    <ProjectTitleField
      title={projectTitle}
      onRename={(next) => void useProjectStore.getState().renameProject(next).then((saved) => {
        if (!saved) toast.error(t("Couldn't save the title. Please try again."))
      })}
    />
  )
}

export function StudioTopBar({
  stage,
  title,
  children,
  className,
}: {
  stage: StageId
  /** 제목 칸을 바꿀 때(시작 화면). 없으면 지금 프로젝트 제목 + 이름 바꾸기. */
  title?: ReactNode
  /** 오른쪽 자리. 없으면 화면이 <TopBarActions> 로 채우는 빈 자리. */
  children?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-sticky flex min-h-[50px] shrink-0 items-center gap-3 bg-background pb-1 pl-6 pr-5 pt-2',
        className,
      )}
      data-testid="studio-top-bar"
    >
      <StageChip stage={stage} />
      <div data-ai-lock-keep className="contents">
        {title ?? <CurrentProjectTitle />}
      </div>
      <div
        id={children ? undefined : ACTIONS_ID}
        className="ml-auto flex min-w-0 items-center gap-2 transition-opacity duration-150 data-ai-locked:opacity-40"
      >
        {children}
      </div>
    </header>
  )
}

const noSubscribe = () => () => {}
const slotNow = () => document.getElementById(ACTIONS_ID)

/** 화면이 위 막대 오른쪽에 단추를 놓는다 — 화면이 사라지면 단추도 같이 사라진다. 서버 그리기에서는 자리가 없어 붙인 뒤에 나온다. */
export function TopBarActions({ children }: { children: ReactNode }) {
  const slot = useSyncExternalStore(noSubscribe, slotNow, () => null)
  return slot ? createPortal(children, slot) : null
}
