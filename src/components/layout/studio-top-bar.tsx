'use client'

// 스튜디오 위 막대(v3 Nav/Stage Header, 2026-11-03) — 지금 단계 칩 · 프로젝트 제목 · 연필(이름 바꾸기) · 오른쪽 자리.
//   스튜디오 레이아웃이 모든 단계 화면 위에 놓는다. Producer 시작 화면은 자기 머리(탭)를 같은 막대로 그린다.
//   오른쪽 자리에 단추를 놓고 싶은 화면(예: Director 의 [다음: Editor로])은 <TopBarActions> 로 넣는다.
//   AI 가 일하는 잠금 화면이 떠 있어도 제목 칸은 막히지 않는다(data-ai-lock-keep, lib/ai-busy-lock) — 예전 레일 홈 카드처럼 이름을 바꾼다.
//   단계 칩 · 오른쪽 자리는 그동안 막히고, 오른쪽 자리는 흐려져 막혀 있음을 알린다.
//   Writer 두 화면(씬 스토리 · 콘티)은 칩 바로 오른쪽에 [씬 스토리 | 콘티]를 둔다(dev D1 2026-11-22 · O1 2026-11-26, features/writer/writer-part-switch).
import { useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { StageChip } from '@/components/controls/stage-chip'
import { ProjectTitleField } from '@/features/entry/project-title-field'
import { WriterPartSwitch } from '@/features/writer/writer-part-switch'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/project-store'
import type { StageId } from '@/types'

const ACTIONS_ID = 'studio-top-bar-actions'

/** 이름 칸 — 최소 폭(4.5rem: 연필과 두어 글자)을 갖고 이름 길이까지만 늘어난다. 한 줄에 그 폭도 남지 않으면 막대가 줄을 바꿔
 *  이 칸이 다음 줄로 내려가고, 그 줄보다 긴 이름은 말줄임으로 준다 — Writer [씬 스토리 | 콘티]가 자리를 차지하는 좁은 폭에서
 *  이름이 0 폭이 되고 연필이 막대 밖으로 밀렸다(리드 2026-11-23 QA ①). 약속: tests/project/top-bar-title.test.ts */
function CurrentProjectTitle() {
  const t = useT()
  const projectTitle = useProjectStore((s) => s.projectTitle)
  return (
    <div className="flex min-w-0 max-w-max grow basis-[4.5rem]" data-testid="top-bar-title">
      <ProjectTitleField
        title={projectTitle}
        onRename={(next) => void useProjectStore.getState().renameProject(next).then((saved) => {
          if (!saved) toast.error(t("Couldn't save the title. Please try again."))
        })}
      />
    </div>
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
        // 좁은 폭에서는 줄을 바꾼다(flex-wrap) — 칸이 막대 밖으로 밀리거나 이름이 0 폭이 되지 않게(리드 2026-11-23 QA ①).
        'sticky top-0 z-sticky flex min-h-[50px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 bg-background pb-1 pl-6 pr-5 pt-2',
        className,
      )}
      data-testid="studio-top-bar"
    >
      <StageChip stage={stage} />
      <WriterPartSwitch stage={stage} />
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
